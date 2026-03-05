'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Star, ChevronDown, ChevronUp, Send, CheckCircle2, Music, Loader2, MessageSquare } from 'lucide-react';

interface Assignment { id: string; week_number: number; file_url: string; content: string; status: string; }
interface Review { assignment_id: string; score: number; comment: string; created_at: string; }

export default function PeerReviewClient({
    currentUserId,
    assignments,
    myReviewMap,
    reviewsByAssignment,
}: {
    currentUserId: string;
    assignments: Assignment[];
    myReviewMap: Record<string, Review>;
    reviewsByAssignment: Record<string, Review[]>;
}) {
    const [expanded, setExpanded] = useState<string | null>(null);
    const [scores, setScores] = useState<Record<string, number>>({});
    const [comments, setComments] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState<string | null>(null);
    const [submitted, setSubmitted] = useState<Record<string, boolean>>({});

    const handleSubmit = async (assignmentId: string) => {
        const score = scores[assignmentId];
        const comment = comments[assignmentId] || '';
        if (!score || score < 1 || score > 10) return alert('1~10점 사이의 점수를 입력하세요.');

        setSubmitting(assignmentId);
        try {
            const res = await fetch('/api/peer-review', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assignmentId, score, comment }),
            });
            if (!res.ok) {
                const d = await res.json();
                throw new Error(d.error || '제출 실패');
            }
            setSubmitted(prev => ({ ...prev, [assignmentId]: true }));
        } catch (err: any) {
            alert(err.message);
        } finally {
            setSubmitting(null);
        }
    };

    const renderStars = (score: number) => (
        <div className="flex gap-0.5">
            {Array.from({ length: 10 }, (_, i) => (
                <Star
                    key={i}
                    className={`w-3.5 h-3.5 ${i < score ? 'fill-amber-400 text-amber-400' : 'text-neutral-200'}`}
                />
            ))}
        </div>
    );

    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-8">
            <div className="mx-auto max-w-3xl space-y-6">

                {/* Header */}
                <header className="rounded-3xl bg-white dark:bg-neutral-900 p-8 shadow-sm border border-neutral-200 dark:border-neutral-800">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-extrabold text-neutral-900 dark:text-white">과제 상호 평가</h1>
                            <p className="text-sm text-neutral-500 mt-2">익명 과제 음원을 듣고 1~10점 점수와 코멘트를 남겨주세요.</p>
                        </div>
                        <Link href="/" className="text-sm font-semibold text-blue-600 hover:underline">← 대시보드</Link>
                    </div>

                    <div className="mt-6 flex items-center gap-6">
                        <div className="text-center">
                            <p className="text-3xl font-extrabold text-neutral-900 dark:text-white">{assignments.length}</p>
                            <p className="text-xs text-neutral-500 font-medium mt-1">평가 가능 과제</p>
                        </div>
                        <div className="text-center">
                            <p className="text-3xl font-extrabold text-indigo-600">
                                {Object.keys(myReviewMap).length + Object.keys(submitted).length}
                            </p>
                            <p className="text-xs text-neutral-500 font-medium mt-1">내가 완료한 평가</p>
                        </div>
                        <div className="text-center">
                            <p className="text-3xl font-extrabold text-emerald-600">
                                {Object.values(reviewsByAssignment).reduce((sum, arr) => sum + arr.length, 0)}
                            </p>
                            <p className="text-xs text-neutral-500 font-medium mt-1">전체 평가 수</p>
                        </div>
                    </div>
                </header>

                {/* Assignment Cards */}
                {assignments.length === 0 ? (
                    <div className="rounded-3xl bg-white dark:bg-neutral-900 p-12 text-center border border-neutral-200 dark:border-neutral-800">
                        <Music className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
                        <p className="text-neutral-500 font-medium">현재 평가할 수 있는 익명 과제가 없습니다.</p>
                        <p className="text-sm text-neutral-400 mt-1">더미 데이터를 주입하면 과제가 표시됩니다.</p>
                    </div>
                ) : (
                    assignments.map((assignment, idx) => {
                        const alreadyReviewed = !!myReviewMap[assignment.id] || submitted[assignment.id];
                        const existingReviews = reviewsByAssignment[assignment.id] || [];
                        const avgScore = existingReviews.length > 0
                            ? (existingReviews.reduce((s, r) => s + r.score, 0) / existingReviews.length).toFixed(1)
                            : null;
                        const isExpanded = expanded === assignment.id;

                        return (
                            <div key={assignment.id} className={`rounded-3xl bg-white dark:bg-neutral-900 shadow-sm border transition-all ${alreadyReviewed ? 'border-emerald-200 dark:border-emerald-800' : 'border-neutral-200 dark:border-neutral-800'}`}>
                                {/* Card Header */}
                                <div className="p-6">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl">
                                                <Music className="w-5 h-5 text-indigo-500" />
                                            </div>
                                            <div>
                                                <h2 className="text-lg font-bold text-neutral-900 dark:text-white">익명 과제 #{idx + 1}</h2>
                                                <p className="text-sm text-neutral-500">{assignment.week_number}주차 제출 과제</p>
                                            </div>
                                        </div>
                                        {alreadyReviewed ? (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold dark:bg-emerald-900/30 dark:text-emerald-400">
                                                <CheckCircle2 className="w-3.5 h-3.5" /> 평가 완료
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 text-purple-700 text-xs font-bold dark:bg-purple-900/30 dark:text-purple-400">
                                                평가 대기중
                                            </span>
                                        )}
                                    </div>

                                    {/* Average Score */}
                                    {avgScore && (
                                        <div className="mb-4 flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 rounded-2xl px-4 py-2.5">
                                            {renderStars(Math.round(parseFloat(avgScore)))}
                                            <span className="text-sm font-bold text-amber-700 dark:text-amber-400">평균 {avgScore}점</span>
                                            <span className="text-xs text-amber-600/70 dark:text-amber-500/70">({existingReviews.length}명 평가)</span>
                                        </div>
                                    )}

                                    {/* Audio Player */}
                                    {assignment.file_url && !assignment.file_url.includes('dummy-url') && (
                                        <div className="mb-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800 p-2">
                                            <p className="text-xs font-semibold mb-2 ml-1 text-neutral-500">과제 음원 듣기</p>
                                            <iframe
                                                src={assignment.file_url.replace('/view', '/preview')}
                                                width="100%"
                                                height="100"
                                                className="rounded-xl border-0"
                                                allow="autoplay"
                                            />
                                        </div>
                                    )}

                                    {/* My Review or Submit Form */}
                                    {alreadyReviewed ? (
                                        <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 p-4 border border-emerald-100 dark:border-emerald-800">
                                            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mb-1">✓ 내가 남긴 평가</p>
                                            <div className="flex items-center gap-2 mb-1">
                                                {myReviewMap[assignment.id] && renderStars(myReviewMap[assignment.id].score)}
                                                <span className="text-sm font-bold text-neutral-700 dark:text-neutral-300">
                                                    {myReviewMap[assignment.id]?.score}점
                                                </span>
                                            </div>
                                            <p className="text-sm text-neutral-600 dark:text-neutral-400">{myReviewMap[assignment.id]?.comment || '코멘트 없음'}</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className="grid grid-cols-4 gap-3">
                                                <input
                                                    type="number"
                                                    min="1" max="10"
                                                    placeholder="점수"
                                                    value={scores[assignment.id] || ''}
                                                    onChange={(e) => setScores(p => ({ ...p, [assignment.id]: parseInt(e.target.value) }))}
                                                    className="col-span-1 rounded-xl border border-neutral-200 p-3 text-sm font-bold text-center outline-none focus:ring-2 focus:ring-indigo-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                                                />
                                                <input
                                                    type="text"
                                                    placeholder="한줄 코멘트를 입력하세요..."
                                                    value={comments[assignment.id] || ''}
                                                    onChange={(e) => setComments(p => ({ ...p, [assignment.id]: e.target.value }))}
                                                    className="col-span-3 rounded-xl border border-neutral-200 p-3 text-sm outline-none focus:ring-2 focus:ring-indigo-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                                                />
                                            </div>
                                            <button
                                                onClick={() => handleSubmit(assignment.id)}
                                                disabled={!!submitting}
                                                className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm py-3 transition disabled:opacity-50"
                                            >
                                                {submitting === assignment.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                                평가 제출하기
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Existing Reviews Expandable */}
                                {existingReviews.length > 0 && (
                                    <div className="border-t border-neutral-100 dark:border-neutral-800">
                                        <button
                                            onClick={() => setExpanded(isExpanded ? null : assignment.id)}
                                            className="w-full flex items-center justify-between px-6 py-4 text-sm font-bold text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition"
                                        >
                                            <span className="flex items-center gap-2">
                                                <MessageSquare className="w-4 h-4" />
                                                다른 학생들의 평가 보기 ({existingReviews.length}건)
                                            </span>
                                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                        </button>

                                        {isExpanded && (
                                            <div className="px-6 pb-6 space-y-3">
                                                {existingReviews.map((review, rIdx) => (
                                                    <div key={rIdx} className="flex items-start gap-3 p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800">
                                                        <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-xs font-bold text-indigo-600 shrink-0">
                                                            {rIdx + 1}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                {renderStars(review.score)}
                                                                <span className="text-xs font-bold text-neutral-600 dark:text-neutral-400">{review.score}점</span>
                                                            </div>
                                                            <p className="text-sm text-neutral-700 dark:text-neutral-300">{review.comment || '—'}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
