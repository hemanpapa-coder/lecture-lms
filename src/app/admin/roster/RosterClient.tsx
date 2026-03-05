'use client';
import Link from 'next/link';
import { Users, ArrowLeft, Music, Phone, Hash, GraduationCap, Download } from 'lucide-react';

const NOTE_COLORS: Record<string, string> = {
    '기타': 'bg-amber-100 text-amber-700',
    '보컬': 'bg-pink-100 text-pink-700',
    '싱어송라이터': 'bg-purple-100 text-purple-700',
    '드럼/퍼커션': 'bg-red-100 text-red-700',
    '사운드엔지니어링': 'bg-blue-100 text-blue-700',
    '작편곡': 'bg-indigo-100 text-indigo-700',
    '미디어뮤직': 'bg-teal-100 text-teal-700',
    '건반': 'bg-green-100 text-green-700',
    '베이스': 'bg-orange-100 text-orange-700',
};

type Student = {
    id: string; no: number; department: string; major_class: string;
    grade: number; student_number: string; name: string; phone: string;
    note: string; early_employment: boolean; profile_image_url?: string | null;
};

export default function RosterClient({
    courses, activeCourseId, activeCourseName, students,
}: {
    courses: { id: string; name: string }[];
    activeCourseId: string | null;
    activeCourseName: string;
    students: Student[];
}) {
    const grade1 = students.filter(s => s.grade === 1);
    const grade2 = students.filter(s => s.grade >= 2);

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans">
            {/* Header */}
            <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-8 py-5">
                <div className="mx-auto max-w-7xl flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/admin" className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition">
                            <ArrowLeft className="w-5 h-5 text-slate-500" />
                        </Link>
                        <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl dark:bg-indigo-900/30">
                            <Users className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">2026학년도 1학기</div>
                            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
                                {activeCourseName} 수강명단
                            </h1>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-bold">
                            총 {students.length}명
                        </span>
                    </div>
                </div>

                {/* Course Tabs */}
                <div className="mx-auto max-w-7xl mt-4 flex gap-2">
                    {courses.map(c => (
                        <Link
                            key={c.id}
                            href={`/admin/roster?course=${c.id}`}
                            className={`px-5 py-2 rounded-xl text-sm font-bold border transition-all ${activeCourseId === c.id
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                                }`}
                        >
                            {c.name}
                        </Link>
                    ))}
                </div>
            </header>

            <main className="mx-auto max-w-7xl p-8 space-y-8">
                {students.length === 0 ? (
                    <div className="text-center py-20 text-slate-400">
                        <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
                        <p className="text-lg font-bold">수강명단이 없습니다</p>
                        <p className="text-sm mt-1">SQL 파일을 실행하여 명단을 등록하세요.</p>
                    </div>
                ) : (
                    <>
                        {/* Stats */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {[
                                { label: '전체', value: students.length, icon: '👥', color: 'indigo' },
                                { label: '1학년', value: grade1.length, icon: '🌱', color: 'emerald' },
                                { label: '2학년 이상', value: grade2.length, icon: '🎓', color: 'blue' },
                                { label: '전공 수', value: [...new Set(students.map(s => s.note))].length, icon: '🎵', color: 'purple' },
                            ].map(stat => (
                                <div key={stat.label} className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-800">
                                    <div className="text-2xl mb-1">{stat.icon}</div>
                                    <div className="text-2xl font-extrabold text-slate-900 dark:text-white">{stat.value}</div>
                                    <div className="text-sm text-slate-500">{stat.label}</div>
                                </div>
                            ))}
                        </div>

                        {/* Table */}
                        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                            <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                                <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">전체 수강생 명단</h2>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 dark:bg-slate-800/50">
                                            <th className="text-left px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">No</th>
                                            <th className="text-left px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">성명</th>
                                            <th className="text-left px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">학부(과)</th>
                                            <th className="text-left px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">학과반</th>
                                            <th className="text-left px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">학년</th>
                                            <th className="text-left px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">학번</th>
                                            <th className="text-left px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">연락처</th>
                                            <th className="text-left px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">전공/악기</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                                        {students.map((s, idx) => (
                                            <tr key={s.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors ${idx % 2 === 0 ? '' : 'bg-slate-50/40 dark:bg-slate-800/10'}`}>
                                                <td className="px-6 py-4 text-slate-400 font-mono text-xs">{s.no}</td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        {s.profile_image_url ? (
                                                            <img src={s.profile_image_url} alt={s.name} className="w-8 h-8 rounded-full object-cover shadow-sm flex-shrink-0" />
                                                        ) : (
                                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm">
                                                                {s.name[0]}
                                                            </div>
                                                        )}
                                                        <span className="font-bold text-slate-900 dark:text-white">{s.name}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{s.department}</td>
                                                <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{s.major_class}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2 py-1 rounded-lg text-xs font-black ${s.grade === 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                                        {s.grade}학년
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 font-mono text-slate-600 dark:text-slate-400 text-xs">{s.student_number}</td>
                                                <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{s.phone}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${NOTE_COLORS[s.note] || 'bg-slate-100 text-slate-600'}`}>
                                                        {s.note}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
