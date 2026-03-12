'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Save, UserCheck } from 'lucide-react'

export default function AudioTechParticipationClient({
    courseId,
    initialScore
}: {
    courseId: string,
    initialScore: number
}) {
    const router = useRouter()
    const [score, setScore] = useState<string>(initialScore.toString())
    const [saving, setSaving] = useState(false)

    const handleSave = async () => {
        const numScore = parseInt(score, 10)
        
        if (isNaN(numScore) || numScore < 0 || numScore > 20) {
            alert('참여도 점수는 0에서 20 사이의 정수여야 합니다.')
            return
        }

        setSaving(true)
        try {
            const res = await fetch('/api/audio-tech/participation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    course_id: courseId,
                    score: numScore
                })
            })
            if (!res.ok) throw new Error('저장 실패')
            alert('참여도 점수가 저장되었습니다.')
            router.refresh()
        } catch (e: any) {
            alert(e.message)
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="mt-6 border-t border-neutral-200 dark:border-neutral-800 pt-6">
            <h3 className="text-sm font-bold text-neutral-800 dark:text-neutral-200 mb-4 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-emerald-500" /> 참여도 점수 자가 입력 (0~20점)
            </h3>
            
            <div className="flex items-center gap-3 bg-neutral-50 dark:bg-neutral-950 p-4 rounded-xl border border-neutral-100 dark:border-neutral-800">
                <input 
                    type="number"
                    min="0"
                    max="20"
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    className="w-20 p-2 text-center text-lg font-black border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <span className="text-sm font-bold text-neutral-500 dark:text-neutral-400">/ 20 점</span>
                
                <div className="flex-1 text-right">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 transition disabled:opacity-50 shadow-sm"
                    >
                        <Save className="w-4 h-4" /> {saving ? '저장 중...' : '저장'}
                    </button>
                </div>
            </div>
            <p className="text-xs text-neutral-500 mt-2 font-medium break-keep">
                * 수업 참여 정도(발표, 질문, 리액션 등)를 스스로 판단하여 20점 만점 기준으로 입력하세요.
            </p>
        </div>
    )
}
