'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import FilePreview, { type Attachment } from '@/app/components/FilePreview'
import { Radio, X, User } from 'lucide-react'

type LivePayload = {
    att: Attachment
    content: string
    studentName: string
}

export default function AudioTechLiveViewer({ courseId }: { courseId: string }) {
    const supabase = createClient()
    const [liveData, setLiveData] = useState<LivePayload | null>(null)
    const [isOpen, setIsOpen] = useState(false) // Whether the modal is fully open
    const [hasUnread, setHasUnread] = useState(false)

    useEffect(() => {
        if (!courseId) return

        const ch = supabase.channel(`audiotech-live-${courseId}`)

        ch.on('broadcast', { event: 'SYNC_LIVE_VIEW' }, ({ payload }) => {
            setLiveData(payload as LivePayload)
            setHasUnread(true)
        })

        ch.on('broadcast', { event: 'STOP_LIVE_VIEW' }, () => {
            setLiveData(null)
            setIsOpen(false)
            setHasUnread(false)
        })

        ch.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                // Request current state in case admin is already broadcasting
                ch.send({
                    type: 'broadcast',
                    event: 'REQUEST_SYNC',
                    payload: {}
                })
            }
        })

        // Cleanup channel on unmount

        return () => {
            supabase.removeChannel(ch)
        }
    }, [courseId, supabase])

    // If completely stopped, render nothing
    if (!liveData) return null

    return (
        <>
            {/* Floating Banner if not open but live */}
            {!isOpen && (
                <div className="fixed bottom-6 right-6 z-40 animate-in slide-in-from-bottom-5 fade-in duration-300">
                    <button
                        onClick={() => {
                            setIsOpen(true)
                            setHasUnread(false)
                        }}
                        className="group relative flex items-center gap-3 bg-neutral-900 border border-neutral-700 p-3 pr-5 rounded-full shadow-2xl hover:bg-neutral-800 transition-all hover:scale-105"
                    >
                        <div className="relative flex items-center justify-center w-10 h-10 rounded-full bg-red-500/10 text-red-500">
                            <Radio className="w-5 h-5 animate-pulse" />
                            {hasUnread && (
                                <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 border-2 border-neutral-900 rounded-full"></span>
                            )}
                        </div>
                        <div className="flex flex-col text-left">
                            <span className="text-sm font-bold text-white flex items-center gap-2">
                                교수님 라이브 뷰 진행 중
                                <span className="flex h-2 w-2 relative">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                </span>
                            </span>
                            <span className="text-[10px] text-neutral-400 font-medium">클릭하여 화면 보기</span>
                        </div>
                    </button>
                </div>
            )}

            {/* Fullscreen Read-only Modal */}
            {isOpen && (
                <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950/95 backdrop-blur-xl animate-in fade-in duration-200">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 bg-neutral-900/80 border-b border-neutral-800">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-red-500/10 text-red-500">
                                <Radio className="w-5 h-5 animate-pulse" />
                            </div>
                            <div>
                                <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                                    라이브 리뷰
                                    <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-md font-bold uppercase tracking-widest">Live</span>
                                </h2>
                                <p className="text-xs text-neutral-400 font-medium mt-0.5 flex items-center gap-1.5">
                                    <User className="w-3.5 h-3.5" /> {liveData.studentName} 학생의 제출물
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

                    {/* Content area */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-8 flex items-center justify-center">
                        <div className="w-full max-w-5xl mx-auto flex flex-col gap-6">
                            
                            {/* The specific file being broadcast */}
                            <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-2 shadow-2xl relative">
                                {/* Disabled overlay to prevent student interaction if desired, but media controls are okay */}
                                {/* <div className="absolute inset-0 z-10"></div> */}
                                <FilePreview att={liveData.att} />
                            </div>

                            {/* Accompanying text content */}
                            {liveData.content && (
                                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-sm">
                                    <h3 className="text-xs font-black text-rose-400 uppercase tracking-widest mb-3">본문 내용</h3>
                                    <p className="text-sm text-neutral-300 whitespace-pre-wrap leading-relaxed select-text">
                                        {liveData.content}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
