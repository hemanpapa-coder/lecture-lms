import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getDriveClient, findOrCreateFolder } from '@/lib/googleDrive'
import { PassThrough } from 'stream'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const formData = await req.formData()
        const file = formData.get('file') as File | null
        const userId = formData.get('userId') as string
        const courseId = formData.get('courseId') as string
        const examType = formData.get('examType') as string
        const content = formData.get('content') as string
        const youtubeUrl = formData.get('youtubeUrl') as string

        if (!userId || !courseId || !examType) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        let finalUrl = ''
        let finalName = ''
        let finalMediaType = ''
        let finalContent = content || ''

        // 1. If there's a file, upload to Google Drive
        if (file) {
            const drive = getDriveClient()
            const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID
            if (!rootFolderId) throw new Error('Drive Root Folder ID not configured')

            const examFolderId = await findOrCreateFolder(drive, examType, rootFolderId)
            const userFolderId = await findOrCreateFolder(drive, userId, examFolderId)

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
            consumeStream().catch(console.error)

            const driveRes = await drive.files.create({
                requestBody: {
                    name: file.name,
                    parents: [userFolderId],
                },
                media: { body: nodeStream },
                fields: 'id, webViewLink, webContentLink',
                supportsAllDrives: true,
            })

            finalUrl = driveRes.data.webViewLink || ''
            finalName = file.name

            // Determine media type
            if (examType === '중간고사') {
                finalMediaType = 'image'
            } else {
                finalMediaType = file.type.startsWith('video') ? 'video' : 'audio'
            }
        }

        // 2. Logic if no file, but youtube is provided (for Final Project)
        if (!file && youtubeUrl) {
            finalUrl = youtubeUrl
            finalMediaType = 'youtube'
            finalName = '유튜브 영상 링크'
        }

        // 3. If file AND youtube are provided
        if (file && youtubeUrl) {
            finalContent = `${finalContent}\n---YOUTUBE-LINK---\n${youtubeUrl}`
        }

        // 4. Save to database
        const { data: existing } = await supabase
            .from('exam_submissions')
            .select('id')
            .eq('user_id', userId)
            .eq('course_id', courseId)
            .eq('exam_type', examType)
            .maybeSingle()

        let error;
        if (existing) {
            const res = await supabase
                .from('exam_submissions')
                .update({
                    content: finalContent,
                    file_url: finalUrl,
                    file_name: finalName,
                    media_type: finalMediaType,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existing.id)
            error = res.error
        } else {
            const res = await supabase
                .from('exam_submissions')
                .insert({
                    user_id: userId,
                    course_id: courseId,
                    exam_type: examType,
                    content: finalContent,
                    file_url: finalUrl,
                    file_name: finalName,
                    media_type: finalMediaType
                })
            error = res.error
        }

        if (error) throw error

        return NextResponse.json({ success: true })

    } catch (e: any) {
        console.error('Exam upload error:', e)
        return NextResponse.json({ error: e.message || '업로드 실패' }, { status: 500 })
    }
}
