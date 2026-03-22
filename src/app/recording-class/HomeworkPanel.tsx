'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Upload, Trash2, Send, Loader2, Paperclip, Play, FileIcon, ChevronRight, User } from 'lucide-react'

type HWSubmission = {
    id: string
    user_id: string
    content: string
    created_at: string
    metadata: { week_number: number; is_resubmit?: boolean }
    users?: { name: string } | null
    attachments?: Attachment[]
}

type Attachment = {
    id: string
    file_name: string
    file_url: string
    file_type: string | null
    file_size: number | null
}

// ────────────────────────────────────────────────────────
//  학생용: 내 과제 제출폼
// ────────────────────────────────────────────────────────
export function HomeworkSubmitForm({
    courseId,
    userId,
    selectedWeek,
}: {
    courseId: string
    userId: string
    selectedWeek: number
}) {
    const supabase = createClient()
    const [content, setContent] = useState('')
    const [files, setFiles] = useState<File[]>([])
    const [isDrag, setIsDrag] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [progress, setProgress] = useState<Record<string, number>>({})
    const [error, setError] = useState('')
    const [existing, setExisting] = useState<HWSubmission | null>(null)
    const [loading, setLoading] = useState(true)

    // 기존 제출물 가져오기
    useEffect(() => {
        const load = async () => {
            setLoading(true)
            const { data } = await supabase
                .from('board_questions')
                .select('id, user_id, content, created_at, metadata, board_attachments(*)')
                .eq('course_id', courseId)
                .eq('type', 'homework')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
            // find current week
            const match = (data || []).find((r: any) => r.metadata?.week_number === selectedWeek)
            setExisting(match ? {
                ...match,
                attachments: (match.board_attachments || []) as Attachment[]
            } : null)
            if (match) setContent(match.content || '')
            setLoading(false)
        }
        load()
    }, [courseId, userId, selectedWeek])

    const uploadFile = async (file: File): Promise<string | null> => {
        const res = await fetch('/api/board/upload-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: file.name, mimeType: file.type || 'application/octet-stream', fileSize: file.size }),
        })
        if (!res.ok) return null
        const { uploadUrl, webViewLink } = await res.json()
        await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest()
            xhr.open('PUT', uploadUrl, true)
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) setProgress(p => ({ ...p, [file.name]: Math.round(e.loaded / e.total * 100) }))
            }
            xhr.onload = () => xhr.status < 300 ? resolve() : reject(new Error(`${xhr.status}`))
            xhr.onerror = () => reject(new Error('net'))
            xhr.send(file)
        })
        return webViewLink
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!content.trim()) { setError('내용을 입력해 주세요.'); return }
        setSubmitting(true); setError(''); setProgress({})
        try {
            let qId: string
            if (existing) {
                // 재제출: update
                await supabase.from('board_questions').update({
                    content: content.trim(),
                    metadata: { week_number: selectedWeek, is_resubmit: true, updated_at: new Date().toISOString() }
                }).eq('id', existing.id)
                qId = existing.id
            } else {
                const { data, error: err } = await supabase.from('board_questions').insert({
                    user_id: userId,
                    course_id: courseId,
                    title: `${selectedWeek}주차 과제`,
                    content: content.trim(),
                    type: 'homework',
                    metadata: { week_number: selectedWeek }
                }).select('id').single()
                if (err) throw err
                qId = data.id
            }
            for (const file of files) {
                const url = await uploadFile(file)
                if (url) {
                    await supabase.from('board_attachments').insert({
                        question_id: qId, file_name: file.name, file_url: url, file_type: file.type, file_size: file.size
                    })
                }
            }
            setFiles([]); setProgress({})
            // reload
            const { data: updated } = await supabase
                .from('board_questions')
                .select('id, user_id, content, created_at, metadata, board_attachments(*)')
                .eq('id', qId).single()
            setExisting(updated ? { ...updated, attachments: (updated.board_attachments || []) as Attachment[] } : null)
        } catch (err: any) {
            setError(err.message || '제출 실패')
        } finally {
            setSubmitting(false)
        }
    }

    if (loading) return <div className="text-center text-sm text-slate-400 py-8">불러오는 중...</div>

    const isVideo = (t: string | null) => t?.startsWith('video/')
    const isImage = (t: string | null) => t?.startsWith('image/')

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
                <span className="text-base font-extrabold text-slate-800 dark:text-white">
                    {selectedWeek}주차 과제 {existing ? '(제출 완료 — 수정 가능)' : ''}
                </span>
                {existing && (
                    <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full dark:bg-emerald-900/30 dark:text-emerald-300">
                        ✓ 제출됨 {new Date(existing.created_at).toLocaleDateString('ko-KR')}
                    </span>
                )}
            </div>

            {/* 기존 첨부 */}
            {existing?.attachments && existing.attachments.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">
                    {existing.attachments.map(att => (
                        <a key={att.id} href={att.file_url} target="_blank" rel="noreferrer"
                            className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-400 transition group">
                            <div className="p-2 bg-white dark:bg-slate-900 rounded-lg text-emerald-500 group-hover:scale-110 transition shrink-0">
                                {isVideo(att.file_type) ? <Play className="w-4 h-4" /> : isImage(att.file_type) ? <FileIcon className="w-4 h-4" /> : <Paperclip className="w-4 h-4" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{att.file_name}</p>
                                {att.file_size && <p className="text-[10px] text-slate-400">{(att.file_size / 1024 / 1024).toFixed(2)} MB</p>}
                            </div>
                        </a>
                    ))}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
                {error && <p className="text-red-500 text-sm font-bold">{error}</p>}
                <textarea
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    rows={5}
                    placeholder="과제 내용 또는 설명을 입력하세요. 파일도 첨부할 수 있습니다."
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
                {/* 파일 드랍존 */}
                <label
                    onDragOver={e => { e.preventDefault(); setIsDrag(true) }}
                    onDragLeave={() => setIsDrag(false)}
                    onDrop={e => { e.preventDefault(); setIsDrag(false); setFiles(p => [...p, ...Array.from(e.dataTransfer.files)]) }}
                    className={`flex flex-col items-center justify-center p-5 border-2 border-dashed rounded-2xl cursor-pointer transition ${isDrag ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/10' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-400'}`}
                >
                    <Upload className={`w-7 h-7 mb-1 ${isDrag ? 'text-indigo-500' : 'text-slate-400'}`} />
                    <span className="text-sm font-bold text-slate-600 dark:text-slate-300">파일 추가 (클릭 또는 드래그)</span>
                    <span className="text-xs text-slate-400 mt-0.5">동영상·음원·문서 모두 지원</span>
                    <input type="file" multiple className="hidden" onChange={e => setFiles(p => [...p, ...Array.from(e.target.files || [])])} />
                </label>
                {files.length > 0 && (
                    <ul className="space-y-2">
                        {files.map((f, i) => (
                            <li key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 relative overflow-hidden">
                                {progress[f.name] !== undefined && (
                                    <div className="absolute left-0 top-0 bottom-0 bg-indigo-100 dark:bg-indigo-900/30 transition-all" style={{ width: `${progress[f.name]}%` }} />
                                )}
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 relative z-10 truncate flex-1">{f.name}</span>
                                {progress[f.name] !== undefined
                                    ? <span className="text-xs font-black text-indigo-600 relative z-10 ml-2">{progress[f.name]}%</span>
                                    : <button type="button" onClick={() => setFiles(p => p.filter((_, j) => j !== i))} className="relative z-10 ml-2 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>}
                            </li>
                        ))}
                    </ul>
                )}
                <button
                    type="submit"
                    disabled={submitting}
                    className="w-full flex justify-center items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-500 transition disabled:opacity-50"
                >
                    {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    {submitting ? '제출 중...' : existing ? '수정 제출' : `${selectedWeek}주차 과제 제출`}
                </button>
            </form>
        </div>
    )
}

// ────────────────────────────────────────────────────────
//  관리자용: 주차별 과제 제출 현황 리뷰
// ────────────────────────────────────────────────────────
export function HomeworkAdminReview({ courseId }: { courseId: string }) {
    const supabase = createClient()
    const [week, setWeek] = useState(1)
    const [submissions, setSubmissions] = useState<HWSubmission[]>([])
    const [selected, setSelected] = useState<HWSubmission | null>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        const load = async () => {
            setLoading(true); setSelected(null)
            // board_questions with type=homework + metadata week
            const { data } = await supabase
                .from('board_questions')
                .select('id, user_id, content, created_at, metadata, users(name), board_attachments(*)')
                .eq('course_id', courseId)
                .eq('type', 'homework')
                .order('created_at', { ascending: true })
            const filtered = (data || []).filter((r: any) => r.metadata?.week_number === week)
            // dedupe per user (latest)
            const byUser: Record<string, any> = {}
            for (const r of filtered) {
                if (!byUser[r.user_id] || r.created_at > byUser[r.user_id].created_at) byUser[r.user_id] = r
            }
            setSubmissions(Object.values(byUser).map((r: any) => ({
                ...r,
                attachments: r.board_attachments || []
            })))
            setLoading(false)
        }
        load()
    }, [courseId, week])

    const isVideo = (t: string | null) => t?.startsWith('video/')
    const isImage = (t: string | null) => t?.startsWith('image/')
    const getName = (s: HWSubmission) => (Array.isArray(s.users) ? s.users[0]?.name : (s.users as any)?.name) || '이름없음'

    return (
        <div className="space-y-4">
            {/* 주차 탭 */}
            <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide">
                {Array.from({ length: 15 }, (_, i) => i + 1).map(w => (
                    <button
                        key={w}
                        onClick={() => setWeek(w)}
                        className={`flex-shrink-0 w-10 h-10 rounded-xl font-bold text-sm transition border ${week === w
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'}`}
                    >
                        {w}
                    </button>
                ))}
            </div>

            <div className="flex gap-0 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden min-h-[400px]">
                {/* 왼쪽: 제출자 탭 */}
                <div className="w-44 shrink-0 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 overflow-y-auto">
                    <div className="px-3 py-2.5 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 dark:border-slate-700">
                        {week}주차 제출 {loading ? '...' : `${submissions.length}명`}
                    </div>
                    {loading ? (
                        <div className="p-4 text-center text-xs text-slate-400"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>
                    ) : submissions.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-400">제출 없음</div>
                    ) : (
                        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                            {submissions.map(s => (
                                <li key={s.id}>
                                    <button
                                        onClick={() => setSelected(s)}
                                        className={`w-full flex items-center gap-2 px-3 py-3 text-left text-sm font-bold transition ${selected?.id === s.id
                                            ? 'bg-indigo-600 text-white'
                                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                                    >
                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${selected?.id === s.id ? 'bg-white/20' : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300'}`}>
                                            {getName(s)[0]?.toUpperCase() || <User className="w-3 h-3" />}
                                        </div>
                                        <span className="truncate">{getName(s)}</span>
                                        {(s.attachments?.length || 0) > 0 && (
                                            <Paperclip className={`w-3 h-3 shrink-0 ${selected?.id === s.id ? 'text-white/70' : 'text-slate-400'}`} />
                                        )}
                                        <ChevronRight className={`w-3.5 h-3.5 shrink-0 ml-auto ${selected?.id === s.id ? 'text-white/70' : 'text-slate-300'}`} />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* 오른쪽: 과제 내용 */}
                <div className="flex-1 p-6 overflow-y-auto">
                    {!selected ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                            <User className="w-10 h-10 opacity-30" />
                            <p className="text-sm font-medium">왼쪽에서 학생을 선택하세요</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 flex items-center justify-center text-base font-black">
                                    {getName(selected)[0]?.toUpperCase()}
                                </div>
                                <div>
                                    <p className="font-extrabold text-slate-900 dark:text-white">{getName(selected)}</p>
                                    <p className="text-[10px] text-slate-400 font-medium">
                                        {week}주차 · 제출 {new Date(selected.created_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        {selected.metadata?.is_resubmit && <span className="ml-2 text-amber-500 font-bold">재제출</span>}
                                    </p>
                                </div>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-700">
                                <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                                    {selected.content || '(내용 없음)'}
                                </p>
                            </div>

                            {(selected.attachments?.length || 0) > 0 && (
                                <div>
                                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">첨부 파일 {selected.attachments!.length}개</p>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        {selected.attachments!.map(att => (
                                            <a key={att.id} href={att.file_url} target="_blank" rel="noreferrer"
                                                className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 transition group">
                                                <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg text-indigo-500 group-hover:scale-110 transition shrink-0">
                                                    {isVideo(att.file_type) ? <Play className="w-4 h-4" /> : isImage(att.file_type) ? <FileIcon className="w-4 h-4" /> : <Paperclip className="w-4 h-4" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{att.file_name}</p>
                                                    {att.file_size && <p className="text-[10px] text-slate-400">{(att.file_size / 1024 / 1024).toFixed(2)} MB</p>}
                                                </div>
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
