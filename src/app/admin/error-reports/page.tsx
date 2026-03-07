import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Bug } from 'lucide-react'
import AdminErrorReportsClient from './AdminErrorReportsClient'

export default async function AdminErrorReportsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/auth/login')

    const { data: userRecord } = await supabase.from('users').select('role').eq('id', user.id).single()
    const isAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com'
    if (!isAdmin) redirect('/')

    // Count open reports for badge
    const { count } = await supabase
        .from('error_reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'open')

    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-6">
            <div className="mx-auto max-w-4xl space-y-6">
                <header className="flex items-center justify-between rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-6 shadow-sm">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-red-50 text-red-500 rounded-2xl dark:bg-red-900/30">
                            <Bug className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-xl font-extrabold text-neutral-900 dark:text-white">에러 리포트 관리</h1>
                                {(count ?? 0) > 0 && (
                                    <span className="bg-red-500 text-white text-xs font-extrabold px-2 py-0.5 rounded-full">{count} 미처리</span>
                                )}
                            </div>
                            <p className="text-sm text-neutral-500 mt-0.5">학생이 신고한 버그 · 에러를 확인하고 Antigravity로 수정하세요</p>
                        </div>
                    </div>
                    <Link href="/admin" className="text-sm font-semibold text-blue-600 hover:underline">← 관리자 대시보드</Link>
                </header>
                <AdminErrorReportsClient />
            </div>
        </div>
    )
}
