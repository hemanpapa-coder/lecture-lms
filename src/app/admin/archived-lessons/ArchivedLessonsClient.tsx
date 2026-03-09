'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Archive, ArrowLeft, RefreshCw } from 'lucide-react'

type Student = {
    id: string
    email: string
    name: string | null
    department: string | null
    student_id: string | null
    private_lesson_id: string | null
    created_at: string
}

type Course = {
    id: string
    name: string
}

export default function ArchivedLessonsClient({
    students: initialStudents,
    courses
}: {
    students: Student[]
    courses: Course[]
}) {
    const router = useRouter()
    const [students, setStudents] = useState<Student[]>(initialStudents)
    const [loadingId, setLoadingId] = useState<string | null>(null)

    const courseMap = Object.fromEntries(courses.map(c => [c.id, c.name]))

    const resumeLesson = async (userId: string) => {
        if (!confirm('이 학생의 레슨을 재개하시겠습니까?\n다시 활성 레슨 목록으로 복귀합니다.')) return

        setLoadingId(userId)

        // Optimistic update
        setStudents(prev => prev.filter(s => s.id !== userId))

        try {
            const body = new FormData()
            body.append('userId', userId)
            body.append('action', 'resume_lesson')

            const res = await fetch('/api/admin/user-action', { method: 'POST', body })
            if (!res.ok && !res.redirected) {
                alert('레슨 재개 처리에 실패했습니다.')
                router.refresh()
            }
        } catch (err) {
            console.error(err)
            router.refresh()
        } finally {
            setLoadingId(null)
            router.refresh()
        }
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-8">
            <div className="mx-auto max-w-5xl space-y-8">

                <header className="bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-sm border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <Link href="/admin" className="p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition">
                            <ArrowLeft className="w-6 h-6 text-slate-500" />
                        </Link>
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <span className="p-1.5 bg-slate-100 text-slate-600 rounded-lg dark:bg-slate-800 dark:text-slate-400">
                                    <Archive className="w-5 h-5" />
                                </span>
                                <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">종료된 레슨 학생 보관함</h1>
                            </div>
                            <p className="text-sm text-slate-500 font-medium">
                                임시 중단되거나 학기가 종료된 개인 레슨 학생들의 목록입니다. 언제든 레슨을 재개할 수 있습니다.
                            </p>
                        </div>
                    </div>
                </header>

                <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div className="p-6 border-b border-slate-100 dark:border-slate-800 font-bold text-slate-900 dark:text-white flex justify-between items-center">
                        <span>보관된 학생 목록 ({students.length}명)</span>
                    </div>

                    {students.length === 0 ? (
                        <div className="p-12 text-center text-slate-400">
                            <Archive className="w-12 h-12 mx-auto mb-4 opacity-20" />
                            <p>보관함에 보관된 학생이 없습니다.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">이름 / 이메일</th>
                                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">종료된 레슨 코스</th>
                                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">가입일</th>
                                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">관리</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                                {students.map(s => {
                                    const isLoading = loadingId === s.id
                                    const courseName = s.private_lesson_id ? courseMap[s.private_lesson_id] : '알 수 없음'

                                    return (
                                        <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                            <td className="p-4">
                                                <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                                    {s.name || '이름 없음'}
                                                    <span className="text-[10px] text-slate-400 font-normal">{s.student_id ? `(${s.student_id})` : ''}</span>
                                                </div>
                                                <div className="text-xs text-slate-500 mt-1">{s.email}</div>
                                            </td>
                                            <td className="p-4">
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                                    {courseName}
                                                </span>
                                            </td>
                                            <td className="p-4 text-xs text-slate-500 font-medium">
                                                {new Date(s.created_at).toLocaleDateString('ko-KR')}
                                            </td>
                                            <td className="p-4 text-right">
                                                <button
                                                    onClick={() => resumeLesson(s.id)}
                                                    disabled={isLoading}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg text-xs font-bold transition-colors shadow-sm disabled:opacity-50"
                                                >
                                                    <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                                                    {isLoading ? '재개 중...' : '레슨 재개'}
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    )
}
