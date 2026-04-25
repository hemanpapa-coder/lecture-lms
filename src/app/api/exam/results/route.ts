import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { recordingMidtermQuestions } from '@/lib/exam-questions'

const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const courseId = searchParams.get('courseId')
    if (!courseId) return NextResponse.json({ error: 'Missing courseId' }, { status: 400 })

    // 시험 문제 가져오기
    const { data: setting } = await supabaseAdmin
        .from('settings')
        .select('value')
        .eq('key', `course_${courseId}_mcq_questions`)
        .maybeSingle()

    let questions = recordingMidtermQuestions
    if (setting?.value) {
        try {
            const parsed = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value
            if (Array.isArray(parsed)) questions = parsed
            else if (parsed.questions?.length > 0) questions = parsed.questions
        } catch {}
    }

    // 1차: exam_submissions에서 상세 답안 조회
    const { data: submissions } = await supabaseAdmin
        .from('exam_submissions')
        .select('user_id, content, created_at')
        .eq('course_id', courseId)
        .eq('exam_type', '중간고사')
        .order('created_at', { ascending: true })

    // 학생 정보 조회 (두 경로 모두 필요)
    const { data: allEvals } = await supabaseAdmin
        .from('evaluations')
        .select('user_id, midterm_score, updated_at')
        .eq('course_id', courseId)

    const { data: allUsers } = await supabaseAdmin
        .from('users')
        .select('id, name, student_id, major')
        .eq('course_id', courseId)
        .is('deleted_at', null)
        .eq('is_approved', true)

    const userMap: Record<string, any> = {}
    ;(allUsers || []).forEach((u: any) => { userMap[u.id] = u })

    const evalMap: Record<string, any> = {}
    ;(allEvals || []).forEach((e: any) => { evalMap[e.user_id] = e })

    let results: any[] = []

    if (submissions && submissions.length > 0) {
        // exam_submissions 데이터 있음 → 상세 답안 포함
        const subUserIds = new Set(submissions.map((s: any) => s.user_id))

        results = submissions.map((sub: any) => {
            let parsedContent: any = {}
            try { parsedContent = typeof sub.content === 'string' ? JSON.parse(sub.content) : sub.content } catch {}
            const userInfo = userMap[sub.user_id] || {}
            const evalInfo = evalMap[sub.user_id] || {}
            return {
                userId: sub.user_id,
                fullName: userInfo.name || '이름 없음',
                studentId: userInfo.student_id || '',
                major: userInfo.major || '실용음악',
                score: parsedContent.score ?? evalInfo.midterm_score ?? 0,
                isCheated: parsedContent.isCheated ?? false,
                answers: parsedContent.answers || [],
                wrongAnswers: parsedContent.wrongAnswers || [],
                submittedAt: sub.created_at,
                hasDetail: true,
            }
        })

        // exam_submissions에 없지만 evaluations에 있는 학생 → 점수만 표시
        for (const ev of (allEvals || [])) {
            if (!subUserIds.has(ev.user_id) && ev.midterm_score != null) {
                const userInfo = userMap[ev.user_id] || {}
                results.push({
                    userId: ev.user_id,
                    fullName: userInfo.name || '이름 없음',
                    studentId: userInfo.student_id || '',
                    major: userInfo.major || '실용음악',
                    score: ev.midterm_score,
                    isCheated: false,
                    answers: [],
                    wrongAnswers: [],
                    submittedAt: ev.updated_at,
                    hasDetail: false,
                })
            }
        }
    } else {
        // exam_submissions 없음 → evaluations 폴백 (오늘 시험처럼 상세 답안 저장 실패한 경우)
        results = (allEvals || [])
            .filter((ev: any) => ev.midterm_score != null)
            .map((ev: any) => {
                const userInfo = userMap[ev.user_id] || {}
                return {
                    userId: ev.user_id,
                    fullName: userInfo.name || '이름 없음',
                    studentId: userInfo.student_id || '',
                    major: userInfo.major || '실용음악',
                    score: ev.midterm_score,
                    isCheated: false,
                    answers: [],
                    wrongAnswers: [],
                    submittedAt: ev.updated_at,
                    hasDetail: false,
                }
            })
    }

    if (!results.length) {
        return NextResponse.json({ error: '제출된 시험 답안이 없습니다.' }, { status: 404 })
    }

    return NextResponse.json({ results, questions })
}
