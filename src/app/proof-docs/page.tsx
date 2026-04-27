'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { UploadCloud, Loader2 } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

export default function ProofDocsPage() {
    const router = useRouter()
    const supabase = createClient()
    const [userId, setUserId] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [pageLoading, setPageLoading] = useState(true)

    useEffect(() => {
        const fetchUser = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                router.push('/auth/login')
            } else {
                setUserId(user.id)
            }
            setPageLoading(false)
        }
        fetchUser()
    }, [router, supabase])

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        if (!userId) return

        setLoading(true)
        try {
            const formData = new FormData(e.currentTarget)
            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            })

            const data = await res.json()
            if (res.ok && data.ok) {
                alert('증빙 서류 제출이 완료되었습니다. 담당 교수자가 확인 후 처리할 예정입니다.')
                router.push('/')
            } else {
                alert('제출에 실패했습니다: ' + (data.error || '알 수 없는 오류'))
            }
        } catch (error) {
            console.error(error)
            alert('네트워크 오류가 발생했습니다.')
        } finally {
            setLoading(false)
        }
    }

    if (pageLoading) {
        return <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-8 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
    }

    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-8">
            <div className="mx-auto max-w-3xl space-y-8">

                <header className="flex items-center justify-between rounded-3xl bg-white p-8 shadow-sm dark:bg-neutral-900 border border-neutral-200/60 dark:border-neutral-800">
                    <div>
                        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">결석/지각 증빙 문서 제출</h1>
                        <p className="text-sm text-neutral-500 mt-2">
                            질병 결석 및 예비군, 공가 등 증빙이 필요한 서류를 제출합니다.
                        </p>
                    </div>
                    <Link href="/" className="text-sm font-semibold text-blue-600 hover:underline">
                        ← 돌아가기
                    </Link>
                </header>

                <div className="rounded-3xl bg-white p-8 shadow-sm border border-neutral-200/60 dark:bg-neutral-900 dark:border-neutral-800 text-center">

                    <div className="mx-auto w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mb-6">
                        <UploadCloud className="w-8 h-8 text-blue-600" />
                    </div>

                    <form onSubmit={handleSubmit} className="max-w-md mx-auto text-left space-y-6">
                        <input type="hidden" name="userId" value={userId || ''} />
                        <input type="hidden" name="weekName" value="proof_documents" />

                        <div>
                            <label className="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-2">
                                사유 선택
                            </label>
                            <select name="reason" className="w-full rounded-xl border border-neutral-200 p-3 dark:border-neutral-700 dark:bg-neutral-800 outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="질병">질병/병원 방문</option>
                                <option value="공가">공가 (예비군, 가족 경조사 등)</option>
                                <option value="기타">기타 사유</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-2">
                                스캔본 또는 사진 첨부 (PDF, JPG, PNG)
                            </label>
                            <input type="file" name="file" accept=".pdf,image/*" className="w-full text-sm text-neutral-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-neutral-800 dark:file:text-neutral-300" required />
                        </div>

                        <button type="submit" disabled={loading} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-white font-bold hover:bg-blue-700 transition shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                            {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> 제출 중...</> : '보안 서버로 제출'}
                        </button>
                    </form>

                    <p className="mt-6 text-xs text-neutral-400">
                        제출된 서류는 담당 교수자만 열람할 수 있으며 학기 종료 후 일괄 파기됩니다.
                    </p>

                </div>
            </div>
        </div>
    )
}
