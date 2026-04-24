import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { recordingMidtermQuestions } from '@/lib/exam-questions'

const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const body = await request.json()
        const { course_id, answers, isCheated } = body

        if (!course_id) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
        }

        let score = 0;
        let wrongAnswers: any[] = [];

        // isCheated 처리 비활성화 (2026-04-24): 부정행위 감지 기능 제거됨
        // if (isCheated) { score = -1; }
        {
            if (!answers || !Array.isArray(answers)) {
                return NextResponse.json({ error: 'Missing answers' }, { status: 400 })
            }

            // DB에서 원본 문제 가져오기
            const key = `course_${course_id}_mcq_questions`;
            const { data: setting, error: settingsError } = await supabaseAdmin
                .from('settings')
                .select('value')
                .eq('key', key)
                .single()

            let questions = recordingMidtermQuestions;

            if (!settingsError && setting && setting.value) {
                try {
                    const parsed = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value;
                    if (Array.isArray(parsed)) {
                        questions = parsed;
                    } else {
                        questions = (parsed.questions && parsed.questions.length > 0) ? parsed.questions : recordingMidtermQuestions;
                    }
                } catch (e) {
                    console.error("Failed to parse stored questions:", e);
                }
            }

            let correctCount = 0;
            questions.forEach((q: any, index: number) => {
                if (answers[index] === q.answerText || answers[index] === q.answerIndex) {
                    correctCount++;
                } else {
                    wrongAnswers.push({
                        questionId: q.id,
                        questionText: q.text,
                        userAnswer: answers[index],
                        correctAnswer: q.answerText,
                        explanation: q.explanation
                    });
                }
            });

            score = correctCount;
        }

        // Update evaluations table
        const { data: existingEval } = await supabaseAdmin
            .from('evaluations')
            .select('user_id')
            .eq('user_id', user.id)
            .eq('course_id', course_id)
            .maybeSingle()

        if (existingEval) {
            const { error: evalError } = await supabaseAdmin
                .from('evaluations')
                .update({ midterm_score: score, updated_at: new Date().toISOString() })
                .eq('user_id', user.id)
                .eq('course_id', course_id)
            if (evalError) throw evalError;
        } else {
            const { error: evalError } = await supabaseAdmin
                .from('evaluations')
                .insert({ user_id: user.id, course_id, midterm_score: score, updated_at: new Date().toISOString() })
            if (evalError) throw evalError;
        }

        // Update exam_submissions table
        try {
            const { data: existingSub } = await supabaseAdmin
                .from('exam_submissions')
                .select('user_id')
                .eq('user_id', user.id)
                .eq('course_id', course_id)
                .eq('exam_type', '중간고사')
                .maybeSingle()

            const submissionData = {
                file_name: isCheated ? '객관식_부정행위차단.txt' : '객관식_온라인시험_제출완료.txt',
                file_url: '#',
                content: JSON.stringify({ score, answers: answers || [], isCheated, wrongAnswers }),
            }

            if (existingSub) {
                const { error: subError } = await supabaseAdmin
                    .from('exam_submissions')
                    .update(submissionData)
                    .eq('user_id', user.id)
                    .eq('course_id', course_id)
                    .eq('exam_type', '중간고사')
                if (subError) console.error('Exam submission update error:', subError);
            } else {
                const { error: subError } = await supabaseAdmin
                    .from('exam_submissions')
                    .insert({
                        user_id: user.id,
                        course_id,
                        exam_type: '중간고사',
                        ...submissionData
                    })
                if (subError) console.error('Exam submission insert error:', subError);
            }
        } catch (subErr) {
            console.error('Exam submission log error:', subErr);
        }

        return NextResponse.json({ success: true, score, wrongAnswers: isCheated ? [] : wrongAnswers })
    } catch (e: any) {
        console.error('Exam submit error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
