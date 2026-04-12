'use client'

import React, { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Star, Loader2, CheckCircle2 } from 'lucide-react'

// Course ID typically needs to be selected if a user is in multiple courses, 
// for now we'll assume the user is rating for the course they are in.
// Alternatively, we use context or fetch their enrolled course.

export default function PeerEvalPage() {
    const params = useParams()
    const [peers, setPeers] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [courseId, setCourseId] = useState<string | null>(null)

    // First fetch user's courses
    useEffect(() => {
        const init = async () => {
            try {
                const res = await fetch(`/api/profile`) // Assuming we can get user's profile which has course_ids
                const d = await res.json()
                const cId = d.user?.course_ids?.[0] || d.user?.course_id
                if (cId) {
                    setCourseId(cId)
                    fetchPeers(cId)
                } else {
                    setLoading(false)
                }
            } catch (err) {
                console.error(err)
                setLoading(false)
            }
        }
        init()
    }, [])

    const fetchPeers = async (cId: string) => {
        try {
            const res = await fetch(`/api/student/peer-eval-list?courseId=${cId}`)
            if (res.ok) {
                const d = await res.json()
                setPeers(d.peers || [])
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const handleRating = async (revieweeId: string, score: number, comment: string) => {
        if (!courseId) return

        try {
            // Optimistic update
            setPeers(prev => prev.map(p => p.id === revieweeId ? { ...p, score, _saving: true } : p))
            
            const res = await fetch('/api/student/peer-eval-list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ courseId, revieweeId, score, comment })
            })

            if (!res.ok) throw new Error('Failed to save')
            
            setPeers(prev => prev.map(p => p.id === revieweeId ? { ...p, _saving: false, _saved: true } : p))
            setTimeout(() => {
                setPeers(prev => prev.map(p => p.id === revieweeId ? { ...p, _saved: false } : p))
            }, 2000)
        } catch (err) {
            console.error(err)
            alert('저장에 실패했습니다. 다시 시도해주세요.')
            setPeers(prev => prev.map(p => p.id === revieweeId ? { ...p, _saving: false } : p))
        }
    }

    if (loading) {
        return <div className="p-10 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-neutral-400" /></div>
    }

    if (!courseId) {
        return <div className="p-10 text-center text-red-500">수강 중인 과목을 찾을 수 없습니다.</div>
    }

    return (
        <div className="max-w-4xl mx-auto py-10 px-6">
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-2">기말 상호평가</h1>
            <p className="text-neutral-500 dark:text-neutral-400 mb-10">
                함께 수업을 들은 학우들에게 평소 기여도 및 최종 결과물에 대한 별점을 부여해주세요.<br/>
                평가 결과는 관리자(교수자)에게만 공개되며 성적 산출 기초 자료로 활용됩니다.
            </p>

            <div className="space-y-6">
                {peers.length === 0 ? (
                    <div className="text-center py-10 bg-neutral-50 dark:bg-neutral-800/50 rounded-2xl border border-neutral-200 dark:border-neutral-700">
                        <p className="text-neutral-500">평가할 대상 수강생이 없습니다.</p>
                    </div>
                ) : null}

                {peers.map(peer => (
                    <PeerCard 
                        key={peer.id} 
                        peer={peer} 
                        onSave={(score, comment) => handleRating(peer.id, score, comment)} 
                    />
                ))}
            </div>
        </div>
    )
}

function PeerCard({ peer, onSave }: { peer: any, onSave: (score: number, comment: string) => void }) {
    const [score, setScore] = useState(peer.score || 0)
    const [comment, setComment] = useState(peer.comment || '')
    const [hoverScore, setHoverScore] = useState(0)

    const handleSave = () => {
        if (score === 0) {
            alert('별점을 1점 이상 선택해주세요.')
            return
        }
        onSave(score, comment)
    }

    return (
        <div className="bg-white dark:bg-neutral-800 rounded-3xl p-6 shadow-sm border border-neutral-200 dark:border-neutral-700 flex flex-col md:flex-row gap-6 items-start md:items-center">
            
            <div className="w-full md:w-1/3 flex flex-col">
                <div className="text-sm font-semibold text-neutral-400 mb-1">학우 이름</div>
                <div className="text-xl font-bold text-neutral-800 dark:text-neutral-200">{peer.name || '이름 없음'}</div>
                {peer.email && <div className="text-xs text-neutral-500 mt-0.5">{peer.email}</div>}
            </div>

            <div className="w-full md:w-2/3 flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                    <div className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                        별점 선택 (1~5점)
                    </div>
                    <div className="flex items-center gap-2">
                        {[1, 2, 3, 4, 5].map(star => (
                            <button
                                key={star}
                                onMouseEnter={() => setHoverScore(star)}
                                onMouseLeave={() => setHoverScore(0)}
                                onClick={() => setScore(star)}
                                className={`transition-all ${star <= (hoverScore || score) ? 'scale-110 text-yellow-500 fill-yellow-500 drop-shadow-sm' : 'text-neutral-300 dark:text-neutral-600'}`}
                            >
                                <Star className={`w-8 h-8 ${star <= (hoverScore || score) ? 'fill-yellow-500' : ''}`} />
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex flex-col gap-2 w-full">
                    <input 
                        type="text" 
                        placeholder="짧은 코멘트나 평가 사유를 남겨주세요 (선택사항)"
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                        className="w-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl px-4 py-3 text-sm text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
                    />
                </div>

                <div className="flex justify-end pt-1">
                    <button
                        onClick={handleSave}
                        disabled={peer._saving}
                        className={`flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-bold transition-all
                            ${peer._saving || score === 0 
                                ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed' 
                                : 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:scale-[1.02] active:scale-95 shadow-md'
                            }`}
                    >
                        {peer._saving ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> 저장 중...</>
                        ) : peer._saved ? (
                            <><CheckCircle2 className="w-4 h-4 text-green-500" /> 제출 완료</>
                        ) : (
                             '평가 제출'
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
