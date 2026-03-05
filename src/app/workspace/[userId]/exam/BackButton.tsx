'use client'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

export default function BackButton() {
    const router = useRouter()
    return (
        <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white transition bg-white dark:bg-slate-900 px-4 py-2 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800"
        >
            <ArrowLeft className="w-4 h-4" /> 뒤로 가기
        </button>
    )
}
