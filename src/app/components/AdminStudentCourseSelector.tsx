'use client';
import { BookOpen, ChevronRight } from 'lucide-react';
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
}

export default function AdminStudentCourseSelector({ courses }: Props) {
    const router = useRouter();

    const handleSelect = (courseId: string) => {
        router.push(`/?view=student&course=${courseId}`);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-6 font-sans">
            <div className="w-full max-w-4xl">
                {/* Header */}
                <div className="text-center mb-10">
                    <div className="inline-flex p-4 bg-white/10 rounded-3xl mb-6">
                        <BookOpen className="w-10 h-10 text-white" />
                    </div>
                    <h1 className="text-3xl font-extrabold text-white mb-3">
                        학생 뷰 과목 선택
                    </h1>
                    <p className="text-slate-400 text-sm">
                        관리자(조교, 교수 권한)로서 확인할 과목의 학생용 페이지를 선택해 주세요.
                    </p>
                </div>

                {/* Course Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                    {courses?.map((course, idx) => {
                        return (
                            <button
                                key={course.id}
                                onClick={() => handleSelect(course.id)}
                                className="group relative text-left p-6 rounded-3xl border-2 border-white/10 bg-white/5 hover:bg-white/10 hover:border-indigo-400/50 hover:shadow-2xl hover:shadow-indigo-500/20 hover:-translate-y-1 transition-all duration-300"
                            >
                                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${COURSE_COLORS[idx % 4]} flex items-center justify-center text-2xl mb-4 shadow-lg`}>
                                    {COURSE_ICONS[idx % 4]}
                                </div>
                                <h2 className="text-xl font-extrabold text-white mb-2 group-hover:text-indigo-300 transition-colors">{course.name}</h2>
                                {course.description && (
                                    <p className="text-sm text-slate-400 line-clamp-2">{course.description}</p>
                                )}

                                <div className="absolute right-6 top-6 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white text-slate-400 transition-colors">
                                    <ChevronRight className="w-4 h-4" />
                                </div>
                            </button>
                        );
                    })}
                </div>

                <div className="text-center mt-8">
                    <button
                        onClick={() => router.push('/?view=admin')}
                        className="px-6 py-3 rounded-xl bg-white/10 text-white font-bold hover:bg-white/20 transition-colors text-sm"
                    >
                        관리자 페이지로 돌아가기
                    </button>
                </div>
            </div>
        </div>
    );
}
