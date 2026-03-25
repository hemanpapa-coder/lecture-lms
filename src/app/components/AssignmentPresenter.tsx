'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import { RealtimeChannel } from '@supabase/supabase-js'
import { X, Radio, ChevronLeft, ChevronRight, Users, MonitorPlay, StopCircle } from 'lucide-react'
import { guessCategory, getDrivePreviewUrl } from '@/app/components/FilePreview'

export type PresentFile = {
    id: string
    file_url: string
    file_name: string
    file_type: string | null
}

interface Props {
    courseId: string
    studentName: string
    file: PresentFile
    onClose: () => void
}

export const LIVE_CHANNEL_PREFIX = 'assignment-live-'

export default function AssignmentPresenter({ courseId, studentName, file, onClose }: Props) {
    const supabase = createClient()
    const channelRef = useRef<RealtimeChannel | null>(null)
    const videoRef = useRef<HTMLVideoElement>(null)
    const contentRef = useRef<HTMLDivElement>(null)
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const scrollThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [viewerCount, setViewerCount] = useState(0)
    const [slideIndex, setSlideIndex] = useState(1)
    const isLiveRef = useRef(false)

    const cat = guessCategory(file.file_type, file.file_name)
    const previewUrl = getDrivePreviewUrl(file.file_url)

    // Get iframe page URL for PPT/PDF (Google Drive supports &rm=minimal for cleaner embed)
    const getSlideUrl = (page: number) => {
        if (!previewUrl) return file.file_url
        const base = previewUrl.split('#')[0].split('?page=')[0]
        return base + (base.includes('?') ? '&' : '?') + `rm=minimal&page=${page}`
    }

    const send = useCallback((event: string, payload: Record<string, unknown>) => {
        channelRef.current?.send({ type: 'broadcast', event, payload })
    }, [])

    // Build full PRES_START payload for SYNC responses
    const buildSyncPayload = useCallback(() => ({
        fileUrl: file.file_url,
        fileName: file.file_name,
        fileType: file.file_type,
        studentName,
        courseId,
        cat,
        slideIndex,
    }), [file, studentName, courseId, cat, slideIndex])

    const syncPayloadRef = useRef(buildSyncPayload())
    useEffect(() => { syncPayloadRef.current = buildSyncPayload() }, [buildSyncPayload])

    // Connect to channel
    useEffect(() => {
        const ch = supabase.channel(`${LIVE_CHANNEL_PREFIX}${courseId}`, {
            config: { presence: { key: studentName } }
        })

        // Track viewer presence
        ch.on('presence', { event: 'sync' }, () => {
            const state = ch.presenceState()
            setViewerCount(Object.keys(state).length)
        })

        // Respond to new viewers requesting sync
        ch.on('broadcast', { event: 'REQUEST_SYNC' }, () => {
            if (isLiveRef.current) {
                ch.send({ type: 'broadcast', event: 'PRES_SYNC', payload: syncPayloadRef.current })
            }
        })

        ch.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await ch.track({ name: studentName, role: 'presenter' })
                isLiveRef.current = true
                ch.send({ type: 'broadcast', event: 'PRES_START', payload: syncPayloadRef.current })
            }
        })

        channelRef.current = ch

        return () => {
            isLiveRef.current = false
            ch.send({ type: 'broadcast', event: 'PRES_STOP', payload: {} })
            supabase.removeChannel(ch)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [courseId])

    // Scroll sync (image / generic content)
    useEffect(() => {
        const el = contentRef.current
        if (!el) return

        const onScroll = () => {
            if (scrollThrottleRef.current) return
            scrollThrottleRef.current = setTimeout(() => {
                scrollThrottleRef.current = null
                const pct = el.scrollHeight > el.clientHeight
                    ? el.scrollTop / (el.scrollHeight - el.clientHeight)
                    : 0
                send('PRES_SCROLL', { scrollPct: Math.max(0, Math.min(1, pct)) })
            }, 80)
        }
        el.addEventListener('scroll', onScroll, { passive: true })
        return () => el.removeEventListener('scroll', onScroll)
    }, [send])

    // Video sync
    useEffect(() => {
        const vid = videoRef.current
        if (!vid) return

        const onPlay = () => send('PRES_VIDEO', { action: 'play', currentTime: vid.currentTime })
        const onPause = () => send('PRES_VIDEO', { action: 'pause', currentTime: vid.currentTime })
        const onSeeked = () => send('PRES_VIDEO', { action: 'seek', currentTime: vid.currentTime })

        vid.addEventListener('play', onPlay)
        vid.addEventListener('pause', onPause)
        vid.addEventListener('seeked', onSeeked)

        return () => {
            vid.removeEventListener('play', onPlay)
            vid.removeEventListener('pause', onPause)
            vid.removeEventListener('seeked', onSeeked)
        }
    }, [send])

    // Slide navigation for PPT/PDF
    const goSlide = (delta: number) => {
        const next = Math.max(1, slideIndex + delta)
        setSlideIndex(next)
        send('PRES_SLIDE', { page: next })
        // Re-load iframe with new page
        if (iframeRef.current) {
            iframeRef.current.src = getSlideUrl(next)
        }
    }

    const handleClose = () => {
        isLiveRef.current = false
        send('PRES_STOP', {})
        onClose()
    }

    const isPptPdf = cat === 'pdf' || cat === 'pptx' || cat === 'docx'
    const isVideo = cat === 'video'
    const isImage = cat === 'image'
    const isAudio = cat === 'audio'

    return (
        <div className="fixed inset-0 z-[100] flex flex-col bg-neutral-950/98 backdrop-blur-xl">
            {/* ── Header ─────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-5 py-3 bg-neutral-900/90 border-b border-neutral-800 shrink-0 gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-rose-500/15 text-rose-400">
                        <MonitorPlay className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-sm font-extrabold text-white flex items-center gap-2">
                            라이브 발표 진행 중
                            <span className="flex h-2 w-2 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
                            </span>
                        </p>
                        <p className="text-[11px] text-neutral-400 truncate max-w-[260px]">{file.file_name}</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Viewer count */}
                    <div className="flex items-center gap-1.5 bg-neutral-800 px-3 py-1.5 rounded-xl border border-neutral-700">
                        <Users className="w-3.5 h-3.5 text-neutral-400" />
                        <span className="text-xs font-bold text-neutral-300">{viewerCount}명 시청 중</span>
                    </div>

                    {/* PPT/PDF slide controls */}
                    {isPptPdf && (
                        <div className="flex items-center gap-1 bg-neutral-800 px-2 py-1.5 rounded-xl border border-neutral-700">
                            <button
                                onClick={() => goSlide(-1)}
                                disabled={slideIndex <= 1}
                                className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-700 disabled:opacity-30 transition"
                                title="이전 슬라이드"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="text-xs font-bold text-neutral-300 px-2 min-w-[32px] text-center">
                                {slideIndex}
                            </span>
                            <button
                                onClick={() => goSlide(1)}
                                className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-700 transition"
                                title="다음 슬라이드"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {/* Stop */}
                    <button
                        onClick={handleClose}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold transition shadow-lg shadow-rose-500/20"
                    >
                        <StopCircle className="w-4 h-4" />
                        발표 종료
                    </button>
                    <button
                        onClick={handleClose}
                        className="p-2 rounded-xl bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white transition"
                        title="닫기"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* ── Tip bar ────────────────────────────────────────── */}
            <div className="px-5 py-2 bg-rose-950/40 border-b border-rose-900/40 text-[11px] text-rose-300 font-medium flex items-center gap-2 shrink-0">
                <Radio className="w-3 h-3 animate-pulse" />
                {isPptPdf
                    ? '슬라이드 좌우 버튼을 눌러 발표를 진행하세요. 시청자 화면이 자동 동기화됩니다.'
                    : isVideo
                    ? '재생 / 일시정지 / 구간 이동이 시청자 화면과 실시간 동기화됩니다.'
                    : '현재 화면이 수강생 전원에게 라이브로 중계됩니다.'}
            </div>

            {/* ── Content ────────────────────────────────────────── */}
            <div ref={contentRef} className="flex-1 overflow-auto flex items-center justify-center p-4 md:p-8">
                <div className="w-full max-w-5xl mx-auto">
                    {/* PDF / PPT / DOCX ─ iframe */}
                    {isPptPdf && previewUrl && (
                        <div className="rounded-2xl overflow-hidden border border-neutral-700 bg-white shadow-2xl" style={{ height: '72vh' }}>
                            <iframe
                                ref={iframeRef}
                                src={getSlideUrl(slideIndex)}
                                className="w-full h-full"
                                allow="autoplay"
                                title={file.file_name}
                            />
                        </div>
                    )}

                    {/* Video */}
                    {cat === 'video' && (
                        <div className="rounded-2xl overflow-hidden border border-neutral-700 bg-black shadow-2xl">
                            <video
                                ref={videoRef}
                                src={file.file_url}
                                controls
                                className="w-full max-h-[72vh]"
                            />
                        </div>
                    )}

                    {/* YouTube */}
                    {cat === 'youtube' && (() => {
                        const videoId = file.file_url.split('v=')[1]?.split('&')[0] || file.file_url.split('/').pop()
                        return (
                            <div className="rounded-2xl overflow-hidden border border-neutral-700 bg-black aspect-video w-full">
                                <iframe
                                    src={`https://www.youtube.com/embed/${videoId}?enablejsapi=1`}
                                    className="w-full h-full"
                                    allowFullScreen
                                    title="YouTube"
                                />
                            </div>
                        )
                    })()}

                    {/* Image */}
                    {isImage && (() => {
                        const driveId = (file.file_url.match(/\/file\/d\/([^/]+)\//) || file.file_url.match(/[?&]id=([^&]+)/))?.[1]
                        const src = driveId ? `https://drive.google.com/uc?export=view&id=${driveId}` : file.file_url
                        return (
                            <div className="rounded-2xl overflow-hidden border border-neutral-700 flex items-center justify-center bg-neutral-900 p-4">
                                <img
                                    src={src}
                                    alt={file.file_name}
                                    className="max-w-full max-h-[72vh] object-contain rounded-xl"
                                />
                            </div>
                        )
                    })()}

                    {/* Audio */}
                    {isAudio && (
                        <div className="rounded-2xl border border-neutral-700 bg-neutral-900 p-10 flex flex-col items-center gap-6">
                            <div className="w-24 h-24 rounded-3xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
                                <Radio className="w-12 h-12 animate-pulse" />
                            </div>
                            <p className="font-bold text-white text-lg text-center">{file.file_name}</p>
                            <audio
                                ref={videoRef as React.RefObject<HTMLAudioElement>}
                                src={file.file_url}
                                controls
                                className="w-full max-w-lg"
                            />
                        </div>
                    )}

                    {/* Fallback */}
                    {!isPptPdf && !isVideo && !isImage && !isAudio && (
                        <div className="rounded-2xl border border-neutral-700 bg-neutral-900 p-10 flex flex-col items-center gap-6 text-center">
                            <p className="text-neutral-300 font-bold text-lg">{file.file_name}</p>
                            <a
                                href={file.file_url}
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
    )
}
