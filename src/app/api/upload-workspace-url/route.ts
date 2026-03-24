import { NextRequest, NextResponse } from 'next/server'
import { getDriveClient, findOrCreateFolder } from '@/lib/googleDrive'
import { createClient } from '@/utils/supabase/server'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        // formData 대신 JSON으로 파일 메타데이터(크기, 이름, 타입)만 받음
        const { fileName, mimeType, fileSize, userId, weekName } = await req.json()

        if (!fileName || !mimeType || !userId || !weekName) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        // 보안: 본인 파일만 업로드 가능 (관리자 예외)
        const { data: userRecord } = await supabase.from('users').select('role, course_id').eq('id', user.id).single()
        const isAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com'
        if (!isAdmin && user.id !== userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        const drive = getDriveClient()
        const authClient = (drive.context as any)._options.auth
        const rootFolderId = process.env.GOOGLE_DRIVE_WORKSPACE_ID || process.env.GOOGLE_DRIVE_FOLDER_ID
        if (!rootFolderId) throw new Error('Drive Root Folder ID not configured')

        // 1. Find or create week/user folders
        const weekFolderId = await findOrCreateFolder(drive, weekName, rootFolderId)
        const userFolderId = await findOrCreateFolder(drive, userId, weekFolderId)

        // 2. 파일 메타데이터 생성 (ID 발급용)
        const fileMetadata = {
            name: fileName,
            mimeType: mimeType,
            parents: [userFolderId],
        }
        const file = await drive.files.create({
            requestBody: fileMetadata,
            fields: 'id, webViewLink',
            supportsAllDrives: true,
        })
        
        const fileId = file.data.id
        const webViewLink = file.data.webViewLink
        if (!fileId) throw new Error('Google Drive File ID 생성 실패')

        // 3. 파일 공개 설정 (누구나 링크 있는 사용자 보기 가능)
        await drive.permissions.create({
            fileId,
            supportsAllDrives: true,
            requestBody: { role: 'reader', type: 'anyone' },
        }).catch(() => {})

        // 4. 업로드 세션 URL (Resumable) 받아오기
        const tokenResponse = await authClient.getAccessToken()
        const token = tokenResponse.token
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
                    'Origin': origin,
                },
            }
        )

        if (!initRes.ok) throw new Error(`Google Upload Session Init Failed`)
        const uploadUrl = initRes.headers.get('Location')
        if (!uploadUrl) throw new Error('No upload URL returned from Google')

        // assignments 테이블 DB 저장은 클라이언트에서 실제 업로드 완료 후 처리하도록 함

        return NextResponse.json({ ok: true, fileId, uploadUrl, webViewLink, courseId: userRecord?.course_id })
    } catch (error: any) {
        console.error('Workspace Drive Session Error:', error)
        return NextResponse.json({ error: error?.message || 'Session Init failed' }, { status: 500 })
    }
}
