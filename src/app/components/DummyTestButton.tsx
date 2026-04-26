'use client'

import { useState, useRef, useEffect } from 'react'
import { Copy, Check, ExternalLink } from 'lucide-react'

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
            <button
                onClick={handleCopy}
                className="shrink-0 p-1.5 rounded-lg hover:bg-slate-700 transition text-slate-400 hover:text-white"
                title="복사"
            >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
        </div>
    )
}

export default function DummyTestButton() {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [open])

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(v => !v)}
                className="px-4 py-2.5 text-xs font-black bg-amber-500/15 text-amber-300 border border-amber-500/25 hover:bg-amber-500/30 hover:text-amber-100 rounded-xl transition flex items-center gap-2"
            >
                🛠 더미 학생 테스트
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl bg-slate-800 border border-slate-700 shadow-2xl z-50 p-4 space-y-3">
                    {/* 헤더 */}
                    <div className="flex items-center gap-2">
                        <span className="text-base">🛠</span>
                        <div>
                            <p className="text-xs font-black text-amber-300">더미 학생 테스트 계정</p>
                            <p className="text-[10px] text-slate-400">시크릿 창(⌘⇧N)에서 접속하세요</p>
                        </div>
                    </div>

                    {/* 크레덴셜 */}
                    <div className="space-y-2">
                        <CopyField label="이메일" value={DUMMY_EMAIL} />
                        <CopyField label="비밀번호" value={DUMMY_PASSWORD} />
                    </div>

                    {/* 로그인 페이지 바로가기 */}
                    <a
                        href="/auth/login?dev=true"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 hover:text-amber-100 text-xs font-bold border border-amber-500/30 transition"
                        onClick={() => setOpen(false)}
                    >
                        <ExternalLink className="w-3.5 h-3.5" />
                        로그인 페이지 열기 (새 탭)
                    </a>
                </div>
            )}
        </div>
    )
}
