import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getDriveClient, findOrCreateFolder, getDriveToken } from '@/lib/googleDrive'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const body = await req.json()
        const { filesInfo, userId, examType } = body
        // filesInfo: { name: string, mimeType: string, size: number }[]

        if (!userId || !examType || !Array.isArray(filesInfo)) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        const drive = getDriveClient()
        const rootFolderId = process.env.GOOGLE_DRIVE_EXAMS_ID || process.env.GOOGLE_DRIVE_FOLDER_ID
        if (!rootFolderId) throw new Error('Drive Root Folder ID not configured')

        // Ensure folders exist
        const examFolderId = await findOrCreateFolder(drive, examType, rootFolderId)
        const userFolderId = await findOrCreateFolder(drive, userId, examFolderId)

        const uploadUrls = []
        
        // We need an access token for raw fetch to Google API
        const token = await getDriveToken()

        // Generate a Resumable Upload URL for each file
        for (const fileInfo of filesInfo) {
            const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink,webContentLink', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'X-Upload-Content-Type': fileInfo.mimeType || 'application/octet-stream',
                    'X-Upload-Content-Length': fileInfo.size.toString(),
                    'Origin': req.headers.get('origin') || 'https://lecture-lms.vercel.app'
                },
                body: JSON.stringify({
                    name: fileInfo.name,
                    parents: [userFolderId]
                })
            })
            
            if (!res.ok) {
                const errText = await res.text()
                console.error('Failed to init resumable upload', errText)
                throw new Error('Failed to create upload session')
            }
            
            const locationUrl = res.headers.get('Location')
            uploadUrls.push({ name: fileInfo.name, uploadUrl: locationUrl })
        }

        return NextResponse.json({ uploadUrls })

    } catch (e: any) {
        console.error('Drive upload URL error:', e)
        return NextResponse.json({ error: e.message || 'URL 생성 실패' }, { status: 500 })
    }
}
