import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const maxDuration = 60 // 1 minute

export async function POST(req: NextRequest) {
    try {
        const { courseId, weekNumber } = await req.json()
        if (!courseId || !weekNumber) return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })

        const supabase = await createClient()

        // 1. Fetch Students' Assignments (new table)
        const { data: assignments } = await supabase
            .from('assignments')
            .select('id, user_id, file_id, file_name, file_url, users(name)')
            .eq('course_id', courseId)
            .eq('week_number', weekNumber)
            .is('deleted_at', null)

        // 1-b. Fetch from board_questions (legacy submissions)
        const { data: bqData } = await supabase
            .from('board_questions')
            .select('id, user_id, content, metadata, users(name), board_attachments(file_id, file_name, file_url)')
            .eq('course_id', courseId)
            .eq('type', 'homework')

        const bqAssignments = (bqData || [])
            .filter((r: any) => r.metadata?.week_number === weekNumber)
            .flatMap((r: any) => (r.board_attachments || []).map((att: any) => ({
                id: att.id || r.id,
                user_id: r.user_id,
                file_id: att.file_id,
                file_name: att.file_name,
                file_url: att.file_url,
                users: r.users,
                // Include any text content from board_question
                textContent: r.content || ''
            })))

        const allAssignments = [...(assignments || []).map((a: any) => ({...a, textContent: ''})), ...bqAssignments]

        if (allAssignments.length === 0) {
            return NextResponse.json({ message: 'No assignments found' })
        }

        // 2. Fetch Lecture Archive (limit content to prevent token overflow)
        const { data: archives } = await supabase
            .from('archive_pages')
            .select('content, week_number')
            .eq('course_id', courseId)
            .in('week_number', [weekNumber - 1, weekNumber, weekNumber + 1])

        // Truncate lecture content to 8000 chars to prevent token overflow
        const MAX_LECTURE_CONTENT_LENGTH = 8000
        const lectureContent = (archives || [])
            .map(a => {
                const content = (a.content || '').slice(0, MAX_LECTURE_CONTENT_LENGTH)
                return `[${a.week_number}주차 강의내용]\n${content}`
            })
            .join('\n\n') || '강의 노트가 없습니다.'

        // 3. Build student submission summary (text only - no file uploads)
        const imageUrls: string[] = []
        const studentSummaries: string[] = []

        for (const assign of allAssignments) {
            const assignUsers = assign.users as any
            const studentName = Array.isArray(assignUsers) ? assignUsers[0]?.name : assignUsers?.name || '학생'
            const ext = assign.file_name?.split('.').pop()?.toLowerCase() || ''
            const fileType = ['jpg', 'png', 'jpeg', 'webp'].includes(ext) ? '이미지 파일' :
                             ext === 'pdf' ? 'PDF 문서' :
                             ext === 'docx' ? 'Word 문서' :
                             ext === 'txt' ? '텍스트 파일' : '파일'

            // Collect image URLs for display in the final HTML
            if (['jpg', 'png', 'jpeg', 'webp'].includes(ext) && (assign.file_id || assign.file_url)) {
                const imgUrl = assign.file_id
                    ? `https://drive.google.com/uc?export=view&id=${assign.file_id}`
                    : assign.file_url
                if (imgUrl) imageUrls.push(imgUrl)
            }

            // Build text-only description of what the student submitted
            let summary = `- ${studentName}: ${assign.file_name} (${fileType})`
            if (assign.textContent) {
                // Strip HTML from text content (from WYSIWYG editor)
                const stripped = assign.textContent.replace(/<[^>]*>/g, '').slice(0, 1000)
                if (stripped.trim()) {
                    summary += `\n  내용: ${stripped}`
                }
            }
            studentSummaries.push(summary)
        }

        // 4. Call Gemini with TEXT ONLY (no file uploads) - much faster and no token overflow
        const prompt = `당신은 최고 수준의 음향학/오디오 마스터 교수입니다.

아래는 ${weekNumber}주차 과제 제출 현황과 강의 노트입니다.

[강의 노트]
${lectureContent}

[학생 제출 현황 (총 ${allAssignments.length}명)]
${studentSummaries.join('\n')}

수행할 작업:
1. 학생들의 과제 제출 내용과 강의 노트를 종합 분석하세요.
2. 이번 주 과제의 핵심 주제를 나타내는 간결하고 학술적인 **과제 타이틀** 하나를 만들어주세요.
   예: "홈 레코딩 장비의 이해와 오디오 인터페이스 활용"
3. 강의 노트와 학생 제출물을 종합한 **이해하기 쉬운 정리본**을 HTML로 작성해주세요.
   - <h2>, <h3>, <p>, <ul>, <li>, <strong> 등 사용
   - 학생들이 제출한 내용 중 핵심 포인트를 추출해서 정리
   - 사진 자리는 [IMAGE_PLACEHOLDER]로 표시 (시스템이 실제 사진으로 교체)

응답은 반드시 아래 JSON 형식으로만 해주세요:
{
  "title": "과제 타이틀",
  "html_summary": "HTML 정리본 내용"
}`

        const geminiKey = process.env.GEMINI_API_KEY!
        const body = {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 4096 }
        }

        console.log(`Calling Gemini for week ${weekNumber} with ${allAssignments.length} submissions, prompt length: ${prompt.length}`)
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })

        if (!res.ok) throw new Error(`Gemini generateContent Failed: ${await res.text()}`)

        const data = await res.json()
        let textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'

        console.log('Gemini raw response:', textResponse.slice(0, 500))

        // Strip markdown fences if present
        textResponse = textResponse.replace(/^```json\s*/m, '').replace(/^```\s*/m, '').replace(/```\s*$/m, '').trim()
        
        // Extract JSON from response
        const jsonMatch = textResponse.match(/\{[\s\S]*\}/)
        const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}

        let finalHtml = parsed.html_summary || '<p>요약 생성에 실패했습니다.</p>'

        // Inject image URLs into placeholders
        for (const url of imageUrls) {
            if (finalHtml.includes('[IMAGE_PLACEHOLDER]')) {
                finalHtml = finalHtml.replace('[IMAGE_PLACEHOLDER]', `<img src="${url}" alt="과제 사진" style="max-width:100%; border-radius:12px; margin: 16px 0;" />`)
            } else {
                finalHtml += `<img src="${url}" alt="과제 사진" style="max-width:100%; border-radius:12px; margin: 16px 0;" />`
            }
        }
        finalHtml = finalHtml.replace(/\[IMAGE_PLACEHOLDER\]/g, '')

        // 5. Save title to courses.weekly_homework_titles
        if (parsed.title) {
            const { data: courseData } = await supabase.from('courses').select('weekly_homework_titles').eq('id', courseId).single()
            const existingTitles = (courseData?.weekly_homework_titles as Record<string, string>) || {}
            existingTitles[weekNumber.toString()] = parsed.title
            await supabase.from('courses').update({ weekly_homework_titles: existingTitles }).eq('id', courseId)
        }

        // 6. Save HTML summary to archives
        const summaryTitle = `💡 [종합 리뷰] ${weekNumber}주차: ${parsed.title || '과제 종합 정리'}`
        const { data: existingArchive } = await supabase
            .from('archives')
            .select('id')
            .eq('course_id', courseId)
            .eq('week', weekNumber)
            .eq('summary_type', 'ai_summary')
            .single()

        if (existingArchive) {
            await supabase.from('archives').update({ title: summaryTitle, description: finalHtml }).eq('id', existingArchive.id)
        } else {
            await supabase.from('archives').insert({
                course_id: courseId,
                week: weekNumber,
                title: summaryTitle,
                description: finalHtml,
                file_name: 'ai_summary.html',
                file_url: '#',
                file_type: 'text/html',
                summary_type: 'ai_summary'
            })
        }

        return NextResponse.json({ success: true, title: parsed.title })

    } catch (e: any) {
        console.error('Homework AI Process Error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
