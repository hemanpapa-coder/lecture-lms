'use client'
import { useState, useEffect, useRef } from 'react'
import { AlertCircle, Pencil, Save, Loader2, CheckCircle2 } from 'lucide-react'

interface Props {
    courseId: string
    courseName: string
}

export default function GradeNoticeEditor({ courseId, courseName }: Props) {
    const [notice, setNotice] = useState('')
    const [saved, setSaved] = useState('')         // last-saved text (to detect changes)
    const [saving, setSaving] = useState(false)
    const [statusMsg, setStatusMsg] = useState<'saved' | 'error' | null>(null)
    const [loading, setLoading] = useState(true)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    // Load existing notice on mount / when course changes
    useEffect(() => {
        setLoading(true)
        setNotice('')
        setSaved('')
        fetch(`/api/admin/grade-notice?courseId=${courseId}`)
            .then(r => r.json())
            .then(d => {
                const v = d.notice ?? ''
                setNotice(v)
                setSaved(v)
            })
            .finally(() => setLoading(false))
    }, [courseId])

    // Auto-resize textarea
    useEffect(() => {
        const el = textareaRef.current
        if (!el) return
        el.style.height = 'auto'
        el.style.height = `${el.scrollHeight}px`
    }, [notice])

    const handleSave = async () => {
        setSaving(true)
        setStatusMsg(null)
        try {
            const res = await fetch('/api/admin/grade-notice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ courseId, notice }),
            })
            const d = await res.json()
            if (!res.ok) throw new Error(d.error)
            setSaved(notice)
            setStatusMsg('saved')
            setTimeout(() => setStatusMsg(null), 3000)
        } catch {
            setStatusMsg('error')
        } finally {
            setSaving(false)
        }
    }

    const isDirty = notice !== saved

    return (
        <div className="bg-orange-50 dark:bg-orange-950/30 rounded-3xl p-6 border border-orange-100 dark:border-orange-900/50">
            {/* Header row */}
            <div className="flex items-start gap-3 mb-4">
                <AlertCircle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                    <h4 className="font-bold text-orange-900 dark:text-orange-300 text-sm">
                        [{courseName}] 성적 산출 안내
                    </h4>
                    <p className="text-[11px] text-orange-500/70 dark:text-orange-400/50 mt-0.5 flex items-center gap-1">
                        <Pencil className="w-3 h-3" />
                        관리자만 수정 가능 · 학생에게 그대로 표시됩니다
                    </p>
                </div>

                {/* Save button */}
                <button
                    onClick={handleSave}
                    disabled={!isDirty || saving || loading}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${isDirty && !saving
                        ? 'bg-orange-600 text-white hover:bg-orange-500'
                        : 'bg-orange-100 dark:bg-orange-900/30 text-orange-400 cursor-not-allowed'
                        }`}
                >
                    {saving
                        ? <><Loader2 className="w-3 h-3 animate-spin" />저장 중...</>
                        : statusMsg === 'saved'
                            ? <><CheckCircle2 className="w-3 h-3" />저장됨</>
                            : <><Save className="w-3 h-3" />저장</>}
                </button>
            </div>

            {/* Editable textarea */}
            {loading ? (
                <div className="flex items-center gap-2 text-orange-400 text-sm py-2">
                    <Loader2 className="w-3 h-3 animate-spin" /> 불러오는 중...
                </div>
            ) : (
                <textarea
                    ref={textareaRef}
                    value={notice}
                    onChange={e => setNotice(e.target.value)}
                    placeholder={`이 수업의 성적 산출 안내를 입력하세요.\n\n예시:\n• 출석: 20점 / 중간고사: 30점 / 기말고사: 30점 / 과제: 20점\n• 결석 1회: 최대 B+ / 결석 2회: 최대 C+ / 결석 3회 이상: F 처리`}
                    rows={4}
                    className="w-full bg-transparent text-sm text-orange-800 dark:text-orange-200 placeholder-orange-300 dark:placeholder-orange-700/60 resize-none outline-none leading-relaxed min-h-[80px] overflow-hidden"
                />
            )}

            {statusMsg === 'error' && (
                <p className="text-xs text-red-500 mt-2">저장에 실패했습니다. 다시 시도해 주세요.</p>
            )}
        </div>
    )
}
