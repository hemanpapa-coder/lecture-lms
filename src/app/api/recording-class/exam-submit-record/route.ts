import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const body = await req.json()
        const { userId, courseId, examType, content, youtubeUrl, uploadedFiles } = body
        /* uploadedFiles: { url: string, name: string, fileType: string }[] */

        if (!userId || !courseId || !examType) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        const uploadedResults = []

        for (const f of uploadedFiles) {
            let mediaType = ''
            if (examType === '중간고사') {
                mediaType = 'image'
            } else {
                mediaType = f.fileType?.startsWith('video') ? 'video' : 'audio'
            }
            uploadedResults.push({ url: f.url, name: f.name, mediaType })
        }

        if (youtubeUrl) {
            uploadedResults.push({ url: youtubeUrl, name: '유튜브 영상 링크', mediaType: 'youtube' })
        }

        if (uploadedResults.length === 0) {
            uploadedResults.push({ url: '', name: '', mediaType: 'text' })
        }

        // Delete old submissions using the generic bypass value
        await supabase
            .from('exam_submissions')
            .delete()
            .eq('user_id', userId)
            .eq('course_id', courseId)
            .eq('exam_type', '수시과제PDF')
            .like('file_name', `[${examType}]%`)

        // Insert new
        const insertData = uploadedResults.map((result, index) => {
            let finalContent = (index === 0) ? (content || '') : ''
            if (index === 0 && youtubeUrl) {
                finalContent = `${finalContent}\n---YOUTUBE-LINK---\n${youtubeUrl}`
            }

            return {
                user_id: userId,
                course_id: courseId,
                exam_type: '수시과제PDF', // bypass db constraint
                content: finalContent,
                file_url: result.url,
                file_name: `[${examType}] ${result.name}`, // embed true category
                media_type: result.mediaType
            }
        })

        const res = await supabase.from('exam_submissions').insert(insertData)
        if (res.error) throw res.error

        return NextResponse.json({ success: true })

    } catch (e: any) {
        console.error('Exam submit record error:', e)
        return NextResponse.json({ error: e.message || '저장 실패' }, { status: 500 })
    }
}
