'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserCircle, Loader2, ChevronRight, GraduationCap } from 'lucide-react';

const GRADES = [1, 2, 3, 4];

export default function ProfileSetupClient({
    email, courseName, existingData
}: {
    email: string;
    courseName: string;
    existingData: { department: string; student_id: string; grade: number; phone: string; major: string };
}) {
    const router = useRouter();
    const [form, setForm] = useState(existingData);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const set = (k: string, v: string | number) => setForm(prev => ({ ...prev, [k]: v }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.department || !form.student_id || !form.major || !form.phone) {
            setError('모든 항목을 입력해 주세요.'); return;
        }
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
                        <span className="text-indigo-300 font-bold">{courseName}</span> 수업 등록을 위해 학생 정보를 입력하세요.
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
                        <label className="block text-sm font-bold text-slate-300 mb-1.5">전공 <span className="text-red-400">*</span></label>
                        <input
                            type="text" placeholder="예: 음악공학 / 실용음악"
                            value={form.major}
                            onChange={e => set('major', e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder-slate-500 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                    </div>

                    {/* 전화번호 */}
                    <div>
                        <label className="block text-sm font-bold text-slate-300 mb-1.5">전화번호 <span className="text-red-400">*</span></label>
                        <input
                            type="tel" placeholder="예: 010-1234-5678"
                            value={form.phone}
                            onChange={e => set('phone', e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder-slate-500 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                    </div>

                    {error && <p className="text-red-400 text-sm text-center">{error}</p>}

                    <button
                        type="submit" disabled={loading}
                        className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-white text-slate-900 font-extrabold hover:bg-slate-100 transition disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ChevronRight className="w-5 h-5" />}
                        {loading ? '저장 중...' : '등록 완료 — 수업 입장'}
                    </button>
                </form>
            </div>
        </div>
    );
}
