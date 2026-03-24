/**
 * 🚀 임시 Google Drive 폴더 구조 설정 API
 * 
 * 이 route는 한 번 실행한 후 삭제하거나 비활성화 하세요.
 * 관리자로 로그인 후 브라우저에서 GET /api/setup-drive-folders 를 호출하면
 * 새 폴더 구조를 자동 생성하고 결과 JSON을 반환합니다.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getDriveClient, findOrCreateFolder } from '@/lib/googleDrive'

export const maxDuration = 60

export async function GET() {
    try {
        // 관리자만 실행 가능
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        const { data: userRecord } = await supabase.from('users').select('role').eq('id', user.id).single()
        const isAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com'
        if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID
        if (!ROOT_FOLDER_ID) return NextResponse.json({ error: 'GOOGLE_DRIVE_FOLDER_ID 환경변수가 없습니다.' }, { status: 500 })

        const drive = getDriveClient()

        // ── 1) Lecture-LMS 루트 하위폴더 생성 ────────────────────────────────
        const lmsRoot = await findOrCreateFolder(drive, 'Lecture-LMS', ROOT_FOLDER_ID)

        // ── 2) 목적별 하위폴더 생성 ───────────────────────────────────────────
        const [
            assignments,
            workspace,
            ttsAudio,
            aiImages,
            archiveUploads,
            boardAttachments,
            editorUploads,
            errorReports,
            examUploads,
            systemConfig,
        ] = await Promise.all([
            findOrCreateFolder(drive, '학생과제',    lmsRoot),
            findOrCreateFolder(drive, '워크스페이스', lmsRoot),
            findOrCreateFolder(drive, 'TTS음원',     lmsRoot),
            findOrCreateFolder(drive, 'AI이미지',    lmsRoot),
            findOrCreateFolder(drive, '아카이브자료', lmsRoot),
            findOrCreateFolder(drive, '게시판첨부',   lmsRoot),
            findOrCreateFolder(drive, '에디터업로드', lmsRoot),
            findOrCreateFolder(drive, '에러리포트',   lmsRoot),
            findOrCreateFolder(drive, '시험제출파일', lmsRoot),
            findOrCreateFolder(drive, '시스템설정',   lmsRoot),
        ])

        const envVars = {
            GOOGLE_DRIVE_FOLDER_ID: ROOT_FOLDER_ID,
            GOOGLE_DRIVE_LMS_ROOT_ID: lmsRoot,
            GOOGLE_DRIVE_ASSIGNMENTS_ID: assignments,
            GOOGLE_DRIVE_WORKSPACE_ID: workspace,
            GOOGLE_DRIVE_TTS_ID: ttsAudio,
            GOOGLE_DRIVE_AI_IMAGES_ID: aiImages,
            GOOGLE_DRIVE_ARCHIVE_ID: archiveUploads,
            GOOGLE_DRIVE_BOARD_ID: boardAttachments,
            GOOGLE_DRIVE_EDITOR_ID: editorUploads,
            GOOGLE_DRIVE_ERRORS_ID: errorReports,
            GOOGLE_DRIVE_EXAMS_ID: examUploads,
            GOOGLE_DRIVE_SYSTEM_ID: systemConfig,
        }

        const envString = Object.entries(envVars)
            .map(([k, v]) => `${k}="${v}"`)
            .join('\n')

        return NextResponse.json({
            ok: true,
            message: '✅ Google Drive 폴더 구조 생성 완료! 아래 환경변수를 .env.local 및 Vercel에 추가하세요.',
            folderIds: envVars,
            envString,
        })
    } catch (e: any) {
        console.error('[setup-drive-folders]', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
