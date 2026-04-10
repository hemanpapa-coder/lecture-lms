import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { recordingMidtermQuestions } from '@/lib/exam-questions'

// 서버 환경에서 RLS를 우회하기 위해 사용하는 admin client
const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const courseId = searchParams.get('courseId')

    if (!courseId) {
        return NextResponse.json({ error: 'courseId is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: dbUser } = await supabase.from('users').select('role').eq('id', user.id).single()
    const isAdmin = dbUser?.role === 'admin'

    try {
        const key = `course_${courseId}_mcq_questions`;
        const { data: setting, error } = await supabaseAdmin
            .from('settings')
            .select('value')
            .eq('key', key)
            .single()

        let questions = recordingMidtermQuestions; // 기본값 (로컬 더미 5문제)
        let isMidtermOpen = false;

        if (!error && setting && setting.value) {
            try {
                const parsed = JSON.parse(setting.value);
                if (Array.isArray(parsed)) {
                    questions = parsed;
                } else {
                    questions = parsed.questions || recordingMidtermQuestions;
                    isMidtermOpen = parsed.isMidtermOpen || false;
                }
            } catch (e) {
                console.error("Failed to parse stored questions:", e);
            }
        }

        // 학생에게 보낼 때는 정답과 해설 노출 차단
        if (!isAdmin) {
            questions = questions.map(q => {
                const { answerText, explanation, answerIndex, ...rest } = q;
                return rest as any;
            });
        }

        return NextResponse.json({ questions, isMidtermOpen })
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}

export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: dbUser } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (dbUser?.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    try {
        const body = await request.json()
        const { courseId, questions, isMidtermOpen } = body

        if (!courseId || !questions || !Array.isArray(questions)) {
            return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
        }

        const key = `course_${courseId}_mcq_questions`;
        
        const { error } = await supabaseAdmin
            .from('settings')
            .upsert({
                key: key,
                value: JSON.stringify({ questions, isMidtermOpen }),
                updated_at: new Date().toISOString()
            })

        if (error) throw error;

        return NextResponse.json({ success: true })
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
