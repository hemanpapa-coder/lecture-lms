import { NextRequest, NextResponse } from 'next/server'
import { getDriveClient, findOrCreateFolder } from '@/lib/googleDrive'
import { PassThrough } from 'stream'
import { createClient } from '@/utils/supabase/server'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const formData = await req.formData()
        const file = formData.get('file') as File | null

        if (!file) {
            return NextResponse.json({ error: 'Missing file' }, { status: 400 })
        }

        const drive = getDriveClient()
        const rootFolderId = process.env.GOOGLE_DRIVE_EDITOR_ID || process.env.GOOGLE_DRIVE_FOLDER_ID

        if (!rootFolderId) {
            return NextResponse.json({ error: 'Drive Root Folder ID not configured' }, { status: 500 })
        }

        // We'll store editor uploads in a generic "Editor_Uploads" folder inside the root
        const editorUploadsFolderId = await findOrCreateFolder(drive, 'Editor_Uploads', rootFolderId)

        // Prepare upload stream from file
        const stream = file.stream()
        const nodeStream = new PassThrough()
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
        consumeStream().catch(console.error)

        // Upload to Google Drive
        const driveRes = await drive.files.create({
            requestBody: {
                name: `${Date.now()}_${file.name}`, // Avoid exact name collisions
                parents: [editorUploadsFolderId],
            },
            media: {
                body: nodeStream,
            },
            fields: 'id',
        })

        const fileId = driveRes.data.id

        return NextResponse.json({ fileId })
    } catch (error) {
        console.error('Editor Drive upload error:', error)
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }
}
