import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { MessagesSquare } from 'lucide-react'
import AdminQnaClient from './AdminQnaClient'

export default async function AdminQnaPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/auth/login')

    const { data: userRecord } = await supabase.from('users').select('role').eq('id', user.id).single()
    const isAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com'
    if (!isAdmin) redirect('/')

    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-6">
            <div className="mx-auto max-w-4xl space-y-6">
                <header className="flex items-center justify-between rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-6 shadow-sm">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl dark:bg-emerald-900/30">
                            <MessagesSquare className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-xl font-extrabold text-neutral-900 dark:text-white">익명 Q&A 관리</h1>
                            <p className="text-sm text-neutral-500 mt-0.5">학생 질문 조회 · 답장 · 공지 설정 · 삭제</p>
                        </div>
                    </div>
                    <Link href="/admin" className="text-sm font-semibold text-blue-600 hover:underline">← 관리자 대시보드</Link>
                </header>

                <AdminQnaClient adminId={user.id} />
            </div>
        </div>
    )
}
