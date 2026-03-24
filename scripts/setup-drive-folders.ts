/**
 * Google Drive 폴더 구조 설정 스크립트
 * 
 * 실행: npx tsx scripts/setup-drive-folders.ts
 * 
 * 현재 GOOGLE_DRIVE_FOLDER_ID(루트)에 아래 하위 폴더들을 자동 생성하고
 * 각 폴더의 ID를 출력합니다.
 * 출력된 ID를 .env.local 및 Vercel 환경변수에 추가하세요.
 */

import { getDriveClient, findOrCreateFolder } from '../src/lib/googleDrive'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID

async function main() {
    if (!ROOT_FOLDER_ID) {
        console.error('❌ GOOGLE_DRIVE_FOLDER_ID 환경변수가 설정되지 않았습니다.')
        process.exit(1)
    }

    console.log(`\n🚀 Google Drive 폴더 구조 설정을 시작합니다.`)
    console.log(`📂 루트 폴더 ID: ${ROOT_FOLDER_ID}\n`)

    const drive = getDriveClient()

    // LMS 루트 폴더 생성 (현재 루트 안에 새 구조 생성)
    const lmsRoot = await findOrCreateFolder(drive, 'Lecture-LMS', ROOT_FOLDER_ID)
    console.log(`📁 Lecture-LMS (루트):        ${lmsRoot}`)

    // 하위 폴더들 병렬 생성
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
        findOrCreateFolder(drive, '학생과제',       lmsRoot),
        findOrCreateFolder(drive, '워크스페이스',    lmsRoot),
        findOrCreateFolder(drive, 'TTS음원',        lmsRoot),
        findOrCreateFolder(drive, 'AI이미지',       lmsRoot),
        findOrCreateFolder(drive, '아카이브자료',    lmsRoot),
        findOrCreateFolder(drive, '게시판첨부',      lmsRoot),
        findOrCreateFolder(drive, '에디터업로드',    lmsRoot),
        findOrCreateFolder(drive, '에러리포트',      lmsRoot),
        findOrCreateFolder(drive, '시험제출파일',    lmsRoot),
        findOrCreateFolder(drive, '시스템설정',      lmsRoot),
    ])

    console.log(`\n✅ 생성 완료! 아래 내용을 .env.local 및 Vercel 환경변수에 추가하세요:\n`)
    console.log(`# ── Google Drive 폴더 구조 (Lecture-LMS) ─────────────────`)
    console.log(`GOOGLE_DRIVE_FOLDER_ID="${ROOT_FOLDER_ID}"          # 기존 루트 (유지)`)
    console.log(`GOOGLE_DRIVE_LMS_ROOT_ID="${lmsRoot}"`)
    console.log(`GOOGLE_DRIVE_ASSIGNMENTS_ID="${assignments}"`)
    console.log(`GOOGLE_DRIVE_WORKSPACE_ID="${workspace}"`)
    console.log(`GOOGLE_DRIVE_TTS_ID="${ttsAudio}"`)
    console.log(`GOOGLE_DRIVE_AI_IMAGES_ID="${aiImages}"`)
    console.log(`GOOGLE_DRIVE_ARCHIVE_ID="${archiveUploads}"`)
    console.log(`GOOGLE_DRIVE_BOARD_ID="${boardAttachments}"`)
    console.log(`GOOGLE_DRIVE_EDITOR_ID="${editorUploads}"`)
    console.log(`GOOGLE_DRIVE_ERRORS_ID="${errorReports}"`)
    console.log(`GOOGLE_DRIVE_EXAMS_ID="${examUploads}"`)
    console.log(`GOOGLE_DRIVE_SYSTEM_ID="${systemConfig}"`)
    console.log(`\n📌 원본 루트 폴더의 기존 파일들은 삭제되지 않았습니다.`)
    console.log(`   Google Drive 웹에서 원하는 파일을 new 폴더로 이동하세요.\n`)
}

main().catch(e => {
    console.error('스크립트 실행 오류:', e.message)
    process.exit(1)
})
