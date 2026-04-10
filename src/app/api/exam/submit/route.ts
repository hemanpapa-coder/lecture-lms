import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { recordingMidtermQuestions } from '@/lib/exam-questions'

export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const body = await request.json()
        const { course_id, answers } = body

        if (!course_id || !answers || !Array.isArray(answers)) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
        }

        // 1. 점수 계산
        let correctCount = 0;
        const totalCount = recordingMidtermQuestions.length;
        
        recordingMidtermQuestions.forEach((q, index) => {
            if (answers[index] === q.answerIndex) {
                correctCount++;
            }
        });

        // 100점 만점으로 환산
        const score = Math.round((correctCount / totalCount) * 100);

        // 2. evaluations 테이블에 midterm_score 저장
        // evaluations 테이블이 존재하는지 확인하고 upsert
        const { error } = await supabase
            .from('evaluations')
            .upsert({
                user_id: user.id,
                course_id,
                midterm_score: score,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id,course_id'
            })

        if (error) {
            console.error('Eval update error:', error);
            throw error;
        }
        
        // 3. (선택) exam_submissions에 기록 남기기 (제출 확인용)
        // 객관식은 파일 제출형태가 아니지만, 제출했다는 기록을 남기기 위해 가짜 레코드를 넣을 수 있음
        // UI에서 제출 완료 여부를 알기 쉽게 하기 위함
        await supabase
            .from('exam_submissions')
            .upsert({
                user_id: user.id,
                course_id,
                exam_type: '중간고사',
                file_name: '객관식_온라인시험_제출완료.txt',
                file_url: '#',
                content: JSON.stringify({ score, answers }), // 상세 내용을 content에 저장
                status: 'submitted'
            }, {
                onConflict: 'course_id,user_id,exam_type'
            }).catch(e => console.error('Exam submission log error:', e));

        return NextResponse.json({ success: true, score })
    } catch (e: any) {
        console.error('Exam submit error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
