'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'
import WaveSurfer from 'wavesurfer.js'
import {
    Loader2, User, Paperclip, FileText, Music, Video, Image as ImageIcon,
    ChevronLeft, ChevronRight, ExternalLink, BookOpen, RefreshCw, Lock, LockOpen
} from 'lucide-react'

type Course = { id: string; name: string; weekly_homework_titles?: Record<string, string> }

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
    metadata: { week_number: number; is_resubmit?: boolean; ai_feedback?: string }
    users?: { name: string } | null
    attachments: Attachment[]
    ai_feedback?: string
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

function AudioPreview({ fileUrl, fileName, submissionId, submissionType, initialFeedback }: { fileUrl: string, fileName: string, submissionId: string, submissionType: string, initialFeedback: string | null }) {
    const containerRef = useRef<HTMLDivElement>(null)
    const wavesurferRef = useRef<WaveSurfer | null>(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [isReady, setIsReady] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [hasError, setHasError] = useState(false)
    
    // AI Diagnosis State
    const [aiLoading, setAiLoading] = useState(false)
    const [aiDiagnosis, setAiDiagnosis] = useState<string | null>(initialFeedback)
    
    const isVocal = fileName.toLowerCase().includes('vocal') || fileName.includes('보컬')
    
    let audioSrc = fileUrl;
    const driveIdMatch = fileUrl.match(/\/file\/d\/([^/]+)\//) || fileUrl.match(/[?&]id=([^&]+)/)
    if (driveIdMatch) {
       // Use internal API proxy to bypass CORS for WaveSurfer fetch
       audioSrc = `/api/audio-stream?fileId=${driveIdMatch[1]}`
    }

    useEffect(() => {
        if (!containerRef.current) return

        const ws = WaveSurfer.create({
            container: containerRef.current,
            waveColor: '#6366f1',
            progressColor: '#818cf8',
            cursorColor: '#ffffff',
            barWidth: 2,
            barGap: 2,
            barRadius: 2,
            height: 100,
            normalize: true,
        })
        
        wavesurferRef.current = ws

        ws.load(audioSrc)

        ws.on('ready', () => {
            setIsReady(true)
            setDuration(ws.getDuration())
        })

        ws.on('audioprocess', () => {
            setCurrentTime(ws.getCurrentTime())
        })

        ws.on('interaction', () => {
            setCurrentTime(ws.getCurrentTime())
        })

        ws.on('play', () => setIsPlaying(true))
        ws.on('pause', () => setIsPlaying(false))
        ws.on('finish', () => setIsPlaying(false))

        ws.on('error', (err) => {
            console.error('WaveSurfer error:', err)
            setHasError(true)
        })

        return () => {
            ws.destroy()
        }
    }, [audioSrc])

    const handlePlayPause = () => {
        wavesurferRef.current?.playPause()
    }

    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60)
        const s = Math.floor(secs % 60)
        return `${m}:${s < 10 ? '0' : ''}${s}`
    }

    const runAiDiagnosis = async () => {
        if (!confirm('🤖 이 보컬 트랙의 녹음 품질(잡음, 공간 잔향, 마이크 테크닉 등)을 AI로 진단하시겠습니까?\n(약 10~30초 소요)')) return
        setAiLoading(true)
        setAiDiagnosis(null)
        try {
            const res = await fetch('/api/analyze-vocal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileUrl, fileName, submissionId, submissionType })
            })
            if (res.ok) {
                const data = await res.json()
                if (data.result) {
                    setAiDiagnosis(data.result)
                } else {
                    alert('진단 결과를 가져오지 못했습니다.')
                }
            } else {
                const data = await res.json()
                alert(`오류 발생: ${data.error}`)
            }
        } catch (e: any) {
            alert(`네트워크 오류: ${e.message}`)
        } finally {
            setAiLoading(false)
        }
    }

    if (hasError) {
        // Fallback to default audio player
        return (
            <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300 flex items-center justify-center">
                    <Music className="w-8 h-8" />
                </div>
                <p className="font-bold text-slate-700 dark:text-slate-300 text-sm text-center">{fileName}</p>
                <audio src={audioSrc} controls className="w-full" />
                <p className="text-xs text-red-400">음원 파형을 불러오지 못했습니다. 일반 플레이어를 사용합니다.</p>
            </div>
        )
    }

    return (
        <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 flex flex-col gap-4 shadow-inner">
            <div className="flex items-center gap-4">
                <button
                    onClick={handlePlayPause}
                    disabled={!isReady}
                    className="w-14 h-14 shrink-0 rounded-full bg-indigo-600 text-white flex items-center justify-center disabled:opacity-50 hover:bg-indigo-500 transition shadow-lg hover:scale-105"
                >
                    {isPlaying ? (
                        <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                    ) : (
                        <svg className="w-6 h-6 fill-current ml-1" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    )}
                </button>
                <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 dark:text-slate-200 text-base truncate">{fileName}</p>
                    <p className="text-sm text-slate-500 mt-1 dark:text-slate-400 font-mono bg-slate-900/10 dark:bg-black/30 inline-block px-2 py-0.5 rounded-md">
                        {isReady ? `${formatTime(currentTime)} / ${formatTime(duration)}` : '음원 파형 분석 중...'}
                    </p>
                </div>
                {isVocal && (
                    <button
                        onClick={runAiDiagnosis}
                        disabled={aiLoading}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl shadow border border-indigo-400/50 transition font-bold text-sm shrink-0"
                    >
                        {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : '🤖 음향 AI 진단'}
                    </button>
                )}
            </div>
            <div ref={containerRef} className={`w-full cursor-pointer mt-2 bg-slate-900/5 dark:bg-black/20 rounded-xl p-2 ${!isReady ? 'opacity-0' : 'opacity-100 transition-opacity duration-500'}`} />
            {!isReady && (
                <div className="h-[100px] flex items-center justify-center -mt-[116px] pointer-events-none">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                </div>
            )}
            
            {/* AI Diagnosis Result Area */}
            {(aiLoading || aiDiagnosis) && (
                <div className="mt-4 bg-indigo-950/20 border border-indigo-500/30 rounded-xl p-5 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-xl">🎙️</span>
                        <h4 className="font-extrabold text-indigo-200 text-sm">보컬 트랙 음향 AI 진단 리포트</h4>
                    </div>
                    {aiLoading ? (
                        <div className="flex flex-col items-center justify-center py-6 gap-3 text-indigo-400">
                            <Loader2 className="w-8 h-8 animate-spin" />
                            <p className="text-sm font-bold">오디오를 분석하고 있습니다. 잠시만 기다려주세요...</p>
                        </div>
                    ) : (
                        <div className="text-sm text-indigo-100/90 leading-relaxed whitespace-pre-wrap">
                            {aiDiagnosis}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}


function FilePreview({ att, submission }: { att: Attachment | undefined, submission?: Submission }) {
    if (!att) return null
    const cat = guessCategory(att.file_type, att.file_name)
    const previewUrl = getDrivePreviewUrl(att.file_url)

    if (cat === 'image') {
        // Google Drive URL에서 파일 ID 추출 → 직접 이미지 URL로 변환
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
        if (previewUrl) {
            return (
                <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-black" style={{ height: '65vh' }}>
                    <iframe
                        src={previewUrl}
                        className="w-full h-full"
                        allow="autoplay; fullscreen"
                        title={att.file_name}
                    />
                </div>
            )
        }
        return (
            <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-black">
                <video src={att.file_url} controls className="w-full max-h-[65vh]" />
            </div>
        )
    }

    if (cat === 'audio') {
        const submissionId = submission?.id.replace('assign_', '') || ''
        const submissionType = submission?.id.startsWith('assign_') ? 'assignment' : 'board'
        const initialFeedback = submission?.ai_feedback || submission?.metadata?.ai_feedback || null
        return <AudioPreview fileUrl={att.file_url} fileName={att.file_name} submissionId={submissionId} submissionType={submissionType} initialFeedback={initialFeedback} />
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
    if (cat === 'video') return <Video className="w-3.5 h-3.5" />
    if (cat === 'audio') return <Music className="w-3.5 h-3.5" />
    return <Paperclip className="w-3.5 h-3.5" />
}

function YouTubeEmbeds({ text }: { text: string | undefined | null }) {
    if (!text) return null;
    const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;
    const matches = Array.from(text.matchAll(regex));
    const videoIds = [...new Set(matches.map(m => m[1]))];

    if (videoIds.length === 0) return null;

    return (
        <div className="mt-4 flex flex-col gap-4">
            {videoIds.map(id => (
                <div key={id} className="relative w-full overflow-hidden rounded-2xl bg-black" style={{ paddingTop: '56.25%' }}>
                    <iframe
                        className="absolute top-0 left-0 w-full h-full"
                        src={`https://www.youtube.com/embed/${id}`}
                        title="YouTube video player"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                    />
                </div>
            ))}
        </div>
    );
}

export default function HomeworkReviewClient({ courses }: { courses: Course[] }) {
    const supabase = createClient()

    const [selectedCourseId, setSelectedCourseId] = useState<string>(courses[0]?.id || '')
    const [selectedWeek, setSelectedWeek] = useState(1)
    const [submissions, setSubmissions] = useState<Submission[]>([])
    const [selectedIdx, setSelectedIdx] = useState(0)
    const [loading, setLoading] = useState(false)
    const [selectedAttIdx, setSelectedAttIdx] = useState(0)
    const [deadlines, setDeadlines] = useState<Record<string, boolean>>({})
    const [deadlineToggling, setDeadlineToggling] = useState(false)
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
    const [dragSubmission, setDragSubmission] = useState<{ id: string; type: 'board' | 'assign' } | null>(null)
    const dragSubmissionRef = useRef<{ id: string; type: 'board' | 'assign' } | null>(null)
    const [dragOverWeek, setDragOverWeek] = useState<number | null>(null)
    const [moving, setMoving] = useState(false)
    const [isAiProcessing, setIsAiProcessing] = useState(false)

    const currentCourse = courses.find(c => c.id === selectedCourseId)
    const currentAiTitle = currentCourse?.weekly_homework_titles?.[String(selectedWeek)]

    const runAiAnalysis = async () => {
        if (!selectedCourseId || isAiProcessing) return
        if (!confirm(`🤖 ${selectedWeek}주차 학생들의 제출물과 강의 노트를 종합해서 AI 분석을 시작하시겠습니까?\n(수십 초에서 최대 2분까지 소요될 수 있습니다)`)) return
        
        setIsAiProcessing(true)
        showToast('🤖 AI 분석을 시작합니다. 창을 닫지 마세요!', 'success')
        
        try {
            const res = await fetch('/api/homework-ai-process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ courseId: selectedCourseId, weekNumber: selectedWeek })
            })
            
            if (res.ok) {
                const data = await res.json()
                if (data.success) {
                    showToast(`✅ [${selectedWeek}주차] AI 분석 완료! ${data.title ? `제목: ${data.title}` : ''}`, 'success')
                    window.location.reload()
                } else {
                    showToast(`문제가 발생했습니다: ${data.message || '알 수 없는 오류'}`, 'error')
                }
            } else {
                const err = await res.json()
                showToast(`AI 분석 실패: ${err.error}`, 'error')
            }
        } catch (e: any) {
            showToast(`네트워크 오류: ${e.message}`, 'error')
        } finally {
            setIsAiProcessing(false)
        }
    }

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 3000)
    }

    const loadDeadlines = useCallback(async () => {
        if (!selectedCourseId) return
        try {
            const res = await fetch(`/api/homework-deadline?courseId=${selectedCourseId}`)
            if (res.ok) {
                const data = await res.json()
                setDeadlines(data.deadlines || {})
            }
        } catch { /* ignore */ }
    }, [selectedCourseId])

    const toggleDeadline = async () => {
        if (!selectedCourseId || deadlineToggling) return
        setDeadlineToggling(true)
        const current = !!deadlines[String(selectedWeek)]
        try {
            const res = await fetch('/api/homework-deadline', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ courseId: selectedCourseId, week: selectedWeek, closed: !current }),
            })
            if (res.ok) {
                const data = await res.json()
                setDeadlines(data.deadlines || {})
                showToast(
                    !current
                        ? `✅ ${selectedWeek}주차 과제가 마감되었습니다.`
                        : `🔓 ${selectedWeek}주차 과제 마감이 해제되었습니다.`,
                    'success'
                )
            } else {
                showToast('마감 상태 변경에 실패했습니다.', 'error')
            }
        } catch {
            showToast('네트워크 오류가 발생했습니다.', 'error')
        } finally {
            setDeadlineToggling(false)
        }
    }


    const load = useCallback(async () => {
        if (!selectedCourseId) return
        setLoading(true)

        // 1. 기존 board_questions 방식 (이전 제출 방식)
        const { data: bqData } = await supabase
            .from('board_questions')
            .select('id, user_id, content, created_at, metadata, users(name), board_attachments(*)')
            .eq('course_id', selectedCourseId)
            .eq('type', 'homework')
            .order('created_at', { ascending: true })

        const bqFiltered = (bqData || []).filter((r: any) => Number(r.metadata?.week_number) === Number(selectedWeek))

        // 2. 새 assignments 방식 (워크스페이스 업로드)
        const { data: assignData } = await supabase
            .from('assignments')
            .select('id, user_id, week_number, file_url, file_id, file_name, created_at, status, users(name), ai_feedback')
            .eq('course_id', selectedCourseId)
            .eq('week_number', selectedWeek)
            .is('deleted_at', null)
            .order('created_at', { ascending: true })

        // assignments 데이터를 Submission 형태로 정규화
        const assignSubmissions: any[] = (assignData || []).map((a: any) => ({
            id: `assign_${a.id}`,
            user_id: a.user_id,
            content: '',
            created_at: a.created_at,
            metadata: { week_number: a.week_number },
            ai_feedback: a.ai_feedback,
            users: Array.isArray(a.users) ? a.users[0] : a.users,
            attachments: [{
                id: a.id,
                file_name: a.file_name || '제출 파일',
                file_url: a.file_url || `https://drive.google.com/file/d/${a.file_id}/view`,
                file_type: null,
                file_size: null,
            }] as Attachment[],
        }))

        // 3. 두 소스 병합 — user별로 가장 최신 제출 유지 (board_questions 우선, 없으면 assignments)
        const byUser: Record<string, any> = {}
        for (const r of bqFiltered) {
            if (!byUser[r.user_id] || r.created_at > byUser[r.user_id].created_at) byUser[r.user_id] = r
        }
        // assignments는 user별로 모두 추가 (단, board_questions 이미 있으면 attachments만 추가)
        for (const r of assignSubmissions) {
            if (byUser[r.user_id]) {
                // 이미 board_questions 제출이 있으면 attachments에 병합
                byUser[r.user_id].attachments = [...(byUser[r.user_id].attachments || []), ...r.attachments]
            } else {
                byUser[r.user_id] = r
            }
        }

        const result = Object.values(byUser).map((r: any) => ({
            ...r,
            attachments: (r.board_attachments || r.attachments || []) as Attachment[],
            users: Array.isArray(r.users) ? r.users[0] : r.users,
        })) as Submission[]

        setSubmissions(result)
        setSelectedIdx(0)
        setSelectedAttIdx(0)
        setLoading(false)
    }, [selectedCourseId, selectedWeek])

    const handleDrop = useCallback(async (targetWeek: number, sub: { id: string; type: string }) => {
        if (!sub?.id || targetWeek === selectedWeek) return
        setMoving(true)
        setDragOverWeek(null)
        try {
            const res = await fetch('/api/homework-move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    submissionId: sub.id,
                    submissionType: sub.type,
                    newWeek: targetWeek,
                }),
            })
            const json = await res.json().catch(() => ({}))
            if (res.ok) {
                showToast(`✅ ${targetWeek}주차로 이동되었습니다.`, 'success')
                load()
            } else {
                showToast(`이동 실패: ${json.error || res.status}`, 'error')
            }
        } catch (e: any) {
            showToast(`네트워크 오류: ${e?.message || ''}`, 'error')
        } finally {
            setMoving(false)
            dragSubmissionRef.current = null
            setDragSubmission(null)
        }
    }, [selectedWeek, load])

    useEffect(() => { load(); loadDeadlines() }, [load, loadDeadlines])

    const selected = submissions[selectedIdx] ?? null
    const getName = (s: Submission) => (s.users as any)?.name || '이름없음'

    return (
        <div className="min-h-screen bg-neutral-950 flex flex-col text-white">
            {/* 토스트 알림 */}
            {toast && (
                <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-2xl text-sm font-bold flex items-center gap-2 transition-all animate-in fade-in slide-in-from-top-4 ${
                    toast.type === 'success'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-red-600 text-white'
                }`}>
                    {toast.msg}
                </div>
            )}
            {/* Top Bar */}
            <header className="flex items-center gap-4 px-5 py-3 bg-neutral-900 border-b border-neutral-800 shrink-0 flex-wrap">
                <Link
                    href={'/admin'}
                    className="p-1 px-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
                >
                    <ChevronLeft className="w-5 h-5" />
                </Link>
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

                {/* Week selector + 마감 토글 */}
                <div className="flex items-center gap-1 ml-auto flex-wrap">
                    <span className="text-xs text-neutral-500 mr-1 font-bold">주차</span>
                    {Array.from({ length: 15 }, (_, i) => i + 1).map(w => {
                        const isClosed = !!deadlines[String(w)]
                        const isDragTarget = dragOverWeek === w && dragSubmission !== null && w !== selectedWeek
                        return (
                            <button
                                key={w}
                                onClick={() => setSelectedWeek(w)}
                                onDragEnter={e => e.preventDefault()}
                                onDragOver={e => { e.preventDefault(); setDragOverWeek(w) }}
                                onDragLeave={() => setDragOverWeek(null)}
                                onDrop={e => {
                                    e.preventDefault()
                                    try {
                                        const raw = e.dataTransfer.getData('text/plain')
                                        const sub = JSON.parse(raw)
                                        handleDrop(w, sub)
                                    } catch {
                                        showToast('드래그 데이터를 읽지 못했습니다.', 'error')
                                    }
                                }}
                                className={`relative w-8 h-8 rounded-lg font-bold text-xs transition ${
                                    isDragTarget
                                        ? 'bg-amber-500 text-white scale-110 ring-2 ring-amber-300 shadow-lg'
                                        : selectedWeek === w
                                            ? 'bg-indigo-600 text-white shadow-lg'
                                            : 'bg-neutral-800 text-neutral-400 hover:text-white'}`}
                            >
                                {w}
                                {isClosed && (
                                    <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 flex items-center justify-center">
                                        <Lock className="w-1.5 h-1.5 text-white" />
                                    </span>
                                )}
                            </button>
                        )
                    })}
                    {/* 현재 주차 마감 토글 버튼 */}
                    <button
                        onClick={toggleDeadline}
                        disabled={deadlineToggling}
                        className={`ml-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition disabled:opacity-50 ${
                            deadlines[String(selectedWeek)]
                                ? 'bg-red-600 hover:bg-red-500 text-white'
                                : 'bg-emerald-700 hover:bg-emerald-600 text-white'
                        }`}
                        title={deadlines[String(selectedWeek)] ? '마감 해제' : '마감하기'}
                    >
                        {deadlineToggling
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : deadlines[String(selectedWeek)]
                                ? <><Lock className="w-3 h-3" /> {selectedWeek}주차 마감 중</>
                                : <><LockOpen className="w-3 h-3" /> {selectedWeek}주차 마감하기</>
                        }
                    </button>
                    <button
                        onClick={() => { load(); loadDeadlines() }}
                        className="ml-1 p-1.5 rounded-lg bg-neutral-800 text-neutral-400 hover:text-white transition"
                        title="새로고침"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                </div>
            </header>

            {/* AI Analysis Bar */}
            <div className="flex items-center justify-between px-5 py-3 bg-indigo-950/20 border-b border-indigo-900/30 flex-wrap gap-3">
                <div className="flex flex-col">
                    <span className="text-xs text-indigo-400 font-bold mb-0.5">🤖 AI 생성 과제 타이틀</span>
                    <h2 className="text-base font-black text-indigo-100">
                        {currentAiTitle || <span className="text-neutral-500 italic">아직 타이틀이 생성되지 않았습니다</span>}
                    </h2>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={runAiAnalysis}
                        disabled={isAiProcessing || submissions.length === 0}
                        className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white text-sm font-bold rounded-xl transition shadow-lg"
                    >
                        {isAiProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : '🤖 AI 전체 분석 시작'}
                    </button>
                    {currentAiTitle && (
                        <Link
                            href={`/admin/homework-review/summary?courseId=${selectedCourseId}&week=${selectedWeek}`}
                            target="_blank"
                            className="flex items-center gap-1.5 px-4 py-2 bg-white text-indigo-950 hover:bg-indigo-50 text-sm font-black rounded-xl transition shadow-lg"
                        >
                            🖨️ 종합 정리 PDF 출력
                        </Link>
                    )}
                </div>
            </div>

            {/* 마감 상태 배너 (현재 주차) */}
            {deadlines[String(selectedWeek)] ? (
                /* 🔴 마감 중 — 버튼 없음, 텍스트만 */
                <div className="flex items-center gap-3 px-5 py-2.5 bg-red-950/60 border-b border-red-800/60">
                    <Lock className="w-4 h-4 text-red-400 shrink-0" />
                    <span className="text-sm font-bold text-red-300">{selectedWeek}주차 과제</span>
                    <span className="px-2.5 py-0.5 rounded-full bg-red-800/60 text-red-200 text-xs font-black tracking-wide">
                        🔒 마감됨
                    </span>
                    <span className="text-xs text-red-500 ml-1">— 학생 제출 불가</span>
                </div>
            ) : (
                /* 🟢 제출 가능 — 토글 스위치로 마감 */
                <div className="flex items-center gap-3 px-5 py-2.5 bg-emerald-950/40 border-b border-emerald-900/40">
                    <LockOpen className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="text-sm font-bold text-emerald-400">{selectedWeek}주차 과제</span>
                    <button
                        onClick={toggleDeadline}
                        disabled={deadlineToggling}
                        className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-800/50 hover:bg-red-900/60 text-emerald-200 hover:text-red-200 text-xs font-black transition group disabled:opacity-50"
                        title="클릭하면 마감됩니다"
                    >
                        {deadlineToggling
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <LockOpen className="w-3 h-3 group-hover:hidden" />}
                        <span className="group-hover:hidden">제출 가능함</span>
                        {!deadlineToggling && <Lock className="w-3 h-3 hidden group-hover:block" />}
                        <span className="hidden group-hover:block">마감하기</span>
                    </button>
                    <span className="text-xs text-emerald-600 ml-1">— 학생 제출 가능</span>
                </div>
            )}

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
                            {dragSubmission && <span className="ml-1 text-amber-400">· 드래그 중</span>}
                        </div>
                        <ul className="flex-1">
                            {submissions.map((s, i) => {
                                const isAssign = s.id.startsWith('assign_')
                                const rawId = isAssign ? s.id.replace('assign_', '') : s.id
                                return (
                                    <li key={s.id}>
                                        <button
                                            draggable
                                            onDragStart={(e) => {
                                                const data = { id: rawId, type: (isAssign ? 'assign' : 'board') as 'board' | 'assign' }
                                                // DataTransfer API — 가장 안정적인 드래그 데이터 전달
                                                e.dataTransfer.setData('text/plain', JSON.stringify(data))
                                                e.dataTransfer.effectAllowed = 'move'
                                                dragSubmissionRef.current = data
                                                setDragSubmission(data)
                                            }}
                                            onDragEnd={() => {
                                                dragSubmissionRef.current = null
                                                setDragSubmission(null)
                                                setDragOverWeek(null)
                                            }}
                                            onClick={() => { setSelectedIdx(i); setSelectedAttIdx(0) }}
                                            className={`w-full flex items-center gap-2 px-3 py-3 text-left transition select-none ${selectedIdx === i
                                                ? 'bg-indigo-600 text-white'
                                                : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'} ${dragSubmission?.id === rawId ? 'opacity-50' : ''}`}
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
                                )
                            })}
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
                                        <YouTubeEmbeds text={selected.content} />
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
                                            <FilePreview att={selected.attachments![selectedAttIdx]} submission={selected} />
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
