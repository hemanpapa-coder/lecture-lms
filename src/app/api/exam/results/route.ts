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

    // 해당 과목 시험 제출 목록 가져오기
    const { data: submissions, error: subError } = await supabaseAdmin
        .from('exam_submissions')
        .select('user_id, content, created_at')
        .eq('course_id', courseId)
        .eq('exam_type', '중간고사')
        .order('created_at', { ascending: true })

    if (subError) return NextResponse.json({ error: subError.message }, { status: 500 })

    // 학생 이름 가져오기
    const userIds = (submissions || []).map((s: any) => s.user_id)
    const { data: users } = await supabaseAdmin
        .from('users')
        .select('id, name, student_id')
        .in('id', userIds)

    const userMap: Record<string, any> = {}
    ;(users || []).forEach((u: any) => { userMap[u.id] = u })

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
            if (Array.isArray(parsed)) {
                questions = parsed
            } else if (parsed.questions && parsed.questions.length > 0) {
                questions = parsed.questions
            }
        } catch (e) {}
    }

    const results = (submissions || []).map((sub: any) => {
        let parsedContent: any = {}
        try {
            parsedContent = typeof sub.content === 'string' ? JSON.parse(sub.content) : sub.content
        } catch (e) {}

        const userInfo = userMap[sub.user_id] || {}
        return {
            userId: sub.user_id,
            fullName: userInfo.name || '이름 없음',
            studentId: userInfo.student_id || '',
            score: parsedContent.score ?? 0,
            isCheated: parsedContent.isCheated ?? false,
            answers: parsedContent.answers || [],
            wrongAnswers: parsedContent.wrongAnswers || [],
            submittedAt: sub.created_at,
        }
    })

    return NextResponse.json({ results, questions })
}
