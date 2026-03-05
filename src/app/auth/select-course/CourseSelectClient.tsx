'use client';
import { useState } from 'react';
import { BookOpen, ChevronRight, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

const COURSE_ICONS = ['🎵', '🎶', '🎙️', '🎛️'];
const COURSE_COLORS = [
    'from-blue-500 to-indigo-600',
    'from-purple-500 to-pink-600',
    'from-emerald-500 to-teal-600',
    'from-orange-500 to-red-500',
];

export default function CourseSelectClient({ courses, userId }: { courses: any[]; userId: string }) {
    const router = useRouter();
    const [selected, setSelected] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSelect = async () => {
        if (!selected) return;
        setLoading(true); setError('');
        try {
            const res = await fetch('/api/select-course', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ courseId: selected }),
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
            router.push('/');
        } catch (e: any) {
            setError(e.message); setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-6">
            <div className="w-full max-w-2xl">
                {/* Header */}
                <div className="text-center mb-10">
                    <div className="inline-flex p-4 bg-white/10 rounded-3xl mb-6">
                        <BookOpen className="w-10 h-10 text-white" />
                    </div>
                    <h1 className="text-3xl font-extrabold text-white mb-3">수강 과목을 선택하세요</h1>
                    <p className="text-slate-400 text-sm">선택한 과목의 학습 공간으로 입장합니다. 추후 변경은 불가합니다.</p>
                </div>

                {/* Course Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                    {courses.map((course, idx) => (
                        <button
                            key={course.id}
                            onClick={() => setSelected(course.id)}
                            className={`relative text-left p-6 rounded-3xl border-2 transition-all duration-200 ${selected === course.id
                                    ? 'border-white bg-white/15 scale-[1.02] shadow-2xl shadow-white/10'
                                    : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/30'
                                }`}
                        >
                            <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${COURSE_COLORS[idx % 4]} flex items-center justify-center text-2xl mb-4`}>
                                {COURSE_ICONS[idx % 4]}
                            </div>
                            <h2 className="text-lg font-extrabold text-white mb-1">{course.name}</h2>
                            <p className="text-sm text-slate-400">{course.description}</p>
                            {selected === course.id && (
                                <div className="absolute top-4 right-4 w-6 h-6 bg-white rounded-full flex items-center justify-center">
                                    <div className="w-3 h-3 bg-indigo-600 rounded-full" />
                                </div>
                            )}
                        </button>
                    ))}
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
