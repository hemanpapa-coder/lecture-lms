import { createClient } from '@/utils/supabase/server'
import LogoutButton from './components/LogoutButton'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ExternalLink, CheckCircle2, Circle, Upload, BookOpen, MessagesSquare, Users, BarChart3, ChevronRight, Settings, FlaskConical, Clock, Bug, Archive } from 'lucide-react'
import RecordingStudentDashboard from './recording-class/RecordingStudentDashboard'
import ApprovalWatcher from '@/components/ApprovalWatcher'
import RecycleBin from './admin/RecycleBin'
import QRDisplay from './admin/QRDisplay'
import PrivacyManager from './admin/PrivacyManager'
import CourseEndButton from './admin/CourseEndButton'

// --- STUDENT DASHBOARD COMPONENT ---
async function StudentDashboard({ user, isRealAdmin, viewMode, courseName }: { user: any, isRealAdmin: boolean, viewMode: string, courseName: string }) {
  const supabase = await createClient()

  // Fetch student info including approval status
  const { data: studentInfo } = await supabase
    .from('users')
    .select('is_approved, name, department, student_id, approval_request_count')
    .eq('id', user.id)
    .single()

  const isApproved = studentInfo?.is_approved || false
  const requestCount = studentInfo?.approval_request_count || 1

  if (!isApproved && !isRealAdmin) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-8">
        <ApprovalWatcher userId={user.id} />
        <div className="max-w-md w-full bg-neutral-900 rounded-3xl p-10 border border-neutral-800 shadow-2xl text-center space-y-6">
          <div className="w-20 h-20 bg-amber-500/20 rounded-2xl border border-amber-500/30 flex items-center justify-center mx-auto">
            <Clock className="w-10 h-10 text-amber-500 animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">수강 승인 대기 중</h1>
            <p className="text-sm text-neutral-400 mt-3 leading-relaxed">
              성공적으로 정보가 입력되었습니다.<br />
              교수자가 수강생 명단을 확인하고 인증해 주어야<br />
              정상적으로 LMS 이용이 가능합니다.
            </p>
          </div>
          <div className="bg-neutral-800/50 rounded-2xl p-4 text-left border border-neutral-700/50">
            <div className="text-[10px] font-black text-neutral-500 uppercase tracking-widest mb-2 font-mono">My Info Summary</div>
            <div className="text-sm font-bold text-white">{studentInfo?.name || '신입생'}</div>
            <div className="text-xs text-neutral-400 mt-1">{studentInfo?.department} / {studentInfo?.student_id || '학번 미입력'}</div>
          </div>

          {/* Re-request Button */}
          <div className="pt-2 border-t border-neutral-800">
            <LogoutButton className="w-full py-3 rounded-xl bg-neutral-800 text-white font-bold text-sm hover:bg-neutral-700 transition mb-3" />

            <form action={async () => {
              'use server';
              const supabase = await createClient()
              await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/student/request-approval`, {
                method: 'POST',
                headers: { cookie: require('next/headers').cookies().toString() }
              })
              require('next/navigation').redirect('/')
            }}>
              <button className="w-full py-3 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 font-bold text-sm hover:bg-indigo-600/40 hover:text-white transition flex items-center justify-center gap-2">
                과목 승인 다시 요청하기
                <span className="bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded-full text-xs shrink-0">{requestCount}회 요청됨</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  // Fetch Assignment count (Mocking 15 weeks total)
  let submittedCount = 0
  const totalWeeks = 15

  const { data: assignments } = await supabase
    .from('assignments')
    .select('id')
    .eq('user_id', user.id)

  if (assignments) {
    submittedCount = assignments.length
  }

  const assignmentProgress = Math.min(100, Math.round((submittedCount / totalWeeks) * 100))

  // Fetch Final Project Status (Mock from evaluations table)
  let hasFinalProject = false
  const { data: evalData } = await supabase
    .from('evaluations')
    .select('has_final_project')
    .eq('user_id', user.id)
    .single()

  if (evalData) {
    hasFinalProject = evalData.has_final_project
  }

  const finalSteps = [
    { name: '최종 음원 믹스', completed: hasFinalProject },
    { name: '앨범 아트워크 디자인', completed: false },
    { name: '크레딧 리스트 작성', completed: false },
    { name: '프로젝트 소개글 작성', completed: false },
  ]
  const completedFinalSteps = finalSteps.filter(s => s.completed).length
  const finalProgress = (completedFinalSteps / finalSteps.length) * 100

  // Mock Midterm & Checkpoint metrics
  const midtermProgress = 0;
  const checkpointProgress = Math.min(100, Math.round((submittedCount / 3) * 100)); // Assuming 3 checkpoints

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-8">
      <div className="mx-auto max-w-6xl space-y-8">

        {/* Header */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between rounded-3xl bg-white p-8 shadow-sm dark:bg-neutral-900 border border-neutral-200/60 dark:border-neutral-800">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white">학습 대시보드</h1>
            <p className="text-sm text-neutral-500 mt-2 font-medium">
              환영합니다, {user.email} 님
            </p>
          </div>
          <div className="flex items-center gap-4 mt-4 sm:mt-0">
            {isRealAdmin && (
              <div className="flex items-center bg-neutral-100 p-1 rounded-xl dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                <Link
                  href="/?view=admin"
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${viewMode !== 'student' ? 'bg-white shadow-sm text-indigo-700 dark:bg-neutral-700 dark:text-indigo-300' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}`}
                >
                  Admin View
                </Link>
                <Link
                  href="/?view=student"
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${viewMode === 'student' ? 'bg-white shadow-sm text-neutral-900 dark:bg-neutral-700 dark:text-white' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}`}
                >
                  Student View
                </Link>
              </div>
            )}
            <LogoutButton className="rounded-xl bg-neutral-100 px-4 py-2.5 text-sm font-bold text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 transition" />
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Progress & Core Actions */}
          <div className="lg:col-span-2 space-y-8">
            {/* Progress Trackers */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Assignment Progress */}
              <div className="rounded-3xl bg-white p-8 shadow-sm border border-neutral-200/60 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex justify-between items-end mb-4">
                  <h2 className="text-lg font-bold">주차별 과제 제출</h2>
                  <span className="text-2xl font-black text-blue-600">{assignmentProgress}%</span>
                </div>
                <div className="w-full bg-neutral-100 rounded-full h-3 dark:bg-neutral-800 mb-2">
                  <div className="bg-blue-600 h-3 rounded-full transition-all duration-500" style={{ width: `${assignmentProgress}%` }}></div>
                </div>
                <p className="text-xs font-medium text-neutral-500 font-mono text-right">{submittedCount} / {totalWeeks} 완료</p>
              </div>

              {/* Final Project Progress */}
              <div className="rounded-3xl bg-white p-8 shadow-sm border border-neutral-200/60 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex justify-between items-end mb-4">
                  <h2 className="text-lg font-bold">기말 프로젝트 상태</h2>
                  <span className="text-2xl font-black text-purple-600">{finalProgress}%</span>
                </div>
                <div className="w-full bg-neutral-100 rounded-full h-3 dark:bg-neutral-800 mb-4">
                  <div className="bg-purple-600 h-3 rounded-full transition-all duration-500" style={{ width: `${finalProgress}%` }}></div>
                </div>
                <div className="space-y-2">
                  {finalSteps.map((step, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      {step.completed ? (
                        <CheckCircle2 className="w-4 h-4 text-purple-600" />
                      ) : (
                        <Circle className="w-4 h-4 text-neutral-300 dark:text-neutral-700" />
                      )}
                      <span className={step.completed ? 'text-neutral-900 font-medium dark:text-neutral-200' : 'text-neutral-500 dark:text-neutral-500'}>
                        {step.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Midterm Evaluation */}
              <div className="rounded-3xl bg-white p-8 shadow-sm border border-neutral-200/60 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex justify-between items-end mb-4">
                  <h2 className="text-lg font-bold">중간 평가 현황</h2>
                  <span className="text-2xl font-black text-emerald-600">{midtermProgress}%</span>
                </div>
                <div className="w-full bg-neutral-100 rounded-full h-3 dark:bg-neutral-800 mb-2">
                  <div className="bg-emerald-600 h-3 rounded-full transition-all duration-500" style={{ width: `${midtermProgress}%` }}></div>
                </div>
                <p className="text-xs font-medium text-neutral-500 font-mono text-right">미응시</p>
              </div>

              {/* Checkpoint Assignments */}
              <div className="rounded-3xl bg-white p-8 shadow-sm border border-neutral-200/60 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex justify-between items-end mb-4">
                  <h2 className="text-lg font-bold">수시 과제 현황</h2>
                  <span className="text-2xl font-black text-orange-600">{checkpointProgress}%</span>
                </div>
                <div className="w-full bg-neutral-100 rounded-full h-3 dark:bg-neutral-800 mb-2">
                  <div className="bg-orange-600 h-3 rounded-full transition-all duration-500" style={{ width: `${checkpointProgress}%` }}></div>
                </div>
                <p className="text-xs font-medium text-neutral-500 font-mono text-right">0 / 3 완료</p>
              </div>
            </div>

            {/* Quick Actions Grid */}
            <div>
              <h3 className="text-lg font-bold mb-4 px-2">LMS 메뉴</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Link href={`/workspace/${user.id}`} className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-white p-6 shadow-sm border border-neutral-200/60 transition hover:border-blue-500 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-blue-500 group">
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition">
                    <Upload className="w-6 h-6" />
                  </div>
                  <span className="text-sm font-bold">내 학습 공간</span>
                </Link>
                <Link href="/peer-review" className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-white p-6 shadow-sm border border-neutral-200/60 transition hover:border-purple-500 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-purple-500 group">
                  <div className="p-3 bg-purple-50 text-purple-600 rounded-xl group-hover:bg-purple-600 group-hover:text-white transition">
                    <Users className="w-6 h-6" />
                  </div>
                  <span className="text-sm font-bold">상호 평가</span>
                </Link>
                <Link href="/archive" className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-white p-6 shadow-sm border border-neutral-200/60 transition hover:border-green-500 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-green-500 group">
                  <div className="p-3 bg-green-50 text-green-600 rounded-xl group-hover:bg-green-600 group-hover:text-white transition">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <span className="text-sm font-bold">공용 아카이브</span>
                </Link>
                <Link href="/board" className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-white p-6 shadow-sm border border-neutral-200/60 transition hover:border-orange-500 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-orange-500 group">
                  <div className="p-3 bg-orange-50 text-orange-600 rounded-xl group-hover:bg-orange-600 group-hover:text-white transition">
                    <MessagesSquare className="w-6 h-6" />
                  </div>
                  <span className="text-sm font-bold">익명 Q&A</span>
                </Link>
                {courseName === '오디오테크놀러지' && (
                  <Link href="/research" className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-white p-6 shadow-sm border border-neutral-200/60 transition hover:border-pink-500 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-pink-500 group">
                    <div className="p-3 bg-pink-50 text-pink-600 rounded-xl group-hover:bg-pink-600 group-hover:text-white transition">
                      <FlaskConical className="w-6 h-6" />
                    </div>
                    <span className="text-sm font-bold">연구 레포지터리</span>
                  </Link>
                )}
              </div>
            </div>

            {/* Proof Doc Upload Link */}
            <div className="rounded-2xl bg-white p-6 shadow-sm border border-neutral-200/60 dark:border-neutral-800 dark:bg-neutral-900 flex justify-between items-center">
              <div>
                <h3 className="font-bold">결성 증빙서류제출</h3>
                <p className="text-sm text-neutral-500">진단서 등 결석 사유 증명 문서를 업로드합니다.</p>
              </div>
              <Link href="/proof-docs" className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 transition">
                제출하기
              </Link>
            </div>
          </div>



        </div>
      </div>
    </div>
  )
}

// --- ADMIN DASHBOARD COMPONENT ---
async function AdminDashboard({ user, isRealAdmin, viewMode, courseId, courseName }: { user: any, isRealAdmin: boolean, viewMode: string, courseId: string | null, courseName: string }) {
  const supabase = await createClient()

  // Fetch all users in this course (or all if no course filter)
  let usersQuery = supabase.from('users').select('id, email, role, created_at, course_id').eq('role', 'user').order('created_at', { ascending: false })
  if (courseId) usersQuery = usersQuery.eq('course_id', courseId)
  const { data: allUsers } = await usersQuery

  // Fetch all courses for the tab switcher (including end-of-semester status)
  const { data: allCourses } = await supabase.from('courses').select('id, name, is_ended, ended_at, late_submission_allowed').order('name')

  // Fetch all assignments to calculate aggregate progress
  const { data: allAssignments } = await supabase
    .from('assignments')
    .select('user_id, id')

  // Calculate stats
  const totalWeeks = 15
  const students = allUsers || []
  const assignments = allAssignments || []

  const stats = students.map((s) => {
    const sAssignments = assignments.filter((a) => a.user_id === s.id)
    const progress = Math.min(100, Math.round((sAssignments.length / totalWeeks) * 100))
    return { ...s, assignmentCount: sAssignments.length, progress }
  })

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-8 font-sans">
      <div className="mx-auto max-w-7xl space-y-8">

        {/* Header - Professor Control Tower */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between rounded-3xl bg-slate-900 p-8 shadow-xl dark:bg-black/40 border border-slate-800">
          <div className="flex items-center gap-6">
            <div className="p-4 bg-indigo-500/20 rounded-2xl border border-indigo-500/30">
              <Settings className="w-8 h-8 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="bg-indigo-500/20 text-indigo-300 px-2.5 py-1 rounded-md text-xs font-black tracking-widest uppercase">Professor Control Tower</span>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">교수용 종합 관리 시스템</h1>
              <p className="text-sm font-medium text-slate-400">
                수업 전체 통계, 학생 관리, 과제 평가 등 모든 LMS 시스템을 통제합니다.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 mt-6 sm:mt-0">
            <div className="flex items-center bg-black/30 p-1.5 rounded-xl border border-white/5">
              <Link
                href={`/?view=admin${courseId ? `&course=${courseId}` : ''}`}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition ${viewMode !== 'student' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                Admin View
              </Link>
              <Link
                href={`/?view=student${courseId ? `&course=${courseId}` : ''}`}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition ${viewMode === 'student' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                Student View
              </Link>
            </div>
            <LogoutButton className="rounded-xl bg-white/10 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/20 transition" />
          </div>
        </header>

        {/* Course Selector Tabs for Admin */}
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap items-center">
            {allCourses?.map((c: any) => (
              <div key={c.id} className="flex items-center gap-1.5">
                <Link
                  href={`/?view=${viewMode}&course=${c.id}`}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all border ${courseId === c.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'bg-white/10 text-slate-400 border-white/10 hover:bg-white/20 hover:text-white'}`}
                >
                  {c.name}
                  {c.is_ended && (
                    <span className="px-1.5 py-0.5 bg-slate-600/80 text-slate-200 text-[10px] font-black rounded-md">종강</span>
                  )}
                </Link>
                {/* End of semester control — show only for currently selected course */}
                {courseId === c.id && (
                  <CourseEndButton
                    courseId={c.id}
                    courseName={c.name}
                    isEnded={c.is_ended ?? false}
                    lateSubmissionAllowed={c.late_submission_allowed ?? true}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Central Prominent Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link href="/admin" className="group relative overflow-hidden rounded-3xl bg-white p-8 shadow-sm border border-slate-200 hover:border-indigo-300 hover:shadow-xl transition-all dark:bg-slate-900 dark:border-slate-800 dark:hover:border-indigo-500">
            <div className="absolute -right-6 -top-6 text-indigo-50 dark:text-indigo-900/10 group-hover:scale-110 transition-transform duration-500">
              <Users className="w-40 h-40" />
            </div>
            <div className="relative z-10">
              <div className="mb-6 inline-flex p-4 rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                <Users className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">학생 통합 관리</h2>
              <p className="text-slate-500 text-sm font-medium leading-relaxed mb-6">수강생 명단 확인, 학생별 워크스페이스 열람 및 권한 상세 설정.</p>
              <span className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 dark:text-indigo-400">
                들어가기 <ChevronRight className="w-4 h-4" />
              </span>
            </div>
          </Link>

          <Link href="/admin?tab=grades" className="group relative overflow-hidden rounded-3xl bg-white p-8 shadow-sm border border-slate-200 hover:border-blue-300 hover:shadow-xl transition-all dark:bg-slate-900 dark:border-slate-800 dark:hover:border-blue-500">
            <div className="absolute -right-6 -top-6 text-blue-50 dark:text-blue-900/10 group-hover:scale-110 transition-transform duration-500">
              <BarChart3 className="w-40 h-40" />
            </div>
            <div className="relative z-10">
              <div className="mb-6 inline-flex p-4 rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                <BarChart3 className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">성적 산출 및 관리</h2>
              <p className="text-slate-500 text-sm font-medium leading-relaxed mb-6">제출된 과제, 출석 상태 기반 최종 성적 자동 산출 및 확정.</p>
              <span className="inline-flex items-center gap-2 text-sm font-bold text-blue-600 dark:text-blue-400">
                들어가기 <ChevronRight className="w-4 h-4" />
              </span>
            </div>
          </Link>

          <Link href={courseId ? `/archive?course=${courseId}` : '/archive'} className="group relative overflow-hidden rounded-3xl bg-white p-8 shadow-sm border border-slate-200 hover:border-emerald-300 hover:shadow-xl transition-all dark:bg-slate-900 dark:border-slate-800 dark:hover:border-emerald-500">
            <div className="absolute -right-6 -top-6 text-emerald-50 dark:text-emerald-900/10 group-hover:scale-110 transition-transform duration-500">
              <BookOpen className="w-40 h-40" />
            </div>
            <div className="relative z-10">
              <div className="mb-6 inline-flex p-4 rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                <BookOpen className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">공용 아카이브 관리</h2>
              <p className="text-slate-500 text-sm font-medium leading-relaxed mb-6">강의 자료, 레퍼런스 음원 등 전체 학생 전용 공유 자료 업로드.</p>
              <span className="inline-flex items-center gap-2 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                업로드 <ChevronRight className="w-4 h-4" />
              </span>
            </div>
          </Link>

          {(courseName === '오디오테크놀러지' || !courseId) && (
            <Link href="/research" className="group relative overflow-hidden rounded-3xl bg-white p-8 shadow-sm border border-slate-200 hover:border-pink-300 hover:shadow-xl transition-all dark:bg-slate-900 dark:border-slate-800 dark:hover:border-pink-500">
              <div className="absolute -right-6 -top-6 text-pink-50 dark:text-pink-900/10 group-hover:scale-110 transition-transform duration-500">
                <FlaskConical className="w-40 h-40" />
              </div>
              <div className="relative z-10">
                <div className="mb-6 inline-flex p-4 rounded-2xl bg-pink-50 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400">
                  <FlaskConical className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">연구 자료 레포지터리</h2>
                <p className="text-slate-500 text-sm font-medium leading-relaxed mb-6">오디오테크놀러지 과목 톡화된 연구 자료 업로드 및 게시를 관리합니다.</p>
                <span className="inline-flex items-center gap-2 text-sm font-bold text-pink-600 dark:text-pink-400">
                  게시 관리 <ChevronRight className="w-4 h-4" />
                </span>
              </div>
            </Link>
          )}

          {/* Q&A 관리 카드 */}
          <Link href="/admin/qna" className="group relative overflow-hidden rounded-3xl bg-white p-8 shadow-sm border border-slate-200 hover:border-emerald-300 hover:shadow-xl transition-all dark:bg-slate-900 dark:border-slate-800 dark:hover:border-emerald-500">
            <div className="absolute -right-6 -top-6 text-emerald-50 dark:text-emerald-900/10 group-hover:scale-110 transition-transform duration-500">
              <MessagesSquare className="w-40 h-40" />
            </div>
            <div className="relative z-10">
              <div className="mb-6 inline-flex p-4 rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                <MessagesSquare className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">익명 Q&A 관리</h2>
              <p className="text-slate-500 text-sm font-medium leading-relaxed mb-6">학생 익명 질문 조회, 공지 설정, 개인/공개 답장 관리.</p>
              <span className="inline-flex items-center gap-2 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                관리하기 <ChevronRight className="w-4 h-4" />
              </span>
            </div>
          </Link>

          {/* 에러 리포트 관리 카드 */}
          <Link href="/admin/error-reports" className="group relative overflow-hidden rounded-3xl bg-white p-8 shadow-sm border border-slate-200 hover:border-red-300 hover:shadow-xl transition-all dark:bg-slate-900 dark:border-slate-800 dark:hover:border-red-500">
            <div className="absolute -right-6 -top-6 text-red-50 dark:text-red-900/10 group-hover:scale-110 transition-transform duration-500">
              <Bug className="w-40 h-40" />
            </div>
            <div className="relative z-10">
              <div className="mb-6 inline-flex p-4 rounded-2xl bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400">
                <Bug className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">에러 리포트</h2>
              <p className="text-slate-500 text-sm font-medium leading-relaxed mb-6">학생이 신고한 버그 확인 · Antigravity로 즉시 수정.</p>
              <span className="inline-flex items-center gap-2 text-sm font-bold text-red-500 dark:text-red-400">
                확인하기 <ChevronRight className="w-4 h-4" />
              </span>
            </div>
          </Link>

          {/* 지난 강의 관리 카드 */}
          <Link href="/past-courses" className="group relative overflow-hidden rounded-3xl bg-white p-8 shadow-sm border border-slate-200 hover:border-slate-400 hover:shadow-xl transition-all dark:bg-slate-900 dark:border-slate-800 dark:hover:border-slate-500">
            <div className="absolute -right-6 -top-6 text-slate-100 dark:text-slate-800/50 group-hover:scale-110 transition-transform duration-500">
              <Archive className="w-40 h-40" />
            </div>
            <div className="relative z-10">
              <div className="mb-6 inline-flex p-4 rounded-2xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                <Archive className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">지난 강의</h2>
              <p className="text-slate-500 text-sm font-medium leading-relaxed mb-6">종강된 수업을 연도별로 확인하고 보관된 자료를 관리합니다.</p>
              <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-400">
                보기 <ChevronRight className="w-4 h-4" />
              </span>
            </div>
          </Link>
        </div>

        {/* 휴지통 & QR 접속 — always visible */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
            <RecycleBin />
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
            <QRDisplay />
          </div>
        </div>

        {/* 개인정보 보호 관리 */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-sm border border-slate-200 dark:border-slate-800">
          <PrivacyManager />
        </div>

        {/* Real-time Student Progress List */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
            <Link href="/admin" className="group block hover:opacity-80 transition">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 transition-colors">실시간 수강생 과제 제출 현황</h2>
              <p className="text-sm font-medium text-slate-500 mt-1">총 {students.length}명의 학생 목록 및 주차별 진행률</p>
            </Link>
            <Link href="/admin" className="px-5 py-2 text-sm font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl transition dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
              전체 보기
            </Link>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800/60 p-2">
            {stats.length > 0 ? stats.map((student) => (
              <div key={student.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6 hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition rounded-2xl">
                <div className="flex items-center gap-4 sm:w-1/3">
                  <div className="h-12 w-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center font-bold text-lg dark:bg-slate-800 dark:text-slate-400">
                    {student.email.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white">{student.email}</h4>
                    <span className={`text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded mt-1 inline-block ${student.role === 'admin' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                      {student.role}
                    </span>
                  </div>
                </div>

                <div className="flex-1 space-y-2">
                  <div className="flex justify-between items-end text-sm">
                    <span className="font-bold text-slate-600 dark:text-slate-400">제출률: <span className="text-slate-900 dark:text-white text-base ml-1">{student.progress}%</span></span>
                    <span className="font-mono text-xs text-slate-400">{student.assignmentCount} / {totalWeeks}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5 dark:bg-slate-800">
                    <div className={`h-2.5 rounded-full transition-all duration-500 ${student.progress > 80 ? 'bg-emerald-500' : student.progress > 40 ? 'bg-blue-500' : 'bg-orange-500'}`} style={{ width: `${student.progress}%` }}></div>
                  </div>
                </div>

                <div className="sm:w-32 text-right">
                  <Link href={`/workspace/${student.id}`} className="text-indigo-600 hover:text-indigo-700 hover:underline text-sm font-bold dark:text-indigo-400 shadow-sm border border-indigo-100 dark:border-indigo-900/50 px-4 py-2 rounded-lg bg-indigo-50/50 dark:bg-indigo-900/20">
                    공간 열람
                  </Link>
                </div>
              </div>
            )) : (
              <div className="p-12 text-center text-slate-500 font-medium">
                등록된 학생 데이터가 없습니다.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// --- MAIN EXPORT ROUTE ---
export default async function Home(props: any) {
  const searchParams = await props.searchParams
  const viewMode = searchParams?.view || 'admin'
  const selectedCourseId = searchParams?.course || null

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Fetch role + course + profile_completed
  const { data: userRecord } = await supabase
    .from('users')
    .select('role, course_id, profile_completed')
    .eq('id', user.id)
    .single()

  const role = userRecord?.role || 'user'
  const isRealAdmin = role === 'admin' || user.email === 'hemanpapa@gmail.com'
  const isAdmin = isRealAdmin && viewMode !== 'student'

  // Non-admin users without a completed profile should be redirected to profile setup
  if (!isRealAdmin && !userRecord?.profile_completed) {
    redirect('/profile-setup')
  }

  // Determine effective courseId: admin uses query param, student uses their own
  const effectiveCourseId = isRealAdmin ? (selectedCourseId || null) : (userRecord?.course_id || null)

  // Redirect admin to first course if no course selected
  if (isRealAdmin && !effectiveCourseId) {
    const { data: firstCourse } = await supabase.from('courses').select('id').order('name').limit(1).single()
    if (firstCourse) {
      redirect(`/?view=${viewMode}&course=${firstCourse.id}`)
    }
  }

  // Fetch course name
  let courseName = ''
  if (effectiveCourseId) {
    const { data: courseData } = await supabase.from('courses').select('name').eq('id', effectiveCourseId).single()
    if (courseData) courseName = courseData.name
  }

  // BRANCH LOGIC
  if (isAdmin) {
    return <AdminDashboard user={user} isRealAdmin={isRealAdmin} viewMode={viewMode} courseId={effectiveCourseId} courseName={courseName} />
  } else if (courseName === '레코딩실습1') {
    return <RecordingStudentDashboard user={user} isRealAdmin={isRealAdmin} viewMode={viewMode} courseName={courseName} courseId={effectiveCourseId} />
  } else {
    return <StudentDashboard user={user} isRealAdmin={isRealAdmin} viewMode={viewMode} courseName={courseName} />
  }
}
