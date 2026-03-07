'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UserCircle, Loader2, ChevronRight, GraduationCap, BookOpen } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

const GRADES = [1, 2, 3, 4];

type Course = { id: string; name: string };

export default function ProfileSetupClient({
    email, existingData
}: {
    email: string;
    existingData: { name: string; department: string; student_id: string; grade: number; phone: string; major: string; course_id: string };
}) {
    const router = useRouter();
    const supabase = createClient();
    const [form, setForm] = useState(existingData);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [courses, setCourses] = useState<Course[]>([]);

    useEffect(() => {
        supabase.from('courses').select('id, name').order('name').then(({ data }) => {
            if (data) setCourses(data);
        });
    }, []);

    const set = (k: string, v: string | number) => setForm(prev => ({ ...prev, [k]: v }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name) { setError('이름을 입력해 주세요.'); return; }
        if (!form.department || !form.student_id) {
            setError('학부/학과와 학번은 필수 항목입니다.'); return;
        }
        if (!form.course_id) { setError('수강할 과목을 선택해 주세요.'); return; }
        setLoading(true); setError('');
        try {
            const res = await fetch('/api/profile-setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || '저장 실패');
            router.push('/');
            router.refresh();
        } catch (err: any) {
            setError(err.message);
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-6">
            <div className="w-full max-w-lg">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex p-4 bg-white/10 rounded-3xl mb-5">
                        <GraduationCap className="w-10 h-10 text-white" />
                    </div>
                    <h1 className="text-2xl font-extrabold text-white mb-2">프로필 정보 입력</h1>
                    <p className="text-slate-400 text-sm">
                        시스템 이용을 위해 먼저 <span className="text-indigo-300 font-bold">학생 기본 정보</span>를 입력해 주세요.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="bg-white/10 backdrop-blur rounded-3xl p-8 space-y-5 border border-white/10">
                    {/* Email (read-only) */}
                    <div>
                        <label className="block text-sm font-bold text-slate-300 mb-1.5">이메일</label>
                        <input
                            type="text" disabled value={email}
                            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-slate-400 text-sm"
                        />
                    </div>

                    {/* 이름 */}
                    <div>
                        <label className="block text-sm font-bold text-slate-300 mb-1.5">이름 <span className="text-red-400">*</span></label>
                        <input
                            type="text" placeholder="예: 홍길동"
                            value={form.name}
                            onChange={e => set('name', e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder-slate-500 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                    </div>

                    {/* 학부 */}
                    <div>
                        <label className="block text-sm font-bold text-slate-300 mb-1.5">학부 / 단과대학 <span className="text-red-400">*</span></label>
                        <input
                            type="text" placeholder="예: 공과대학 / 예술대학"
                            value={form.department}
                            onChange={e => set('department', e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder-slate-500 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* 학번 */}
                        <div>
                            <label className="block text-sm font-bold text-slate-300 mb-1.5">학번 <span className="text-red-400">*</span></label>
                            <input
                                type="text" placeholder="예: 20231234"
                                value={form.student_id}
                                onChange={e => set('student_id', e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder-slate-500 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                            />
                        </div>

                        {/* 학년 */}
                        <div>
                            <label className="block text-sm font-bold text-slate-300 mb-1.5">학년 <span className="text-red-400">*</span></label>
                            <div className="flex gap-2">
                                {GRADES.map(g => (
                                    <button
                                        key={g} type="button"
                                        onClick={() => set('grade', g)}
                                        className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all border ${form.grade === g
                                            ? 'bg-indigo-600 text-white border-indigo-500'
                                            : 'bg-white/10 text-slate-400 border-white/10 hover:bg-white/20'
                                            }`}
                                    >
                                        {g}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* 전공 */}
                    <div>
                        <label className="block text-sm font-bold text-slate-300 mb-1.5">전공</label>
                        <input
                            type="text" placeholder="예: 음악공학 / 실용음악"
                            value={form.major}
                            onChange={e => set('major', e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder-slate-500 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                    </div>

                    {/* 전화번호 */}
                    <div>
                        <label className="block text-sm font-bold text-slate-300 mb-1.5">전화번호</label>
                        <input
                            type="tel" placeholder="예: 010-1234-5678"
                            value={form.phone}
                            onChange={e => set('phone', e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder-slate-500 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                    </div>

                    {/* 수강 과목 선택 */}
                    <div>
                        <label className="block text-sm font-bold text-slate-300 mb-2">
                            수강 신청 과목 <span className="text-red-400">*</span>
                        </label>
                        <div className="space-y-2">
                            {courses.length === 0 && (
                                <p className="text-slate-500 text-sm">과목 목록을 불러오는 중...</p>
                            )}
                            {courses.map(course => (
                                <label
                                    key={course.id}
                                    className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${form.course_id === course.id
                                        ? 'border-indigo-500 bg-indigo-500/20'
                                        : 'border-white/10 bg-white/5 hover:border-white/20'
                                        }`}
                                >
                                    <input
                                        type="radio"
                                        name="course"
                                        value={course.id}
                                        checked={form.course_id === course.id}
                                        onChange={() => set('course_id', course.id)}
                                        className="sr-only"
                                    />
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${form.course_id === course.id ? 'border-indigo-500 bg-indigo-500' : 'border-white/30'}`}>
                                        {form.course_id === course.id && (
                                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                        )}
                                    </div>
                                    <span className="text-sm font-bold text-white flex items-center gap-2">
                                        <BookOpen className="w-4 h-4 text-indigo-400 shrink-0" />
                                        {course.name}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {error && <p className="text-red-400 text-sm text-center">{error}</p>}

                    <button
                        type="submit" disabled={loading}
                        className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-indigo-600 text-white font-extrabold hover:bg-indigo-500 transition disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ChevronRight className="w-5 h-5" />}
                        {loading ? '저장 중...' : '등록 완료 — 수업 입장'}
                    </button>
                </form>
            </div>
        </div>
    );
}
