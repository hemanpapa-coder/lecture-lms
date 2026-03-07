'use client';
import { useState, useEffect } from 'react';
import { Loader2, GraduationCap, BookOpen, CheckCircle2, Clock } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

const GRADES = [1, 2, 3, 4];
type Course = { id: string; name: string };

// Auto-format phone number: 01012345678 -> 010-1234-5678
function formatPhone(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 11);
    if (digits.length < 4) return digits;
    if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export default function ProfileSetupClient({
    email, existingData
}: {
    email: string;
    existingData: { name: string; department: string; student_id: string; grade: number; phone: string; major: string; course_id: string };
}) {
    const supabase = createClient();
    const [form, setForm] = useState(existingData);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [submitted, setSubmitted] = useState(false);  // show approval-waiting screen
    const [courses, setCourses] = useState<Course[]>([]);

    useEffect(() => {
        supabase.from('courses').select('id, name').order('name').then(({ data }) => {
            if (data) setCourses(data);
        });
    }, []);

    const set = (k: string, v: string | number) => setForm(prev => ({ ...prev, [k]: v }));

    const handlePhone = (raw: string) => set('phone', formatPhone(raw));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim()) { setError('이름을 입력해 주세요.'); return; }
        if (!form.department.trim()) { setError('학부/학과를 입력해 주세요.'); return; }
        if (!form.student_id.trim()) { setError('학번을 입력해 주세요.'); return; }
        if (!form.course_id) { setError('수강할 과목을 선택해 주세요.'); return; }

        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/profile-setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });

            // Check if response is actually JSON
            const contentType = res.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
                throw new Error(`서버 오류가 발생했습니다. (HTTP ${res.status})`);
            }

            const d = await res.json();
            if (!res.ok) throw new Error(d.error || '저장에 실패했습니다.');

            // Show approval waiting screen instead of navigating away
            setSubmitted(true);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const [approved, setApproved] = useState(false);

    // Auto-poll for approval after submission
    useEffect(() => {
        if (!submitted) return;
        const interval = setInterval(async () => {
            const { data } = await supabase
                .from('users')
                .select('is_approved')
                .single();
            if (data?.is_approved) {
                clearInterval(interval);
                setApproved(true);
            }
        }, 5000); // check every 5 seconds
        return () => clearInterval(interval);
    }, [submitted]);

    // ✅ POST-SUBMISSION: waiting or approved screen
    if (submitted) {
        const selectedCourse = courses.find(c => c.id === form.course_id);
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-6">
                <div className="w-full max-w-md text-center space-y-6">

                    {/* Icon - amber waiting / green approved */}
                    <div className="relative inline-flex">
                        <div className={`w-24 h-24 rounded-3xl border flex items-center justify-center mx-auto transition-all duration-500
                            ${approved
                                ? 'bg-emerald-500/20 border-emerald-500/40'
                                : 'bg-amber-500/20 border-amber-500/30'}`}>
                            {approved
                                ? <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                                : <Clock className="w-12 h-12 text-amber-400 animate-pulse" />}
                        </div>
                    </div>

                    {/* Status heading */}
                    <div>
                        {approved ? (
                            <>
                                <h1 className="text-2xl font-black text-emerald-400 mt-4">인증 완료! 🎉</h1>
                                <p className="text-slate-300 mt-2 text-sm leading-relaxed">
                                    교수님이 수강을 승인했습니다.<br />
                                    이제 LMS를 이용하실 수 있습니다.
                                </p>
                            </>
                        ) : (
                            <>
                                <h1 className="text-2xl font-black text-white mt-4">수강 신청 완료!</h1>
                                <p className="text-slate-400 mt-2 text-sm leading-relaxed">
                                    정보가 저장되었습니다.<br />
                                    <span className="text-indigo-300 font-bold">교수님의 수강 승인</span>을 기다리는 중입니다.
                                </p>
                                <div className="flex items-center justify-center gap-2 mt-3">
                                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                                    <span className="text-amber-400 text-xs font-bold">승인 대기 중... (자동 확인 중)</span>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Info summary */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 text-left space-y-3">
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">신청 정보 요약</div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                                <p className="text-slate-500 text-xs mb-0.5">이름</p>
                                <p className="text-white font-bold">{form.name}</p>
                            </div>
                            <div>
                                <p className="text-slate-500 text-xs mb-0.5">학번</p>
                                <p className="text-white font-bold">{form.student_id}</p>
                            </div>
                            <div>
                                <p className="text-slate-500 text-xs mb-0.5">학부</p>
                                <p className="text-white font-bold">{form.department}</p>
                            </div>
                            <div>
                                <p className="text-slate-500 text-xs mb-0.5">신청 과목</p>
                                <p className="text-indigo-300 font-bold">{selectedCourse?.name || '-'}</p>
                            </div>
                        </div>
                    </div>

                    {/* CTA */}
                    {approved ? (
                        <a
                            href="/"
                            className="w-full inline-block py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm transition text-center"
                        >
                            LMS 입장하기 →
                        </a>
                    ) : (
                        <p className="text-slate-600 text-xs">
                            승인이 완료되면 이 화면에서 바로 알려드립니다.
                        </p>
                    )}
                </div>
            </div>
        );
    }

    // 📝 FORM
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-6">
            <div className="w-full max-w-lg">
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
                    {/* Email */}
                    <div>
                        <label className="block text-sm font-bold text-slate-300 mb-1.5">이메일</label>
                        <input type="text" disabled value={email}
                            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-slate-400 text-sm" />
                    </div>

                    {/* 이름 */}
                    <div>
                        <label className="block text-sm font-bold text-slate-300 mb-1.5">이름 <span className="text-red-400">*</span></label>
                        <input type="text" placeholder="예: 홍길동"
                            value={form.name} onChange={e => set('name', e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder-slate-500 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
                    </div>

                    {/* 학부 */}
                    <div>
                        <label className="block text-sm font-bold text-slate-300 mb-1.5">학부 / 단과대학 <span className="text-red-400">*</span></label>
                        <input type="text" placeholder="예: 공과대학 / 예술대학"
                            value={form.department} onChange={e => set('department', e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder-slate-500 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* 학번 */}
                        <div>
                            <label className="block text-sm font-bold text-slate-300 mb-1.5">학번 <span className="text-red-400">*</span></label>
                            <input type="text" placeholder="예: 20231234"
                                value={form.student_id} onChange={e => set('student_id', e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder-slate-500 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
                        </div>

                        {/* 학년 */}
                        <div>
                            <label className="block text-sm font-bold text-slate-300 mb-1.5">학년 <span className="text-red-400">*</span></label>
                            <div className="flex gap-2">
                                {GRADES.map(g => (
                                    <button key={g} type="button" onClick={() => set('grade', g)}
                                        className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all border ${form.grade === g
                                            ? 'bg-indigo-600 text-white border-indigo-500'
                                            : 'bg-white/10 text-slate-400 border-white/10 hover:bg-white/20'}`}>
                                        {g}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* 전공 */}
                    <div>
                        <label className="block text-sm font-bold text-slate-300 mb-1.5">전공</label>
                        <input type="text" placeholder="예: 음악공학 / 실용음악"
                            value={form.major} onChange={e => set('major', e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder-slate-500 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
                    </div>

                    {/* 전화번호 - auto-format */}
                    <div>
                        <label className="block text-sm font-bold text-slate-300 mb-1.5">전화번호
                            <span className="ml-2 text-[10px] text-slate-500 font-normal normal-case">숫자만 입력하면 자동으로 010-XXXX-XXXX 형식으로 변환됩니다</span>
                        </label>
                        <input type="tel" placeholder="01012345678"
                            value={form.phone}
                            onChange={e => handlePhone(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder-slate-500 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
                    </div>

                    {/* 수강 과목 선택 */}
                    <div>
                        <label className="block text-sm font-bold text-slate-300 mb-2">
                            수강 신청 과목 <span className="text-red-400">*</span>
                        </label>
                        <div className="space-y-2">
                            {courses.length === 0 && (
                                <p className="text-slate-500 text-sm py-3 text-center">과목 목록 불러오는 중...</p>
                            )}
                            {courses.map(course => (
                                <label key={course.id}
                                    className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${form.course_id === course.id
                                        ? 'border-indigo-500 bg-indigo-500/20'
                                        : 'border-white/10 bg-white/5 hover:border-white/25'}`}>
                                    <input type="radio" name="course" value={course.id}
                                        checked={form.course_id === course.id}
                                        onChange={() => set('course_id', course.id)}
                                        className="sr-only" />
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all
                                        ${form.course_id === course.id ? 'border-indigo-500 bg-indigo-500' : 'border-white/30'}`}>
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

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                            <p className="text-red-400 text-sm text-center">{error}</p>
                        </div>
                    )}

                    <button type="submit" disabled={loading}
                        className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-indigo-600 text-white font-extrabold hover:bg-indigo-500 transition disabled:opacity-70">
                        {loading
                            ? <><Loader2 className="w-5 h-5 animate-spin" />저장 중...</>
                            : '등록 완료 — 수업 입장'}
                    </button>
                </form>
            </div>
        </div>
    );
}
