'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import {
    Loader2, User, Paperclip, FileText, Music, Video, Image as ImageIcon,
    ChevronLeft, ChevronRight, ExternalLink, BookOpen, RefreshCw
} from 'lucide-react'

type Course = { id: string; name: string }

type Attachment = {
    id: string
    file_name: string
    file_url: string
    file_type: string | null
    file_size: number | null
}

type Submission = {
    id: string
    user_id: string
    content: string
    created_at: string
    metadata: { week_number: number; is_resubmit?: boolean }
    users?: { name: string } | null
    attachments: Attachment[]
}

// Google Drive webViewLink → embed preview URL
function getDrivePreviewUrl(url: string): string | null {
    const match = url.match(/\/file\/d\/([^/]+)\//)
    if (match) return `https://drive.google.com/file/d/${match[1]}/preview`
    // handle id= style
    const idMatch = url.match(/[?&]id=([^&]+)/)
    if (idMatch) return `https://drive.google.com/file/d/${idMatch[1]}/preview`
    return null
}

function guessCategory(file_type: string | null, file_name: string) {
    const ext = file_name.split('.').pop()?.toLowerCase() || ''
    if (file_type?.startsWith('image/') || ['jpg','jpeg','png','gif','webp','bmp','svg'].includes(ext)) return 'image'
    if (file_type?.startsWith('video/') || ['mp4','mov','avi','mkv','webm'].includes(ext)) return 'video'
    if (file_type?.startsWith('audio/') || ['mp3','wav','aac','m4a','flac','ogg','aiff'].includes(ext)) return 'audio'
    if (['pdf'].includes(ext) || file_type === 'application/pdf') return 'pdf'
    if (['pptx','ppt'].includes(ext)) return 'pptx'
    if (['docx','doc'].includes(ext)) return 'docx'
    return 'other'
}

function FilePreview({ att }: { att: Attachment }) {
    const cat = guessCategory(att.file_type, att.file_name)
    const previewUrl = getDrivePreviewUrl(att.file_url)

    if (cat === 'image') {
        return (
            <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-2 max-h-[65vh]">
                <img src={att.file_url} alt={att.file_name} className="max-h-[60vh] w-auto object-contain rounded-xl" />
            </div>
        )
    }

    if (cat === 'video') {
        return (
            <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-black">
                <video src={att.file_url} controls className="w-full max-h-[65vh]" />
            </div>
        )
    }

    if (cat === 'audio') {
        return (
            <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300 flex items-center justify-center">
                    <Music className="w-8 h-8" />
                </div>
                <p className="font-bold text-slate-700 dark:text-slate-300 text-sm text-center">{att.file_name}</p>
                <audio src={att.file_url} controls className="w-full" />
            </div>
        )
    }

    // PDF, PPTX, DOCX → Google Drive embed
    if ((cat === 'pdf' || cat === 'pptx' || cat === 'docx') && previewUrl) {
        return (
            <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white" style={{ height: '65vh' }}>
                <iframe
                    src={previewUrl}
                    className="w-full h-full"
                    allow="autoplay"
                    title={att.file_name}
                />
            </div>
        )
    }

    // Fallback: link
    return (
        <a
            href={att.file_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-4 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 transition group"
        >
            <div className="p-3 bg-white dark:bg-slate-900 rounded-xl text-indigo-500 group-hover:scale-110 transition">
                <FileText className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-800 dark:text-white truncate">{att.file_name}</p>
                {att.file_size && <p className="text-xs text-slate-400 mt-0.5">{(att.file_size / 1024 / 1024).toFixed(2)} MB</p>}
            </div>
            <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition shrink-0" />
        </a>
    )
}

function AttachmentIcon({ att }: { att: Attachment }) {
    const cat = guessCategory(att.file_type, att.file_name)
    if (cat === 'image') return <ImageIcon className="w-3.5 h-3.5" />
    if (cat === 'video') return <Video className="w-3.5 h-3.5" />
    if (cat === 'audio') return <Music className="w-3.5 h-3.5" />
    return <Paperclip className="w-3.5 h-3.5" />
}

export default function HomeworkReviewClient({ courses }: { courses: Course[] }) {
    const supabase = createClient()

    const [selectedCourseId, setSelectedCourseId] = useState<string>(courses[0]?.id || '')
    const [selectedWeek, setSelectedWeek] = useState(1)
    const [submissions, setSubmissions] = useState<Submission[]>([])
    const [selectedIdx, setSelectedIdx] = useState(0)
    const [loading, setLoading] = useState(false)
    const [selectedAttIdx, setSelectedAttIdx] = useState(0)

    const load = useCallback(async () => {
        if (!selectedCourseId) return
        setLoading(true)
        const { data } = await supabase
            .from('board_questions')
            .select('id, user_id, content, created_at, metadata, users(name), board_attachments(*)')
            .eq('course_id', selectedCourseId)
            .eq('type', 'homework')
            .order('created_at', { ascending: true })

        const filtered = (data || []).filter((r: any) => r.metadata?.week_number === selectedWeek)
        // dedupe: keep latest per user
        const byUser: Record<string, any> = {}
        for (const r of filtered) {
            if (!byUser[r.user_id] || r.created_at > byUser[r.user_id].created_at) byUser[r.user_id] = r
        }
        const result = Object.values(byUser).map((r: any) => ({
            ...r,
            attachments: (r.board_attachments || []) as Attachment[],
            users: Array.isArray(r.users) ? r.users[0] : r.users,
        })) as Submission[]
        setSubmissions(result)
        setSelectedIdx(0)
        setSelectedAttIdx(0)
        setLoading(false)
    }, [selectedCourseId, selectedWeek])

    useEffect(() => { load() }, [load])

    const selected = submissions[selectedIdx] ?? null
    const getName = (s: Submission) => (s.users as any)?.name || '이름없음'

    return (
        <div className="min-h-screen bg-neutral-950 flex flex-col text-white">
            {/* Top Bar */}
            <header className="flex items-center gap-4 px-5 py-3 bg-neutral-900 border-b border-neutral-800 shrink-0 flex-wrap">
                <div className="flex items-center gap-2 mr-2">
                    <BookOpen className="w-5 h-5 text-indigo-400" />
                    <span className="font-extrabold text-lg tracking-tight">과제 리뷰</span>
                </div>

                {/* Course selector */}
                {courses.length > 1 && (
                    <div className="flex gap-1.5">
                        {courses.map(c => (
                            <button
                                key={c.id}
                                onClick={() => setSelectedCourseId(c.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${selectedCourseId === c.id
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-neutral-800 text-neutral-400 hover:text-white'}`}
                            >
                                {c.name}
                            </button>
                        ))}
                    </div>
                )}
                {courses.length === 1 && (
                    <span className="text-sm font-bold text-indigo-300">{courses[0].name}</span>
                )}

                {/* Week selector */}
                <div className="flex items-center gap-1 ml-auto flex-wrap">
                    <span className="text-xs text-neutral-500 mr-1 font-bold">주차</span>
                    {Array.from({ length: 15 }, (_, i) => i + 1).map(w => (
                        <button
                            key={w}
                            onClick={() => setSelectedWeek(w)}
                            className={`w-8 h-8 rounded-lg font-bold text-xs transition ${selectedWeek === w
                                ? 'bg-indigo-600 text-white shadow-lg'
                                : 'bg-neutral-800 text-neutral-400 hover:text-white'}`}
                        >
                            {w}
                        </button>
                    ))}
                    <button
                        onClick={load}
                        className="ml-2 p-1.5 rounded-lg bg-neutral-800 text-neutral-400 hover:text-white transition"
                        title="새로고침"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                </div>
            </header>

            {loading ? (
                <div className="flex-1 flex items-center justify-center gap-3 text-neutral-400">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span className="font-medium">불러오는 중...</span>
                </div>
            ) : submissions.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 gap-3">
                    <BookOpen className="w-12 h-12 opacity-30" />
                    <p className="font-bold text-lg">{selectedWeek}주차 제출 없음</p>
                    <p className="text-sm">아직 과제를 제출한 학생이 없습니다.</p>
                </div>
            ) : (
                <div className="flex flex-1 min-h-0 overflow-hidden">
                    {/* Left: Student Name List */}
                    <aside className="w-40 shrink-0 border-r border-neutral-800 bg-neutral-900 overflow-y-auto flex flex-col">
                        <div className="px-3 py-2 text-[9px] font-black text-neutral-500 uppercase tracking-widest border-b border-neutral-800">
                            {selectedWeek}주차 · {submissions.length}명
                        </div>
                        <ul className="flex-1">
                            {submissions.map((s, i) => (
                                <li key={s.id}>
                                    <button
                                        onClick={() => { setSelectedIdx(i); setSelectedAttIdx(0) }}
                                        className={`w-full flex items-center gap-2 px-3 py-3 text-left transition ${selectedIdx === i
                                            ? 'bg-indigo-600 text-white'
                                            : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'}`}
                                    >
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black shrink-0 ${selectedIdx === i ? 'bg-white/20' : 'bg-neutral-700 text-neutral-300'}`}>
                                            {getName(s)[0]?.toUpperCase() || <User className="w-3 h-3" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold truncate leading-tight">{getName(s)}</p>
                                            {(s.attachments?.length || 0) > 0 && (
                                                <p className={`text-[9px] flex items-center gap-0.5 mt-0.5 ${selectedIdx === i ? 'text-white/60' : 'text-neutral-500'}`}>
                                                    <Paperclip className="w-2.5 h-2.5" />
                                                    {s.attachments!.length}개
                                                </p>
                                            )}
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </aside>

                    {/* Right: Content */}
                    <main className="flex-1 overflow-y-auto flex flex-col min-w-0">
                        {selected ? (
                            <div className="flex flex-col h-full p-6 gap-5">
                                {/* Student Header */}
                                <div className="flex items-center justify-between flex-wrap gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-lg font-black shrink-0">
                                            {getName(selected)[0]?.toUpperCase()}
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-extrabold text-white">{getName(selected)}</h2>
                                            <p className="text-xs text-neutral-400 mt-0.5 font-medium">
                                                {selectedWeek}주차 · 제출 {new Date(selected.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                {selected.metadata?.is_resubmit && <span className="ml-2 text-amber-400 font-bold">재제출</span>}
                                            </p>
                                        </div>
                                    </div>
                                    {/* Prev/Next student navigation */}
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => { setSelectedIdx(i => Math.max(0, i - 1)); setSelectedAttIdx(0) }}
                                            disabled={selectedIdx === 0}
                                            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-neutral-800 text-neutral-400 hover:text-white disabled:opacity-30 transition text-xs font-bold"
                                        >
                                            <ChevronLeft className="w-4 h-4" /> 이전
                                        </button>
                                        <span className="text-xs text-neutral-500 font-bold">{selectedIdx + 1} / {submissions.length}</span>
                                        <button
                                            onClick={() => { setSelectedIdx(i => Math.min(submissions.length - 1, i + 1)); setSelectedAttIdx(0) }}
                                            disabled={selectedIdx === submissions.length - 1}
                                            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-neutral-800 text-neutral-400 hover:text-white disabled:opacity-30 transition text-xs font-bold"
                                        >
                                            다음 <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* Text Content */}
                                {selected.content && (
                                    <div className="bg-neutral-800/60 rounded-2xl p-5 border border-neutral-700">
                                        <p className="text-[11px] font-black text-neutral-500 uppercase tracking-widest mb-2">과제 내용</p>
                                        <p className="text-sm text-neutral-200 whitespace-pre-wrap leading-relaxed">{selected.content}</p>
                                    </div>
                                )}

                                {/* Attachments */}
                                {(selected.attachments?.length || 0) > 0 && (
                                    <div className="flex-1 flex flex-col min-h-0 gap-3">
                                        {/* Attachment tabs */}
                                        {selected.attachments!.length > 1 && (
                                            <div className="flex gap-1.5 flex-wrap">
                                                {selected.attachments!.map((att, ai) => (
                                                    <button
                                                        key={att.id}
                                                        onClick={() => setSelectedAttIdx(ai)}
                                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition ${selectedAttIdx === ai
                                                            ? 'bg-indigo-600 text-white'
                                                            : 'bg-neutral-800 text-neutral-400 hover:text-white'}`}
                                                    >
                                                        <AttachmentIcon att={att} />
                                                        <span className="max-w-[120px] truncate">{att.file_name}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {/* File Preview */}
                                        <div className="flex-1 min-h-0">
                                            <FilePreview att={selected.attachments![selectedAttIdx]} />
                                        </div>
                                    </div>
                                )}

                                {!selected.content && (!selected.attachments || selected.attachments.length === 0) && (
                                    <div className="flex-1 flex items-center justify-center text-neutral-500">
                                        <p className="text-sm">(내용 없음)</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-neutral-500">
                                <p>왼쪽에서 학생을 선택하세요</p>
                            </div>
                        )}
                    </main>
                </div>
            )}
        </div>
    )
}
