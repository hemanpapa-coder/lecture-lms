import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getDriveClient } from '@/lib/googleDrive'

export const maxDuration = 120 // 2 minutes

// Upload a single file to Gemini File API and return its URI
async function uploadToGemini(drive: ReturnType<typeof getDriveClient>, fileId: string, mimeType: string, fileName: string): Promise<string | null> {
    try {
        const geminiKey = process.env.GEMINI_API_KEY!
        console.log(`Downloading ${fileName} from Drive...`)
        const response = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' })
        const buffer = Buffer.from(response.data as ArrayBuffer)

        // Initialize resumable upload
        const initRes = await fetch(
            `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiKey}`,
            {
                method: 'POST',
                headers: {
                    'X-Goog-Upload-Protocol': 'resumable',
                    'X-Goog-Upload-Command': 'start',
                    'X-Goog-Upload-Header-Content-Length': buffer.length.toString(),
                    'X-Goog-Upload-Header-Content-Type': mimeType,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ file: { display_name: fileName } })
            }
        )
        if (!initRes.ok) {
            console.error(`Gemini Init Failed for ${fileName}: ${await initRes.text()}`)
            return null
        }

        const uploadUrl = initRes.headers.get('x-goog-upload-url')
        if (!uploadUrl) return null

        // Upload bytes
        const uploadRes = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'X-Goog-Upload-Command': 'upload, finalize',
                'X-Goog-Upload-Offset': '0',
            },
            body: buffer
        })
        if (!uploadRes.ok) {
            console.error(`Gemini Upload Failed for ${fileName}: ${await uploadRes.text()}`)
            return null
        }

        const uploadData = await uploadRes.json()
        return uploadData.file?.uri || null
    } catch (error) {
        console.error(`Error uploading ${fileName}:`, error)
        return null
    }
}

// Call Gemini generateContent with the given body
async function callGemini(body: object): Promise<string | null> {
    const geminiKey = process.env.GEMINI_API_KEY!
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    )
    if (!res.ok) {
        const err = await res.text()
        throw new Error(`Gemini Failed: ${err}`)
    }
    const data = await res.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null
}

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
            .filter((r: { metadata?: { week_number?: number } }) => r.metadata?.week_number === weekNumber)
            .flatMap((r: { id: string; user_id: string; content: string; users: unknown; board_attachments: { file_id: string; file_name: string; file_url: string }[] }) =>
                (r.board_attachments || []).map(att => ({
                    id: att.file_id || r.id,
                    user_id: r.user_id,
                    file_id: att.file_id,
                    file_name: att.file_name,
                    file_url: att.file_url,
                    users: r.users,
                    textContent: r.content || ''
                })))

        const allAssignments = [
            ...(assignments || []).map((a: { id: string; user_id: string; file_id: string; file_name: string; file_url: string; users: unknown }) => ({ ...a, textContent: '' })),
            ...bqAssignments
        ]

        if (allAssignments.length === 0) {
            return NextResponse.json({ message: 'No assignments found' })
        }

        // 2. Fetch lecture archive content
        const { data: archives } = await supabase
            .from('archive_pages')
            .select('content, week_number')
            .eq('course_id', courseId)
            .in('week_number', [weekNumber - 1, weekNumber, weekNumber + 1])

        const lectureContent = (archives || [])
            .map(a => `[${a.week_number}주차 강의내용]\n${(a.content || '').slice(0, 5000)}`)
            .join('\n\n') || '강의 노트가 없습니다.'

        // 3. Upload each student's file and extract content (PASS 1)
        const drive = getDriveClient()
        const imageUrls: string[] = []

        const extractPromises = allAssignments.map(async (assign) => {
            const assignUsers = assign.users as { name?: string } | { name?: string }[]
            const studentName = Array.isArray(assignUsers) ? assignUsers[0]?.name : assignUsers?.name || '학생'
            const ext = assign.file_name?.split('.').pop()?.toLowerCase() || ''
            const isImage = ['jpg', 'png', 'jpeg', 'webp'].includes(ext)
            const isDoc = ['pdf', 'docx', 'txt'].includes(ext)

            // Collect image URLs for display
            if (isImage && (assign.file_id || assign.file_url)) {
                const imgUrl = assign.file_id
                    ? `https://drive.google.com/uc?export=view&id=${assign.file_id}`
                    : assign.file_url
                if (imgUrl) imageUrls.push(imgUrl)
            }

            if (!assign.file_id) {
                // No Google Drive file, just use text content if any
                if (assign.textContent) {
                    const stripped = assign.textContent.replace(/<[^>]*>/g, '').slice(0, 2000)
                    return `[${studentName}의 과제]\n${stripped}`
                } else {
                    return `[${studentName}]: ${assign.file_name} 제출`
                }
            }

            if (!isImage && !isDoc) {
                return `[${studentName}]: ${assign.file_name} 제출 (지원되지 않는 형식)`
            }

            let mimeType = 'application/pdf'
            if (isImage) {
                mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`
            } else if (ext === 'docx') {
                mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            } else if (ext === 'txt') {
                mimeType = 'text/plain'
            }

            console.log(`Processing ${studentName}'s file: ${assign.file_name} in parallel`)
            const fileUri = await uploadToGemini(drive, assign.file_id, mimeType, assign.file_name)

            if (!fileUri) {
                return `[${studentName}]: ${assign.file_name} 업로드 실패`
            }

            // Pass 1: Extract content from each file individually
            try {
                const extractPrompt = `이 파일(${assign.file_name})은 음향학/홈레코딩 수업의 학생 과제입니다.
이 파일의 핵심 내용을 한국어로 3-5문장으로 요약해주세요.
특히 어떤 장비, 개념, 기술을 다루고 있는지 중심으로 설명해주세요.`

                const extractBody = {
                    contents: [{
                        role: 'user',
                        parts: [
                            { fileData: { fileUri, mimeType } },
                            { text: extractPrompt }
                        ]
                    }],
                    generationConfig: { temperature: 0.2, maxOutputTokens: 512 }
                }

                const extracted = await callGemini(extractBody)
                if (extracted) {
                    return `[${studentName}의 과제 내용]\n${extracted.trim()}`
                } else {
                    return `[${studentName}]: ${assign.file_name} 내용 추출 실패`
                }
            } catch (e) {
                console.error(`Failed to extract from ${studentName}'s file:`, e)
                return `[${studentName}]: ${assign.file_name} 분석 오류`
            }
        });

        const studentExtracts = await Promise.all(extractPromises);

        // 4. PASS 2: Synthesize all extracted content into a final HTML summary
        const combinedDocument = studentExtracts.join('\n\n---\n\n')

        const synthPrompt = `당신은 최고 수준의 음향학/오디오 마스터 교수입니다.

아래는 ${weekNumber}주차 수업에 대한 강의 노트와 학생들의 과제 내용을 하나로 합친 종합 문서입니다.

[강의 노트]
${lectureContent}

[학생 과제 종합 내용 (총 ${allAssignments.length}명)]
${combinedDocument}

위 내용을 바탕으로 다음 두 가지를 수행하세요:

1. **과제 타이틀**: 이번 주 과제의 핵심을 담는 학술적이고 간결한 제목을 만들어주세요.
   예: "홈 레코딩 장비 이해와 오디오 인터페이스 실습"

2. **종합 정리본 (HTML)**: 강의 내용과 학생들의 과제를 종합한 이해하기 쉬운 가이드를 HTML로 작성해주세요.
   - <h2>, <h3>, <p>, <ul>, <li>, <strong> 태그 활용
   - 주요 개념, 장비, 팁 등을 체계적으로 정리
   - 사진 삽입 위치는 [IMAGE_PLACEHOLDER]로 표시
   - 아름답고 구조적인 레이아웃

반드시 아래 JSON 형식으로만 응답하세요 (마크다운 코드블록 없이):
{
  "title": "과제 타이틀",
  "html_summary": "HTML 정리본"
}`

        const finalResponse = await callGemini({
            contents: [{ role: 'user', parts: [{ text: synthPrompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 4096 }
        })

        if (!finalResponse) throw new Error('AI synthesis failed')

        // Parse JSON response
        const cleanedResponse = finalResponse.replace(/^```json\s*/m, '').replace(/^```\s*/m, '').replace(/```\s*$/m, '').trim()
        const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/)
        const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}

        let finalHtml = parsed.html_summary || '<p>요약 생성 실패</p>'

        // Inject image URLs
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

    } catch (e: unknown) {
        const error = e as Error
        console.error('Homework AI Process Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
