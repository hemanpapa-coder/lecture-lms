import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import BackButton from '../BackButton'
import MidtermMCQClient from './MidtermMCQClient'
import { recordingMidtermQuestions } from '@/lib/exam-questions'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function MidtermMCQPage(
    props: { params: Promise<{ userId: string }>, searchParams: Promise<{ course?: string }> }
) {
    const params = await props.params
    const searchParams = await props.searchParams
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/auth/login')
    }

    // 권한 체크
    const { data: currentUser } = await supabase.from('users').select('*').eq('id', user.id).single()
    const isRealAdmin = currentUser?.role === 'admin'
    const isOwnProfile = user.id === params.userId

    if (!isRealAdmin && !isOwnProfile) {
        return <div className="p-8 text-center text-red-500 font-bold">권한이 없습니다.</div>
    }

    const { data: student } = await supabase.from('users').select('*').eq('id', params.userId).single()
    const activeCourseId = searchParams?.course || student?.course_id

    if (!activeCourseId) {
        return <div className="p-8 text-center text-slate-500 font-bold">과목 정보를 찾을 수 없습니다.</div>
    }

    const { data: course } = await supabase.from('courses').select('*').eq('id', activeCourseId).single()
    
    // 이전에 제출했는지 확인 (evaluations.midterm_score 참조)
    const { data: evaluation } = await supabase
        .from('evaluations')
        .select('*')
        .eq('user_id', params.userId)
        .eq('course_id', activeCourseId)
        .single()

    const alreadySubmitted = evaluation?.midterm_score !== null && evaluation?.midterm_score !== undefined;
    const initialScore = evaluation?.midterm_score;

    let initialWrongAnswers: any[] = [];
    if (alreadySubmitted) {
        const { data: submission } = await supabase
            .from('exam_submissions')
            .select('content')
            .eq('user_id', params.userId)
            .eq('course_id', activeCourseId)
            .eq('exam_type', '중간고사')
            .single();
            
        if (submission && submission.content) {
            try {
                const parsed = typeof submission.content === 'string' ? JSON.parse(submission.content) : submission.content;
                initialWrongAnswers = parsed.wrongAnswers || [];
            } catch(e) {}
        }
    }

    // DB에서 실시간 객관식 문제 가져오기 (관리자 권한 bypass)
    let questions = recordingMidtermQuestions;
    const key = `course_${activeCourseId}_mcq_questions`;
    const { data: setting, error: settingsError } = await supabaseAdmin
        .from('settings')
        .select('value')
        .eq('key', key)
        .single()
        
    if (!settingsError && setting && setting.value) {
        try {
            questions = JSON.parse(setting.value);
        } catch(e) {
            console.error(e);
        }
    }

    // 학생에게 전달할 때는 클라이언트 단에서 정답 및 해설을 알 수 없게 마스킹하여 내려보냅니다.
    const maskedQuestions = questions.map(q => {
         const { answerText, explanation, answerIndex, ...rest } = q as any;
         return rest;
    });

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-8">
            <div className="max-w-2xl mx-auto space-y-6">
                <div>
                    <BackButton />
                </div>

                <div className="text-center mb-6">
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white">중간고사</h1>
                    <p className="text-slate-500 mt-2">{course?.name} - {student?.name} 학생</p>
                </div>

                <MidtermMCQClient 
                    userId={params.userId}
                    courseId={activeCourseId}
                    courseName={course?.name || ''}
                    questions={maskedQuestions}
                    alreadySubmitted={alreadySubmitted}
                    initialScore={initialScore}
                    initialWrongAnswers={initialWrongAnswers}
                />
            </div>
        </div>
    )
}
