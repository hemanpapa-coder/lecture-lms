'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Bug, Copy, Check, Trash2, ChevronDown, ChevronUp, ExternalLink, Clock, CheckCircle2, AlertCircle, Loader2, RefreshCw } from 'lucide-react'

type ErrorReport = {
    id: string
    user_id: string
    user_name: string | null
    user_email: string | null
    course_id: string | null
    page_url: string | null
    description: string
    screenshot_url: string | null
    status: 'open' | 'in_progress' | 'resolved'
    admin_note: string | null
    created_at: string
}

const STATUS_COLORS = {
    open: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    resolved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
}

const STATUS_LABELS = { open: '미처리', in_progress: '처리 중', resolved: '해결됨' }

function formatForAntigravity(r: ErrorReport): string {
    return `🐛 **에러 리포트 #${r.id.slice(0, 8)}**

**신고자**: ${r.user_name || '이름 없음'} (${r.user_email || ''})
**발생 페이지**: ${r.page_url || '알 수 없음'}
**신고 시각**: ${new Date(r.created_at).toLocaleString('ko-KR')}

**에러 설명**:
${r.description}
${r.screenshot_url ? `\n**스크린샷**: ${r.screenshot_url}` : ''}

---
위 에러를 분석하고 수정해주세요. 프로젝트 경로: /Users/user/Desktop/Lecture-management/lecture-lms`
}

export default function AdminErrorReportsClient() {
    const supabase = createClient()
    const [reports, setReports] = useState<ErrorReport[]>([])
    const [loading, setLoading] = useState(true)
    const [expanded, setExpanded] = useState<string | null>(null)
    const [copied, setCopied] = useState<string | null>(null)
    const [filterStatus, setFilterStatus] = useState<string>('open')
    const [noteMap, setNoteMap] = useState<Record<string, string>>({})
    const [savingNote, setSavingNote] = useState<string | null>(null)

    useEffect(() => { fetchReports() }, [filterStatus])

    const fetchReports = async () => {
        setLoading(true)
        let q = supabase.from('error_reports').select('*').order('created_at', { ascending: false })
        if (filterStatus !== 'all') q = q.eq('status', filterStatus)
        const { data } = await q
        if (data) setReports(data as ErrorReport[])
        setLoading(false)
    }

    const copyForAntigravity = async (r: ErrorReport) => {
        await navigator.clipboard.writeText(formatForAntigravity(r))
        setCopied(r.id)
        setTimeout(() => setCopied(null), 2000)
    }

    const updateStatus = async (id: string, status: string) => {
        await supabase.from('error_reports').update({ status }).eq('id', id)
        setReports(prev => prev.map(r => r.id === id ? { ...r, status: status as ErrorReport['status'] } : r))
    }

    const saveNote = async (id: string) => {
        setSavingNote(id)
        await supabase.from('error_reports').update({ admin_note: noteMap[id] || '' }).eq('id', id)
        setSavingNote(null)
    }

    const deleteReport = async (id: string) => {
        if (!confirm('이 리포트를 삭제하시겠습니까?')) return
        await supabase.from('error_reports').delete().eq('id', id)
        setReports(prev => prev.filter(r => r.id !== id))
    }

    const openCount = reports.filter(r => r.status === 'open').length

    return (
        <div className="space-y-5">
            {/* Filters + refresh */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                    {(['all', 'open', 'in_progress', 'resolved'] as const).map(s => (
                        <button
                            key={s}
                            onClick={() => setFilterStatus(s)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${filterStatus === s ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700'}`}
                        >
                            {s === 'all' ? '전체' : STATUS_LABELS[s]}
                        </button>
                    ))}
                </div>
                <button onClick={fetchReports} className="flex items-center gap-1.5 text-xs font-bold text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition">
                    <RefreshCw className="w-3.5 h-3.5" /> 새로고침
                </button>
            </div>

            {/* Tip box */}
            <div className="rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 px-5 py-3 text-sm text-indigo-700 dark:text-indigo-300 flex items-start gap-3">
                <span className="text-lg mt-0.5">💡</span>
                <div>
                    <strong>Antigravity 자동 수정 방법:</strong> 에러 리포트의 <strong>"Antigravity에 복사"</strong> 버튼을 클릭 →
                    Antigravity 채팅창에 붙여넣기 → 자동으로 에러를 분석하고 수정합니다.
                </div>
            </div>

            {loading ? (
                <div className="text-center py-12 text-neutral-400 text-sm">불러오는 중...</div>
            ) : reports.length === 0 ? (
                <div className="text-center py-12 text-neutral-400 text-sm">
                    {filterStatus === 'open' ? '🎉 미처리 에러가 없습니다!' : '해당하는 리포트가 없습니다.'}
                </div>
            ) : (
                <div className="space-y-3">
                    {reports.map(r => (
                        <div key={r.id} className={`rounded-2xl bg-white dark:bg-neutral-900 border shadow-sm overflow-hidden ${r.status === 'open' ? 'border-red-200 dark:border-red-900/50' : r.status === 'in_progress' ? 'border-amber-200 dark:border-amber-900/50' : 'border-neutral-200 dark:border-neutral-800'}`}>
                            {/* Header row */}
                            <div className="p-4 flex items-start justify-between gap-3">
                                <button onClick={() => setExpanded(e => e === r.id ? null : r.id)} className="flex-1 text-left">
                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${STATUS_COLORS[r.status]}`}>
                                            {STATUS_LABELS[r.status]}
                                        </span>
                                        <span className="font-bold text-neutral-900 dark:text-neutral-100 text-sm line-clamp-1">{r.description.slice(0, 80)}{r.description.length > 80 ? '...' : ''}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-neutral-400">
                                        <span className="font-bold text-indigo-600">{r.user_name || '이름 없음'}</span>
                                        <span>{r.user_email || ''}</span>
                                        <span>{new Date(r.created_at).toLocaleString('ko-KR')}</span>
                                        {r.screenshot_url && <span className="text-emerald-600 font-bold">📷 스크린샷 있음</span>}
                                    </div>
                                </button>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    {/* Copy for Antigravity */}
                                    <button
                                        onClick={() => copyForAntigravity(r)}
                                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition ${copied === r.id ? 'bg-emerald-600 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
                                        title="Antigravity 채팅에 붙여넣을 포맷으로 복사"
                                    >
                                        {copied === r.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                        {copied === r.id ? '복사됨!' : 'Antigravity 복사'}
                                    </button>
                                    <button onClick={() => setExpanded(e => e === r.id ? null : r.id)} className="p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition text-neutral-400">
                                        {expanded === r.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    </button>
                                    <button onClick={() => deleteReport(r.id)} className="p-2 rounded-xl hover:bg-red-50 text-neutral-300 hover:text-red-500 transition">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Expanded detail */}
                            {expanded === r.id && (
                                <div className="px-4 pb-4 space-y-4 border-t border-neutral-100 dark:border-neutral-800 pt-4">
                                    {/* Page */}
                                    {r.page_url && (
                                        <div className="flex items-center gap-2 text-xs font-mono text-neutral-500 bg-neutral-50 dark:bg-neutral-800 rounded-xl px-3 py-2">
                                            <ExternalLink className="w-3.5 h-3.5" />
                                            <a href={r.page_url} target="_blank" className="hover:text-blue-600 hover:underline truncate">{r.page_url}</a>
                                        </div>
                                    )}

                                    {/* Full description */}
                                    <div className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap bg-neutral-50 dark:bg-neutral-800 rounded-xl p-4 leading-relaxed">
                                        {r.description}
                                    </div>

                                    {/* Screenshot */}
                                    {r.screenshot_url && (
                                        <div>
                                            <p className="text-xs font-bold text-neutral-500 mb-2">📷 스크린샷</p>
                                            {r.screenshot_url.startsWith('data:') ? (
                                                <img src={r.screenshot_url} alt="Error screenshot" className="rounded-xl max-h-[500px] border border-neutral-200 dark:border-neutral-700" />
                                            ) : (
                                                <a href={r.screenshot_url} target="_blank" rel="noreferrer">
                                                    <img src={r.screenshot_url} alt="Error screenshot" className="rounded-xl max-h-64 border border-neutral-200 dark:border-neutral-700 hover:opacity-90 transition cursor-zoom-in" />
                                                </a>
                                            )}
                                        </div>
                                    )}

                                    {/* Status selector */}
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-neutral-500">상태 변경:</span>
                                        {(['open', 'in_progress', 'resolved'] as const).map(s => (
                                            <button
                                                key={s}
                                                onClick={() => updateStatus(r.id, s)}
                                                className={`text-xs px-3 py-1.5 rounded-xl font-bold transition border ${r.status === s ? STATUS_COLORS[s] + ' border-transparent' : 'bg-neutral-50 dark:bg-neutral-800 text-neutral-500 border-neutral-200 dark:border-neutral-700 hover:border-neutral-400'}`}
                                            >
                                                {STATUS_LABELS[s]}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Admin note */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-neutral-500">관리자 메모 (내부용)</label>
                                        <div className="flex gap-2">
                                            <textarea
                                                value={noteMap[r.id] ?? (r.admin_note || '')}
                                                onChange={e => setNoteMap(p => ({ ...p, [r.id]: e.target.value }))}
                                                placeholder="처리 내용, 수정 커밋 해시 등..."
                                                rows={2}
                                                className="flex-1 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                            <button
                                                onClick={() => saveNote(r.id)}
                                                disabled={savingNote === r.id}
                                                className="px-3 py-2 rounded-xl bg-neutral-800 dark:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-bold transition hover:opacity-80 self-end"
                                            >
                                                {savingNote === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '저장'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
