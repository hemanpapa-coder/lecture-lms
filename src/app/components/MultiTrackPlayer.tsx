'use client'
import { useState, useEffect, useRef } from 'react'
import WaveSurfer from 'wavesurfer.js'
import { Play, Pause, Loader2, Volume2, VolumeX, Mic2 } from 'lucide-react'

export type AudioTrack = {
    id: string
    url: string
    fileName: string
}

export default function MultiTrackPlayer({ 
    tracks, 
    submissionId, 
    submissionType, 
    initialFeedback 
}: { 
    tracks: AudioTrack[], 
    submissionId?: string, 
    submissionType?: string, 
    initialFeedback?: string | null 
}) {
    const [isReady, setIsReady] = useState(false)
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)

    const [trackStates, setTrackStates] = useState<Record<string, { volume: number, muted: boolean, solo: boolean }>>({})
    const [loadingCount, setLoadingCount] = useState(tracks.length)

    const wavesurfers = useRef<Record<string, WaveSurfer>>({})
    const containerRefs = useRef<Record<string, HTMLDivElement | null>>({})

    // AI Diagnosis State
    const [aiLoading, setAiLoading] = useState(false)
    const [aiDiagnosis, setAiDiagnosis] = useState<string | null>(initialFeedback || null)

    // Sync AI Diagnosis state when switching submissions
    useEffect(() => {
        setAiDiagnosis(initialFeedback || null)
        setAiLoading(false)
    }, [submissionId, initialFeedback])

    useEffect(() => {
        setTrackStates(
            tracks.reduce((acc, t) => ({ ...acc, [t.id]: { volume: 1, muted: false, solo: false } }), {})
        )
    }, [tracks])

    useEffect(() => {
        let isCancelled = false
        const wss: Record<string, WaveSurfer> = {}
        let readyCount = 0

        tracks.forEach(track => {
            const container = containerRefs.current[track.id]
            if (!container) return

            // Bypassing CORS with API route if necessary
            let audioSrc = track.url
            const driveIdMatch = track.url.match(/\/file\/d\/([^/]+)\//) || track.url.match(/[?&]id=([^&]+)/)
            if (driveIdMatch) {
                audioSrc = `/api/audio-stream?fileId=${driveIdMatch[1]}`
            }

            const ws = WaveSurfer.create({
                container,
                waveColor: '#6366f1',
                progressColor: '#4f46e5',
                cursorColor: '#c7d2fe',
                barWidth: 2,
                barGap: 2,
                barRadius: 2,
                height: 64,
                url: audioSrc,
                normalize: true,
                autoScroll: true,
            })

            ws.on('ready', () => {
                if (isCancelled) return
                readyCount++
                if (readyCount === tracks.length) {
                    setIsReady(true)
                    setDuration(ws.getDuration())
                }
                setLoadingCount(tracks.length - readyCount)
            })

            // Sync interactions
            ws.on('interaction', () => {
                if (isCancelled) return
                const time = ws.getCurrentTime()
                Object.values(wss).forEach(w => {
                    if (w !== ws) {
                        w.seekTo(time / w.getDuration())
                    }
                })
            })

            ws.on('audioprocess', () => {
                if (isCancelled) return
                // Choose the first track for time reporting
                if (track.id === tracks[0].id) {
                    setCurrentTime(ws.getCurrentTime())
                }
            })

            ws.on('finish', () => {
                if (isCancelled) return
                if (track.id === tracks[0].id) {
                    setIsPlaying(false)
                }
            })

            wss[track.id] = ws
        })

        wavesurfers.current = wss

        return () => {
            isCancelled = true
            Object.values(wss).forEach(ws => ws.destroy())
        }
    }, [tracks])

    // Update individual track audio properties
    useEffect(() => {
        const hasSolo = Object.values(trackStates).some(s => s.solo)

        tracks.forEach(track => {
            const ws = wavesurfers.current[track.id]
            const state = trackStates[track.id]
            if (!ws || !state) return

            let effectiveVolume = state.muted ? 0 : state.volume
            if (hasSolo && !state.solo) {
                effectiveVolume = 0
            }
            ws.setVolume(effectiveVolume)
        })
    }, [trackStates, tracks])

    const togglePlayPause = () => {
        const wss = Object.values(wavesurfers.current)
        if (isPlaying) {
            wss.forEach(ws => ws.pause())
            setIsPlaying(false)
        } else {
            wss.forEach(ws => ws.play())
            setIsPlaying(true)
        }
    }

    const setTrackState = (id: string, key: 'volume' | 'muted' | 'solo', value: any) => {
        setTrackStates(prev => ({
            ...prev,
            [id]: { ...prev[id], [key]: value }
        }))
    }

    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60)
        const s = Math.floor(secs % 60)
        return `${m}:${s < 10 ? '0' : ''}${s}`
    }

    const runAiDiagnosis = async (track: AudioTrack) => {
        if (!confirm('🤖 이 보컬 트랙의 성능을 점검하시겠습니까?\n(10~20초 소요)')) return
        setAiLoading(true)
        setAiDiagnosis(null)
        try {
            const res = await fetch('/api/analyze-vocal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    fileUrl: track.url, 
                    fileName: track.fileName,
                    submissionId,
                    submissionType 
                })
            })
            if (res.ok) {
                const data = await res.json()
                if (data.result) setAiDiagnosis(data.result)
                else alert('진단 결과를 가져오지 못했습니다.')
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

    return (
        <div className="bg-slate-900 rounded-3xl p-6 mb-6 shadow-xl border border-slate-700 font-sans text-white">
            {/* Master Header */}
            <div className="flex items-center justify-between mb-8 border-b border-slate-800 pb-5">
                <div className="flex items-center gap-4">
                    <button
                        onClick={togglePlayPause}
                        disabled={!isReady}
                        className="w-14 h-14 rounded-full bg-indigo-600 flex items-center justify-center hover:bg-indigo-500 hover:scale-105 transition shadow-[0_0_20px_rgba(79,70,229,0.4)] disabled:opacity-50 disabled:hover:scale-100"
                    >
                        {!isReady ? <Loader2 className="w-6 h-6 animate-spin text-white" /> : isPlaying ? <Pause className="w-6 h-6 ml-0 text-white" fill="currentColor" /> : <Play className="w-6 h-6 ml-1 text-white" fill="currentColor" />}
                    </button>
                    <div>
                        <h3 className="text-xl font-black text-white tracking-tight">Audio Workspace</h3>
                        <p className="text-slate-400 text-sm font-mono mt-0.5">
                            {isReady ? `${formatTime(currentTime)} / ${formatTime(duration)}` : `Loading tracks... (${loadingCount} remaining)`}
                        </p>
                    </div>
                </div>
            </div>

            {/* Sub-Tracks */}
            <div className="space-y-4">
                {tracks.map(track => {
                    const isVocal = track.fileName.toLowerCase().includes('vocal') || track.fileName.includes('보컬')
                    const tState = trackStates[track.id] || { muted: false, solo: false, volume: 1 }

                    return (
                        <div key={track.id} className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50 transition hover:bg-slate-800 transition-colors">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-indigo-400">
                                        <Mic2 className="w-4 h-4" />
                                    </div>
                                    <h4 className="font-bold text-slate-200 text-sm truncate max-w-[200px]">{track.fileName}</h4>
                                </div>

                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2 bg-slate-900 rounded-lg p-1 border border-slate-700">
                                        <button
                                            onClick={() => setTrackState(track.id, 'muted', !tState.muted)}
                                            className={`px-3 py-1 text-xs font-black rounded-md transition ${tState.muted ? 'bg-red-500/20 text-red-400 border border-red-500/50' : 'text-slate-400 hover:text-white border border-transparent'}`}
                                        >
                                            M
                                        </button>
                                        <button
                                            onClick={() => setTrackState(track.id, 'solo', !tState.solo)}
                                            className={`px-3 py-1 text-xs font-black rounded-md transition ${tState.solo ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50' : 'text-slate-400 hover:text-white border border-transparent'}`}
                                        >
                                            S
                                        </button>
                                    </div>
                                    
                                    <div className="flex items-center gap-2 w-24">
                                        {tState.muted || tState.volume === 0 ? <VolumeX className="w-4 h-4 text-slate-500" /> : <Volume2 className="w-4 h-4 text-indigo-400" />}
                                        <input 
                                            type="range" 
                                            min="0" max="1" step="0.05"
                                            value={tState.volume}
                                            onChange={(e) => setTrackState(track.id, 'volume', parseFloat(e.target.value))}
                                            className="w-full accent-indigo-500"
                                        />
                                    </div>

                                    {/* AI Diagnosis Button for Vocal Track */}
                                    {isVocal && (
                                        <button
                                            onClick={() => runAiDiagnosis(track)}
                                            disabled={aiLoading}
                                            className="flex items-center justify-center min-w-[32px] w-8 h-8 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg disabled:opacity-50 transition ml-2"
                                            title="AI 보컬 진단"
                                        >
                                            {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span className="text-sm">🤖</span>}
                                        </button>
                                    )}
                                </div>
                            </div>
                            
                            <div 
                                ref={el => { containerRefs.current[track.id] = el }} 
                                className="w-full cursor-pointer bg-slate-900/50 rounded-xl" 
                            />
                        </div>
                    )
                })}
            </div>

            {/* AI Diagnosis Report Wrapper */}
            {(aiLoading || aiDiagnosis) && (
                <div className="mt-8 bg-indigo-950/40 border border-indigo-500/40 rounded-2xl p-6 relative overflow-hidden backdrop-blur-sm">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500"></div>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-indigo-500/20 rounded-xl">
                            <span className="text-xl">🎙️</span>
                        </div>
                        <h4 className="font-black text-indigo-200 text-lg tracking-tight">보컬 트랙 음향 AI 진단 리포트</h4>
                    </div>
                    {aiLoading ? (
                        <div className="flex flex-col items-center justify-center py-10 gap-4 text-indigo-400">
                            <Loader2 className="w-10 h-10 animate-spin" />
                            <p className="text-sm font-bold tracking-tight">수석 AI 엔지니어가 트랙의 위상을 점검하고 있습니다...</p>
                        </div>
                    ) : (
                        <div className="text-[15px] text-indigo-100/90 leading-relaxed whitespace-pre-wrap font-medium">
                            {aiDiagnosis}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
