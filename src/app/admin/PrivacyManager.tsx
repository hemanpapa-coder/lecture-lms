'use client'
import { useState, useEffect } from 'react'
import { ShieldCheck, Trash2, AlertTriangle, Calendar, ChevronDown, ChevronUp, CheckCircle2, Loader2 } from 'lucide-react'

type Course = { id: string; name: string; semester_end_date: string | null }
type Student = {
    id: string; name: string; email: string; department: string; student_id: string
    course_id: string; privacy_consented_at: string | null; privacy_deleted_at: string | null; created_at: string
}

export default function PrivacyManager() {
    const [courses, setCourses] = useState<Course[]>([])
    const [eligible, setEligible] = useState<Student[]>([])
    const [summary, setSummary] = useState<{ total: number; consented: number; deleted: number } | null>(null)
    const [loading, setLoading] = useState(true)
    const [showEligible, setShowEligible] = useState(false)
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [deletingIds, setDeletingIds] = useState<string[]>([])
    const [statusMsg, setStatusMsg] = useState('')
    const [dateChanges, setDateChanges] = useState<Record<string, string>>({})
    const [savingDate, setSavingDate] = useState<string | null>(null)

    const load = async () => {
        setLoading(true)
        const [sumRes, listRes, coursesRes] = await Promise.all([
            fetch('/api/admin/privacy?action=summary'),
            fetch('/api/admin/privacy?action=list'),
            fetch('/api/admin/privacy?action=courses'),
        ])
        const sumData = await sumRes.json()
        const listData = await listRes.json()
        const coursesData = await coursesRes.json()
        setSummary(sumData)
        setEligible(listData.eligible || [])
        setCourses(coursesData.courses || [])
        setLoading(false)
    }

    useEffect(() => { load() }, [])

    const toggleSelect = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }

    const handleAnonymize = async () => {
        const ids = [...selected]
        if (!ids.length) return
        const confirmed = confirm(
            `⚠️ 선택한 ${ids.length}명의 개인정보를 익명화 처리하시겠습니까?\n\n이름·학번·연락처는 삭제되지만 성적 데이터는 보존됩니다.\n이 작업은 되돌릴 수 없습니다.`
        )
        if (!confirmed) return

        setDeletingIds(ids)
        const res = await fetch('/api/admin/privacy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'anonymize', userIds: ids }),
        })
        const data = await res.json()
        setDeletingIds([])
        setSelected(new Set())
        if (data.success) {
            setStatusMsg(`✅ ${data.anonymized}명의 개인정보가 익명화 처리되었습니다.`)
            await load()
        } else {
            setStatusMsg(`❌ 오류: ${data.error}`)
        }
    }

    const handleSetDate = async (courseId: string) => {
        const date = dateChanges[courseId]
        if (!date) return
        setSavingDate(courseId)
        await fetch('/api/admin/privacy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'set_semester_end', courseId, date }),
        })
        setSavingDate(null)
        await load()
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
                    <ShieldCheck className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">개인정보 보호 관리</h3>
                    <p className="text-xs text-slate-500">「개인정보보호법」 제15조 — 종강 후 3년 보관, 이후 익명화 처리</p>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 text-slate-500 text-sm py-4">
                    <Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중...
                </div>
            ) : (
                <>
                    {/* Summary */}
                    {summary && (
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3 text-center">
                                <p className="text-2xl font-black text-slate-900 dark:text-white">{summary.total}</p>
                                <p className="text-xs text-slate-500 mt-0.5">전체 학생</p>
                            </div>
                            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-3 text-center">
                                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{summary.consented}</p>
                                <p className="text-xs text-slate-500 mt-0.5">동의 완료</p>
                            </div>
                            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-2xl p-3 text-center">
                                <p className="text-2xl font-black text-purple-600 dark:text-purple-400">{summary.deleted}</p>
                                <p className="text-xs text-slate-500 mt-0.5">익명화 완료</p>
                            </div>
                        </div>
                    )}

                    {/* Semester End Date Settings */}
                    <div>
                        <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">📅 과목별 종강일 설정 <span className="text-xs text-slate-400 font-normal">(익명화 기산일 기준)</span></h4>
                        <div className="space-y-2">
                            {courses.map(c => (
                                <div key={c.id} className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl px-3 py-2">
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex-1 truncate">{c.name}</span>
                                    {c.semester_end_date && (
                                        <span className="text-xs text-slate-400">
                                            현재: {c.semester_end_date}
                                            → 삭제 가능: {new Date(new Date(c.semester_end_date).setFullYear(new Date(c.semester_end_date).getFullYear() + 3)).toISOString().slice(0, 10)}
                                        </span>
                                    )}
                                    <input
                                        type="date"
                                        value={dateChanges[c.id] ?? c.semester_end_date ?? ''}
                                        onChange={e => setDateChanges(prev => ({ ...prev, [c.id]: e.target.value }))}
                                        className="text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-400"
                                    />
                                    <button
                                        onClick={() => handleSetDate(c.id)}
                                        disabled={savingDate === c.id || !dateChanges[c.id]}
                                        className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-500 transition disabled:opacity-50"
                                    >
                                        {savingDate === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : '저장'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Eligible for Deletion */}
                    <div>
                        <button
                            onClick={() => setShowEligible(v => !v)}
                            className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300 w-full"
                        >
                            {eligible.length > 0 ? (
                                <span className="flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                                    익명화 대상 학생 {eligible.length}명 — 3년 보관 기간 만료
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                    현재 익명화 대상 없음 (모두 보관 기간 이내)
                                </span>
                            )}
                            {showEligible ? <ChevronUp className="w-4 h-4 ml-auto" /> : <ChevronDown className="w-4 h-4 ml-auto" />}
                        </button>

                        {showEligible && eligible.length > 0 && (
                            <div className="mt-3 space-y-2">
                                {eligible.map(s => (
                                    <label key={s.id}
                                        className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${selected.has(s.id)
                                            ? 'border-red-400 bg-red-50 dark:bg-red-900/20'
                                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30 hover:border-red-300'}`}>
                                        <input type="checkbox" checked={selected.has(s.id)}
                                            onChange={() => toggleSelect(s.id)}
                                            className="w-4 h-4 rounded accent-red-500" />
                                        <div className="flex-1 text-sm">
                                            <span className="font-bold text-slate-900 dark:text-white">{s.name}</span>
                                            <span className="text-slate-400 ml-2">{s.student_id}</span>
                                            <span className="text-slate-400 ml-2">· {s.department}</span>
                                        </div>
                                        <span className="text-[10px] text-slate-400">동의: {s.privacy_consented_at?.slice(0, 10) || '미동의'}</span>
                                    </label>
                                ))}

                                <div className="flex gap-3 mt-3">
                                    <button
                                        onClick={() => setSelected(new Set(eligible.map(s => s.id)))}
                                        className="text-xs px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition"
                                    >
                                        전체 선택
                                    </button>
                                    <button
                                        onClick={handleAnonymize}
                                        disabled={selected.size === 0 || deletingIds.length > 0}
                                        className="flex items-center gap-2 text-xs px-4 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-500 transition disabled:opacity-50"
                                    >
                                        {deletingIds.length > 0
                                            ? <><Loader2 className="w-3 h-3 animate-spin" />처리 중...</>
                                            : <><Trash2 className="w-3 h-3" />선택 {selected.size}명 개인정보 익명화</>}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {statusMsg && (
                        <div className={`text-sm px-4 py-3 rounded-xl font-medium ${statusMsg.startsWith('✅')
                            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                            : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'}`}>
                            {statusMsg}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
