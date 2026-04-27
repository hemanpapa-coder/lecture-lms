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
    private_lesson_id?: string | null
    private_lesson_ended?: boolean
    approval_request_count: number | null
    last_requested_at?: string | null
    course_role: string | null
    is_auditor?: boolean
    profile_image_url?: string | null
}

type Course = {
    id: string
    name: string
    university_name?: string | null
}

export default function AdminStudentList({
    students: initialStudents,
    courses,
    courseName: courseNameProp,
    isPrivateLesson = false,
}: {
    students: Student[]
    courses: Course[]
    courseName?: string
    isPrivateLesson?: boolean
}) {
    const router = useRouter()
    const [students, setStudents] = useState<Student[]>(initialStudents)
    const [loadingId, setLoadingId] = useState<string | null>(null)

    // Attendance Modal States
    const [selectedAttendanceUser, setSelectedAttendanceUser] = useState<{ id: string, name: string } | null>(null)
    const [attendancesModalData, setAttendancesModalData] = useState<any[] | null>(null)

    // Proof Docs Modal States
    const [selectedProofUser, setSelectedProofUser] = useState<{ id: string, name: string } | null>(null)
    const [proofsModalData, setProofsModalData] = useState<any[] | null>(null)

    const courseMap = Object.fromEntries(courses.map(c => [c.id, c]))

    const openAttendanceModal = async (userId: string, name: string, courseId: string) => {
        setSelectedAttendanceUser({ id: userId, name: name || '이름 없음' })
        setAttendancesModalData(null)
        try {
            const res = await fetch(`/api/admin/student-attendance?userId=${userId}&courseId=${courseId}`)
            if (!res.ok) throw new Error('API 오류')
            const data = await res.json()
            if (data.attendances) {
                setAttendancesModalData(data.attendances)
            } else {
                setAttendancesModalData([])
            }
        } catch(e) {
            console.error(e)
            alert('출석 정보를 불러오지 못했습니다.')
            setSelectedAttendanceUser(null)
        }
    }

    const openProofModal = async (userId: string, name: string) => {
        setSelectedProofUser({ id: userId, name: name || '이름 없음' })
        setProofsModalData(null)
        try {
            const res = await fetch(`/api/admin/proof-docs?userId=${userId}`)
            if (!res.ok) throw new Error('API 오류')
            const data = await res.json()
            if (data.proofs) {
                setProofsModalData(data.proofs)
            } else {
                setProofsModalData([])
            }
        } catch(e) {
            console.error(e)
            alert('증빙 서류 정보를 불러오지 못했습니다.')
            setSelectedProofUser(null)
        }
    }

    const doAction = async (userId: string, action: 'approve' | 'delete' | 'end_lesson') => {
        if (action === 'delete') {
            if (!confirm('이 학생의 계정을 완전히 삭제하시겠습니까?\n⚠️ 이 작업은 되돌릴 수 없습니다.\n삭제 후 다시 가입해야 합니다.')) return
        } else if (action === 'end_lesson') {
            if (!confirm('이 학생의 레슨을 종료 처리하시겠습니까?\n종료된 레슨 학생은 보관함으로 이동합니다.')) return
        }

        setLoadingId(userId + action)

        // Optimistic update: apply change immediately to local state
        if (action === 'approve') {
            setStudents(prev => prev.map(s => s.id === userId ? { ...s, is_approved: true } : s))
        } else if (action === 'delete' || action === 'end_lesson') {
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
            router.refresh()
        }
    }

    const moveCourse = async (userId: string, newCourseId: string) => {
        if (!confirm('이 학생을 다른 과목으로 이동하시겠습니까?\n(해당 과목에서 즉시 승인 처리됩니다)')) return

        setLoadingId(userId + 'move')
        try {
            const body = new FormData()
            body.append('userId', userId)
            body.append('action', 'move_course')
            body.append('newCourseId', newCourseId)
            if (isPrivateLesson) {
                body.append('isPrivateLesson', 'true')
            }

            const res = await fetch('/api/admin/user-action', { method: 'POST', body })
            if (!res.ok && !res.redirected) {
                alert('과목 이동에 실패했습니다.')
            }
        } catch (err) {
            console.error(err)
            alert('네트워크 오류가 발생했습니다.')
        } finally {
            setLoadingId(null)
            router.refresh()
        }
    }

    const changeRole = async (userId: string, newRole: string) => {
        setLoadingId(userId + 'role')
        // Optimistic update
        setStudents(prev => prev.map(s => s.id === userId ? { ...s, course_role: newRole } : s))

        try {
            const res = await fetch('/api/admin/update-course-role', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetUserId: userId, newRole }),
            })
            if (!res.ok) {
                const ct = res.headers.get('content-type') || ''
                if (ct.includes('application/json')) {
                    const d = await res.json()
                    alert(d.error || '역할 변경에 실패했습니다.')
                }
                router.refresh()
            }
        } catch (err) {
            console.error(err)
            router.refresh()
        } finally {
            setLoadingId(null)
        }
    }

    if (students.length === 0) {
        return (
            <tr>
                <td colSpan={6} className="p-6 text-center text-neutral-500">
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
                const isEnding = loadingId === u.id + 'end_lesson'
                const isRoleUpdating = loadingId === u.id + 'role'
                const isAuditorUpdating = loadingId === u.id + 'auditor'

                const displayCourseId = isPrivateLesson ? (u.private_lesson_id || u.course_id) : u.course_id
                const displayCourse = displayCourseId ? courseMap[displayCourseId] : null
                const courseName = displayCourse?.name || null
                const universityName = displayCourse?.university_name || null

                const toggleAuditor = async () => {
                    setLoadingId(u.id + 'auditor')
                    // Optimistic update
                    setStudents(prev => prev.map(s => s.id === u.id ? { ...s, is_auditor: !s.is_auditor } : s))

                    try {
                        const body = new FormData()
                        body.append('userId', u.id)
                        body.append('action', 'toggle_auditor')

                        const res = await fetch('/api/admin/user-action', { method: 'POST', body })
                        if (!res.ok && !res.redirected) {
                            alert('상태 변경에 실패했습니다.')
                            router.refresh() // revert optimistic
                        }
                    } catch (err) {
                        console.error(err)
                        router.refresh()
                    } finally {
                        setLoadingId(null)
                    }
                }

                return (
                    <tr key={u.id} className="border-b border-neutral-100 dark:border-neutral-800/50 hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition">
                        {/* 학생 정보 */}
                        <td className="p-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 flex items-center justify-center shrink-0">
                                    {u.profile_image_url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={u.profile_image_url} alt="Profile" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-gray-500 font-bold">{u.name ? u.name.charAt(0) : '?'}</span>
                                    )}
                                </div>
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        <div className="text-sm font-bold text-neutral-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                                            {u.name || '이름 없음'}
                                            {u.is_auditor && (
                                                <span className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700 text-[10px] px-1.5 py-0.5 rounded font-black whitespace-nowrap" title="청강생">🎧 청강생</span>
                                            )}
                                    {u.course_role === 'sound_engineer_rep' && (
                                                <span className="bg-indigo-100 text-indigo-700 text-[10px] px-1.5 py-0.5 rounded font-black whitespace-nowrap" title="가산점 대상">🎵 음향반장</span>
                                            )}
                                            {u.course_role === 'musician_rep' && (
                                                <span className="bg-fuchsia-100 text-fuchsia-700 text-[10px] px-1.5 py-0.5 rounded font-black whitespace-nowrap" title="가산점 대상">🎸 뮤지션반장</span>
                                            )}
                                        </div>
                                        {!u.is_approved && u.approval_request_count != null && u.approval_request_count > 1 && (
                                            <button 
                                                type="button"
                                                onClick={() => {
                                                    const timeStr = u.last_requested_at ? new Date(u.last_requested_at).toLocaleString('ko-KR') : '시간 정보 없음'
                                                    alert(`해당 학생이 과목 승인을 ${u.approval_request_count}회 다시 요청했습니다.\n\n마지막 요청 일시: ${timeStr}`)
                                                }}
                                                title="승인 재요청 정보 확인"
                                                className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-red-500 rounded-full shadow-sm animate-pulse flex-shrink-0 cursor-pointer hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 dark:focus:ring-offset-neutral-900 transition"
                                            >
                                                {u.approval_request_count}
                                            </button>
                                        )}
                                    </div>
                                    <div className="text-xs text-neutral-500 mt-1">{u.email}</div>
                                    <div className="text-[10px] text-neutral-400 mt-0.5">
                                        {u.department} {u.student_id ? `(${u.student_id})` : ''}
                                    </div>
                                </div>
                            </div>
                        </td>

                        {/* 소속 과목 변경 (Admin Roster Dropdown) */}
                        <td className="p-3">
                            <select
                                value={displayCourseId || ''}
                                onChange={(e) => moveCourse(u.id, e.target.value)}
                                disabled={loadingId === u.id + 'move'}
                                className="text-xs border border-neutral-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 px-2 py-1 outline-none focus:border-indigo-400 disabled:opacity-50"
                            >
                                <option value="" disabled>과목 선택...</option>
                                {courses.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </td>

                        {/* 수강과목 */}
                        <td className="p-3">
                            <div className="flex flex-col gap-1">
                                <div className="text-xs font-bold text-neutral-500">
                                    {u.is_approved ? '✅ 수강중' : '⏳ 신청중'}
                                </div>
                                {universityName && (
                                    <div className="text-[10px] font-black tracking-widest text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 w-fit px-1.5 py-0.5 rounded">
                                        {universityName}
                                    </div>
                                )}
                                <div className="text-sm font-bold text-indigo-600">
                                    {courseName || '과목 미지정'}
                                </div>
                            </div>
                        </td>

                        {/* 가입일 */}
                        <td className="p-3 text-xs text-neutral-500">
                            {new Date(u.created_at).toLocaleString('ko-KR', {
                                year: 'numeric', month: '2-digit', day: '2-digit',
                                hour: '2-digit', minute: '2-digit'
                            })}
                        </td>

                        {/* 관리 */}
                        <td className="p-3">
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-3">
                                    <span className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors ${u.is_approved ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                        }`}>
                                        {u.is_approved ? '인증됨' : '대기중'}
                                    </span>
                                    {u.is_approved && courseNameProp === '레코딩실습1' && (
                                        <div>
                                            <select
                                                value={u.course_role || 'student'}
                                                onChange={(e) => changeRole(u.id, e.target.value)}
                                                disabled={isRoleUpdating}
                                                className="text-[10px] border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 px-1 py-0.5 outline-none focus:border-indigo-400 disabled:opacity-50 font-medium"
                                            >
                                                <option value="student">일반 학생</option>
                                                <option value="sound_engineer_rep">🎵 음향 반장 (가산점)</option>
                                                <option value="musician_rep">🎸 뮤지션 반장 (가산점)</option>
                                            </select>
                                        </div>
                                    )}
                                    {!u.is_approved && (
                                        <button
                                            onClick={() => doAction(u.id, 'approve')}
                                            disabled={isApproving}
                                            className="text-emerald-600 hover:underline text-sm font-bold disabled:opacity-50 disabled:cursor-wait"
                                        >
                                            {isApproving ? '처리중...' : '인증하기'}
                                        </button>
                                    )}
                                    <a
                                        href={`/workspace/${u.id}`}
                                        className="text-blue-600 hover:underline text-sm font-semibold"
                                    >
                                        공간 열람
                                    </a>
                                    {isPrivateLesson && u.private_lesson_id && (
                                        <a
                                            href={`/admin?tab=archive&course=${u.private_lesson_id}`}
                                            className="text-emerald-600 hover:underline text-sm font-semibold whitespace-nowrap"
                                            title="이 학생의 개인 레슨 아카이브 관리"
                                        >
                                            📁 레슨 아카이브
                                        </a>
                                    )}
                                    {['레코딩실습1', '오디오테크놀러지'].includes(courseName || '') && displayCourseId && (
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => openAttendanceModal(u.id, u.name || '', displayCourseId)}
                                                className="text-emerald-600 hover:text-emerald-700 hover:underline text-sm font-semibold whitespace-nowrap"
                                            >
                                                출석 보기
                                            </button>
                                            <span className="text-neutral-300">|</span>
                                            <button
                                                onClick={() => openProofModal(u.id, u.name || '')}
                                                className="text-blue-600 hover:text-blue-700 hover:underline text-sm font-semibold whitespace-nowrap"
                                                title="결석/지각 증빙 서류 보기"
                                            >
                                                증빙 서류 보기
                                            </button>
                                        </div>
                                    )}
                                    {isPrivateLesson && u.is_approved && (
                                        <button
                                            onClick={() => doAction(u.id, 'end_lesson')}
                                            disabled={isEnding}
                                            className="text-rose-500 hover:text-rose-600 text-[11px] px-2 py-1 bg-rose-50 hover:bg-rose-100 rounded-md font-bold transition-colors disabled:opacity-50"
                                        >
                                            {isEnding ? '진행중' : '레슨 종료'}
                                        </button>
                                    )}
                                    <button
                                        onClick={() => doAction(u.id, 'delete')}
                                        disabled={isDeleting}
                                        title="계정 삭제 (영구)"
                                        className="text-neutral-400 hover:text-red-500 transition-colors disabled:opacity-50 disabled:cursor-wait flex items-center justify-center p-1"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>

                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={toggleAuditor}
                                        disabled={isAuditorUpdating}
                                        className={`text-[10px] font-bold px-2 py-1 rounded transition disabled:opacity-50 ${u.is_auditor
                                            ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                                            }`}
                                    >
                                        {isAuditorUpdating ? '변경중...' : (u.is_auditor ? '청강 해제' : '청강생 전환')}
                                    </button>
                                </div>
                            </div>
                        </td>
                    </tr>
                )
            })}

            {/* Attendance Modal */}
            {selectedAttendanceUser && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in">
                    <div className="bg-white dark:bg-neutral-900 rounded-3xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col shadow-2xl border border-neutral-200 dark:border-neutral-800 animate-in zoom-in-95">
                         <div className="p-6 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50 dark:bg-neutral-950">
                            <div>
                                <h3 className="text-xl font-extrabold text-neutral-900 dark:text-white flex items-center gap-2">
                                    <span className="text-emerald-500">📅</span> {selectedAttendanceUser.name} 학생 출석 현황
                                </h3>
                            </div>
                            <button onClick={() => setSelectedAttendanceUser(null)} className="p-2 bg-neutral-200 dark:bg-neutral-800 rounded-full hover:bg-neutral-300 dark:hover:bg-neutral-700 transition">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-600 dark:text-neutral-400"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                            </button>
                         </div>
                         <div className="p-6 overflow-y-auto w-full">
                            {!attendancesModalData ? (
                                <div className="text-center py-10 font-bold text-neutral-500 animate-pulse">출석 데이터를 불러오는 중...</div>
                            ) : attendancesModalData.length === 0 ? (
                                <div className="text-center py-10 text-neutral-500 border border-neutral-200 dark:border-neutral-800 rounded-xl bg-neutral-50 dark:bg-neutral-800/50">출석 기록이 없습니다.</div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {Array.from({ length: 15 }, (_, i) => i + 1).map(week => {
                                        const att = attendancesModalData.find(a => a.week_number === week)
                                        return (
                                            <div key={week} className={`p-3 rounded-xl border ${att ? 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 shadow-sm' : 'bg-neutral-50 dark:bg-neutral-950 border-neutral-100 dark:border-neutral-900'}`}>
                                                <div className="text-[10px] font-black text-neutral-400 mb-1">WEEK {week}</div>
                                                {att ? (
                                                    <div>
                                                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${att.status === '출석' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : att.status === '결석' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'}`}>
                                                            {att.status}
                                                        </span>
                                                        {(att.status === '병출석' || att.status === '사유출석') && att.reason_text && (
                                                            <div className="mt-2 text-[10px] text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 p-1.5 rounded">{att.reason_text}</div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-neutral-400 font-medium">-</span>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                         </div>
                    </div>
                </div>
            )}
            {/* Proof Docs Modal */}
            {selectedProofUser && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in">
                    <div className="bg-white dark:bg-neutral-900 rounded-3xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col shadow-2xl border border-neutral-200 dark:border-neutral-800 animate-in zoom-in-95">
                         <div className="p-6 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50 dark:bg-neutral-950">
                            <div>
                                <h3 className="text-xl font-extrabold text-neutral-900 dark:text-white flex items-center gap-2">
                                    <span className="text-blue-500">📎</span> {selectedProofUser.name} 학생 증빙 서류
                                </h3>
                            </div>
                            <button onClick={() => setSelectedProofUser(null)} className="p-2 bg-neutral-200 dark:bg-neutral-800 rounded-full hover:bg-neutral-300 dark:hover:bg-neutral-700 transition">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-600 dark:text-neutral-400"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                            </button>
                         </div>
                         <div className="p-6 overflow-y-auto w-full">
                            {!proofsModalData ? (
                                <div className="text-center py-10 font-bold text-neutral-500 animate-pulse">증빙 서류를 불러오는 중...</div>
                            ) : proofsModalData.length === 0 ? (
                                <div className="text-center py-10 text-neutral-500 border border-neutral-200 dark:border-neutral-800 rounded-xl bg-neutral-50 dark:bg-neutral-800/50">제출된 증빙 서류가 없습니다.</div>
                            ) : (
                                <div className="space-y-3">
                                    {proofsModalData.map((proof: any) => (
                                        <div key={proof.id} className="p-4 rounded-xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 shadow-sm flex flex-col gap-2">
                                            <div className="flex justify-between items-start">
                                                <div className="font-bold text-sm text-neutral-900 dark:text-white">{proof.title}</div>
                                                <div className="text-[10px] text-neutral-500">{new Date(proof.created_at).toLocaleString('ko-KR')}</div>
                                            </div>
                                            <a 
                                                href={proof.file_url} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="mt-2 inline-flex items-center justify-center w-full py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 dark:text-blue-400 font-bold text-xs rounded-lg transition"
                                            >
                                                서류 열람하기 (Google Drive)
                                            </a>
                                        </div>
                                    ))}
                                </div>
                            )}
                         </div>
                    </div>
                </div>
            )}
        </>
    )
}
