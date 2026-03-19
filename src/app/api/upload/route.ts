import { NextRequest, NextResponse } from 'next/server'
import { getDriveClient, findOrCreateFolder } from '@/lib/googleDrive'
import { createClient } from '@/utils/supabase/server'
import { PassThrough } from 'stream'

export const maxDuration = 60

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const formData = await req.formData()
        const file = formData.get('file') as File | null
        const userId = formData.get('userId') as string
        const weekName = formData.get('weekName') as string

        if (!file || !userId || !weekName) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        // 보안: 본인 파일만 업로드 가능 (관리자 예외)
        const { data: userRecord } = await supabase.from('users').select('role, course_id').eq('id', user.id).single()
        const isAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com'
        if (!isAdmin && user.id !== userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
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
        const nodeStream = new PassThrough()
        const reader = stream.getReader()
        const consumeStream = async () => {
            while (true) {
                const { done, value } = await reader.read()
                if (done) { nodeStream.end(); break }
                nodeStream.write(value)
            }
        }
        consumeStream().catch(e => { console.error('Stream error:', e); nodeStream.destroy(e) })

        // 4. Upload to Google Drive
        const driveRes = await drive.files.create({
            requestBody: {
                name: file.name,
                parents: [userFolderId],
            },
            media: { body: nodeStream },
            fields: 'id, webViewLink, webContentLink',
        })

        const { id: fileId, webViewLink } = driveRes.data

        // 5. 파일공개 설정
        await drive.permissions.create({
            fileId: fileId!,
            requestBody: { role: 'reader', type: 'anyone' }
        }).catch(() => {}) // 실패해도 계속

        // 6. assignments 테이블에 저장 (주차 숫자 추출)
        const weekNum = parseInt(weekName.replace(/[^0-9]/g, ''), 10) || 0
        await supabase.from('assignments').insert({
            user_id: userId,
            week_number: weekNum,
            title: file.name,
            file_url: webViewLink || `https://drive.google.com/file/d/${fileId}/view`,
            file_id: fileId,
            file_name: file.name,
            course_id: userRecord?.course_id || null,
            status: 'submitted',
        }).then(({ error }) => {
            if (error) console.error('Assignment DB insert error:', error.message)
        })

        return NextResponse.json({ ok: true, fileId, fileUrl: webViewLink })
    } catch (error: any) {
        console.error('Drive upload error:', error)
        return NextResponse.json({ error: error?.message || 'Upload failed' }, { status: 500 })
    }
}
