const fs = require('fs');
const file = 'src/app/workspace/[userId]/exam/midterm-mcq/MidtermMCQClient.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Props
content = content.replace(
`    alreadySubmitted: boolean;
    initialScore?: number;
}) {`,
`    alreadySubmitted: boolean;
    initialScore?: number;
    initialWrongAnswers?: any[];
}) {`
);
content = content.replace(
`    alreadySubmitted,
    initialScore
}: {`,
`    alreadySubmitted,
    initialScore,
    initialWrongAnswers = []
}: {`
);

// 2. State & Shuffling
content = content.replace(
`    const router = useRouter();
    const [hasStarted, setHasStarted] = useState(false);
    const [answers, setAnswers] = useState<number[]>(new Array(questions.length).fill(-1));
    const [currentIdx, setCurrentIdx] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [score, setScore] = useState<number | null>(alreadySubmitted ? (initialScore ?? null) : null);`,
    `    const router = useRouter();
    const [hasStarted, setHasStarted] = useState(false);
    const [answers, setAnswers] = useState<string[]>(new Array(questions.length).fill(''));
    const [currentIdx, setCurrentIdx] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [score, setScore] = useState<number | null>(alreadySubmitted ? (initialScore ?? null) : null);
    const [wrongAnswers, setWrongAnswers] = useState<any[]>(alreadySubmitted ? initialWrongAnswers : []);
    const [shuffledQuestions, setShuffledQuestions] = useState<any[]>([]);

    useEffect(() => {
        if (questions && questions.length > 0 && shuffledQuestions.length === 0) {
            const shuffled = questions.map(q => {
                const opts = [...q.options];
                for (let i = opts.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [opts[i], opts[j]] = [opts[j], opts[i]];
                }
                return { ...q, options: opts };
            });
            setShuffledQuestions(shuffled);
        }
    }, [questions]);`
);


// 3. handleSelect
content = content.replace(
`    const handleSelect = (optionIdx: number) => {
        if (alreadySubmitted || score !== null) return;
        const newAnswers = [...answers];
        newAnswers[currentIdx] = optionIdx;
        setAnswers(newAnswers);
    };`,
`    const handleSelect = (optionText: string) => {
        if (alreadySubmitted || score !== null) return;
        const newAnswers = [...answers];
        newAnswers[currentIdx] = optionText;
        setAnswers(newAnswers);
    };`
);

// 4. handleSubmit
content = content.replace( // replace the string matching part
`        if (answers.includes(-1)) {`,
`        if (answers.includes('')) {`
);
content = content.replace(
`            setScore(data.score);
            alert(\`제출 완료! 점수: \${data.score}점\`);`,
`            setScore(data.score);
            setWrongAnswers(data.wrongAnswers || []);
            alert(\`제출 완료! 점수: \${data.score}점\`);`
);

// 5. Result view
content = content.replace( // Find exactly after this node
`            <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-sm border border-emerald-200 dark:border-emerald-900/50 text-center animate-in fade-in zoom-in duration-500">
                <CheckCircle2 className="w-20 h-20 text-emerald-500 mx-auto mb-6" />
                <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-2">시험 제출 완료</h2>
                <p className="text-slate-500 dark:text-slate-400 mb-8">수고하셨습니다. 제출된 답안이 채점되었습니다.</p>
                
                <div className="inline-block bg-slate-50 dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700 w-full max-w-sm mb-8">
                    <p className="text-sm font-bold text-slate-500 mb-2 uppercase tracking-wide">나의 점수</p>
                    <div className="text-6xl font-black text-indigo-600 dark:text-indigo-400">
                        {score !== null ? \`\${score}점\` : '제출됨'}
                    </div>
                </div>

                <div>`,

`            <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-sm border border-emerald-200 dark:border-emerald-900/50 text-center animate-in fade-in zoom-in duration-500">
                <CheckCircle2 className="w-20 h-20 text-emerald-500 mx-auto mb-6" />
                <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-2">시험 제출 완료</h2>
                <p className="text-slate-500 dark:text-slate-400 mb-8">수고하셨습니다. 제출된 답안이 채점되었습니다.</p>
                
                <div className="inline-block bg-slate-50 dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700 w-full max-w-sm mb-8">
                    <p className="text-sm font-bold text-slate-500 mb-2 uppercase tracking-wide">나의 점수</p>
                    <div className="text-6xl font-black text-indigo-600 dark:text-indigo-400">
                        {score !== null ? \`\${score}점\` : '제출됨'}
                    </div>
                </div>

                {wrongAnswers && wrongAnswers.length > 0 && (
                    <div className="mt-4 mb-8 text-left space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                        <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
                            오답 노트 <span className="text-sm font-normal text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">{wrongAnswers.length}문제</span>
                        </h3>
                        <div className="space-y-4">
                            {wrongAnswers.map((w: any, idx: number) => (
                                <div key={idx} className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-5 border border-red-100 dark:border-red-900/30 shadow-sm relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-red-400 dark:bg-red-500/50"></div>
                                    <p className="font-bold text-slate-800 dark:text-slate-200 mb-3 ml-2"><span className="text-red-500 mr-2">Q.</span>{w.questionText}</p>
                                    <div className="ml-2 pl-4 border-l-2 border-slate-200 dark:border-slate-700 space-y-2 mb-4">
                                        <p className="text-sm text-slate-500 line-through">내가 고른 답: {w.userAnswer || '미선택'}</p>
                                        <p className="text-sm text-emerald-600 dark:text-emerald-400 font-bold">정답: {w.correctAnswer}</p>
                                    </div>
                                    <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-4 text-sm text-indigo-700 dark:text-indigo-300 leading-relaxed border border-indigo-100 dark:border-indigo-900/50 ml-2">
                                        <span className="font-bold mr-2 text-indigo-800 dark:text-indigo-200">💡 해설 :</span>{w.explanation}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div>`
);

// 6. Rendering Logic
content = content.replace(
`    if (!questions || questions.length === 0) {
        return <div className="text-center p-8">로딩중이거나 설정된 문제가 없습니다.</div>;
    }

    const currentQuestion = questions[currentIdx];
    const isAnswered = answers[currentIdx] !== -1;
    const isLastQuestion = currentIdx === questions.length - 1;
    const progressPerc = Math.round(((currentIdx + 1) / questions.length) * 100);`,

`    if (!questions || questions.length === 0 || shuffledQuestions.length === 0) {
        return <div className="text-center p-8">문제를 불러오는 중입니다...</div>;
    }

    const currentQuestion = shuffledQuestions[currentIdx];
    const isAnswered = answers[currentIdx] !== '';
    const isLastQuestion = currentIdx === questions.length - 1;
    const progressPerc = Math.round(((currentIdx + 1) / questions.length) * 100);`
);

// 7. Option mapping
content = content.replace(
`                {currentQuestion.options.map((option, idx) => {
                    const selected = answers[currentIdx] === idx;
                    return (
                        <button
                            key={idx}
                            onClick={() => handleSelect(idx)}`,

`                {currentQuestion.options.map((option: string, idx: number) => {
                    const selected = answers[currentIdx] === option;
                    return (
                        <button
                            key={idx}
                            onClick={() => handleSelect(option)}`
);

// 8. answers map at bottom
content = content.replace(
`                        className={\`w-2.5 h-2.5 rounded-full transition-colors \${idx === currentIdx ? 'bg-indigo-600 ring-2 ring-indigo-200 dark:ring-indigo-900' : ans !== -1 ? 'bg-indigo-400 dark:bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}\`}`,
`                        className={\`w-2.5 h-2.5 rounded-full transition-colors \${idx === currentIdx ? 'bg-indigo-600 ring-2 ring-indigo-200 dark:ring-indigo-900' : ans !== '' ? 'bg-indigo-400 dark:bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}\`}`
);

// update submit button condition
content = content.replace(
`disabled={isSubmitting || answers.includes(-1)}`,
`disabled={isSubmitting || answers.includes('')}`
);

fs.writeFileSync(file, content, 'utf8');
