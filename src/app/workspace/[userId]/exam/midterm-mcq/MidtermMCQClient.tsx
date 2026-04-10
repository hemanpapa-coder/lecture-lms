'use client';
import { useState } from 'react';
import { Question } from '@/lib/exam-questions';
import { Loader2, CheckCircle2, ChevronRight, ChevronLeft, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function MidtermMCQClient({
    userId,
    courseId,
    courseName,
    questions,
    alreadySubmitted,
    initialScore
}: {
    userId: string;
    courseId: string;
    courseName: string;
    questions: Question[];
    alreadySubmitted: boolean;
    initialScore?: number;
}) {
    const router = useRouter();
    const [answers, setAnswers] = useState<number[]>(new Array(questions.length).fill(-1));
    const [currentIdx, setCurrentIdx] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [score, setScore] = useState<number | null>(alreadySubmitted ? (initialScore ?? null) : null);
    
    const handleSelect = (optionIdx: number) => {
        if (alreadySubmitted || score !== null) return;
        const newAnswers = [...answers];
        newAnswers[currentIdx] = optionIdx;
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
        if (answers.includes(-1)) {
            alert('모든 문제에 답을 선택해주세요!');
            return;
        }
        if (!confirm('제출 후에는 수정할 수 없습니다. 제출하시겠습니까?')) return;

        setIsSubmitting(true);
        try {
            const res = await fetch('/api/exam/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ course_id: courseId, answers })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            setScore(data.score);
            alert(`제출 완료! 점수: ${data.score}점`);
        } catch (err: any) {
            alert(err.message || '제출 중 오류가 발생했습니다.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // 결과 화면 / 이미 제출한 경우
    if (alreadySubmitted || score !== null) {
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

                <div>
                    <button onClick={() => router.push(`/workspace/${userId}?course=${courseId}`)} className="px-6 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition">
                        대시보드로 돌아가기
                    </button>
                </div>
            </div>
        );
    }

    const currentQuestion = questions[currentIdx];
    const isAnswered = answers[currentIdx] !== -1;
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
                {currentQuestion.options.map((option, idx) => {
                    const selected = answers[currentIdx] === idx;
                    return (
                        <button
                            key={idx}
                            onClick={() => handleSelect(idx)}
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
                        disabled={isSubmitting || answers.includes(-1)}
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
                        className={`w-2.5 h-2.5 rounded-full transition-colors ${idx === currentIdx ? 'bg-indigo-600 ring-2 ring-indigo-200 dark:ring-indigo-900' : ans !== -1 ? 'bg-indigo-400 dark:bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}`}
                    />
                ))}
            </div>
        </div>
    );
}
