import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const maxDuration = 60

export async function POST(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Only admins/professors should generate evals
    const { data: userRow } = await supabase.from('users').select('role, email').eq('id', user.id).single()
    if (userRow?.role !== 'admin' && userRow?.email !== 'hemanpapa@gmail.com') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    try {
        const { studentId, courseId, courseName, instructions, previousEvaluation } = await req.json()
        if (!studentId || !courseId || !courseName) return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })

        // Fetch student's data
        const [
            { data: student },
            { data: attendances },
            { data: logs },
            { data: submissions },
            { data: evaluation }
        ] = await Promise.all([
            supabase.from('users').select('name, email').eq('id', studentId).single(),
            supabase.from('class_attendances').select('*').eq('user_id', studentId).eq('course_id', courseId),
            supabase.from('production_logs').select('*').eq('user_id', studentId).eq('course_id', courseId),
            supabase.from('exam_submissions').select('*').eq('user_id', studentId).eq('course_id', courseId),
            supabase.from('evaluations').select('*').eq('user_id', studentId).eq('course_id', courseId).maybeSingle()
        ])

        // Construct context
        const participationScore = evaluation?.midterm_score || 0
        const attendanceCount = attendances?.filter(a => a.status === '출석').length || 0

        let contextPrompt = `학생 이름: ${student?.name || '익명'}
출석 기록: 총 15주 중 ${attendanceCount}회 출석
참여도 점수(자가평가 또는 임시부여): ${participationScore} / 20

[제출된 과제 및 발표 내용]
`
        if (submissions && submissions.length > 0) {
            submissions.forEach(sub => {
                contextPrompt += `- [${sub.exam_type}] 파일명: ${sub.file_name}, 제출일: ${new Date(sub.created_at).toLocaleDateString()}, 작성내용: ${sub.content || '없음'}\n`
            })
        } else {
            contextPrompt += `- 제출 내역 없음\n`
        }

        contextPrompt += `\n[작성된 강의 요약 및 연구 일지]
`
        if (logs && logs.length > 0) {
            logs.forEach(log => {
                contextPrompt += `- [${log.week_number}주차] ${log.content}\n`
            })
        } else {
            contextPrompt += `- 작성 내역 없음\n`
        }

        if (previousEvaluation) {
            contextPrompt += `\n[기존 AI 평가서 초안]\n${JSON.stringify(previousEvaluation, null, 2)}\n`
        }

        let systemInstruction = `당신은 핵심 과목 '${courseName}'의 전문적이고 통찰력 있는 교수입니다. 
주어진 학생의 출결/수업참여/과제작성/일지기록 데이터를 종합적으로 분석하여 성적표(총 100점 만점)와 상세 피드백을 산출해주세요.
성적은 출석(30점, 결석 시 감점), 참여도(20점), 과제/발표 등(50점) 비율로 책정하되, 수업의 특징이나 제출된 자료의 실질적인 퀄리티를 반영하여 유연하게 점수와 피드백을 작성하세요.
답변은 아래 JSON 스키마를 엄격히 준수해야 합니다.
{
  "total_score": 85,
  "attendance_score": 30,
  "participation_score": 20,
  "assignment_score": 35,
  "overall_feedback": "학생의 성실함과 보완할 점을 포함한 종합 평가 텍스트",
  "assignment_feedbacks": [
    { "exam_type": "과제/발표명", "feedback": "세부 제출물에 대한 구체적인 평가" }
  ]
}`

        if (instructions) {
            systemInstruction += `\n\n[추가 지시사항 (수정 요청)]
교수님이 기존 평가 내용을 바탕으로 다음과 같이 수정하라고 지시했습니다. 이 지시사항을 반영하여 완전히 새로운 JSON 평가서를 출력하세요:
지시사항: ${instructions}`
        }

        const geminiKey = process.env.GEMINI_API_KEY!
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${geminiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: systemInstruction }] },
                    contents: [{ role: 'user', parts: [{ text: contextPrompt }] }],
                    generationConfig: {
                        temperature: 0.2,
                        responseMimeType: 'application/json'
                    }
                })
            }
        )

        if (!res.ok) {
            const errText = await res.text()
            throw new Error(`Gemini API Error: ${errText}`)
        }

        const data = await res.json()
        const textResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
        
        let parsedResult
        try {
            parsedResult = JSON.parse(textResponse)
        } catch (e) {
            const cleaned = textResponse.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim()
            parsedResult = JSON.parse(cleaned)
        }

        return NextResponse.json({ evaluation: parsedResult })

    } catch (e: any) {
        console.error('generate-ai-eval error:', e)
        return NextResponse.json({ error: e.message || 'AI 평가 생성에 실패했습니다.' }, { status: 500 })
    }
}
