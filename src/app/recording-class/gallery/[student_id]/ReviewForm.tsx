'use client'

import { useState } from 'react'
import { Star, Send } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function ReviewForm({ courseId, revieweeId }: { courseId: string, revieweeId: string }) {
    const router = useRouter()
    const [compScore, setCompScore] = useState(0)
    const [qualScore, setQualScore] = useState(0)
    const [comment, setComment] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState('')

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')

        if (compScore === 0 || qualScore === 0) {
            setError('모든 항목의 별점을 선택해주세요.')
            return
        }
        if (comment.trim().length < 10) {
            setError('감상평을 최소 10자 이상 작성해주세요.')
            return
        }

        setIsSubmitting(true)
        try {
            const res = await fetch('/api/recording-class/gallery-review', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    course_id: courseId,
                    reviewee_id: revieweeId,
                    score_completeness: compScore,
                    score_quality: qualScore,
                    comment: comment.trim()
                })
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.error || '평가 제출에 실패했습니다.')

            alert('평가가 성공적으로 등록되었습니다!')
            router.refresh()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setIsSubmitting(false)
        }
    }

    const StarRating = ({ value, onChange, label }: { value: number, onChange: (v: number) => void, label: string }) => (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-4">
            <span className="text-sm font-bold text-slate-700 dark:text-slate-300 min-w-[120px]">{label}</span>
            <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                    <button
                        key={star}
                        type="button"
                        onClick={() => onChange(star)}
                        className={`p-1 transition-transform hover:scale-110 ${star <= value ? 'text-yellow-500' : 'text-slate-300 dark:text-slate-600'}`}
                    >
                        <Star className={`w-6 h-6 ${star <= value ? 'fill-yellow-500' : ''}`} />
                    </button>
                ))}
            </div>
            <span className="text-xs text-slate-500 font-medium ml-2">{value > 0 ? `${value}점` : '선택해주세요'}</span>
        </div>
    )

    return (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-700 shadow-sm">

            <div className="mb-6 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800/30">
                <StarRating value={compScore} onChange={setCompScore} label="음악/곡의 완성도" />
                <StarRating value={qualScore} onChange={setQualScore} label="레코딩/믹싱 품질" />
            </div>

            <div className="mb-6">
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                    감상평 (최소 10자 이상)
                </label>
                <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="이 작품의 좋았던 점이나 인상 깊었던 부분을 자유롭게 적어주세요!"
                    className="w-full p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-sm outline-none focus:border-indigo-500 min-h-[120px] resize-none"
                />
                <div className={`text-xs mt-2 text-right ${comment.length < 10 ? 'text-red-500' : 'text-green-500'}`}>
                    {comment.length} / 10자 이상
                </div>
            </div>

            {error && (
                <div className="mb-4 text-sm text-red-500 font-bold bg-red-50 p-3 rounded-lg">
                    🚨 {error}
                </div>
            )}

            <div className="flex justify-end">
                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-8 py-3 bg-indigo-600 font-bold text-white rounded-xl hover:bg-indigo-700 transition flex items-center gap-2 disabled:opacity-50"
                >
                    <Send className="w-5 h-5" />
                    {isSubmitting ? '제출 중...' : '평가 등록하기'}
                </button>
            </div>
        </form>
    )
}
