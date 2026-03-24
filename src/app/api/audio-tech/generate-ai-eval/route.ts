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
        const { studentId, courseId, instructions, previousEvaluation } = await req.json()
        if (!studentId || !courseId) return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })

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

        let systemInstruction = `당신은 '오디오테크놀러지' 과목의 전문적이고 통찰력 있는 교수입니다. 
주어진 학생의 데이터를 분석하여 종합적인 성적(총 100점 만점)을 산출하고, 각 과제/발표별 세부 평가서와 종합 평가서를 작성해주세요.
출석은 30점 만점(15회 기준, 1회 결석 시 감점), 참여도는 20점 만점, 과제 및 발표 등은 50점 만점으로 추정하여 총합 100점 기준으로 할당하세요. (제출물의 텍스트나 로그를 분석해 노력을 칭찬하거나 보완점을 짚어주세요)
답변은 아래 JSON 스키마를 엄격히 준수해야 합니다.
{
  "total_score": 85,
  "attendance_score": 30,
  "participation_score": 20,
  "assignment_score": 35,
  "overall_feedback": "이 학생은 성실하게 참여했으며... 종합 평가 텍스트",
  "assignment_feedbacks": [
    { "exam_type": "과제명 (예: 발표 1주차)", "feedback": "세부 과제에 대한 평가 내용" }
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
