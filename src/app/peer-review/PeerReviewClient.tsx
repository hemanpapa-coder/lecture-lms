'use client';

import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Star, User, CheckCircle2, FileText, Music, Youtube, FileAudio, ChevronDown, ChevronUp, ExternalLink, Send } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface PeerReviewClientProps {
    currentUserId: string;
    courseId: string;
    students: any[];
    examSubmissions: any[];
    weeklyAssignments: any[];
    reviewedMap: Record<string, any>;
    reviewCounts: Record<string, number>;
}

export default function PeerReviewClient({
    currentUserId,
    courseId,
    students,
    examSubmissions,
    weeklyAssignments,
    reviewedMap,
    reviewCounts
}: PeerReviewClientProps) {
    const supabase = createClient();
    const router = useRouter();

    const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);

    // Review Form State
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [scoreCompleteness, setScoreCompleteness] = useState(0);
    const [scoreQuality, setScoreQuality] = useState(0);
    const [comment, setComment] = useState('');
    const [hoveredCompleteness, setHoveredCompleteness] = useState(0);
    const [hoveredQuality, setHoveredQuality] = useState(0);

    const toggleStudent = (id: string) => {
        setExpandedStudentId(prev => (prev === id ? null : id));
        // Reset form when opening a new student
        setScoreCompleteness(0);
        setScoreQuality(0);
        setComment('');
    };

    const handleSubmitReview = async (revieweeId: string) => {
        if (!scoreCompleteness || !scoreQuality || !comment.trim()) {
            alert('별점과 코멘트를 모두 남겨주세요.');
            return;
        }

        setIsSubmitting(true);
        try {
            const { error } = await supabase
                .from('portfolio_reviews')
                .upsert({
                    course_id: courseId,
                    reviewer_id: currentUserId,
                    reviewee_id: revieweeId,
                    score_completeness: scoreCompleteness,
                    score_quality: scoreQuality,
                    comment: comment.trim()
                });

            if (error) throw error;
            alert('평가가 성공적으로 등록되었습니다.');
            router.refresh();
        } catch (error: any) {
            console.error('평가 등록 실패:', error);
            alert('평가 등록 중 오류가 발생했습니다.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-20">
            <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href={`/?view=student&course=${courseId}`} className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                            <ArrowLeftIcon className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                        </Link>
                        <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                            상호 평가 갤러리 (Roster)
                        </h1>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 sm:px-6 mt-8">
                <div className="mb-8 bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">동료들의 과제 및 작품을 평가해주세요</h2>
                    <p className="text-slate-500 dark:text-slate-400">
                        수강생 명단을 기준으로 각 학생의 수시(체크포인트), 주차별 과제, 중간고사, 기말작품을 한눈에 모아보고 종합 평가를 남길 수 있습니다. (본인 평가 불가)
                    </p>
                </div>

                <div className="space-y-6">
                    {students.map(student => {
                        const isMe = student.id === currentUserId;
                        const reviewedData = reviewedMap[student.id];
                        const isExpanded = expandedStudentId === student.id;

                        // Filter student specific submissions
                        const s_exams = examSubmissions.filter(e => e.user_id === student.id);
                        const s_weeklys = weeklyAssignments.filter(a => a.user_id === student.id);

                        const checkpoint = s_exams.find(e => e.exam_type === '수시과제PDF');
                        const midterm = s_exams.find(e => e.exam_type === '중간고사');
                        const final = s_exams.find(e => e.exam_type === '기말작품');

                        return (
                            <div key={student.id} className={`bg-white dark:bg-slate-800 rounded-3xl border ${isMe ? 'border-indigo-500/50' : 'border-slate-200 dark:border-slate-700'} shadow-sm overflow-hidden transition-all duration-300`}>
                                {/* Header Row */}
                                <div
                                    className={`p-6 flex items-center justify-between cursor-pointer ${isMe ? 'bg-indigo-50/30 dark:bg-indigo-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors'}`}
                                    onClick={() => !isMe && toggleStudent(student.id)}
                                >
                                    <div className="flex items-center gap-5">
                                        <div className="w-16 h-16 shrink-0 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600 flex items-center justify-center relative">
                                            {student.profile_image_url ? (
                                                <img src={student.profile_image_url} alt={student.full_name} className="w-full h-full object-cover" />
                                            ) : (
                                                <User className="w-8 h-8 text-slate-300 dark:text-slate-500" />
                                            )}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-3">
                                                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{student.full_name || '이름 없음'}</h3>
                                                {isMe && <span className="text-xs font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full dark:bg-indigo-900 dark:text-indigo-300">내 프로필</span>}
                                            </div>
                                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{student.major || '전공 미입력'}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-6">
                                        {!isMe && reviewedData && (
                                            <div className="hidden sm:flex items-center gap-2 text-sm font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 rounded-xl border border-emerald-100 dark:border-emerald-800/30">
                                                <CheckCircle2 className="w-4 h-4" /> 평가 완료
                                            </div>
                                        )}
                                        {!isMe && (
                                            <div className="text-slate-400 dark:text-slate-500">
                                                {isExpanded ? <ChevronUp className="w-6 h-6" /> : <ChevronDown className="w-6 h-6" />}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Expanded Content Area */}
                                {isExpanded && !isMe && (
                                    <div className="border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 p-6 sm:p-8 space-y-8 animate-in slide-in-from-top-4 fade-in duration-300">

                                        {/* Submissions Matrix */}
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                                            {/* Exams & Checkpoint */}
                                            <div className="space-y-4">
                                                <h4 className="text-sm font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                                    <Star className="w-4 h-4" /> 주요 포트폴리오
                                                </h4>
                                                <div className="space-y-3">
                                                    {final ? (
                                                        <a href={final.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-900/50 shadow-sm hover:border-indigo-300 transition-colors group">
                                                            <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500 flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                                                                <Youtube className="w-6 h-6" />
                                                            </div>
                                                            <div className="flex-1">
                                                                <p className="font-bold text-slate-900 dark:text-white mb-0.5">기말 작품</p>
                                                                <p className="text-xs text-slate-500 line-clamp-1">{final.content || '설명 없음'}</p>
                                                            </div>
                                                            <ExternalLink className="w-4 h-4 text-slate-400" />
                                                        </a>
                                                    ) : (
                                                        <div className="flex items-center gap-4 bg-slate-100/50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 opacity-60">
                                                            <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-400 flex items-center justify-center"><Youtube className="w-6 h-6" /></div>
                                                            <div className="flex-1"><p className="font-bold text-slate-700 dark:text-slate-300">기말 작품</p><p className="text-xs text-slate-500">미제출</p></div>
                                                        </div>
                                                    )}

                                                    {midterm ? (
                                                        <a href={midterm.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:border-blue-300 transition-colors group">
                                                            <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-500 flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                                                <FileText className="w-6 h-6" />
                                                            </div>
                                                            <div className="flex-1">
                                                                <p className="font-bold text-slate-900 dark:text-white mb-0.5">중간고사</p>
                                                                <p className="text-xs text-slate-500 line-clamp-1">제출 완료</p>
                                                            </div>
                                                            <ExternalLink className="w-4 h-4 text-slate-400" />
                                                        </a>
                                                    ) : (
                                                        <div className="flex items-center gap-4 bg-slate-100/50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 opacity-60">
                                                            <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-400 flex items-center justify-center"><FileText className="w-6 h-6" /></div>
                                                            <div className="flex-1"><p className="font-bold text-slate-700 dark:text-slate-300">중간고사</p><p className="text-xs text-slate-500">미제출</p></div>
                                                        </div>
                                                    )}

                                                    {checkpoint ? (
                                                        <a href={checkpoint.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:border-emerald-300 transition-colors group">
                                                            <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-500 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                                                                <FileText className="w-6 h-6" />
                                                            </div>
                                                            <div className="flex-1">
                                                                <p className="font-bold text-slate-900 dark:text-white mb-0.5">수시/과제 (통합본)</p>
                                                                <p className="text-xs text-slate-500 line-clamp-1">제출 완료</p>
                                                            </div>
                                                            <ExternalLink className="w-4 h-4 text-slate-400" />
                                                        </a>
                                                    ) : (
                                                        <div className="flex items-center gap-4 bg-slate-100/50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 opacity-60">
                                                            <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-400 flex items-center justify-center"><FileText className="w-6 h-6" /></div>
                                                            <div className="flex-1"><p className="font-bold text-slate-700 dark:text-slate-300">수시/과제 (통합본)</p><p className="text-xs text-slate-500">미제출</p></div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Weekly Assignments */}
                                            <div className="space-y-4">
                                                <h4 className="text-sm font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                                    <FileAudio className="w-4 h-4" /> 주차별 파일
                                                </h4>
                                                {s_weeklys.length > 0 ? (
                                                    <div className="bg-white dark:bg-slate-800 p-2 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm max-h-[260px] overflow-y-auto">
                                                        <ul className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                                            {s_weeklys.map(wk => (
                                                                <li key={wk.id}>
                                                                    <a href={wk.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 rounded-xl transition-colors">
                                                                        <div className="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-black text-xs px-2 py-1 rounded border border-blue-200 dark:border-blue-800 shrink-0">
                                                                            {wk.week_number}주
                                                                        </div>
                                                                        <div className="font-medium text-sm text-slate-700 dark:text-slate-300 truncate">
                                                                            {wk.original_filename || '첨부 파일'}
                                                                        </div>
                                                                    </a>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                ) : (
                                                    <div className="h-full min-h-[140px] flex items-center justify-center bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 border-dashed text-slate-400 text-sm">
                                                        업로드된 주차별 과제가 없습니다.
                                                    </div>
                                                )}
                                            </div>

                                        </div>

                                        {/* Evaluation Form / Readout */}
                                        <div className="mt-8 bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-3xl border border-indigo-100 dark:border-indigo-900 shadow-sm relative overflow-hidden">
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-bl-[100px] blur-2xl pointer-events-none"></div>

                                            <h4 className="text-xl font-black text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                                                <Star className="w-6 h-6 text-yellow-500 fill-yellow-500" /> 동료 평가
                                            </h4>

                                            {reviewedData ? (
                                                <div className="space-y-6">
                                                    <div className="grid grid-cols-2 gap-4 max-w-sm">
                                                        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                                                            <p className="text-xs font-bold text-slate-500 mb-1">곡 완성도</p>
                                                            <div className="flex items-center gap-1">
                                                                {[1, 2, 3, 4, 5].map((star) => (
                                                                    <Star key={star} className={`w-5 h-5 ${star <= reviewedData.score_completeness ? 'text-yellow-500 fill-yellow-500' : 'text-slate-300 dark:text-slate-600'}`} />
                                                                ))}
                                                            </div>
                                                        </div>
                                                        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                                                            <p className="text-xs font-bold text-slate-500 mb-1">레코딩 품질</p>
                                                            <div className="flex items-center gap-1">
                                                                {[1, 2, 3, 4, 5].map((star) => (
                                                                    <Star key={star} className={`w-5 h-5 ${star <= reviewedData.score_quality ? 'text-yellow-500 fill-yellow-500' : 'text-slate-300 dark:text-slate-600'}`} />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="bg-indigo-50/50 dark:bg-indigo-900/20 p-5 rounded-xl border border-indigo-100 dark:border-indigo-800">
                                                        <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400 mb-2">남긴 코멘트</p>
                                                        <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed italic">
                                                            "{reviewedData.comment}"
                                                        </p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-6">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                                        <div>
                                                            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                                                                곡 완성도 별점
                                                            </label>
                                                            <div className="flex gap-1">
                                                                {[1, 2, 3, 4, 5].map((score) => (
                                                                    <button
                                                                        key={score}
                                                                        type="button"
                                                                        onMouseEnter={() => setHoveredCompleteness(score)}
                                                                        onMouseLeave={() => setHoveredCompleteness(0)}
                                                                        onClick={() => setScoreCompleteness(score)}
                                                                        className="p-1 focus:outline-none transition-transform hover:scale-110"
                                                                    >
                                                                        <Star className={`w-8 h-8 transition-colors ${(hoveredCompleteness || scoreCompleteness) >= score ? 'text-yellow-500 fill-yellow-500' : 'text-slate-200 dark:text-slate-700'}`} />
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                                                                레코딩 품질 별점
                                                            </label>
                                                            <div className="flex gap-1">
                                                                {[1, 2, 3, 4, 5].map((score) => (
                                                                    <button
                                                                        key={score}
                                                                        type="button"
                                                                        onMouseEnter={() => setHoveredQuality(score)}
                                                                        onMouseLeave={() => setHoveredQuality(0)}
                                                                        onClick={() => setScoreQuality(score)}
                                                                        className="p-1 focus:outline-none transition-transform hover:scale-110"
                                                                    >
                                                                        <Star className={`w-8 h-8 transition-colors ${(hoveredQuality || scoreQuality) >= score ? 'text-yellow-500 fill-yellow-500' : 'text-slate-200 dark:text-slate-700'}`} />
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                                                            평가 코멘트
                                                        </label>
                                                        <textarea
                                                            value={comment}
                                                            onChange={(e) => setComment(e.target.value)}
                                                            className="w-full h-32 p-4 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
                                                            placeholder="이 동료의 작품에 대한 구체적인 피드백이나 칭찬을 남겨주세요."
                                                        />
                                                    </div>

                                                    <div className="flex justify-end">
                                                        <button
                                                            onClick={() => handleSubmitReview(student.id)}
                                                            disabled={isSubmitting || !scoreCompleteness || !scoreQuality || !comment.trim()}
                                                            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            {isSubmitting ? '등록 중...' : <><Send className="w-4 h-4" /> 평가 등록하기</>}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </main>
        </div>
    );
}

const ArrowLeftIcon = (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M19 12H5" />
        <path d="M12 19l-7-7 7-7" />
    </svg>
)
