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

        if (isCheated) {
            // 부정행위 발각 시 -1점 처리
            score = -1;
        } else {
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
            const totalCount = questions.length;
            const wrongAnswers: any[] = [];
            
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
        const { data: existingEval } = await supabase
            .from('evaluations')
            .select('id')
            .eq('user_id', user.id)
            .eq('course_id', course_id)
            .maybeSingle()

        if (existingEval) {
            const { error } = await supabase
                .from('evaluations')
                .update({ midterm_score: score, updated_at: new Date().toISOString() })
                .eq('id', existingEval.id)
            if (error) throw error;
        } else {
            const { error } = await supabase
                .from('evaluations')
                .insert({ user_id: user.id, course_id, midterm_score: score, updated_at: new Date().toISOString() })
            if (error) throw error;
        }
        
        // Update exam_submissions table
        const { data: existingSub } = await supabase
            .from('exam_submissions')
            .select('id')
            .eq('user_id', user.id)
            .eq('course_id', course_id)
            .eq('exam_type', '중간고사')
            .maybeSingle()

        if (existingSub) {
            await supabase
                .from('exam_submissions')
                .update({
                    file_name: isCheated ? '객관식_부정행위차단.txt' : '객관식_온라인시험_제출완료.txt',
                    file_url: '#',
                    content: JSON.stringify({ score, answers: answers || [], isCheated, wrongAnswers }),
                    status: isCheated ? 'blocked' : 'submitted'
                })
                .eq('id', existingSub.id)
                .catch(e => console.error('Exam submission log error:', e));
        } else {
            await supabase
                .from('exam_submissions')
                .insert({
                    user_id: user.id,
                    course_id,
                    exam_type: '중간고사',
                    file_name: isCheated ? '객관식_부정행위차단.txt' : '객관식_온라인시험_제출완료.txt',
                    file_url: '#',
                    content: JSON.stringify({ score, answers: answers || [], isCheated, wrongAnswers }),
                    status: isCheated ? 'blocked' : 'submitted'
                })
                .catch(e => console.error('Exam submission log error:', e));
        }

        return NextResponse.json({ success: true, score, wrongAnswers: isCheated ? [] : wrongAnswers })
    } catch (e: any) {
        console.error('Exam submit error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
