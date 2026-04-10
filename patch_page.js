const fs = require('fs');
const file = 'src/app/workspace/[userId]/exam/midterm-mcq/page.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
`    const alreadySubmitted = evaluation?.midterm_score !== null && evaluation?.midterm_score !== undefined;
    const initialScore = evaluation?.midterm_score;`,
`    const alreadySubmitted = evaluation?.midterm_score !== null && evaluation?.midterm_score !== undefined;
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
    }`
);

content = content.replace(
`    // 학생에게 전달할 때는 클라이언트 단에서 정답(answerIndex)을 알 수 없게 마스킹하여 내려보냅니다.
    const maskedQuestions = questions.map(q => {
         const { answerIndex, ...rest } = q as any;
         return rest;
    });`,
`    // 학생에게 전달할 때는 클라이언트 단에서 정답 및 해설을 알 수 없게 마스킹하여 내려보냅니다.
    const maskedQuestions = questions.map(q => {
         const { answerText, explanation, ...rest } = q as any;
         return rest;
    });`
);

content = content.replace(
`                    questions={maskedQuestions}
                    alreadySubmitted={alreadySubmitted}
                    initialScore={initialScore}
                />`,
`                    questions={maskedQuestions}
                    alreadySubmitted={alreadySubmitted}
                    initialScore={initialScore}
                    initialWrongAnswers={initialWrongAnswers}
                />`
);

fs.writeFileSync(file, content, 'utf8');
