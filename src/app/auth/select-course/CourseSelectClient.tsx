'use client';
import { useState } from 'react';
import { BookOpen, ChevronRight, Loader2, CheckCircle2, PlusCircle, Headphones } from 'lucide-react';
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
    enrolledClassId: string | null;
    enrolledLessonId: string | null;
    isFirstTime: boolean;
}

export default function CourseSelectClient({ courses, userId, enrolledClassId, enrolledLessonId, isFirstTime }: Props) {
    const router = useRouter();
    const [selectedClass, setSelectedClass] = useState<string | null>(enrolledClassId);
    const [selectedLesson, setSelectedLesson] = useState<string | null>(enrolledLessonId);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [isAuditor, setIsAuditor] = useState(false);

    const handleSelect = async () => {
        if (!selectedClass) {
            setError('정규 클래스를 최소 1과목 선택해야 합니다.');
            return;
        }
        setLoading(true); setError('');
        try {
            const res = await fetch('/api/select-course', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ classId: selectedClass, lessonId: selectedLesson, isAuditor }),
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

    const regularClasses = courses.filter(c => !c.is_private_lesson);
    const privateLessons = courses.filter(c => c.is_private_lesson);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex flex-col items-center justify-center p-6 py-12">
            <div className="w-full max-w-3xl">
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
                            ? '정규 클래스 1개와 개인 실기 레슨을 선택할 수 있습니다. 신중하게 선택하세요.'
                            : '이미 수강 신청된 과목입니다. 과목 변경이 필요하면 관리자에게 문의하세요.'}
                    </p>
                </div>

                {/* Regular Classes */}
                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-indigo-400" /> 정규 클래스 선택 <span className="text-xs text-indigo-300 font-normal ml-2">(1과목 필수)</span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                    {regularClasses.map((course, idx) => {
                        const enrolled = enrolledClassId === course.id;
                        const isSelected = selectedClass === course.id;
                        return (
                            <button
                                key={course.id}
                                onClick={() => setSelectedClass(course.id)}
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

                                {enrolled && (
                                    <div className="absolute top-4 right-12 flex items-center gap-1 bg-emerald-500/20 text-emerald-300 text-xs font-bold px-2 py-1 rounded-full">
                                        <CheckCircle2 className="w-3 h-3" /> 수강중
                                    </div>
                                )}
                                {!enrolled && !isFirstTime && isSelected && (
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

                {/* Private Lessons */}
                {privateLessons.length > 0 && (
                    <>
                        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <Headphones className="w-5 h-5 text-pink-400" /> 개인 실기 레슨 선택 <span className="text-xs text-pink-300 font-normal ml-2">(선택 사항)</span>
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                            {privateLessons.map((course, idx) => {
                                const enrolled = enrolledLessonId === course.id;
                                const isSelected = selectedLesson === course.id;
                                return (
                                    <button
                                        key={course.id}
                                        onClick={() => setSelectedLesson(isSelected ? null : course.id)} // Allow toggling off
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

                                        {enrolled && (
                                            <div className="absolute top-4 right-12 flex items-center gap-1 bg-emerald-500/20 text-emerald-300 text-xs font-bold px-2 py-1 rounded-full">
                                                <CheckCircle2 className="w-3 h-3" /> 수강중
                                            </div>
                                        )}
                                        {!enrolled && !isFirstTime && isSelected && (
                                            <div className="absolute top-4 right-12 flex items-center gap-1 bg-pink-500/20 text-pink-300 text-xs font-bold px-2 py-1 rounded-full">
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
                    </>
                )}

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
                    disabled={!selectedClass || loading}
                    className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-white text-slate-900 font-extrabold text-base hover:bg-slate-100 transition disabled:opacity-40"
                >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ChevronRight className="w-5 h-5" />}
                    {loading ? '처리 중...' : '선택한 과목으로 입장하기'}
                </button>
            </div>
        </div>
    );
}
