import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BookOpen, BarChart3, AlertCircle } from 'lucide-react'
import AttendanceToggle from './AttendanceToggle'
import AdminStudentList from './AdminStudentList'

export const dynamic = 'force-dynamic'

export default async function AdminDashboardPage({
    searchParams,
}: {
    searchParams: Promise<{ tab?: string; course?: string }>
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

    const { tab = 'students', course: courseIdParam } = await searchParams

    // Fetch all courses for student list display and attendance toggle
    const { data: allCoursesRaw } = await supabase
        .from('courses')
        .select('id, name, is_attendance_open')
        .order('name')

    const allCourses = (allCoursesRaw || []) as any[]
    const recordingClass = allCourses.find(c => c.name === '레코딩실습1')

    // Determine currently selected course (default to 'all' if none specified)
    const selectedCourseId = courseIdParam || 'all'

    // Fetch users (no FK join - we resolve courses separately)
    const { data: allUsersRaw } = await supabase
        .from('users')
        .select('id, email, role, created_at, is_approved, department, name, student_id, course_id, approval_request_count, course_role')
        .eq('role', 'user')
        .order('created_at', { ascending: false })

    const allUsers = (allUsersRaw || []) as any[]

    let selectedCourse: any = null
    let courseUsers: any[] = []

    if (selectedCourseId === 'all') {
        selectedCourse = { id: 'all', name: '전체' }
        courseUsers = allUsers.filter(u => u.course_id) // show only students who HAVE a course
    } else if (selectedCourseId === 'unassigned') {
        selectedCourse = { id: 'unassigned', name: '과목 미지정' }
        courseUsers = allUsers.filter(u => !u.course_id)
    } else {
        selectedCourse = allCourses.find(c => c.id === selectedCourseId)
        courseUsers = allUsers.filter(u => u.course_id === selectedCourseId)
    }

    // For the grades tab, we always need a real course ID (not 'all' or 'unassigned')
    const gradesCourseId = (selectedCourseId && selectedCourseId !== 'all' && selectedCourseId !== 'unassigned')
        ? selectedCourseId
        : (allCourses.length > 0 ? allCourses[0].id : null)
    const gradesCourse = allCourses.find(c => c.id === gradesCourseId)

    // Fetch evaluations data for grades tab (always uses a real course ID)
    let evaluations = []
    if (tab === 'grades' && gradesCourseId) {
        const { data: evaluationsRaw, error: evaluationsError } = await supabase
            .from('evaluations')
            .select('*')
            .eq('course_id', gradesCourseId)
            .order('total_score', { ascending: false })
        if (evaluationsError) console.error('[ADMIN] Evaluations error:', evaluationsError)
        evaluations = (evaluationsRaw || []) as any[]
    }

    // Per-course grade notices (precomputed before return)
    const gradeNotices: Record<string, { text: string; rules: string }> = {
        '레코딩실습1': {
            text: '스튜디오 실습 수업입니다. 출석 점수는 수업 참여만으로 산정되며, 연주 실습 평가 및 기말 프로젝트가 포함됩니다.',
            rules: '결석 1회: 최대 B+ / 결석 2회: 최대 C+ / 결석 3회 이상: F 처리'
        },
        '오디오테크놀러지': {
            text: '오디오 정밀 반의 이론 및 실험 수업입니다. 쫙음향학, 마이크 개론, 레코딩 실험을 다릅니다. 강의 참여도와 고종도 테스트가 평가됩니다.',
            rules: '결석 1회: 최대 B+ / 결석 2회: 최대 C+ / 결석 3회 이상: F 처리'
        },
        '홈레코딩과 음향학A': {
            text: '홈 레코딩 시스템을 활용한 트랙 제작과 음향 보정 실습 수업입니다. 실습 결과물 품질과 참여도를 기반으로 평가합니다.',
            rules: '결석 1회: 최대 B+ / 결석 2회: 최대 C+ / 결석 3회 이상: F 처리'
        },
        '홈레코딩과 음향학B': {
            text: '홈 레코딩 시스템을 활용한 트랙 제작과 음향 보정 실습 수업입니다. 실습 결과물 품질과 참여도를 기반으로 평가합니다.',
            rules: '결석 1회: 최대 B+ / 결석 2회: 최대 C+ / 결석 3회 이상: F 처리'
        },
    }
    const gradeNotice = gradeNotices[gradesCourse?.name || ''] || {
        text: '모든 학생의 평가 및 기말 프로젝트 제출이 완료된 후 학생별 성적을 최종 확정하세요.',
        rules: '결석 1회: 최대 B+ / 결석 2회: 최대 C+ / 결석 3회 이상: F 처리'
    }

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
    ]

    // Determine if the current tab should show the course filter
    const showCourseFilter = ['students', 'grades', 'archive'].includes(tab)

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

                <div>
                    {/* Main Tab Navigation */}
                    <div className="flex gap-2 flex-wrap mb-4">
                        {tabs.map(t => (
                            <Link
                                key={t.id}
                                href={`/admin?tab=${t.id}${selectedCourseId ? `&course=${selectedCourseId}` : ''}`}
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

                    {/* Sub Navigation: Course Selection */}
                    {showCourseFilter && (
                        <div className="flex gap-2 flex-wrap items-center bg-white dark:bg-neutral-900 p-2 rounded-2xl shadow-sm border border-neutral-200 dark:border-neutral-800">
                            <span className="text-xs font-bold text-neutral-400 ml-2 mr-1">과목 필터:</span>

                            {/* '전체' and '미지정' pills — only on non-grades tabs */}
                            {tab !== 'grades' && (
                                <Link
                                    href={`/admin?tab=${tab}&course=all`}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${selectedCourseId === 'all'
                                        ? 'bg-indigo-600 text-white border border-indigo-600 shadow-sm'
                                        : 'bg-neutral-50 text-neutral-500 hover:bg-neutral-100 border border-transparent dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700'
                                        }`}
                                >
                                    전체 ({allUsers.filter(u => u.course_id).length})
                                </Link>
                            )}

                            {/* Real course pills — always shown */}
                            {allCourses.map(c => {
                                const isActive = tab === 'grades'
                                    ? gradesCourseId === c.id
                                    : selectedCourseId === c.id
                                return (
                                    <Link
                                        key={c.id}
                                        href={`/admin?tab=${tab}&course=${c.id}`}
                                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${isActive
                                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-800/50'
                                            : 'bg-neutral-50 text-neutral-500 hover:bg-neutral-100 border border-transparent dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700'
                                            }`}
                                    >
                                        {c.name}
                                    </Link>
                                )
                            })}


                        </div>
                    )}
                </div>

                {/* ===== Tab: 학생 관리 ===== */}
                {tab === 'students' && (
                    <div className="bg-white dark:bg-neutral-900 rounded-3xl p-8 shadow-sm border border-neutral-200/60 dark:border-neutral-800">

                        {/* Attendance Toggle for the currently selected class (if it is a recording class) */}
                        {selectedCourse && selectedCourse.name.includes('레코딩실습') && (
                            <AttendanceToggle
                                courseId={selectedCourse.id}
                                courseName={selectedCourse.name}
                                initialState={selectedCourse.is_attendance_open}
                            />
                        )}

                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className="text-xl font-bold text-neutral-900 dark:text-white">
                                    {selectedCourse ? `[${selectedCourse.name}] 수강생 목록` : '전체 학생 목록'}
                                </h2>
                                <p className="text-sm text-neutral-500 mt-1">이 과정에 소속된 총 {courseUsers.length}명 대기/수강 중</p>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-neutral-200 dark:border-neutral-800">
                                        <th className="p-3 text-sm font-semibold text-neutral-500">학생 정보</th>
                                        <th className="p-3 text-sm font-semibold text-neutral-500">소속 과목 변경</th>
                                        <th className="p-3 text-sm font-semibold text-neutral-500">수강과목</th>
                                        <th className="p-3 text-sm font-semibold text-neutral-500">가입일</th>
                                        <th className="p-3 text-sm font-semibold text-neutral-500">관리</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <AdminStudentList
                                        key={selectedCourseId}
                                        students={courseUsers}
                                        courses={allCourses}
                                        courseName={selectedCourse?.name}
                                    />
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
                                <h4 className="font-bold text-orange-900 dark:text-orange-300 mb-1">
                                    [{gradesCourse?.name || '과목 미지정'}] 성적 산출 안내
                                </h4>
                                <p className="text-sm text-orange-700 dark:text-orange-400/80">
                                    {gradeNotice.text}<br />
                                    {gradeNotice.rules}
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
                            href={`/archive${selectedCourseId && selectedCourseId !== 'all' && selectedCourseId !== 'unassigned' ? `?course=${selectedCourseId}` : ''}`}
                            className="inline-flex items-center gap-3 px-6 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition"
                        >
                            📁 아카이브 전체 보기 및 과목 선택
                        </Link>
                    </div>
                )}

            </div>
        </div >
    )
}
