import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BookOpen, BarChart3 } from 'lucide-react'
import AttendanceToggle from './AttendanceToggle'
import AdminStudentList from './AdminStudentList'
import GradeNoticeEditor from './GradeNoticeEditor'
import ArchiveClientPage from '../archive/ArchiveClientPage'
import AdminCourseDashboardNotices from './AdminCourseDashboardNotices'
import AdminPrivateLessonToggle from './AdminPrivateLessonToggle'
import AdminLibraryManager from './AdminLibraryManager'
import AiSettingsPanel from './AiSettingsPanel'
import CourseAiContextEditor from './CourseAiContextEditor'

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
        .select('id, name, is_private_lesson, is_attendance_open, notice_weekly, notice_assignment, notice_final, notice_midterm, notice_checkpoint')
        .order('name')

    const allCourses = (allCoursesRaw || []) as any[]
    const recordingClass = allCourses.find(c => c.name === '레코딩실습1')

    // Determine currently selected course (default to 'all' if none specified)
    const selectedCourseId = courseIdParam || 'all'

    // Fetch users
    const { data: allUsersRaw } = await supabase
        .from('users')
        .select('id, email, role, created_at, is_approved, department, name, student_id, course_id, private_lesson_id, approval_request_count, last_requested_at, course_role, is_auditor, private_lesson_ended, profile_image_url')
        .eq('role', 'user')
        .order('created_at', { ascending: false })

    const allUsers = (allUsersRaw || []) as any[]

    // Collect all individual student sub-course IDs (referenced in private_lesson_id)
    const studentSubCourseIds = new Set(allUsers.map((u: any) => u.private_lesson_id).filter(Boolean))
    // 개인 레슨 sub-course(문재모의 레슨, 박성현의 레슨 등)는 탭에서 숨김
    // 우산 코스(사운드엔지니어 개인레슨)는 어떤 학생의 private_lesson_id에도 없으므로 유지됨
    const tabCourses = allCourses.filter((c: any) => !studentSubCourseIds.has(c.id))

    let selectedCourse: any = null
    let courseUsers: any[] = []

    if (selectedCourseId === 'all') {
        selectedCourse = { id: 'all', name: '전체' }
        courseUsers = allUsers.filter(u => (u.course_id || u.private_lesson_id) && !u.private_lesson_ended)
    } else if (selectedCourseId === 'unassigned') {
        selectedCourse = { id: 'unassigned', name: '과목 미지정' }
        courseUsers = allUsers.filter(u => !u.course_id && !u.private_lesson_id)
    } else {
        // allCourses에서 조회 (서브코스도 포함)
        selectedCourse = allCourses.find(c => c.id === selectedCourseId)
        if (selectedCourse?.is_private_lesson) {
            // Umbrella private lesson course: show all students with any private_lesson_id
            // (each student has their own sub-course, not the umbrella ID itself)
            courseUsers = allUsers.filter(u => u.private_lesson_id && !u.private_lesson_ended)
        } else {
            courseUsers = allUsers.filter(u =>
                (u.course_id === selectedCourseId || u.private_lesson_id === selectedCourseId)
                && !u.private_lesson_ended
            )
        }
    }

    // For the grades tab, we always need a real course ID (not 'all' or 'unassigned')
    const gradesCourseId = (selectedCourseId && selectedCourseId !== 'all' && selectedCourseId !== 'unassigned')
        ? selectedCourseId
        : (allCourses.length > 0 ? allCourses[0].id : null)
    const gradesCourse = allCourses.find(c => c.id === gradesCourseId)

    // Fetch evaluations data for grades tab (always uses a real course ID)
    let evaluations = []
    let validEvaluations = [] // For statistics (excludes auditors)
    if (tab === 'grades' && gradesCourseId) {
        const { data: evaluationsRaw, error: evaluationsError } = await supabase
            .from('evaluations')
            .select('*, users!inner(is_auditor)')
            .eq('course_id', gradesCourseId)
            .order('total_score', { ascending: false })

        if (evaluationsError) console.error('[ADMIN] Evaluations error:', evaluationsError)

        // Shape the data: remove the nested users object but keep the is_auditor flag for UI rendering
        evaluations = (evaluationsRaw || []).map((ev: any) => ({
            ...ev,
            is_auditor: ev.users?.is_auditor || false
        }))

        // Filter out auditors for statistical calculations
        validEvaluations = evaluations.filter(ev => !ev.is_auditor)
    }

    // --- Statistics Calculations (excluding auditors) ---
    const totalValidStudents = validEvaluations.length
    const avgScore = totalValidStudents > 0
        ? (validEvaluations.reduce((sum, ev) => sum + (Number(ev.total_score) || 0), 0) / totalValidStudents).toFixed(1)
        : 0

    const gradeCounts = { A: 0, B: 0, C: 0, F: 0 }
    validEvaluations.forEach(ev => {
        const grade = ev.final_grade?.charAt(0) // Extract A, B, C, F
        if (grade && gradeCounts[grade as keyof typeof gradeCounts] !== undefined) {
            gradeCounts[grade as keyof typeof gradeCounts]++
        }
    })


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
        { id: 'ai_settings', label: 'AI 설정', icon: '🤖' },
    ]

    // Determine if the current tab should show the course filter
    const showCourseFilter = ['students', 'grades', 'archive'].includes(tab)

    const currentViewCourseId = tab === 'grades' 
        ? gradesCourseId 
        : (selectedCourseId !== 'all' && selectedCourseId !== 'unassigned' ? selectedCourseId : null);

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
                    <div className="flex flex-col items-end gap-3">
                        <Link href="/" className="text-sm font-semibold text-blue-600 hover:underline w-full text-right">
                            ← 메인으로 돌아가기
                        </Link>
                        <Link
                            href="/admin/homework-review"
                            target="_blank"
                            className="inline-flex items-center justify-center gap-2 bg-amber-500 text-white px-4 py-2 w-full rounded-xl font-bold text-sm hover:bg-amber-600 hover:scale-105 active:scale-95 transition-all shadow-sm whitespace-nowrap"
                        >
                            <span>📋 과제 리뷰</span>
                        </Link>
                        {currentViewCourseId && (
                            <Link 
                                href={`/?course=${currentViewCourseId}`}
                                target="_blank"
                                className="inline-flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2 w-full rounded-xl font-bold text-sm hover:bg-indigo-700 hover:scale-105 active:scale-95 transition-all shadow-sm whitespace-nowrap"
                            >
                                <span>👀 학생 페이지 미리보기</span>
                            </Link>
                        )}
                    </div>
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

                            {/* Real course pills — exclude individual student sub-courses */}
                            {tabCourses.map(c => {
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

                        {/* AI 수업 맥락 설정 - 수업이 선택된 경우 */}
                        {selectedCourse && selectedCourse.id !== 'all' && selectedCourse.id !== 'unassigned' && (
                            <CourseAiContextEditor
                                courseId={selectedCourse.id}
                                courseName={selectedCourse.name}
                            />
                        )}

                        {/* Attendance Toggle for the currently selected class (if it is a recording class) */}
                        {selectedCourse && selectedCourse.name.includes('레코딩실습') && (
                            <AttendanceToggle
                                courseId={selectedCourse.id}
                                courseName={selectedCourse.name}
                                initialState={selectedCourse.is_attendance_open}
                            />
                        )}

                        {/* Private Lesson: Library Manager only (toggle is redundant — course is already is_private_lesson) */}
                        {selectedCourse && selectedCourse.is_private_lesson && (
                            <AdminLibraryManager courseId={selectedCourse.id} />
                        )}

                        {/* Admin Notice Config for the selected class */}
                        {selectedCourse && selectedCourse.id !== 'all' && selectedCourse.id !== 'unassigned' && (
                            <AdminCourseDashboardNotices
                                courseId={selectedCourse.id}
                                courseName={selectedCourse.name}
                                initialWeekly={selectedCourse.notice_weekly || ''}
                                initialAssignment={selectedCourse.notice_assignment || ''}
                                initialFinal={selectedCourse.notice_final || ''}
                                initialMidterm={selectedCourse.notice_midterm || ''}
                                initialCheckpoint={selectedCourse.notice_checkpoint || ''}
                            />
                        )}

                        {/* 탭 선택 여부에 따라 학생 목록 or 안내 표시 */}
                        {!courseIdParam ? (
                            <div className="flex flex-col items-center justify-center py-16 text-neutral-400 dark:text-neutral-600">
                                <span className="text-4xl mb-3">👈</span>
                                <p className="text-sm font-medium">위에서 클래스 또는 개인레슨을 선택하면 학생 목록이 표시됩니다.</p>
                            </div>
                        ) : (
                            <>
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
                                                isPrivateLesson={selectedCourse?.is_private_lesson}
                                            />
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* ===== Tab: 성적 산출 및 관리 ===== */}
                {tab === 'grades' && (
                    <div className="space-y-6">
                        {gradesCourse && (
                            <GradeNoticeEditor
                                courseId={gradesCourse.id}
                                courseName={gradesCourse.name}
                            />
                        )}

                        <div className="bg-white dark:bg-neutral-900 rounded-3xl p-8 shadow-sm border border-neutral-200/60 dark:border-neutral-800">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-bold text-neutral-900 dark:text-white">학생별 성적 현황</h2>
                                <BarChart3 className="w-5 h-5 text-neutral-400" />
                            </div>

                            {evaluations && evaluations.length > 0 ? (
                                <div className="space-y-6">
                                    {/* Stats Widget (Excluding Auditors) */}
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 bg-indigo-50/50 dark:bg-indigo-900/10 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-800/30">
                                        <div className="bg-white dark:bg-neutral-800 p-4 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-700">
                                            <p className="text-xs text-neutral-500 font-medium mb-1">정규 평균 총점</p>
                                            <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{avgScore}<span className="text-sm text-neutral-400 font-normal ml-1">점</span></p>
                                        </div>
                                        <div className="bg-white dark:bg-neutral-800 p-4 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-700">
                                            <p className="text-xs text-neutral-500 font-medium mb-1">A 학점</p>
                                            <p className="text-2xl font-bold text-green-600 dark:text-green-500">{gradeCounts.A}<span className="text-sm text-neutral-400 font-normal ml-1">명</span></p>
                                        </div>
                                        <div className="bg-white dark:bg-neutral-800 p-4 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-700">
                                            <p className="text-xs text-neutral-500 font-medium mb-1">B 학점</p>
                                            <p className="text-2xl font-bold text-blue-600 dark:text-blue-500">{gradeCounts.B}<span className="text-sm text-neutral-400 font-normal ml-1">명</span></p>
                                        </div>
                                        <div className="bg-white dark:bg-neutral-800 p-4 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-700">
                                            <p className="text-xs text-neutral-500 font-medium mb-1">C 학점</p>
                                            <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-500">{gradeCounts.C}<span className="text-sm text-neutral-400 font-normal ml-1">명</span></p>
                                        </div>
                                        <div className="bg-white dark:bg-neutral-800 p-4 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-700">
                                            <p className="text-xs text-neutral-500 font-medium mb-1">정규 수강 인원</p>
                                            <p className="text-2xl font-bold text-neutral-800 dark:text-neutral-200">{totalValidStudents}<span className="text-sm text-neutral-400 font-normal ml-1">명</span></p>
                                        </div>
                                    </div>

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
                                                {evaluations.map((ev: any) => (
                                                    <tr key={ev.user_id} className={`border-b border-neutral-100 dark:border-neutral-800/50 hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition ${ev.is_auditor ? 'opacity-50 bg-neutral-50/50' : ''}`}>
                                                        <td className="p-3">
                                                            <span className="font-mono text-xs text-neutral-500">{ev.user_id.slice(0, 8)}…</span>
                                                            {ev.is_auditor && <span className="ml-2 text-[10px] font-bold bg-neutral-200 text-neutral-600 px-1.5 py-0.5 rounded">청강</span>}
                                                        </td>
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
                    selectedCourse?.is_private_lesson ? (
                        // Private lesson: show per-student archive list
                        <div className="bg-white dark:bg-neutral-900 rounded-3xl p-8 shadow-sm border border-neutral-200/60 dark:border-neutral-800">
                            <div className="mb-6">
                                <h2 className="text-xl font-bold text-neutral-900 dark:text-white">레슨생 개별 자료 관리</h2>
                                <p className="text-sm text-neutral-500 mt-1">각 레슨생의 개인 아카이브를 별도로 관리합니다. 공용 자료가 아닌 개별 자료입니다.</p>
                            </div>
                            {courseUsers.length === 0 ? (
                                <div className="py-12 text-center text-neutral-400">
                                    <BookOpen className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
                                    <p className="font-medium">등록된 레슨생이 없습니다.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {courseUsers.map((student: any) => (
                                        <div key={student.id} className="flex items-center justify-between p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 hover:border-emerald-300 dark:hover:border-emerald-700 transition bg-neutral-50 dark:bg-neutral-950/50">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-700 dark:text-emerald-400 font-bold text-sm">
                                                    {(student.name || student.email || '?').charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-neutral-900 dark:text-white text-sm">{student.name || '이름 없음'}</p>
                                                    <p className="text-xs text-neutral-500">{student.email}</p>
                                                </div>
                                            </div>
                                            {student.private_lesson_id ? (
                                                <Link
                                                    href={`/admin?tab=archive&course=${student.private_lesson_id}`}
                                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition shrink-0"
                                                >
                                                    <BookOpen className="w-3.5 h-3.5" />
                                                    레슨 아카이브
                                                </Link>
                                            ) : (
                                                <span className="text-xs text-neutral-400 italic">아카이브 없음</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <ArchiveClientPage
                            isAdmin={true}
                            courseId={selectedCourseId !== 'all' && selectedCourseId !== 'unassigned' ? selectedCourseId : null}
                            courseName={selectedCourse?.name || '전체 과목'}
                            courses={tabCourses.map(c => ({ id: c.id, name: c.name }))}
                        />
                    )
                )}

                {/* ===== Tab: AI 설정 ===== */}
                {tab === 'ai_settings' && (
                    <div className="bg-white dark:bg-neutral-900 rounded-3xl p-8 shadow-sm border border-neutral-200/60 dark:border-neutral-800">
                        <AiSettingsPanel />
                    </div>
                )}

            </div>
        </div >
    )
}
