'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'
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
    metadata: any
    users?: { name: string } | null
    attachments: Attachment[]
}

// Google Drive webViewLink → embed preview URL
function getDrivePreviewUrl(url: string): string | null {
    const match = url.match(/\/file\/d\/([^/]+)\//)
    if (match) return `https://drive.google.com/file/d/${match[1]}/preview`
    const idMatch = url.match(/[?&]id=([^&]+)/)
    if (idMatch) return `https://drive.google.com/file/d/${idMatch[1]}/preview`
    return null
}

function guessCategory(file_type: string | null, file_name: string) {
    const ext = file_name.split('.').pop()?.toLowerCase() || ''
    if (file_type === 'youtube') return 'youtube'
    if (file_type?.startsWith('image/') || ['jpg','jpeg','png','gif','webp','bmp','svg'].includes(ext)) return 'image'
    if (file_type?.startsWith('video/') || ['mp4','mov','avi','mkv','webm'].includes(ext)) return 'video'
    if (file_type?.startsWith('audio/') || ['mp3','wav','aac','m4a','flac','ogg','aiff'].includes(ext)) return 'audio'
    if (['pdf'].includes(ext) || file_type === 'application/pdf') return 'pdf'
    if (['pptx','ppt'].includes(ext)) return 'pptx'
    if (['docx','doc'].includes(ext)) return 'docx'
    return 'other'
}

function FilePreview({ att }: { att: Attachment | undefined }) {
    if (!att) return null
    const cat = guessCategory(att.file_type, att.file_name)
    const previewUrl = getDrivePreviewUrl(att.file_url)

    if (cat === 'youtube') {
        const videoId = att.file_url.split('v=')[1]?.split('&')[0] || att.file_url.split('/').pop()
        return (
            <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-black aspect-video">
                <iframe
                    src={`https://www.youtube.com/embed/${videoId}`}
                    className="w-full h-full"
                    allowFullScreen
                    title="YouTube Preview"
                />
            </div>
        )
    }

    if (cat === 'image') {
        const driveIdMatch = att.file_url.match(/\/file\/d\/([^/]+)\//) || att.file_url.match(/[?&]id=([^&]+)/)
        const driveFileId = driveIdMatch?.[1]
        const imgSrc = driveFileId
            ? `https://drive.google.com/uc?export=view&id=${driveFileId}`
            : att.file_url
        const fallbackUrl = driveFileId
            ? `https://drive.google.com/file/d/${driveFileId}/preview`
            : null
        return <ImagePreview key={att.id} imgSrc={imgSrc} alt={att.file_name} fallbackUrl={fallbackUrl} />
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
                <div className="w-16 h-16 rounded-2xl bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 flex items-center justify-center">
                    <Music className="w-8 h-8" />
                </div>
                <p className="font-bold text-slate-700 dark:text-slate-300 text-sm text-center">{att.file_name}</p>
                <audio src={att.file_url} controls className="w-full" />
            </div>
        )
    }

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

    return (
        <a
            href={att.file_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-4 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-rose-400 transition group"
        >
            <div className="p-3 bg-white dark:bg-slate-900 rounded-xl text-rose-500 group-hover:scale-110 transition">
                <FileText className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-800 dark:text-white truncate">{att.file_name}</p>
                {att.file_size && <p className="text-xs text-slate-400 mt-0.5">{(att.file_size / 1024 / 1024).toFixed(2)} MB</p>}
            </div>
            <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-rose-500 transition shrink-0" />
        </a>
    )
}

function ImagePreview({ imgSrc, alt, fallbackUrl }: { imgSrc: string; alt: string; fallbackUrl: string | null }) {
    const [useFallback, setUseFallback] = useState(false)

    if (useFallback && fallbackUrl) {
        return (
            <div className="rounded-2xl overflow-hidden border border-neutral-700 bg-neutral-900" style={{ height: '65vh' }}>
                <iframe src={fallbackUrl} className="w-full h-full" title={alt} />
            </div>
        )
    }
    return (
        <div className="rounded-2xl overflow-hidden border border-neutral-700 bg-neutral-900 flex items-center justify-center min-h-[40vh] max-h-[65vh]">
            <img
                src={imgSrc}
                alt={alt}
                className="max-h-[65vh] max-w-full w-auto object-contain rounded-xl"
                onError={() => setUseFallback(true)}
            />
        </div>
    )
}

function AttachmentIcon({ att }: { att: Attachment | undefined }) {
    if (!att) return <Paperclip className="w-3.5 h-3.5" />
    const cat = guessCategory(att.file_type, att.file_name)
    if (cat === 'image') return <ImageIcon className="w-3.5 h-3.5" />
    if (cat === 'video' || cat === 'youtube') return <Video className="w-3.5 h-3.5" />
    if (cat === 'audio') return <Music className="w-3.5 h-3.5" />
    return <Paperclip className="w-3.5 h-3.5" />
}

export default function AudioTechReviewClient({ courses }: { courses: Course[] }) {
    const supabase = createClient()

    const [selectedCourseId, setSelectedCourseId] = useState<string>(courses[0]?.id || '')
    const [selectedType, setSelectedType] = useState<'발표' | '과제물'>('발표')
    const [selectedNum, setSelectedNum] = useState(1)
    
    const [submissions, setSubmissions] = useState<Submission[]>([])
    const [selectedIdx, setSelectedIdx] = useState(0)
    const [loading, setLoading] = useState(false)
    const [selectedAttIdx, setSelectedAttIdx] = useState(0)

    const len = selectedType === '발표' ? 15 : 3;
    const suffix = selectedType === '발표' ? '주차' : '회차';

    const load = useCallback(async () => {
        if (!selectedCourseId) return
        setLoading(true)

        const targetExamType = `${selectedType} ${selectedNum}${suffix}`

        const { data: subsData, error } = await supabase
            .from('exam_submissions')
            .select('*, users(name)')
            .eq('course_id', selectedCourseId)
            .eq('exam_type', '수시과제PDF')
            .like('file_name', `[${targetExamType}]%`)
            .order('created_at', { ascending: true })

        if (error) console.error('Error fetching submissions:', error)

        // Group by user_id since multiple files for the same submission creates multiple rows
        const byUser: Record<string, Submission> = {}
        for (const r of (subsData || [])) {
            if (!byUser[r.user_id]) {
                byUser[r.user_id] = {
                    id: r.id,
                    user_id: r.user_id,
                    content: r.content || '',
                    created_at: r.created_at,
                    metadata: {},
                    users: Array.isArray(r.users) ? r.users[0] : r.users,
                    attachments: []
                }
            }
            
            // Collect the file
            if (r.file_url) {
                // Determine if youtube
                const cat = r.media_type === 'youtube' ? 'youtube' : r.media_type
                // Strip the fake examType prefix we injected during upload
                const displayName = r.file_name?.replace(`[${targetExamType}] `, '') || '제출 파일'
                byUser[r.user_id].attachments.push({
                    id: r.id,
                    file_name: displayName,
                    file_url: r.file_url,
                    file_type: cat,
                    file_size: null
                })
            }
            
            // Merge content if separated
            if (!byUser[r.user_id].content && r.content) {
                 byUser[r.user_id].content = r.content;
            }
        }

        const result = Object.values(byUser)
        setSubmissions(result)
        setSelectedIdx(0)
        setSelectedAttIdx(0)
        setLoading(false)
    }, [selectedCourseId, selectedType, selectedNum, suffix])

    useEffect(() => { 
        load() 
    }, [load])

    // Ensure we don't stay on an invalid week when switching types
    useEffect(() => {
        if (selectedType === '과제물' && selectedNum > 3) {
            setSelectedNum(1)
        }
    }, [selectedType, selectedNum])

    const selected = submissions[selectedIdx] ?? null
    const getName = (s: Submission) => (s.users as any)?.name || '이름없음'

    return (
        <div className="min-h-screen bg-neutral-950 flex flex-col text-white font-sans selection:bg-rose-500/30">
            {/* Top Bar */}
            <header className="flex items-center gap-4 px-5 py-3 bg-neutral-900 border-b border-neutral-800 shrink-0 flex-wrap">
                <Link
                    href={'/admin'}
                    className="p-1 px-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
                    title="대시보드로 돌아가기"
                >
                    <ChevronLeft className="w-5 h-5" />
                </Link>
                <div className="flex items-center gap-2 mr-2">
                    <div className="w-8 h-8 rounded-lg bg-rose-500 text-white flex items-center justify-center">
                        <Music className="w-4 h-4" />
                    </div>
                    <span className="font-extrabold text-lg tracking-tight">오디오 리뷰</span>
                </div>

                {/* Course selector */}
                {courses.length > 1 && (
                    <div className="flex gap-1.5">
                        {courses.map(c => (
                            <button
                                key={c.id}
                                onClick={() => setSelectedCourseId(c.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${selectedCourseId === c.id
                                    ? 'bg-rose-600 text-white shadow-md shadow-rose-900/50'
                                    : 'bg-neutral-800 text-neutral-400 hover:text-white'}`}
                            >
                                {c.name}
                            </button>
                        ))}
                    </div>
                )}
                {courses.length === 1 && (
                    <span className="text-sm font-bold text-rose-300 bg-rose-900/20 px-3 py-1.5 rounded-lg border border-rose-800/30">
                        {courses[0].name}
                    </span>
                )}

                {/* Type selector (발표 vs 과제물) */}
                <div className="flex gap-1 ml-4 bg-neutral-800 p-1 rounded-xl">
                    <button
                        onClick={() => setSelectedType('발표')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${selectedType === '발표' ? 'bg-white text-black shadow-sm' : 'text-neutral-400 hover:text-neutral-200'}`}
                    >
                        발표
                    </button>
                    <button
                        onClick={() => setSelectedType('과제물')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${selectedType === '과제물' ? 'bg-white text-black shadow-sm' : 'text-neutral-400 hover:text-neutral-200'}`}
                    >
                        과제물
                    </button>
                </div>

                {/* Week/Session selector */}
                <div className="flex items-center gap-1.5 ml-auto flex-wrap bg-neutral-900 p-1 rounded-xl border border-neutral-800">
                    <span className="text-xs text-neutral-500 px-2 font-bold">{suffix}</span>
                    {Array.from({ length: len }, (_, i) => i + 1).map(w => (
                        <button
                            key={w}
                            onClick={() => setSelectedNum(w)}
                            className={`relative w-8 h-8 rounded-lg font-bold text-xs transition ${
                                selectedNum === w
                                    ? 'bg-rose-600 text-white shadow-md shadow-rose-900/50 scale-105'
                                    : 'bg-transparent text-neutral-400 hover:bg-neutral-800 hover:text-white'}`}
                        >
                            {w}
                        </button>
                    ))}
                    <div className="w-px h-6 bg-neutral-800 mx-1"></div>
                    <button
                        onClick={load}
                        className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition group"
                        title="새로고침"
                    >
                        <RefreshCw className="w-4 h-4 group-active:rotate-180 transition-transform duration-300" />
                    </button>
                </div>
            </header>

            {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 text-neutral-400">
                    <div className="w-16 h-16 rounded-2xl bg-neutral-900 flex items-center justify-center shadow-inner">
                        <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
                    </div>
                    <span className="font-bold text-sm tracking-wide text-neutral-500">제출물 불러오는 중...</span>
                </div>
            ) : submissions.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 gap-4">
                    <div className="w-20 h-20 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800 shadow-inner">
                        <BookOpen className="w-8 h-8 opacity-40 text-rose-400" />
                    </div>
                    <div className="text-center">
                        <p className="font-extrabold text-xl text-neutral-300">{selectedType} {selectedNum}{suffix} 제출 없음</p>
                        <p className="text-sm mt-2 text-neutral-500 font-medium">아직 과제를 제출한 학생이 없습니다.</p>
                    </div>
                </div>
            ) : (
                <div className="flex flex-1 min-h-0 overflow-hidden relative">
                    {/* Left: Student Name List */}
                    <aside className="w-56 shrink-0 border-r border-neutral-800 bg-neutral-900/50 overflow-y-auto flex flex-col backdrop-blur-xl">
                        <div className="px-5 py-4 text-[10px] font-black text-rose-400/80 uppercase tracking-widest border-b border-neutral-800/80 sticky top-0 bg-neutral-900/90 z-10 flex items-center justify-between">
                            <span>{selectedType} {selectedNum}{suffix}</span>
                            <span className="bg-rose-500/10 text-rose-400 px-2 py-0.5 rounded-full">{submissions.length}명</span>
                        </div>
                        <ul className="flex-1 p-2 space-y-1">
                            {submissions.map((s, i) => (
                                <li key={s.id}>
                                    <button
                                        onClick={() => { setSelectedIdx(i); setSelectedAttIdx(0) }}
                                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all select-none group ${
                                            selectedIdx === i
                                            ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/30 translate-x-1'
                                            : 'text-neutral-400 hover:bg-neutral-800/80 hover:text-white active:scale-95'}`}
                                    >
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 shadow-inner transition-colors ${
                                            selectedIdx === i ? 'bg-white/20 text-white' : 'bg-neutral-800 text-neutral-500 group-hover:bg-neutral-700 group-hover:text-neutral-300'}`}>
                                            {getName(s)[0]?.toUpperCase() || <User className="w-3.5 h-3.5" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-bold truncate transition-colors ${selectedIdx === i ? 'text-white' : 'text-neutral-300 group-hover:text-white'}`}>
                                                {getName(s)}
                                            </p>
                                            {(s.attachments?.length || 0) > 0 && (
                                                <p className={`text-[10px] flex items-center gap-1 mt-1 font-medium transition-colors ${selectedIdx === i ? 'text-rose-200' : 'text-neutral-500'}`}>
                                                    <Paperclip className="w-3 h-3" />
                                                    {s.attachments!.length}개 첨부됨
                                                </p>
                                            )}
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </aside>

                    {/* Right: Content */}
                    <main className="flex-1 overflow-y-auto flex flex-col min-w-0 bg-neutral-950 relative">
                        {selected ? (
                            <div className="flex flex-col h-full p-8 gap-6 max-w-6xl mx-auto w-full">
                                {/* Student Header */}
                                <div className="flex items-center justify-between flex-wrap gap-4 bg-neutral-900/60 p-5 rounded-2xl border border-neutral-800/80 backdrop-blur-sm">
                                    <div className="flex items-center gap-4">
                                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 text-white flex items-center justify-center text-xl font-black shrink-0 shadow-lg shadow-rose-500/20">
                                            {getName(selected)[0]?.toUpperCase()}
                                        </div>
                                        <div>
                                            <h2 className="text-2xl font-extrabold text-white tracking-tight">{getName(selected)}</h2>
                                            <p className="text-xs text-neutral-400 mt-1 font-medium flex items-center gap-2">
                                                <span className="inline-block w-2 h-2 rounded-full bg-rose-500"></span>
                                                {selectedType} {selectedNum}{suffix}
                                                <span className="text-neutral-600">|</span> 
                                                제출일시: {new Date(selected.created_at).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                    </div>
                                    {/* Prev/Next student navigation */}
                                    <div className="flex items-center gap-3 bg-neutral-950 p-1.5 rounded-xl border border-neutral-800 shadow-inner">
                                        <button
                                            onClick={() => { setSelectedIdx(i => Math.max(0, i - 1)); setSelectedAttIdx(0) }}
                                            disabled={selectedIdx === 0}
                                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition text-xs font-bold"
                                        >
                                            <ChevronLeft className="w-4 h-4" /> 이전 학생
                                        </button>
                                        <div className="px-2">
                                            <span className="text-xs font-black text-rose-400 bg-rose-500/10 px-2 py-1 rounded-md">{selectedIdx + 1}</span>
                                            <span className="text-xs font-bold text-neutral-600 mx-1">/</span>
                                            <span className="text-xs font-bold text-neutral-500">{submissions.length}</span>
                                        </div>
                                        <button
                                            onClick={() => { setSelectedIdx(i => Math.min(submissions.length - 1, i + 1)); setSelectedAttIdx(0) }}
                                            disabled={selectedIdx === submissions.length - 1}
                                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition text-xs font-bold"
                                        >
                                            다음 학생 <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* Text Content */}
                                {selected.content && (
                                    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-sm relative overflow-hidden group">
                                        <div className="absolute top-0 left-0 w-1 h-full bg-rose-500/50 group-hover:bg-rose-500 transition-colors"></div>
                                        <h3 className="text-xs font-black text-rose-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                            <FileText className="w-4 h-4" /> 과제 본문 내용
                                        </h3>
                                        <p className="text-sm text-neutral-300 whitespace-pre-wrap leading-relaxed">
                                            {selected.content}
                                        </p>
                                    </div>
                                )}

                                {/* Attachments */}
                                {(selected.attachments?.length || 0) > 0 && (
                                    <div className="flex-1 flex flex-col min-h-0 gap-4">
                                        {/* Attachment tabs */}
                                        {selected.attachments!.length > 1 && (
                                            <div className="bg-neutral-900/50 p-2 rounded-2xl border border-neutral-800/50 backdrop-blur-sm">
                                                <p className="text-[10px] font-black text-neutral-500 uppercase tracking-widest px-2 pt-1 pb-2">첨부 파일 목록 ({selected.attachments!.length})</p>
                                                <div className="flex gap-2 flex-wrap">
                                                    {selected.attachments!.map((att, ai) => (
                                                        <button
                                                            key={att.id}
                                                            onClick={() => setSelectedAttIdx(ai)}
                                                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${selectedAttIdx === ai
                                                                ? 'bg-rose-600 text-white shadow-md shadow-rose-900/30 ring-1 ring-rose-500'
                                                                : 'bg-neutral-950 text-neutral-400 border border-neutral-800 hover:text-white hover:border-neutral-600'}`}
                                                        >
                                                            <div className={`p-1 rounded-md ${selectedAttIdx === ai ? 'bg-white/20' : 'bg-neutral-800'}`}>
                                                                <AttachmentIcon att={att} />
                                                            </div>
                                                            <span className="max-w-[150px] truncate">{att.file_name}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* File Preview */}
                                        <div className="flex-1 min-h-0 bg-neutral-900 rounded-3xl border border-neutral-800 p-2 shadow-2xl">
                                            <FilePreview att={selected.attachments![selectedAttIdx]} />
                                        </div>
                                    </div>
                                )}

                                {!selected.content && (!selected.attachments || selected.attachments.length === 0) && (
                                    <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 bg-neutral-900/30 rounded-3xl border border-neutral-800/50 border-dashed">
                                        <div className="w-16 h-16 rounded-full bg-neutral-900 flex items-center justify-center mb-4">
                                            <FileText className="w-6 h-6 text-neutral-600" />
                                        </div>
                                        <p className="font-bold text-neutral-400">제출된 내용이 없습니다</p>
                                        <p className="text-xs mt-1 opacity-60">텍스트 내용이나 첨부 파일이 누락되었습니다.</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-neutral-600 font-bold bg-neutral-950">
                                <User className="w-16 h-16 text-neutral-800 mb-4" />
                                <p>왼쪽 목록에서 학생을 선택하세요</p>
                            </div>
                        )}
                    </main>
                </div>
            )}
        </div>
    )
}
