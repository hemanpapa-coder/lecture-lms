'use client';
import { useState, useEffect } from 'react';
import { Question } from '@/lib/exam-questions';
import { Loader2, CheckCircle2, ChevronRight, ChevronLeft, AlertCircle, ShieldAlert, PlayCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import StudentExamPDFButton from '@/app/components/StudentExamPDFButton';

export default function MidtermMCQClient({
    userId,
    courseId,
    courseName,
    questions,
    alreadySubmitted,
    initialScore,
    initialWrongAnswers
}: {
    userId: string;
    courseId: string;
    courseName: string;
    questions: Question[];
    alreadySubmitted: boolean;
    initialScore?: number;
    initialWrongAnswers?: any[];
}) {
    const router = useRouter();
    const [hasStarted, setHasStarted] = useState(false);
    const [answers, setAnswers] = useState<string[]>(new Array(questions.length).fill(''));
    const [currentIdx, setCurrentIdx] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [score, setScore] = useState<number | null>(alreadySubmitted ? (initialScore ?? null) : null);
    const [wrongAnswers, setWrongAnswers] = useState<any[]>(alreadySubmitted ? (initialWrongAnswers || []) : []);
    const [shuffledQuestions, setShuffledQuestions] = useState<any[]>([]);

    useEffect(() => {
        if (questions && questions.length > 0 && shuffledQuestions.length === 0) {
            const shuffled = questions.map(q => {
                const opts = [...q.options];
                // Fisher-Yates Shuffle
                for (let i = opts.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [opts[i], opts[j]] = [opts[j], opts[i]];
                }
                return { ...q, options: opts };
            });
            setShuffledQuestions(shuffled);
        }
    }, [questions]);
    
    // 부정행위 감지 기능 비활성화됨 (2026-04-24)

    const handleSelect = (optionText: string) => {
        if (alreadySubmitted || score !== null) return;
        const newAnswers = [...answers];
        newAnswers[currentIdx] = optionText;
        setAnswers(newAnswers);
    };

    const handleNext = () => {
        if (currentIdx < questions.length - 1) {
            setCurrentIdx(prev => prev + 1);
        }
    };

    const handlePrev = () => {
        if (currentIdx > 0) {
            setCurrentIdx(prev => prev - 1);
        }
    };

    const handleSubmit = async () => {
        if (answers.includes('')) {
            alert('모든 문제에 답을 선택해주세요!');
            return;
        }
        if (!confirm('제출 후에는 수정할 수 없습니다. 제출하시겠습니까?')) return;

        setIsSubmitting(true);
        try {
            const res = await fetch('/api/exam/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ course_id: courseId, answers, isCheated: false })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            setScore(data.score);
            setWrongAnswers(data.wrongAnswers || []);
            alert(`제출 완료! 점수: ${data.score}점`);
        } catch (err: any) {
            alert(err.message || '제출 중 오류가 발생했습니다.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // 결과 화면 / 이미 제출한 경우 / 부정행위 차단된 경우
    if (alreadySubmitted || score !== null) {
        if (score === -1) {
             return (
                 <div className="bg-red-50 dark:bg-red-900/10 rounded-3xl p-8 shadow-sm border border-red-200 dark:border-red-900 text-center animate-in fade-in zoom-in duration-500">
                     <ShieldAlert className="w-20 h-20 text-red-500 mx-auto mb-6" />
                     <h2 className="text-2xl font-black text-red-700 dark:text-red-400 mb-2">시험 접근 차단됨</h2>
                     <p className="text-red-600 dark:text-red-300 font-bold mb-2">시험 중 부정행위 (브라우저 이탈, 탭 전환 등)가 감지되어 시험이 강제 종료되었습니다.</p>
                     <p className="text-sm text-red-500 mb-8">관리자(교수님)의 재응시 허가가 있어야만 시험을 다시 볼 수 있습니다.</p>
                     <button onClick={() => router.push(`/workspace/${userId}?course=${courseId}`)} className="px-6 py-3 bg-red-600 dark:bg-red-500 text-white font-bold rounded-xl hover:bg-red-700 dark:hover:bg-red-600 transition">
                         대시보드로 돌아가기
                     </button>
                 </div>
             )
        }

        return (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-sm border border-emerald-200 dark:border-emerald-900/50 text-center animate-in fade-in zoom-in duration-500">
                <CheckCircle2 className="w-20 h-20 text-emerald-500 mx-auto mb-6" />
                <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-2">시험 제출 완료</h2>
                <p className="text-slate-500 dark:text-slate-400 mb-8">수고하셨습니다. 제출된 답안이 채점되었습니다.</p>
                
                <div className="inline-block bg-slate-50 dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700 w-full max-w-sm mb-8">
                    <p className="text-sm font-bold text-slate-500 mb-2 uppercase tracking-wide">나의 점수</p>
                    <div className="text-6xl font-black text-indigo-600 dark:text-indigo-400">
                        {score !== null ? `${score}점` : '제출됨'}
                    </div>
                </div>

                {wrongAnswers && wrongAnswers.length > 0 && (
                    <div className="mt-4 mb-8 text-left space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                        <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
                            오답 노트 해설 <span className="text-sm font-normal text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">{wrongAnswers.length}문제</span>
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

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <StudentExamPDFButton
                        userId={userId}
                        courseId={courseId}
                        courseName={courseName}
                    />
                    <button onClick={() => router.push(`/workspace/${userId}?course=${courseId}`)} className="px-6 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition">
                        대시보드로 돌아가기
                    </button>
                </div>
            </div>
        );
    }

    if (!hasStarted) {
        return (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-sm border border-indigo-200 dark:border-indigo-900/50 text-center animate-in fade-in zoom-in duration-500 max-w-xl mx-auto mt-10">
                <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6 dark:bg-indigo-900/30 dark:text-indigo-400">
                    <ShieldAlert className="w-10 h-10" />
                </div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-4">온라인 중간고사 안내</h2>
                <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-2xl text-left border border-slate-100 dark:border-slate-700 mb-8 space-y-4 shadow-inner">
                    <p className="text-sm text-slate-700 dark:text-slate-300 font-bold">⚠️ 부정행위 감지 시스템이 작동 중입니다.</p>
                    <ul className="list-disc list-inside text-sm text-slate-600 dark:text-slate-400 space-y-2">
                        <li>시험이 시작되면 <strong className="text-red-500">브라우저 창을 닫거나, 다른 앱/탭으로 이동시 즉시 0점 (차단) 처리</strong>됩니다.</li>
                        <li>카카오톡 등 알림을 누르셔도 화면 포커스를 잃어 부정행위로 간주될 수 있으니 주의하세요.</li>
                        <li>충분한 시간이 있으니 당황하지 않고 풀어주세요.</li>
                    </ul>
                </div>
                <button 
                    onClick={() => setHasStarted(true)} 
                    className="w-full flex justify-center items-center gap-2 px-6 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg rounded-2xl shadow-lg shadow-indigo-200 dark:shadow-none transition-transform active:scale-95"
                >
                    <PlayCircle className="w-6 h-6" /> 확인했습니다. 시험을 시작합니다.
                </button>
            </div>
        );
    }

    if (!questions || questions.length === 0 || shuffledQuestions.length === 0) {
        return <div className="text-center p-8">문제를 불러오는 중입니다...</div>;
    }

    const currentQuestion = shuffledQuestions[currentIdx];
    const isAnswered = answers[currentIdx] !== '';
    const isLastQuestion = currentIdx === questions.length - 1;
    const progressPerc = Math.round(((currentIdx + 1) / questions.length) * 100);

    return (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200 dark:border-slate-800 relative overflow-hidden">
            {/* Progress Bar */}
            <div className="absolute top-0 left-0 w-full h-1.5 bg-slate-100 dark:bg-slate-800">
                <div className="h-full bg-indigo-600 transition-all duration-300" style={{ width: `${progressPerc}%` }} />
            </div>

            <div className="flex items-center justify-between mb-8 mt-2">
                <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">{courseName} 중간고사</h2>
                <span className="text-xs font-bold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-3 py-1 rounded-full">
                    {currentIdx + 1} / {questions.length}
                </span>
            </div>

            {/* Question */}
            <div className="mb-8">
                <h3 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white leading-relaxed">
                    <span className="text-indigo-600 mr-2">Q{currentQuestion.id}.</span> 
                    {currentQuestion.text}
                </h3>
            </div>

            {/* Options (Mobile Friendly Large Touch Targets) */}
            <div className="space-y-3 mb-12">
                {currentQuestion.options.map((option: string, idx: number) => {
                    const selected = answers[currentIdx] === option;
                    return (
                        <button
                            key={idx}
                            onClick={() => handleSelect(option)}
                            className={`w-full flex items-center p-5 rounded-2xl border-2 text-left transition-all active:scale-[0.98] ${
                                selected 
                                    ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-900 dark:text-indigo-100 shadow-md shadow-indigo-100 dark:shadow-none' 
                                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 text-slate-700 dark:text-slate-300'
                            }`}
                        >
                            <div className={`w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full border-2 mr-4 font-bold transition-colors ${
                                selected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 dark:border-slate-600 text-slate-400'
                            }`}>
                                {idx + 1}
                            </div>
                            <span className="text-lg font-medium leading-tight">{option}</span>
                        </button>
                    );
                })}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between pt-6 border-t border-slate-100 dark:border-slate-800">
                <button
                    onClick={handlePrev}
                    disabled={currentIdx === 0}
                    className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                >
                    <ChevronLeft className="w-5 h-5" /> 이전
                </button>

                {isLastQuestion ? (
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || answers.includes('')}
                        className="flex items-center gap-2 px-8 py-3 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-200 dark:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <AlertCircle className="w-5 h-5" />}
                        최종 제출
                    </button>
                ) : (
                    <button
                        onClick={handleNext}
                        className="flex items-center gap-2 px-8 py-3 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200 dark:shadow-none transition-all"
                    >
                        다음 <ChevronRight className="w-5 h-5" />
                    </button>
                )}
            </div>
            
            {/* Answer Map Indicator */}
            <div className="mt-8 flex justify-center gap-1.5 flex-wrap">
                {answers.map((ans, idx) => (
                    <div 
                        key={idx} 
                        className={`w-2.5 h-2.5 rounded-full transition-colors ${idx === currentIdx ? 'bg-indigo-600 ring-2 ring-indigo-200 dark:ring-indigo-900' : ans !== '' ? 'bg-indigo-400 dark:bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}`}
                    />
                ))}
            </div>
        </div>
    );
}
