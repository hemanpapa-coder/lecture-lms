import { NextRequest, NextResponse } from 'next/server'
import { getDriveClient, findOrCreateFolder } from '@/lib/googleDrive'
import { Readable } from 'stream'

async function makeFilePublic(drive: any, fileId: string) {
    try {
        await drive.permissions.create({
            fileId,
            supportsAllDrives: true,
            requestBody: { role: 'reader', type: 'anyone' },
        })
    } catch (err) {
        console.warn('Failed to make file public:', err)
    }
}

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData()
        const description = formData.get('description') as string
        const pageUrl = formData.get('pageUrl') as string
        const userName = formData.get('userName') as string
        const userEmail = formData.get('userEmail') as string
        const screenshotFile = formData.get('screenshot') as File | null

        const drive = getDriveClient()
        const rootFolderId = process.env.GOOGLE_DRIVE_ERRORS_ID || process.env.GOOGLE_DRIVE_FOLDER_ID
        if (!rootFolderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID not set')

        // Find or create '에러리포트' subfolder
        const errorFolderId = await findOrCreateFolder(drive, '에러리포트', rootFolderId)

        const timestamp = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
        const slug = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const reportName = `ErrorReport_${slug}`

        // 1. Upload text report
        const textContent = `🐛 에러 리포트\n==================\n시각: ${timestamp}\n신고자: ${userName} (${userEmail})\n발생 페이지: ${pageUrl}\n\n에러 설명:\n${description}\n`
        const textStream = Readable.from([Buffer.from(textContent, 'utf-8')])
        const textRes = await drive.files.create({
            requestBody: { name: `${reportName}.txt`, parents: [errorFolderId], mimeType: 'text/plain' },
            media: { mimeType: 'text/plain', body: textStream },
            fields: 'id, webViewLink, webContentLink',
            supportsAllDrives: true,
        })
        await makeFilePublic(drive, textRes.data.id!)

        // 2. Upload screenshot if provided
        let screenshotUrl: string | null = null
        let screenshotFileId: string | null = null
        if (screenshotFile && screenshotFile.size > 0) {
            const buffer = Buffer.from(await screenshotFile.arrayBuffer())
            const imgStream = Readable.from([buffer])
            const imgRes = await drive.files.create({
                requestBody: {
                    name: `${reportName}_screenshot.${screenshotFile.name?.split('.').pop() || 'png'}`,
                    parents: [errorFolderId],
                    mimeType: screenshotFile.type || 'image/png',
                },
                media: { mimeType: screenshotFile.type || 'image/png', body: imgStream },
                fields: 'id, webViewLink, webContentLink',
                supportsAllDrives: true,
            })
            screenshotFileId = imgRes.data.id!
            await makeFilePublic(drive, screenshotFileId)

            // Use Drive thumbnail API to embed image inline in the dashboard
            screenshotUrl = `https://drive.google.com/thumbnail?id=${screenshotFileId}&sz=w1200`
        }

        return NextResponse.json({
            success: true,
            driveUrl: textRes.data.webViewLink || null,
            screenshotUrl,
        })
    } catch (err: any) {
        console.error('[drive-upload] error:', err.message)
        return NextResponse.json({ skipped: true, reason: err.message })
    }
}
