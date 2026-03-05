import { NextRequest, NextResponse } from 'next/server'
import { getDriveClient, findOrCreateFolder } from '@/lib/googleDrive'
import { PassThrough } from 'stream'

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData()
        const file = formData.get('file') as File | null
        const userId = formData.get('userId') as string
        const weekName = formData.get('weekName') as string

        if (!file || !userId || !weekName) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        const drive = getDriveClient()
        const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID

        if (!rootFolderId) {
            return NextResponse.json({ error: 'Drive Root Folder ID not configured' }, { status: 500 })
        }

        // 1. Find or create week folder
        const weekFolderId = await findOrCreateFolder(drive, weekName, rootFolderId)
        // 2. Find or create user folder inside the week folder
        const userFolderId = await findOrCreateFolder(drive, userId, weekFolderId)

        // 3. Prepare upload stream from file
        const stream = file.stream()
        // Convert ReadableStream to Node.js Readable
        const nodeStream = new PassThrough()

        // We get a reader, read all chunks and write to PassThrough
        const reader = stream.getReader()
        const consumeStream = async () => {
            while (true) {
                const { done, value } = await reader.read()
                if (done) {
                    nodeStream.end()
                    break
                }
                nodeStream.write(value)
            }
        }
        // Don't await here, let it pump while upload is happening
        consumeStream().catch(console.error)

        // 4. Upload to Google Drive using pipe
        const driveRes = await drive.files.create({
            requestBody: {
                name: file.name,
                parents: [userFolderId],
                // Note: We're not setting mimeType explicitly here, drive will infer it or fallback to octet-stream
            },
            media: {
                body: nodeStream,
            },
            fields: 'id, webViewLink, webContentLink',
        })

        const { id, webViewLink, webContentLink } = driveRes.data

        // TODO: Update Phase 3 DB here to store links alongside user ID and week.

        return NextResponse.redirect(`${req.nextUrl.origin}/workspace/${userId}?success=true`)
    } catch (error) {
        console.error('Drive upload error:', error)
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }
}
