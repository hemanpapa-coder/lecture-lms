'use client'
import { useState } from 'react'
import { Power, PowerOff, Loader2, RotateCcw, FileUp } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Props {
    courseId: string
    courseName: string
    isEnded: boolean
    lateSubmissionAllowed: boolean
}

export default function CourseEndButton({ courseId, courseName, isEnded, lateSubmissionAllowed }: Props) {
    const [loading, setLoading] = useState(false)
    const [loadingToggle, setLoadingToggle] = useState(false)
    const router = useRouter()

    const handleEnd = async () => {
        const confirmed = confirm(
            `⚠️ [${courseName}] 수업을 종강 처리하시겠습니까?\n\n` +
            `• 과제 제출 및 파일 업로드가 마감됩니다.\n` +
            `• 수업 내용은 '지난 강의'로 연도별 보관됩니다.\n` +
            `• 기본적으로 아카이브에서 자료 제출은 계속 허용됩니다.\n\n` +
            `종강 후에도 '재개' 버튼으로 수업을 다시 열 수 있습니다.`
        )
        if (!confirmed) return

        setLoading(true)
        try {
            const res = await fetch('/api/admin/course-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'end', courseId }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            router.refresh()
        } catch (err: any) {
            alert(`오류: ${err.message}`)
        } finally {
            setLoading(false)
        }
    }

    const handleReopen = async () => {
        const confirmed = confirm(`[${courseName}] 수업을 다시 열겠습니까? 종강 상태가 해제됩니다.`)
        if (!confirmed) return

        setLoading(true)
        try {
            const res = await fetch('/api/admin/course-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'reopen', courseId }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            router.refresh()
        } catch (err: any) {
            alert(`오류: ${err.message}`)
        } finally {
            setLoading(false)
        }
    }

    const handleToggleLate = async () => {
        setLoadingToggle(true)
        try {
            const res = await fetch('/api/admin/course-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'toggle-late-submission', courseId }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            router.refresh()
        } catch (err: any) {
            alert(`오류: ${err.message}`)
        } finally {
            setLoadingToggle(false)
        }
    }

    if (isEnded) {
        return (
            <div className="flex items-center gap-2 flex-wrap">
                {/* Late submission toggle */}
                <button
                    onClick={handleToggleLate}
                    disabled={loadingToggle}
                    title={lateSubmissionAllowed ? '자료 제출 허용 중 — 클릭해서 차단' : '자료 제출 차단 중 — 클릭해서 허용'}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${lateSubmissionAllowed
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800'
                        : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                        }`}
                >
                    {loadingToggle
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <FileUp className="w-3 h-3" />}
                    {lateSubmissionAllowed ? '자료 제출 허용 중' : '자료 제출 차단'}
                </button>

                {/* Reopen button */}
                <button
                    onClick={handleReopen}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-all dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800"
                >
                    {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                    재개
                </button>
            </div>
        )
    }

    return (
        <button
            onClick={handleEnd}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-all dark:bg-red-900/30 dark:text-red-300 dark:border-red-800"
        >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <PowerOff className="w-3 h-3" />}
            종강하기
        </button>
    )
}
