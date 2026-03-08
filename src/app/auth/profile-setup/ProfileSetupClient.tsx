'use client';
import { useState, useEffect } from 'react';
import { Loader2, GraduationCap, BookOpen, CheckCircle2, Clock, ShieldCheck } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

const GRADES = [1, 2, 3, 4];
type Course = { id: string; name: string };

const SCHOOLS = [
    '백석대학교 신학교육원',
    '백석예술대학교',
    '상명 문화기술대학원',
    '상명 미래교육원',
];

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
    const [submitted, setSubmitted] = useState(false);
    const [courses, setCourses] = useState<Course[]>([]);
    const [privacyConsented, setPrivacyConsented] = useState(false);
    const [showPrivacyDetail, setShowPrivacyDetail] = useState(false);

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
        if (!form.department) { setError('소속 학교를 선택해 주세요.'); return; }
        if (!form.student_id.trim()) { setError('학번을 입력해 주세요.'); return; }
        if (!form.course_id) { setError('수강할 과목을 선택해 주세요.'); return; }
        if (!privacyConsented) { setError('개인정보 수집·이용에 동의해 주세요.'); return; }

        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/profile-setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, privacyConsented }),
            });

            const contentType = res.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
                throw new Error(`서버 오류가 발생했습니다. (HTTP ${res.status})`);
            }

            const d = await res.json();
            if (!res.ok) throw new Error(d.error || '저장에 실패했습니다.');

            setSubmitted(true);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const [approved, setApproved] = useState(false);

    useEffect(() => {
        if (!submitted) return;
        const interval = setInterval(async () => {
            const { data } = await supabase.from('users').select('is_approved').single();
            if (data?.is_approved) { clearInterval(interval); setApproved(true); }
        }, 5000);
        return () => clearInterval(interval);
    }, [submitted]);

    // ✅ POST-SUBMISSION: waiting or approved screen
    if (submitted) {
        const selectedCourse = courses.find(c => c.id === form.course_id);
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-6">
                <div className="w-full max-w-md text-center space-y-6">
                    <div className="relative inline-flex">
                        <div className={`w-24 h-24 rounded-3xl border flex items-center justify-center mx-auto transition-all duration-500
                            ${approved ? 'bg-emerald-500/20 border-emerald-500/40' : 'bg-amber-500/20 border-amber-500/30'}`}>
                            {approved
                                ? <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                                : <Clock className="w-12 h-12 text-amber-400 animate-pulse" />}
                        </div>
                    </div>
                    <div>
                        {approved ? (
                            <>
                                <h1 className="text-2xl font-black text-emerald-400 mt-4">인증 완료! 🎉</h1>
                                <p className="text-slate-300 mt-2 text-sm leading-relaxed">교수님이 수강을 승인했습니다.<br />이제 LMS를 이용하실 수 있습니다.</p>
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
                                <p className="text-slate-500 text-xs mb-0.5">소속</p>
                                <p className="text-white font-bold">{form.department}</p>
                            </div>
                            <div>
                                <p className="text-slate-500 text-xs mb-0.5">신청 과목</p>
                                <p className="text-indigo-300 font-bold">{selectedCourse?.name || '-'}</p>
                            </div>
                        </div>
                    </div>
                    {approved ? (
                        <a href="/" className="w-full inline-block py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm transition text-center">
                            LMS 입장하기 →
                        </a>
                    ) : (
                        <p className="text-slate-600 text-xs">승인이 완료되면 이 화면에서 바로 알려드립니다.</p>
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

                    {/* 소속 학교 - 드롭다운 */}
                    <div>
                        <label className="block text-sm font-bold text-slate-300 mb-1.5">소속 학교 <span className="text-red-400">*</span></label>
                        <select
                            value={form.department}
                            onChange={e => set('department', e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white text-sm outline-none focus:ring-2 focus:ring-indigo-400 appearance-none cursor-pointer"
                            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238b9fc9' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '20px' }}
                        >
                            <option value="" className="bg-slate-800 text-slate-400">소속 학교를 선택해 주세요</option>
                            {SCHOOLS.map(s => (
                                <option key={s} value={s} className="bg-slate-800 text-white">{s}</option>
                            ))}
                        </select>
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

                    {/* 전화번호 */}
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

                    {/* ===== 개인정보보호법 동의 ===== */}
                    <div className="bg-slate-800/60 border border-slate-600/50 rounded-2xl p-4 space-y-3">
                        <div className="flex items-center gap-2 mb-1">
                            <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0" />
                            <span className="text-xs font-black text-indigo-300 uppercase tracking-widest">개인정보 수집·이용 동의</span>
                        </div>

                        {/* 요약 고지 */}
                        <div className="text-xs text-slate-400 leading-relaxed space-y-1">
                            <p>「개인정보보호법」 제15조 및 제22조에 따라 아래 내용을 고지합니다.</p>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-[11px]">
                                <div><span className="text-slate-500">수집 항목</span><br /><span className="text-slate-300">이름, 소속, 학번, 연락처</span></div>
                                <div><span className="text-slate-500">수집 목적</span><br /><span className="text-slate-300">수업 관리 및 성적 평가</span></div>
                                <div><span className="text-slate-500">보관 기간</span><br /><span className="text-slate-300">종강 후 3년 (성적 자료 보관 의무)</span></div>
                                <div><span className="text-slate-500">보관 후</span><br /><span className="text-slate-300">개인정보 익명화·삭제 처리</span></div>
                            </div>
                        </div>

                        {/* 상세 보기 토글 */}
                        <button type="button" onClick={() => setShowPrivacyDetail(v => !v)}
                            className="text-[11px] text-indigo-400 hover:text-indigo-300 underline">
                            {showPrivacyDetail ? '▲ 상세 내용 접기' : '▼ 전체 개인정보 처리 방침 보기'}
                        </button>

                        {showPrivacyDetail && (
                            <div className="bg-slate-900/50 rounded-xl p-3 text-[11px] text-slate-400 leading-relaxed space-y-2 max-h-48 overflow-y-auto">
                                <p className="font-bold text-slate-300">개인정보 처리 방침</p>
                                <p>본 LMS는 「개인정보보호법」을 준수하며, 수업 운영 목적 외 개인정보를 제3자에게 제공하지 않습니다.</p>
                                <p><span className="text-slate-300 font-bold">① 수집 항목:</span> 이름, 소속 학교, 학번, 연락처 (이메일·전화번호), 학년, 전공</p>
                                <p><span className="text-slate-300 font-bold">② 수집 목적:</span> 수강생 신원 확인, 수업 출석 관리, 성적 평가 및 증빙 자료 생성</p>
                                <p><span className="text-slate-300 font-bold">③ 보관 기간:</span> 종강일로부터 3년 (고등교육법 시행령 제4조, 성적 자료 보관 의무). 보관 기간 만료 후 개인 식별 정보(이름·학번·연락처)는 익명화 또는 삭제 처리됩니다. 성적 평가 관련 데이터는 별도 보관됩니다.</p>
                                <p><span className="text-slate-300 font-bold">④ 동의 거부 시:</span> 개인정보 수집·이용에 동의하지 않을 권리가 있습니다. 단, 동의 거부 시 수업 등록 및 LMS 이용이 제한됩니다.</p>
                                <p><span className="text-slate-300 font-bold">⑤ 개인정보 보호:</span> 수집된 정보는 암호화된 서버에 저장되며, 관리자 외 접근이 제한됩니다.</p>
                                <p className="text-slate-500">문의: 담당 교수자에게 직접 연락 주시기 바랍니다.</p>
                            </div>
                        )}

                        {/* 동의 체크박스 */}
                        <label className="flex items-start gap-3 cursor-pointer group">
                            <div
                                onClick={() => setPrivacyConsented(v => !v)}
                                className={`w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 border-2 transition-all cursor-pointer ${privacyConsented
                                    ? 'bg-indigo-600 border-indigo-500'
                                    : 'bg-white/5 border-white/30 group-hover:border-indigo-400'}`}>
                                {privacyConsented && (
                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </div>
                            <span className="text-xs text-slate-300 leading-relaxed">
                                <span className="font-bold text-white">위 개인정보 수집·이용에 동의합니다.</span><br />
                                <span className="text-slate-500">(필수) 미동의 시 수강 신청이 불가능합니다.</span>
                            </span>
                        </label>
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
