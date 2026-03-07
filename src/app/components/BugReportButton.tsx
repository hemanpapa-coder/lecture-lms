'use client'
import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Bug, X, Send, Upload, CheckCircle2, Loader2 } from 'lucide-react'

export default function BugReportButton({
    userId,
    userName,
    userEmail,
    courseId,
}: {
    userId: string
    userName?: string
    userEmail?: string
    courseId?: string
}) {
    const supabase = createClient()
    const [open, setOpen] = useState(false)
    const [description, setDescription] = useState('')
    const [screenshotFile, setScreenshotFile] = useState<File | null>(null)
    const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [done, setDone] = useState(false)
    const [error, setError] = useState('')

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setScreenshotFile(file)
        setScreenshotPreview(URL.createObjectURL(file))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!description.trim()) { setError('에러 설명을 입력해 주세요.'); return }
        setSubmitting(true)
        setError('')

        let screenshotUrl: string | null = null

        // Upload screenshot if provided
        if (screenshotFile) {
            const ext = screenshotFile.name.split('.').pop()
            const path = `${userId}/${Date.now()}.${ext}`
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('error-screenshots')
                .upload(path, screenshotFile, { upsert: true })
            if (uploadError) {
                // Non-fatal — still submit without screenshot
                console.warn('Screenshot upload failed:', uploadError.message)
            } else {
                const { data: { publicUrl } } = supabase.storage
                    .from('error-screenshots')
                    .getPublicUrl(path)
                screenshotUrl = publicUrl
            }
        }

        const { error: insertError } = await supabase.from('error_reports').insert({
            user_id: userId,
            user_name: userName || null,
            user_email: userEmail || null,
            course_id: courseId || null,
            page_url: window.location.href,
            description: description.trim(),
            screenshot_url: screenshotUrl,
        })

        setSubmitting(false)
        if (insertError) { setError(insertError.message); return }

        setDone(true)
        setTimeout(() => {
            setOpen(false)
            setDone(false)
            setDescription('')
            setScreenshotFile(null)
            setScreenshotPreview(null)
        }, 2500)
    }

    return (
        <>
            {/* Floating trigger button */}
            <button
                onClick={() => setOpen(true)}
                className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl bg-red-500 hover:bg-red-400 text-white px-4 py-2.5 text-sm font-bold shadow-lg shadow-red-900/20 transition-all hover:scale-105"
                title="버그/에러 신고"
            >
                <Bug className="w-4 h-4" />
                <span className="hidden sm:inline">버그 신고</span>
            </button>

            {/* Modal */}
            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                    <div
                        className="relative w-full max-w-lg bg-white dark:bg-neutral-900 rounded-3xl shadow-2xl border border-neutral-200 dark:border-neutral-800 p-6 space-y-5"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-red-50 dark:bg-red-900/30 rounded-xl">
                                    <Bug className="w-5 h-5 text-red-500" />
                                </div>
                                <div>
                                    <h2 className="font-extrabold text-neutral-900 dark:text-white">버그 / 에러 신고</h2>
                                    <p className="text-xs text-neutral-500">신고 내용은 교수님에게만 전달됩니다.</p>
                                </div>
                            </div>
                            <button onClick={() => setOpen(false)} className="p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition text-neutral-400">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {done ? (
                            <div className="flex flex-col items-center gap-3 py-8 text-center">
                                <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                                <p className="font-bold text-neutral-900 dark:text-white">신고가 접수됐습니다!</p>
                                <p className="text-sm text-neutral-500">빠르게 확인하고 수정해드릴게요.</p>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-4">
                                {error && <p className="text-red-500 text-sm font-bold">{error}</p>}

                                {/* Page info (auto-filled) */}
                                <div className="rounded-xl bg-neutral-50 dark:bg-neutral-800 px-4 py-2.5 text-xs text-neutral-500 font-mono truncate">
                                    📍 {typeof window !== 'undefined' ? window.location.pathname : ''}
                                </div>

                                {/* Description */}
                                <textarea
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    placeholder="어떤 문제가 발생했나요? 가능하면 자세히 설명해 주세요.&#10;예) '로그인 버튼을 누르면 흰 화면만 나와요.'"
                                    rows={4}
                                    className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-500"
                                />

                                {/* Screenshot upload */}
                                <div>
                                    <label className="block text-xs font-bold text-neutral-500 mb-2">스크린샷 첨부 (선택)</label>
                                    {screenshotPreview ? (
                                        <div className="relative rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-700">
                                            <img src={screenshotPreview} alt="screenshot preview" className="w-full max-h-40 object-cover" />
                                            <button
                                                type="button"
                                                onClick={() => { setScreenshotFile(null); setScreenshotPreview(null) }}
                                                className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-lg hover:bg-black/70 transition"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ) : (
                                        <label className="flex items-center gap-3 cursor-pointer rounded-xl border-2 border-dashed border-neutral-200 dark:border-neutral-700 hover:border-red-300 transition px-4 py-4">
                                            <Upload className="w-5 h-5 text-neutral-400" />
                                            <span className="text-sm text-neutral-500">클릭하여 이미지 업로드</span>
                                            <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
                                        </label>
                                    )}
                                </div>

                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-500 hover:bg-red-400 text-white font-bold py-3 text-sm transition disabled:opacity-60"
                                >
                                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    {submitting ? '신고 중...' : '신고 접수하기'}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </>
    )
}
