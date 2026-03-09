'use client';
import { useState } from 'react';
import { BookOpen, ChevronRight, Loader2, CheckCircle2, PlusCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

const COURSE_ICONS = ['🎵', '🎶', '🎙️', '🎛️'];
const COURSE_COLORS = [
    'from-blue-500 to-indigo-600',
    'from-purple-500 to-pink-600',
    'from-emerald-500 to-teal-600',
    'from-orange-500 to-red-500',
];

interface Props {
    courses: any[];
    userId: string;
    enrolledIds: string[];
    isFirstTime: boolean;
}

export default function CourseSelectClient({ courses, userId, enrolledIds, isFirstTime }: Props) {
    const router = useRouter();
    const [selected, setSelected] = useState<string | null>(
        // If only 1 enrolled, auto-select it for convenience
        enrolledIds.length === 1 && !isFirstTime ? enrolledIds[0] : null
    );
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [isAuditor, setIsAuditor] = useState(false);

    const handleSelect = async () => {
        if (!selected) return;
        setLoading(true); setError('');
        try {
            const res = await fetch('/api/select-course', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ courseId: selected, isAuditor }),
            });
            const data = await res.json();
            if (!res.ok) {
                if (res.status === 409 && data.alreadyEnrolled) {
                    setError(data.error);
                } else {
                    throw new Error(data.error);
                }
                setLoading(false);
                return;
            }
            router.push('/');
            router.refresh();
        } catch (e: any) {
            setError(e.message); setLoading(false);
        }
    };

    const isEnrolled = (courseId: string) => enrolledIds.includes(courseId);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-6">
            <div className="w-full max-w-2xl">
                {/* Header */}
                <div className="text-center mb-10">
                    <div className="inline-flex p-4 bg-white/10 rounded-3xl mb-6">
                        <BookOpen className="w-10 h-10 text-white" />
                    </div>
                    <h1 className="text-3xl font-extrabold text-white mb-3">
                        {isFirstTime ? '수강 과목을 선택하세요' : '수강 과목 확인'}
                    </h1>
                    <p className="text-slate-400 text-sm">
                        {isFirstTime
                            ? '한 과목만 수강 신청할 수 있습니다. 신중하게 선택하세요.'
                            : '이미 수강 신청된 과목입니다. 과목 변경이 필요하면 관리자에게 문의하세요.'}
                    </p>
                </div>

                {/* Course Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                    {courses.map((course, idx) => {
                        const enrolled = isEnrolled(course.id);
                        const isSelected = selected === course.id;
                        return (
                            <button
                                key={course.id}
                                onClick={() => setSelected(course.id)}
                                className={`relative text-left p-6 rounded-3xl border-2 transition-all duration-200 ${isSelected
                                    ? 'border-white bg-white/15 scale-[1.02] shadow-2xl shadow-white/10'
                                    : enrolled
                                        ? 'border-emerald-400/50 bg-emerald-900/20 hover:bg-emerald-900/30 hover:border-emerald-400'
                                        : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/30'
                                    }`}
                            >
                                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${COURSE_COLORS[idx % 4]} flex items-center justify-center text-2xl mb-4`}>
                                    {COURSE_ICONS[idx % 4]}
                                </div>
                                <h2 className="text-lg font-extrabold text-white mb-1">{course.name}</h2>
                                <p className="text-sm text-slate-400">{course.description}</p>

                                {/* Enrolled badge */}
                                {enrolled && (
                                    <div className="absolute top-4 right-12 flex items-center gap-1 bg-emerald-500/20 text-emerald-300 text-xs font-bold px-2 py-1 rounded-full">
                                        <CheckCircle2 className="w-3 h-3" /> 수강중
                                    </div>
                                )}

                                {/* New badge */}
                                {!enrolled && !isFirstTime && (
                                    <div className="absolute top-4 right-12 flex items-center gap-1 bg-indigo-500/20 text-indigo-300 text-xs font-bold px-2 py-1 rounded-full">
                                        <PlusCircle className="w-3 h-3" /> 새로 수강
                                    </div>
                                )}

                                {isSelected && (
                                    <div className="absolute top-4 right-4 w-6 h-6 bg-white rounded-full flex items-center justify-center">
                                        <div className="w-3 h-3 bg-indigo-600 rounded-full" />
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>

                <div className="mb-6 bg-white/5 border border-white/10 p-4 rounded-2xl flex items-center justify-between cursor-pointer hover:bg-white/10 transition" onClick={() => setIsAuditor(!isAuditor)}>
                    <div>
                        <h3 className="text-white font-bold text-sm">청강 자격으로 참석합니다</h3>
                        <p className="text-slate-400 text-xs mt-0.5">과제 제출이나 성적 산출 대상에서 제외됩니다.</p>
                    </div>
                    <div className={`w-6 h-6 rounded border flex items-center justify-center transition ${isAuditor ? 'bg-indigo-500 border-indigo-500' : 'bg-slate-800 border-slate-600'}`}>
                        {isAuditor && <CheckCircle2 className="w-4 h-4 text-white" />}
                    </div>
                </div>

                {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}

                <button
                    onClick={handleSelect}
                    disabled={!selected || loading}
                    className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-white text-slate-900 font-extrabold text-base hover:bg-slate-100 transition disabled:opacity-40"
                >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ChevronRight className="w-5 h-5" />}
                    {loading ? '처리 중...' : '이 과목으로 입장하기'}
                </button>
            </div>
        </div>
    );
}
