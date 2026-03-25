'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Radio, X, User } from 'lucide-react'
import { LIVE_CHANNEL_PREFIX } from '@/app/components/AssignmentPresenter'
import { getDrivePreviewUrl } from '@/app/components/FilePreview'

type PresentState = {
    fileUrl: string
    fileName: string
    fileType: string | null
    studentName: string
    cat: string
    slideIndex: number
}

export default function AssignmentLiveViewer({
    courseId,
}: {
    courseId: string
}) {
    const supabase = createClient()
    const [live, setLive] = useState<PresentState | null>(null)
    const [isOpen, setIsOpen] = useState(false)
    const [hasUnread, setHasUnread] = useState(false)
    const videoRef = useRef<HTMLVideoElement>(null)
    const contentRef = useRef<HTMLDivElement>(null)
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const isActionRef = useRef(false) // prevent re-trigger on programmatic play/pause

    useEffect(() => {
        if (!courseId) return

        const ch = supabase.channel(`${LIVE_CHANNEL_PREFIX}${courseId}`)

        ch.on('broadcast', { event: 'PRES_START' }, ({ payload }) => {
            setLive(payload as PresentState)
            setHasUnread(true)
        })

        ch.on('broadcast', { event: 'PRES_SYNC' }, ({ payload }) => {
            setLive(prev => prev ?? (payload as PresentState))
        })

        ch.on('broadcast', { event: 'PRES_STOP' }, () => {
            setLive(null)
            setIsOpen(false)
            setHasUnread(false)
        })

        ch.on('broadcast', { event: 'PRES_SCROLL' }, ({ payload }) => {
            const el = contentRef.current
            if (!el) return
            const { scrollPct } = payload as { scrollPct: number }
            el.scrollTop = scrollPct * (el.scrollHeight - el.clientHeight)
        })

        ch.on('broadcast', { event: 'PRES_VIDEO' }, ({ payload }) => {
            const vid = videoRef.current
            if (!vid) return
            const { action, currentTime } = payload as { action: string; currentTime: number }
            isActionRef.current = true
            if (Math.abs(vid.currentTime - currentTime) > 1) vid.currentTime = currentTime
            if (action === 'play') vid.play().catch(() => {})
            else if (action === 'pause') vid.pause()
            else if (action === 'seek') vid.currentTime = currentTime
            setTimeout(() => { isActionRef.current = false }, 300)
        })

        ch.on('broadcast', { event: 'PRES_SLIDE' }, ({ payload }) => {
            const { page } = payload as { page: number }
            setLive(prev => prev ? { ...prev, slideIndex: page } : prev)
            if (iframeRef.current) {
                const base = getDrivePreviewUrl(iframeRef.current.src.split('?')[0]) || iframeRef.current.src.split('?')[0]
                const url = base + (base.includes('?') ? '&' : '?') + `rm=minimal&page=${page}`
                iframeRef.current.src = url
            }
        })

        ch.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                // Ask presenter to re-sync state in case they're already presenting
                ch.send({ type: 'broadcast', event: 'REQUEST_SYNC', payload: {} })
            }
        })

        return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [courseId])

    if (!live) return null

    const { fileUrl, fileName, studentName, cat, slideIndex } = live
    const previewUrl = getDrivePreviewUrl(fileUrl)
    const isPptPdf = cat === 'pdf' || cat === 'pptx' || cat === 'docx'
    const isVideo = cat === 'video'
    const isImage = cat === 'image'
    const isAudio = cat === 'audio'
    const isYoutube = cat === 'youtube'

    const getSlideUrl = (page: number) => {
        if (!previewUrl) return fileUrl
        const base = previewUrl.split('#')[0].split('?page=')[0]
        return base + (base.includes('?') ? '&' : '?') + `rm=minimal&page=${page}`
    }

    const driveId = (fileUrl.match(/\/file\/d\/([^/]+)\//) || fileUrl.match(/[?&]id=([^&]+)/))?.[1]
    const imgSrc = driveId ? `https://drive.google.com/uc?export=view&id=${driveId}` : fileUrl

    return (
        <>
            {/* ── Floating Banner (when modal is closed) ──────── */}
            {!isOpen && (
                <div className="fixed bottom-6 right-6 z-40 animate-in slide-in-from-bottom-5 fade-in duration-300">
                    <button
                        onClick={() => { setIsOpen(true); setHasUnread(false) }}
                        className="group relative flex items-center gap-3 bg-neutral-900 border border-neutral-700 p-3 pr-5 rounded-full shadow-2xl hover:bg-neutral-800 transition-all hover:scale-105"
                    >
                        <div className="relative flex items-center justify-center w-10 h-10 rounded-full bg-rose-500/10 text-rose-500">
                            <Radio className="w-5 h-5 animate-pulse" />
                            {hasUnread && (
                                <span className="absolute top-0 right-0 w-3 h-3 bg-rose-500 border-2 border-neutral-900 rounded-full" />
                            )}
                        </div>
                        <div className="flex flex-col text-left">
                            <span className="text-sm font-bold text-white flex items-center gap-2">
                                학생 라이브 발표 중
                                <span className="flex h-2 w-2 relative">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
                                </span>
                            </span>
                            <span className="text-[10px] text-neutral-400 font-medium">{studentName} · 클릭하여 화면 보기</span>
                        </div>
                    </button>
                </div>
            )}

            {/* ── Full-screen Viewer Modal ─────────────────────── */}
            {isOpen && (
                <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950/95 backdrop-blur-xl animate-in fade-in duration-200">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 bg-neutral-900/80 border-b border-neutral-800 shrink-0 flex-wrap gap-4">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500">
                                <Radio className="w-5 h-5 animate-pulse" />
                            </div>
                            <div>
                                <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                                    학생 라이브 발표
                                    <span className="text-xs bg-rose-500 text-white px-2 py-0.5 rounded-md font-bold uppercase tracking-widest">LIVE</span>
                                </h2>
                                <p className="text-xs text-neutral-400 font-medium mt-0.5 flex items-center gap-1.5">
                                    <User className="w-3.5 h-3.5" /> {studentName} 학생 발표 중
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-2 rounded-xl bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white transition"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Slide info for PPT/PDF */}
                    {isPptPdf && (
                        <div className="px-6 py-2 bg-rose-950/30 border-b border-rose-900/30 text-[11px] text-rose-300 font-medium flex items-center gap-2 shrink-0">
                            <Radio className="w-3 h-3 animate-pulse" />
                            슬라이드 {slideIndex}페이지 · 발표자가 페이지를 넘기면 자동으로 업데이트됩니다.
                        </div>
                    )}

                    {/* Content */}
                    <div ref={contentRef} className="flex-1 overflow-auto p-4 md:p-8 flex items-center justify-center">
                        <div className="w-full max-w-5xl mx-auto">

                            {/* PDF / PPT / DOCX */}
                            {isPptPdf && previewUrl && (
                                <div className="rounded-2xl overflow-hidden border border-neutral-700 bg-white shadow-2xl" style={{ height: '72vh' }}>
                                    <iframe
                                        ref={iframeRef}
                                        src={getSlideUrl(slideIndex)}
                                        className="w-full h-full"
                                        allow="autoplay"
                                        title={fileName}
                                    />
                                </div>
                            )}

                            {/* Video */}
                            {isVideo && (
                                <div className="rounded-2xl overflow-hidden border border-neutral-700 bg-black shadow-2xl">
                                    <video
                                        ref={videoRef}
                                        src={fileUrl}
                                        controls
                                        className="w-full max-h-[72vh]"
                                    />
                                </div>
                            )}

                            {/* YouTube */}
                            {isYoutube && (() => {
                                const videoId = fileUrl.split('v=')[1]?.split('&')[0] || fileUrl.split('/').pop()
                                return (
                                    <div className="rounded-2xl overflow-hidden border border-neutral-700 bg-black aspect-video w-full">
                                        <iframe
                                            src={`https://www.youtube.com/embed/${videoId}`}
                                            className="w-full h-full"
                                            allowFullScreen
                                            title="YouTube"
                                        />
                                    </div>
                                )
                            })()}

                            {/* Image */}
                            {isImage && (
                                <div className="rounded-2xl overflow-hidden border border-neutral-700 flex items-center justify-center bg-neutral-900 p-4">
                                    <img
                                        src={imgSrc}
                                        alt={fileName}
                                        className="max-w-full max-h-[72vh] object-contain rounded-xl"
                                    />
                                </div>
                            )}

                            {/* Audio */}
                            {isAudio && (
                                <div className="rounded-2xl border border-neutral-700 bg-neutral-900 p-10 flex flex-col items-center gap-6">
                                    <div className="w-24 h-24 rounded-3xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
                                        <Radio className="w-12 h-12 animate-pulse" />
                                    </div>
                                    <p className="font-bold text-white text-lg text-center">{fileName}</p>
                                    <audio
                                        ref={videoRef as React.RefObject<HTMLAudioElement>}
                                        src={fileUrl}
                                        controls
                                        className="w-full max-w-lg"
                                    />
                                </div>
                            )}

                            {/* Fallback */}
                            {!isPptPdf && !isVideo && !isImage && !isAudio && !isYoutube && (
                                <div className="rounded-2xl border border-neutral-700 bg-neutral-900 p-10 flex flex-col items-center gap-6 text-center">
                                    <p className="text-neutral-300 font-bold text-lg">{fileName}</p>
                                    <a
                                        href={fileUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="px-6 py-3 rounded-xl bg-rose-600 text-white font-bold text-sm hover:bg-rose-700 transition"
                                    >
                                        파일 열기
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
