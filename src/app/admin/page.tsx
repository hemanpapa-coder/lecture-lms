import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Users, BookOpen, BarChart3, AlertCircle, Database } from 'lucide-react'
import AttendanceToggle from './AttendanceToggle'
import RecycleBin from './RecycleBin'
import QRDisplay from './QRDisplay'

export default async function AdminDashboardPage({
    searchParams,
}: {
    searchParams: Promise<{ tab?: string }>
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/auth/login')
    }

    const { data: userRecord } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

    const isRealAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com'
    if (!isRealAdmin) {
        redirect('/')
    }

    const { tab = 'students' } = await searchParams

    // Fetch users for student management tab
    const { data: allUsersRaw, error: usersError } = await supabase
        .from('users')
        .select('id, email, role, created_at, is_approved, department, name, student_id, course_id, courses(name)')
        .eq('role', 'user')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

    if (usersError) console.error('[ADMIN] Error fetching users:', JSON.stringify(usersError))
    console.log('[ADMIN] allUsersRaw count:', allUsersRaw?.length, '| data:', JSON.stringify(allUsersRaw?.map(u => ({ id: u.id, email: u.email, role: u.role }))))

    const allUsers = (allUsersRaw || []) as any[]

    // Fetch evaluations data for grades tab
    const { data: evaluations } = await supabase
        .from('evaluations')
        .select('*')
        .order('total_score', { ascending: false })

    // Fetch course information for attendance toggle
    const { data: courses } = await supabase
        .from('courses')
        .select('id, name, is_attendance_open')
        .eq('name', '레코딩실습1')

    const pendingApprovalsCount = allUsers?.filter(u => !u.is_approved).length || 0;

    const tabs = [
        {
            id: 'students',
            label: '학생 관리',
            icon: '👥',
            badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : null
        },
        { id: 'grades', label: '성적 산출 및 관리', icon: '📊' },
        { id: 'archive', label: '공용 자료 관리', icon: '📁' },
        { id: 'roster', label: '수강명단', icon: '📋' },
        { id: 'recycle', label: '휴지통', icon: '🗑️' },
        { id: 'access', label: 'QR 접속', icon: '📱' },
    ]

    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-8">
            <div className="mx-auto max-w-6xl space-y-8">

                <header className="flex items-center justify-between rounded-3xl bg-white p-8 shadow-sm dark:bg-neutral-900 border border-indigo-100 dark:border-indigo-900/50">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md text-xs font-bold dark:bg-indigo-900 dark:text-indigo-300">Admin Only</span>
                        </div>
                        <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white">관리자 전용 대시보드</h1>
                        <p className="text-sm text-neutral-500 mt-2 font-medium">전체 학생 성적 및 시스템을 관리합니다.</p>
                    </div>
                    <Link href="/" className="text-sm font-semibold text-blue-600 hover:underline">
                        ← 메인으로 돌아가기
                    </Link>
                </header>

                {/* Tab Navigation */}
                <div className="flex gap-2 flex-wrap">
                    {tabs.map(t => (
                        <Link
                            key={t.id}
                            href={`/admin?tab=${t.id}`}
                            className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm transition-all ${tab === t.id
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30'
                                : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200 dark:bg-neutral-900 dark:text-neutral-400 dark:border-neutral-800 dark:hover:bg-neutral-800'
                                }`}
                        >
                            <span>{t.icon}</span> {t.label}
                            {t.badge && (
                                <span className="ml-1 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full animate-bounce">
                                    {t.badge}
                                </span>
                            )}
                        </Link>
                    ))}
                </div>

                {/* ===== Tab: 학생 관리 ===== */}
                {tab === 'students' && (
                    <div className="bg-white dark:bg-neutral-900 rounded-3xl p-8 shadow-sm border border-neutral-200/60 dark:border-neutral-800">

                        {/* Attendance Toggle for Recording Class 1 */}
                        {courses && courses.length > 0 && (
                            <AttendanceToggle
                                courseId={courses[0].id}
                                courseName={courses[0].name}
                                initialState={courses[0].is_attendance_open}
                            />
                        )}

                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className="text-xl font-bold text-neutral-900 dark:text-white">전체 학생 목록</h2>
                                <p className="text-sm text-neutral-500 mt-1">총 {allUsers?.length || 0}명 수강 중</p>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-neutral-200 dark:border-neutral-800">
                                        <th className="p-3 text-sm font-semibold text-neutral-500">학생 정보</th>
                                        <th className="p-3 text-sm font-semibold text-neutral-500">신청/수강 과목</th>
                                        <th className="p-3 text-sm font-semibold text-neutral-500">가입일</th>
                                        <th className="p-3 text-sm font-semibold text-neutral-500">상태</th>
                                        <th className="p-3 text-sm font-semibold text-neutral-500">관리</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {allUsers?.map((u) => (
                                        <tr key={u.id} className="border-b border-neutral-100 dark:border-neutral-800/50 hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition">
                                            <td className="p-3">
                                                <div className="text-sm font-bold text-neutral-900 dark:text-white">{u.name || '이름 없음'}</div>
                                                <div className="text-xs text-neutral-500">{u.email}</div>
                                                <div className="text-[10px] text-neutral-400 mt-0.5">{u.department} {u.student_id ? `(${u.student_id})` : ''}</div>
                                            </td>
                                            <td className="p-3">
                                                <div className="text-xs font-bold text-neutral-500 mb-1">
                                                    {u.is_approved ? '✅ 수강과목' : '⏳ 신청과목'}
                                                </div>
                                                <div className="text-sm font-bold text-indigo-600">
                                                    {(u as any).courses?.name || '과목 미지정'}
                                                </div>
                                            </td>
                                            <td className="p-3 text-xs text-neutral-500">{new Date(u.created_at).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                                            <td className="p-3">
                                                <span className={`px-2 py-1 rounded-md text-[10px] font-bold ${u.is_approved ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                    {u.is_approved ? '인증됨' : '대기중'}
                                                </span>
                                            </td>
                                            <td className="p-3">
                                                <div className="flex items-center gap-3">
                                                    {!u.is_approved && (
                                                        <form action={`/api/admin/user-action`} method="POST">
                                                            <input type="hidden" name="userId" value={u.id} />
                                                            <input type="hidden" name="action" value="approve" />
                                                            <button type="submit" className="text-emerald-600 hover:underline text-sm font-bold">인증하기</button>
                                                        </form>
                                                    )}
                                                    <form action={`/api/admin/user-action`} method="POST" onSubmit={(e) => { if (!confirm('정말 삭제하시겠습니까? 관련 데이터가 모두 삭제됩니다.')) e.preventDefault(); }}>
                                                        <input type="hidden" name="userId" value={u.id} />
                                                        <input type="hidden" name="action" value="delete" />
                                                        <button type="submit" className="text-red-500 hover:underline text-sm font-bold">삭제</button>
                                                    </form>
                                                    <Link href={`/workspace/${u.id}`} className="text-blue-600 hover:underline text-sm font-semibold">
                                                        공간 열람
                                                    </Link>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {(!allUsers || allUsers.length === 0) && (
                                        <tr>
                                            <td colSpan={4} className="p-6 text-center text-neutral-500">가입된 학생이 없습니다.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ===== Tab: 성적 산출 및 관리 ===== */}
                {tab === 'grades' && (
                    <div className="space-y-6">
                        <div className="bg-orange-50 dark:bg-orange-950/30 rounded-3xl p-6 border border-orange-100 dark:border-orange-900/50 flex gap-4 items-start">
                            <AlertCircle className="w-6 h-6 text-orange-600 shrink-0 mt-1" />
                            <div>
                                <h4 className="font-bold text-orange-900 dark:text-orange-300 mb-1">성적 산출 안내</h4>
                                <p className="text-sm text-orange-700 dark:text-orange-400/80">
                                    모든 학생의 상호 평가 및 기말 프로젝트 제출이 완료된 후 아래 학생별 성적을 최종 확정하세요.<br />
                                    결석 1회: 최대 B+ / 결석 2회: 최대 C+ / 결석 3회 이상: F 처리
                                </p>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-neutral-900 rounded-3xl p-8 shadow-sm border border-neutral-200/60 dark:border-neutral-800">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-bold text-neutral-900 dark:text-white">학생별 성적 현황</h2>
                                <BarChart3 className="w-5 h-5 text-neutral-400" />
                            </div>

                            {evaluations && evaluations.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse text-sm">
                                        <thead>
                                            <tr className="border-b border-neutral-200 dark:border-neutral-800">
                                                <th className="p-3 font-semibold text-neutral-500">학생 ID</th>
                                                <th className="p-3 font-semibold text-neutral-500">출석 점수</th>
                                                <th className="p-3 font-semibold text-neutral-500">중간 점수</th>
                                                <th className="p-3 font-semibold text-neutral-500">기말 점수</th>
                                                <th className="p-3 font-semibold text-neutral-500">과제 점수</th>
                                                <th className="p-3 font-semibold text-neutral-500">총점</th>
                                                <th className="p-3 font-semibold text-neutral-500">학점</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {evaluations.map((ev) => (
                                                <tr key={ev.user_id} className="border-b border-neutral-100 dark:border-neutral-800/50 hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition">
                                                    <td className="p-3 font-mono text-xs text-neutral-500">{ev.user_id.slice(0, 8)}…</td>
                                                    <td className="p-3">{ev.attendance_score}</td>
                                                    <td className="p-3">{ev.midterm_score}</td>
                                                    <td className="p-3">{ev.final_score}</td>
                                                    <td className="p-3">{ev.assignment_score}</td>
                                                    <td className="p-3 font-bold">{ev.total_score}</td>
                                                    <td className="p-3">
                                                        <span className={`px-2 py-1 rounded text-xs font-bold ${ev.final_grade?.startsWith('A') ? 'bg-green-100 text-green-700' :
                                                            ev.final_grade?.startsWith('B') ? 'bg-blue-100 text-blue-700' :
                                                                ev.final_grade?.startsWith('C') ? 'bg-yellow-100 text-yellow-700' :
                                                                    ev.final_grade === 'F' ? 'bg-red-100 text-red-700' :
                                                                        'bg-neutral-100 text-neutral-600'
                                                            }`}>
                                                            {ev.final_grade || '미확정'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="py-16 text-center text-neutral-400">
                                    <BarChart3 className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
                                    <p className="font-medium">아직 확정된 성적 데이터가 없습니다.</p>
                                    <p className="text-sm mt-1">학기 말 평가 완료 후 성적이 여기에 표시됩니다.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ===== Tab: 공용 자료 관리 ===== */}
                {tab === 'archive' && (
                    <div className="bg-white dark:bg-neutral-900 rounded-3xl p-8 shadow-sm border border-neutral-200/60 dark:border-neutral-800">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-xl font-bold text-neutral-900 dark:text-white">공용 자료 아카이브 관리</h2>
                                <p className="text-sm text-neutral-500 mt-1">과목별 15주차 위키 자료를 관리합니다.</p>
                            </div>
                            <BookOpen className="w-5 h-5 text-neutral-400" />
                        </div>
                        <Link
                            href="/archive"
                            className="inline-flex items-center gap-3 px-6 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition"
                        >
                            📁 아카이브 전체 보기 및 과목 선택
                        </Link>
                    </div>
                )}

                {/* ===== Tab: 수강명단 ===== */}
                {tab === 'roster' && (
                    <div className="bg-white dark:bg-neutral-900 rounded-3xl p-8 shadow-sm border border-neutral-200/60 dark:border-neutral-800">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-xl font-bold text-neutral-900 dark:text-white">수강명단</h2>
                                <p className="text-sm text-neutral-500 mt-1">2026학년도 1학기 수강생 명단을 확인합니다.</p>
                            </div>
                        </div>
                        <Link
                            href="/admin/roster"
                            className="inline-flex items-center gap-3 px-6 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition"
                        >
                            📋 수강명단 전체 보기
                        </Link>
                    </div>
                )}

                {/* ===== Tab: 휴지통 ===== */}
                {tab === 'recycle' && (
                    <RecycleBin />
                )}

                {/* ===== Tab: QR 접속 ===== */}
                {tab === 'access' && (
                    <QRDisplay />
                )}

            </div>
        </div>
    )
}
