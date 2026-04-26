'use client'

import { useState, useRef, useEffect } from 'react'
import { Copy, Check, ExternalLink, Trash2, Loader2, ChevronDown } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

const DUMMY_EMAIL = 'dummy@test.com'
const DUMMY_PASSWORD = 'lms-test-2024!'

function CopyField({ label, value }: { label: string; value: string }) {
    const [copied, setCopied] = useState(false)
    const handleCopy = () => {
        navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
    }
    return (
        <div className="flex items-center justify-between gap-2 bg-slate-900 rounded-lg px-3 py-2">
            <div className="min-w-0">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</p>
                <p className="text-sm font-mono text-white select-all truncate">{value}</p>
            </div>
            <button onClick={handleCopy} className="shrink-0 p-1.5 rounded-lg hover:bg-slate-700 transition text-slate-400 hover:text-white">
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
        </div>
    )
}

export default function DummyTestButton() {
    const [open, setOpen] = useState(false)
    const [cleaning, setCleaning] = useState(false)
    const [cleanResult, setCleanResult] = useState<string | null>(null)
    const [courses, setCourses] = useState<{ id: string; name: string }[]>([])
    const [selectedCourse, setSelectedCourse] = useState<{ id: string; name: string } | null>(null)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        const supabase = createClient()
        supabase.from('courses').select('id,name,is_private_lesson').eq('is_private_lesson', false).order('name')
            .then(({ data }) => {
                if (data) setCourses(data)
                if (data?.length && !selectedCourse) setSelectedCourse(data[0])
            })
    }, [open])

    useEffect(() => {
        if (!open) return
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false); setCleanResult(null)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [open])

    const handleCleanup = async () => {
        if (!confirm('더미 학생의 모든 시험, 과제, 채팅 기록을 삭제합니다.\n계속하시겠습니까?')) return
        setCleaning(true); setCleanResult(null)
        try {
            const res = await fetch('/api/admin/cleanup-dummy', { method: 'DELETE' })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            const lines = Object.entries(data.deleted).filter(([, c]) => (c as number) > 0).map(([t, c]) => `${t}: ${c}건`)
            setCleanResult(lines.length > 0 ? `삭제 완료 — ${lines.join(', ')}` : '삭제할 데이터가 없습니다.')
        } catch (e: any) {
            setCleanResult(`오류: ${e.message}`)
        } finally {
            setCleaning(false)
        }
    }

    const loginUrl = selectedCourse
        ? `/auth/login?dev=true&course=${selectedCourse.id}`
        : '/auth/login?dev=true'

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => { setOpen(v => !v); setCleanResult(null) }}
                className="px-4 py-2.5 text-xs font-black bg-amber-500/15 text-amber-300 border border-amber-500/25 hover:bg-amber-500/30 hover:text-amber-100 rounded-xl transition flex items-center gap-2"
            >
                🛠 더미 학생 테스트
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl bg-slate-800 border border-slate-700 shadow-2xl z-50 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                        <span className="text-base">🛠</span>
                        <div>
                            <p className="text-xs font-black text-amber-300">더미 학생 테스트 계정</p>
                            <p className="text-[10px] text-slate-400">시크릿 창(⌘⇧N)에서 접속하세요</p>
                        </div>
                    </div>

                    {/* 과목 선택 */}
                    <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">테스트 과목 선택</p>
                        <div className="relative">
                            <select
                                value={selectedCourse?.id ?? ''}
                                onChange={e => {
                                    const c = courses.find(c => c.id === e.target.value)
                                    if (c) setSelectedCourse(c)
                                }}
                                className="w-full appearance-none bg-slate-900 border border-slate-600 text-white text-sm font-semibold rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-amber-500"
                            >
                                {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <CopyField label="이메일" value={DUMMY_EMAIL} />
                        <CopyField label="비밀번호" value={DUMMY_PASSWORD} />
                    </div>

                    <a
                        href={loginUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 hover:text-amber-100 text-xs font-bold border border-amber-500/30 transition"
                        onClick={() => setOpen(false)}
                    >
                        <ExternalLink className="w-3.5 h-3.5" />
                        {selectedCourse ? `[${selectedCourse.name}] 로 로그인` : '로그인 페이지 열기'} (새 탭)
                    </a>

                    <div className="border-t border-slate-700" />

                    <button
                        onClick={handleCleanup}
                        disabled={cleaning}
                        className="flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-red-500/15 hover:bg-red-500/30 text-red-400 hover:text-red-200 text-xs font-bold border border-red-500/20 transition disabled:opacity-50"
                    >
                        {cleaning ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 삭제 중...</> : <><Trash2 className="w-3.5 h-3.5" /> 🧹 더미 흔적 지우기</>}
                    </button>
                    {cleanResult && (
                        <p className={`text-[11px] text-center font-semibold px-2 ${cleanResult.startsWith('오류') ? 'text-red-400' : 'text-emerald-400'}`}>{cleanResult}</p>
                    )}
                </div>
            )}
        </div>
    )
}
