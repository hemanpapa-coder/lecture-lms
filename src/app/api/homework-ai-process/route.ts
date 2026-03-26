import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getDriveClient } from '@/lib/googleDrive'

export const maxDuration = 120 // 2 minutes due to AI processing

async function uploadToGemini(drive: any, fileId: string, mimeType: string, fileName: string): Promise<string | null> {
    try {
        console.log(`Downloading ${fileName} (${fileId}) from Drive...`)
        const response = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' })
        const buffer = Buffer.from(response.data)

        console.log(`Uploading ${fileName} to Gemini...`)
        const geminiKey = process.env.GEMINI_API_KEY!
        
        // Step 1: Initialize upload
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
        if (!initRes.ok) throw new Error(`Gemini Init Failed: ${await initRes.text()}`)
        
        const uploadUrl = initRes.headers.get('x-goog-upload-url')
        if (!uploadUrl) throw new Error('No upload URL returned')

        // Step 2: Upload bytes
        const uploadRes = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'X-Goog-Upload-Command': 'upload, finalize',
                'X-Goog-Upload-Offset': '0',
            },
            body: buffer
        })
        if (!uploadRes.ok) throw new Error(`Gemini Upload Failed: ${await uploadRes.text()}`)
        
        const uploadData = await uploadRes.json()
        console.log(`Gemini Upload Success: ${uploadData.file.uri}`)
        return uploadData.file.uri
    } catch (error) {
        console.error(`Error uploading file to Gemini:`, error)
        return null
    }
}

export async function POST(req: NextRequest) {
    try {
        const { courseId, weekNumber } = await req.json()
        if (!courseId || !weekNumber) return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })

        const supabase = await createClient()

        // 1. Fetch Students' Assignments
        const { data: assignments } = await supabase
            .from('assignments')
            .select('id, user_id, file_id, file_name, file_url, users(name)')
            .eq('course_id', courseId)
            .eq('week_number', weekNumber)
            .is('deleted_at', null)

        // 1-b. Fetch from board_questions (older submissions)
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
                users: r.users
            })))

        const allAssignments = [...(assignments || []), ...bqAssignments]

        if (allAssignments.length === 0) {
            return NextResponse.json({ message: 'No assignments found' })
        }

        // 2. Fetch the corresponding Lecture Archive
        // The user says "항상 전주에 과제를 내니까요", so week 2 homework corresponds to week 2 lecture (or week 3 lecture).
        // Let's fetch both weekNumber and weekNumber - 1 to be safe, and pass them to AI.
        const { data: archives } = await supabase
            .from('archive_pages')
            .select('content, week_number')
            .eq('course_id', courseId)
            .in('week_number', [weekNumber - 1, weekNumber, weekNumber + 1])
        
        const lectureContent = archives?.map(a => `[${a.week_number}주차 강의내용]\n${a.content}`).join('\n\n') || '강의 노트가 없습니다.'

        // 3. Prepare images and PDFs concurrently
        const drive = getDriveClient()
        const imageUrls: string[] = []
        const studentContents: string[] = []

        const uploadPromises = allAssignments.map(async (assign) => {
            const assignUsers = assign.users as any;
            const studentName = Array.isArray(assignUsers) ? assignUsers[0]?.name : assignUsers?.name || '학생'
            const ext = assign.file_name?.split('.').pop()?.toLowerCase() || ''
            
            if (['jpg', 'png', 'jpeg', 'webp'].includes(ext)) {
                const imgUrl = assign.file_id ? `https://drive.google.com/uc?export=view&id=${assign.file_id}` : assign.file_url
                imageUrls.push(imgUrl)
                
                const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`
                if (assign.file_id) {
                    const uri = await uploadToGemini(drive, assign.file_id, mimeType, assign.file_name)
                    return { uri, mimeType }
                }
            } else if (['pdf', 'docx', 'txt'].includes(ext)) {
                let mimeType = 'application/pdf'
                if (ext === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                if (ext === 'txt') mimeType = 'text/plain'
                
                if (assign.file_id) {
                    studentContents.push(`[${studentName}의 과제 문서가 첨부되었습니다]`)
                    const uri = await uploadToGemini(drive, assign.file_id, mimeType, assign.file_name)
                    return { uri, mimeType }
                }
            } else {
                studentContents.push(`[${studentName} 제출: ${assign.file_name} (지원되지 않는 파일 형식)]`)
            }
            return null
        })

        const uploadedUris = await Promise.all(uploadPromises)
        const allGeminiFiles = uploadedUris.filter(f => f !== null) as { uri: string; mimeType: string }[]
        
        // Prevent exceeding the 1M token limit by restricting the number of sent files
        // Gemini 3.1 Pro Preview might tokenize images/files heavily, so keep this low
        const MAX_FILES_TO_ANALYZE = 3;
        const geminiFiles = allGeminiFiles.slice(0, MAX_FILES_TO_ANALYZE);

        // 4. Generate Content with Gemini
        const prompt = `당신은 최고 수준의 음향학/오디오 마스터 교수입니다. 
다음은 이번 주(${weekNumber}주차) 학생들의 과제 제출물(문서, 이미지)과 지난/이번 주 강의 노트 내용입니다.

[강의 노트]
${lectureContent}

[학생 제출물 요약 목록]
${studentContents.join('\n')}
(실제 파일 내용들은 첨부된 파일 데이터로 확인하세요)

수행할 작업:
1. 학생들의 과제 내용을 모두 읽고 종합적으로 분석하세요.
2. 이번 주 과제의 핵심 주제를 나타내는 간결하고 학술적인 **과제 타이틀**(예: "디지털 오디오 파이프라인 실습")을 하나 정해주세요.
3. 강의 노트 내용과 학생들의 과제 내용을 하나로 합쳐서, 누구나 이해하기 쉬운 **종합 리뷰 및 요약본 (가이드)**를 HTML 형식으로 작성해주세요.
4. 만약 학생들이 과제로 제출한 사진들이 인상깊다면, 정리본 중간중간에 사진이 들어갈 자리를 마련해주세요. 자리 표시자로 \`[IMAGE_PLACEHOLDER]\` 라고 적어주시면 시스템이 실제 사진으로 교체합니다.

응답 형식은 반드시 JSON으로 해주세요:
\`\`\`json
{
  "title": "여기에 과제 타이틀",
  "html_summary": "여기에 HTML 정리본 (h2, p, ul 등을 사용해서 아름답게 구성, [IMAGE_PLACEHOLDER] 포함 가능)"
}
\`\`\``

        const geminiKey = process.env.GEMINI_API_KEY!
        const body = {
            contents: [{
                role: 'user',
                parts: [
                    ...geminiFiles.map(file => ({ fileData: { fileUri: file.uri, mimeType: file.mimeType } })),
                    { text: prompt }
                ]
            }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 8192, responseMimeType: "application/json" }
        }

        console.log('Calling Gemini generateContent...')
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })

        if (!res.ok) throw new Error(`Gemini generateContent Failed: ${await res.text()}`)
        
        const data = await res.json()
        let textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
        
        console.log('Gemini response:', textResponse)
        
        textResponse = textResponse.replace(/^```json\s*/, '').replace(/```$/, '').trim()
        const parsed = JSON.parse(textResponse)

        let finalHtml = parsed.html_summary || ''
        
        // Re-inject image placeholders with actual image URLs
        imageUrls.forEach(url => {
            if (finalHtml.includes('[IMAGE_PLACEHOLDER]')) {
                finalHtml = finalHtml.replace('[IMAGE_PLACEHOLDER]', `<img src="${url}" alt="과제 사진" style="max-width:100%; border-radius:12px; margin: 16px 0;" />`)
            } else {
                finalHtml += `<img src="${url}" alt="과제 사진" style="max-width:100%; border-radius:12px; margin: 16px 0;" />`
            }
        })
        
        // Clean up remaining placeholders
        finalHtml = finalHtml.replace(/\[IMAGE_PLACEHOLDER\]/g, '')

        // 5. Update Database
        // 5-1. Save Title to courses.weekly_homework_titles
        if (parsed.title) {
            const { data: courseData } = await supabase.from('courses').select('weekly_homework_titles').eq('id', courseId).single()
            const existingTitles = courseData?.weekly_homework_titles || {}
            existingTitles[weekNumber.toString()] = parsed.title
            await supabase.from('courses').update({ weekly_homework_titles: existingTitles }).eq('id', courseId)
        }

        // 5-2. Save Summary to archives
        // Note: archives table requires a course_id, title, content, week etc.
        const summaryTitle = `💡 [종합 리뷰] ${weekNumber}주차: ${parsed.title || '과제 종합 정리'}`
        
        const { data: existingArchive } = await supabase
            .from('archives')
            .select('id')
            .eq('course_id', courseId)
            .eq('week', weekNumber)
            .eq('summary_type', 'ai_summary')
            .single()

        if (existingArchive) {
            await supabase.from('archives').update({
                title: summaryTitle,
                description: finalHtml,
            }).eq('id', existingArchive.id)
        } else {
            // Need to provide file_name, file_url (can be empty string or placeholder for summaries)
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
