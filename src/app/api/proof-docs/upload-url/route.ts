import { NextRequest, NextResponse } from 'next/server'
import { getDriveClient, findOrCreateFolder } from '@/lib/googleDrive'
import { createClient } from '@/utils/supabase/server'

type DriveAuthClient = {
    getAccessToken: () => Promise<string | { token?: string | null } | null>
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { fileName, mimeType, fileSize, userId } = await req.json()
        if (!fileName || !mimeType || !fileSize || !userId) {
            return NextResponse.json({ error: '파일 정보가 부족합니다.' }, { status: 400 })
        }

        const { data: userRecord } = await supabase
            .from('users')
            .select('role, course_id')
            .eq('id', user.id)
            .single()

        const isAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com'
        if (!isAdmin && user.id !== userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        const rootFolderId = process.env.GOOGLE_DRIVE_ASSIGNMENTS_ID || process.env.GOOGLE_DRIVE_FOLDER_ID
        if (!rootFolderId) throw new Error('Drive Root Folder ID not configured')

        const drive = getDriveClient()
        const authClient = drive.context._options.auth as DriveAuthClient
        const proofFolderId = await findOrCreateFolder(drive, 'proof_documents', rootFolderId)
        const userFolderId = await findOrCreateFolder(drive, userId, proofFolderId)

        const file = await drive.files.create({
            requestBody: {
                name: fileName,
                mimeType,
                parents: [userFolderId],
            },
            fields: 'id, webViewLink',
            supportsAllDrives: true,
        })

        const fileId = file.data.id
        const webViewLink = file.data.webViewLink
        if (!fileId) throw new Error('Google Drive File ID 생성 실패')

        await drive.permissions.create({
            fileId,
            supportsAllDrives: true,
            requestBody: { role: 'reader', type: 'anyone' },
        }).catch(() => {})

        const tokenResponse = await authClient.getAccessToken()
        const token = (tokenResponse && typeof tokenResponse === 'object') ? tokenResponse.token : tokenResponse
        if (!token) throw new Error('Access Token 발급 실패')

        const origin = req.headers.get('origin') || 'https://lecture-lms.vercel.app'
        const initRes = await fetch(
            `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=resumable`,
            {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'X-Upload-Content-Type': mimeType,
                    'X-Upload-Content-Length': String(fileSize),
                    Origin: origin,
                },
            }
        )

        if (!initRes.ok) {
            const errText = await initRes.text().catch(() => '')
            throw new Error(`Google Upload Session Init Failed: ${errText.slice(0, 300)}`)
        }

        const uploadUrl = initRes.headers.get('Location')
        if (!uploadUrl) throw new Error('No upload URL returned from Google')

        return NextResponse.json({
            ok: true,
            fileId,
            uploadUrl,
            webViewLink,
            courseId: userRecord?.course_id || null,
        })
    } catch (error: unknown) {
        console.error('Proof docs upload URL error:', error)
        const message = error instanceof Error ? error.message : '증빙 서류 업로드 준비 실패'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
