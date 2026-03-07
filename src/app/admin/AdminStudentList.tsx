'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Student = {
    id: string
    email: string
    name: string | null
    department: string | null
    student_id: string | null
    created_at: string
    is_approved: boolean
    course_id: string | null
    approval_request_count: number | null
}

type Course = {
    id: string
    name: string
}

export default function AdminStudentList({
    students: initialStudents,
    courses,
}: {
    students: Student[]
    courses: Course[]
}) {
    const router = useRouter()
    const [students, setStudents] = useState<Student[]>(initialStudents)
    const [loadingId, setLoadingId] = useState<string | null>(null)

    const courseMap = Object.fromEntries(courses.map(c => [c.id, c.name]))

    const doAction = async (userId: string, action: 'approve' | 'delete') => {
        if (action === 'delete') {
            if (!confirm('정말 삭제하시겠습니까?')) return
        }
        setLoadingId(userId + action)

        // Optimistic update: apply change immediately to local state
        if (action === 'approve') {
            setStudents(prev => prev.map(s => s.id === userId ? { ...s, is_approved: true } : s))
        } else if (action === 'delete') {
            setStudents(prev => prev.filter(s => s.id !== userId))
        }

        try {
            const body = new FormData()
            body.append('userId', userId)
            body.append('action', action)
            const res = await fetch('/api/admin/user-action', { method: 'POST', body })

            // If server failed, revert by refreshing
            if (!res.ok && !res.redirected) {
                const ct = res.headers.get('content-type') || ''
                if (ct.includes('application/json')) {
                    const d = await res.json()
                    alert(d.error || '오류가 발생했습니다.')
                }
                router.refresh() // revert optimistic change
            }
        } catch (err) {
            console.error(err)
            router.refresh() // revert on network error
        } finally {
            setLoadingId(null)
        }
    }

    if (students.length === 0) {
        return (
            <tr>
                <td colSpan={5} className="p-6 text-center text-neutral-500">
                    가입된 학생이 없습니다.
                </td>
            </tr>
        )
    }

    return (
        <>
            {students.map((u) => {
                const isApproving = loadingId === u.id + 'approve'
                const isDeleting = loadingId === u.id + 'delete'
                const courseName = u.course_id ? courseMap[u.course_id] : null

                return (
                    <tr key={u.id} className="border-b border-neutral-100 dark:border-neutral-800/50 hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition">
                        {/* 학생 정보 */}
                        <td className="p-3">
                            <div className="flex items-center gap-2">
                                <div className="text-sm font-bold text-neutral-900 dark:text-white">
                                    {u.name || '이름 없음'}
                                </div>
                                {u.approval_request_count != null && u.approval_request_count > 1 && (
                                    <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-red-500 rounded-full shadow-sm animate-pulse">
                                        {u.approval_request_count}
                                    </span>
                                )}
                            </div>
                            <div className="text-xs text-neutral-500">{u.email}</div>
                            <div className="text-[10px] text-neutral-400 mt-0.5">
                                {u.department} {u.student_id ? `(${u.student_id})` : ''}
                            </div>
                        </td>

                        {/* 신청/수강 과목 */}
                        <td className="p-3">
                            <div className="text-xs font-bold text-neutral-500 mb-1">
                                {u.is_approved ? '✅ 수강과목' : '⏳ 신청과목'}
                            </div>
                            <div className="text-sm font-bold text-indigo-600">
                                {courseName || '과목 미지정'}
                            </div>
                        </td>

                        {/* 가입일 */}
                        <td className="p-3 text-xs text-neutral-500">
                            {new Date(u.created_at).toLocaleString('ko-KR', {
                                year: 'numeric', month: '2-digit', day: '2-digit',
                                hour: '2-digit', minute: '2-digit'
                            })}
                        </td>

                        {/* 상태 */}
                        <td className="p-3">
                            <span className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors ${u.is_approved ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                {u.is_approved ? '인증됨' : '대기중'}
                            </span>
                        </td>

                        {/* 관리 */}
                        <td className="p-3">
                            <div className="flex items-center gap-3">
                                {!u.is_approved && (
                                    <button
                                        onClick={() => doAction(u.id, 'approve')}
                                        disabled={isApproving}
                                        className="text-emerald-600 hover:underline text-sm font-bold disabled:opacity-50 disabled:cursor-wait"
                                    >
                                        {isApproving ? '처리중...' : '인증하기'}
                                    </button>
                                )}
                                <button
                                    onClick={() => doAction(u.id, 'delete')}
                                    disabled={isDeleting}
                                    className="text-red-500 hover:underline text-sm font-bold disabled:opacity-50 disabled:cursor-wait"
                                >
                                    {isDeleting ? '삭제중...' : '삭제'}
                                </button>
                                <a
                                    href={`/workspace/${u.id}`}
                                    className="text-blue-600 hover:underline text-sm font-semibold"
                                >
                                    공간 열람
                                </a>
                            </div>
                        </td>
                    </tr>
                )
            })}
        </>
    )
}
