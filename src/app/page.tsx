import { createClient } from '@/utils/supabase/server'
import LogoutButton from './components/LogoutButton'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ExternalLink, CheckCircle2, Circle, Upload, BookOpen, MessagesSquare, Users, BarChart3, ChevronRight, Settings, FlaskConical, Clock, Bug, Archive, HelpCircle, Lightbulb } from 'lucide-react'
import EditNameButton from './components/EditNameButton'
import RecordingStudentDashboard from './recording-class/RecordingStudentDashboard'
import ApprovalWatcher from '@/components/ApprovalWatcher'
import RecycleBin from './admin/RecycleBin'
import QRDisplay from './admin/QRDisplay'
import PrivacyManager from './admin/PrivacyManager'
import CourseEndButton from './admin/CourseEndButton'
import AdminCourseChatPanel from './AdminCourseChatPanel'
import AudioTechFilePreviewList from './components/AudioTechFilePreviewList'
import BugReportButton from './components/BugReportButton'
import ChatRoom from '@/components/ChatRoom'
import AdminCourseSwitcher from './components/AdminCourseSwitcher'
import AdminStudentCourseSelector from './components/AdminStudentCourseSelector'
import StudentDashboardTabs from './components/StudentDashboardTabs'
import AiAssistant from './components/AiAssistant'
import AdminPrivateLessonToggle from './admin/AdminPrivateLessonToggle'
import AdminCourseDashboardNotices from './admin/AdminCourseDashboardNotices'
import AdminCourseExamManager from './admin/AdminCourseExamManager'
import AdminLibraryManager from './admin/AdminLibraryManager'
import SoundEngineerExamTable from './admin/SoundEngineerExamTable'
import StudentCourseSwitcher from './components/StudentCourseSwitcher'
import { cookies } from 'next/headers'
import AudioTechAttendanceClient from './components/AudioTechAttendanceClient'
import AudioTechParticipationClient from './components/AudioTechParticipationClient'
import AudioTechUploadClient from './components/AudioTechUploadClient'
import DummyTestButton from './components/DummyTestButton'
import AudioTechLiveViewer from './components/AudioTechLiveViewer'
import CollapsibleSection from '@/components/CollapsibleSection'

// --- STUDENT DASHBOARD COMPONENT ---
async function StudentDashboard({ user, isRealAdmin, viewMode, courseName, courseId, role, allCourses, classCourse, lessonCourse }: { user: any, isRealAdmin: boolean, viewMode: string, courseName: string, courseId: string | null, role: string, allCourses: any[], classCourse?: any, lessonCourse?: any }) {
  const supabase = await createClient()

  // Fetch student info including approval status
  const { data: studentInfo } = await supabase
    .from('users')
    .select('is_approved, name, department, student_id, approval_request_count, major')
    .eq('id', user.id)
    .single()

  const isApproved = studentInfo?.is_approved || false
  const requestCount = studentInfo?.approval_request_count || 1

  // Determine if the currently viewed course is a private lesson
  const isPrivateLesson = isRealAdmin
    ? allCourses?.find(c => c.id === courseId)?.is_private_lesson
    : courseId === lessonCourse?.id;

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
              const { data: { user } } = await supabase.auth.getUser()

              if (user) {
                const { data: userData } = await supabase.from('users').select('approval_request_count').eq('id', user.id).single()

                const currentCount = userData?.approval_request_count || 0
                await supabase.from('users').update({
                  approval_request_count: currentCount + 1,
                  last_requested_at: new Date().toISOString()
                }).eq('id', user.id)
              }

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

  let submittedCount = 0
  const totalWeeks = 15

  // Prepare queries
  const assignmentsQuery = supabase.from('assignments').select('id').eq('user_id', user.id)
  const evalQuery = supabase.from('evaluations').select('has_final_project, midterm_score').eq('user_id', user.id).eq('course_id', courseId || '').maybeSingle()
  
  const isAudioTech = courseId && courseName === '오디오테크놀러지'
  const attQuery = isAudioTech ? supabase.from('class_attendances').select('*').eq('user_id', user.id).eq('course_id', courseId) : Promise.resolve({ data: null })
  const examSubmissionsQuery = isAudioTech ? supabase.from('exam_submissions').select('*').eq('user_id', user.id).eq('course_id', courseId) : Promise.resolve({ data: null })
  const courseNoticeQuery = courseId ? supabase.from('courses').select('notice_weekly, notice_assignment, notice_final, notice_midterm, notice_checkpoint, weekly_presentation_titles, is_attendance_open').eq('id', courseId).maybeSingle() : Promise.resolve({ data: null })
  
  const effectiveLessonCourseId = lessonCourse?.id || (isPrivateLesson ? courseId : null)
  const archiveQuery = (isPrivateLesson && effectiveLessonCourseId) ? supabase.from('archive_pages').select('week_number, title, updated_at').eq('course_id', effectiveLessonCourseId).order('week_number', { ascending: true }) : Promise.resolve({ data: null })

  // Execute all queries concurrently
  const [
    { data: assignments },
    { data: evalData },
    { data: attData },
    { data: uploadsData },
    { data: courseData },
    { data: archiveData }
  ] = await Promise.all([
    assignmentsQuery,
    evalQuery,
    attQuery,
    examSubmissionsQuery,
    courseNoticeQuery,
    archiveQuery
  ])

  if (assignments) {
    submittedCount = assignments.length
  }
  const assignmentProgress = Math.min(100, Math.round((submittedCount / totalWeeks) * 100))

  // Evaluation processing
  let hasFinalProject = false
  let audioTechParticipationScore = 0
  if (evalData) {
    hasFinalProject = evalData.has_final_project
    audioTechParticipationScore = evalData.midterm_score || 0
  }

  // Audio Tech processing
  let audioTechAttendances: any[] = attData || []
  let audioTechPresentations: any[] = []
  let audioTechAssignments: any[] = []
  if (uploadsData) {
    audioTechPresentations = uploadsData.filter((u: any) => u.exam_type.startsWith('발표 '))
    audioTechAssignments = uploadsData.filter((u: any) => u.exam_type.startsWith('과제물 '))
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

  // Notices processing
  let notices = { weekly: '', assignment: '', final: '', midterm: '', checkpoint: '' }
  let weeklyPresentationTitles: Record<string, string> = {}
  let isAttendanceOpen = false
  if (courseData) {
    notices = {
      weekly: courseData.notice_weekly || '',
      assignment: courseData.notice_assignment || '',
      final: courseData.notice_final || '',
      midterm: courseData.notice_midterm || '',
      checkpoint: courseData.notice_checkpoint || ''
    }
    if (courseData.weekly_presentation_titles) {
      weeklyPresentationTitles = courseData.weekly_presentation_titles
    }
    isAttendanceOpen = courseData.is_attendance_open || false
  } else if (!courseData && courseId) {
      // Fallback in case the query failed or courseData is missing but we're Audio Tech
      isAttendanceOpen = allCourses?.find(c => c.id === courseId)?.is_attendance_open || false
  }

  // Archive processing
  let lessonArchivePages: { week_number: number; title: string; updated_at: string | null }[] = archiveData || [];

  return (
    <>
      {courseId && courseName === '오디오테크놀러지' && (
        <AudioTechLiveViewer courseId={courseId} />
      )}
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-8">
        <div className="mx-auto max-w-6xl space-y-8">

          {/* Header */}
          <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between rounded-3xl bg-white p-8 shadow-sm dark:bg-neutral-900 border border-neutral-200/60 dark:border-neutral-800">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white">{isPrivateLesson ? '레슨 대시보드' : '학습 대시보드'}</h1>
              <div className="flex items-center gap-3 mt-2">
                <div className="text-sm text-neutral-500 font-medium flex items-center">
                  환영합니다, {studentInfo?.name || user.email} 님
                  <EditNameButton currentName={studentInfo?.name || ''} />
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-4 mt-4 sm:mt-0">
              <LogoutButton className="rounded-xl bg-neutral-100 px-4 py-2.5 text-sm font-bold text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 transition" />
            </div>
          </header>

          {!isRealAdmin && classCourse && lessonCourse && (
            <StudentCourseSwitcher classCourse={classCourse} lessonCourse={lessonCourse} activeCourseId={courseId} />
          )}

          <StudentDashboardTabs
            courseId={courseId || ''}
            courseName={courseName}
            userId={user.id}
            isAdmin={isRealAdmin}
            userMajor={studentInfo?.major || ''}
            isPrivateLesson={isPrivateLesson}
            lessonArchivePages={lessonArchivePages}
            lessonCourseId={effectiveLessonCourseId || ''}
          >
            <div className="space-y-8">
              {/* Progress Trackers */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {!isPrivateLesson && (
                  <>
                    {/* Assignment Progress -> Presentation for Audio Tech */}
                    <div className="rounded-3xl bg-white p-8 shadow-sm border border-neutral-200/60 dark:border-neutral-800 dark:bg-neutral-900">
                      <div className="flex justify-between items-end mb-4">
                        <h2 className="text-lg font-bold">
                          {courseName === '오디오테크놀러지' ? '발표 (30점) 현황' : '주차별 과제 제출'}
                        </h2>
                        <span className="text-2xl font-black text-blue-600">
                          {courseName === '오디오테크놀러지' ? Math.min(100, Math.round((audioTechPresentations.length / 15) * 100)) : assignmentProgress}%
                        </span>
                      </div>
                      <div className="w-full bg-neutral-100 rounded-full h-3 dark:bg-neutral-800 mb-2">
                        <div className="bg-blue-600 h-3 rounded-full transition-all duration-500" style={{ width: `${courseName === '오디오테크놀러지' ? Math.min(100, Math.round((audioTechPresentations.length / 15) * 100)) : assignmentProgress}%` }}></div>
                      </div>
                      <div className="flex justify-between items-start mt-3">
                        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 max-w-[70%] leading-relaxed">{notices.weekly}</p>
                        <p className="text-xs font-medium text-neutral-500 font-mono text-right shrink-0">
                          {courseName === '오디오테크놀러지' ? `${audioTechPresentations.length} / 15 완료` : `${submittedCount} / ${totalWeeks} 완료`}
                        </p>
                      </div>
                      
                      {courseName === '오디오테크놀러지' && courseId && (
                        <>
                          <AudioTechUploadClient userId={user.id} courseId={courseId} type="발표" title="발표 자료" weeklyPresentationTitles={weeklyPresentationTitles} />
                          <AudioTechFilePreviewList items={audioTechPresentations} accentColor="blue" />
                        </>
                      )}
                    </div>
                  </>
                )}

                {/* Final Project Progress */}
                {courseName !== '오디오테크놀러지' && (
                  <div className="rounded-3xl bg-white p-8 shadow-sm border border-neutral-200/60 dark:border-neutral-800 dark:bg-neutral-900">
                    <div className="flex justify-between items-end mb-4">
                      <h2 className="text-lg font-bold">
                        {isPrivateLesson ? '기말 공동평가 상태' : '기말 프로젝트 상태'}
                      </h2>
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
                    {notices.final && (
                      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mt-4 leading-relaxed">{notices.final}</p>
                    )}
                  </div>
                )}

                {/* Midterm Evaluation */}
                <div className="rounded-3xl bg-white p-8 shadow-sm border border-neutral-200/60 dark:border-neutral-800 dark:bg-neutral-900">
                  <div className="flex justify-between items-end mb-4">
                    <h2 className="text-lg font-bold">
                      {isPrivateLesson ? '중간 과제 현황' : courseName === '오디오테크놀러지' ? '참여도 (20점) 현황' : '중간 평가 현황'}
                    </h2>
                    <span className="text-2xl font-black text-emerald-600">
                      {courseName === '오디오테크놀러지' ? Math.min(100, Math.round((audioTechParticipationScore / 20) * 100)) : midtermProgress}%
                    </span>
                  </div>
                  <div className="w-full bg-neutral-100 rounded-full h-3 dark:bg-neutral-800 mb-2">
                    <div className="bg-emerald-600 h-3 rounded-full transition-all duration-500" style={{ width: `${courseName === '오디오테크놀러지' ? Math.min(100, Math.round((audioTechParticipationScore / 20) * 100)) : midtermProgress}%` }}></div>
                  </div>
                  <div className="flex justify-between items-start mt-3">
                    <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 max-w-[70%] leading-relaxed">{notices.midterm}</p>
                    <p className="text-xs font-medium text-neutral-500 font-mono text-right shrink-0">
                      {courseName === '오디오테크놀러지' ? `${audioTechParticipationScore} 점` : '미응시'}
                    </p>
                  </div>
                  {courseName === '오디오테크놀러지' && courseId && (
                    <AudioTechParticipationClient courseId={courseId} initialScore={audioTechParticipationScore} />
                  )}
                </div>

                {!isPrivateLesson && (
                  <>
                    {/* Checkpoint Assignments -> Assignment Task for Audio Tech */}
                    <div className="rounded-3xl bg-white p-8 shadow-sm border border-neutral-200/60 dark:border-neutral-800 dark:bg-neutral-900">
                      <div className="flex justify-between items-end mb-4">
                        <h2 className="text-lg font-bold">
                          {courseName === '오디오테크놀러지' ? '과제물 (20점) 현황' : '수시 평가 현황'}
                        </h2>
                        <span className="text-2xl font-black text-orange-600">
                          {courseName === '오디오테크놀러지' ? Math.min(100, Math.round((audioTechAssignments.length / 3) * 100)) : checkpointProgress}%
                        </span>
                      </div>
                      <div className="w-full bg-neutral-100 rounded-full h-3 dark:bg-neutral-800 mb-2">
                        <div className="bg-orange-600 h-3 rounded-full transition-all duration-500" style={{ width: `${courseName === '오디오테크놀러지' ? Math.min(100, Math.round((audioTechAssignments.length / 3) * 100)) : checkpointProgress}%` }}></div>
                      </div>
                      <div className="flex justify-between items-start mt-3">
                        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 max-w-[70%] leading-relaxed">{notices.checkpoint}</p>
                        <p className="text-xs font-medium text-neutral-500 font-mono text-right shrink-0">
                          {courseName === '오디오테크놀러지' ? `${audioTechAssignments.length} / 3 완료` : '0 / 3 완료'}
                        </p>
                      </div>

                      {courseName === '오디오테크놀러지' && courseId && (
                        <>
                          <AudioTechUploadClient userId={user.id} courseId={courseId} type="과제물" title="과제물 파일" />
                          <AudioTechFilePreviewList items={audioTechAssignments} accentColor="orange" />
                        </>
                      )}
                    </div>

                    {/* Assignment Task -> Attendance for Audio Tech */}
                    <div className="rounded-3xl bg-white p-8 shadow-sm border border-neutral-200/60 dark:border-neutral-800 dark:bg-neutral-900">
                      <div className="flex justify-between items-end mb-4">
                        <h2 className="text-lg font-bold">
                          {courseName === '오디오테크놀러지' ? '출석 (30점) 현황' : '과제 현황'}
                        </h2>
                        <span className="text-2xl font-black text-indigo-600">
                          {courseName === '오디오테크놀러지' ? Math.min(100, Math.round((audioTechAttendances.length / 15) * 100)) : 0}%
                        </span>
                      </div>
                      <div className="w-full bg-neutral-100 rounded-full h-3 dark:bg-neutral-800 mb-2">
                        <div className="bg-indigo-600 h-3 rounded-full transition-all duration-500" style={{ width: `${courseName === '오디오테크놀러지' ? Math.min(100, Math.round((audioTechAttendances.length / 15) * 100)) : 0}%` }}></div>
                      </div>
                      <div className="flex justify-between items-start mt-3">
                        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 max-w-[70%] leading-relaxed">{notices.assignment}</p>
                        <p className="text-xs font-medium text-neutral-500 font-mono text-right shrink-0">
                          {courseName === '오디오테크놀러지' ? `${audioTechAttendances.length} / 15 완료` : '미제출'}
                        </p>
                      </div>
                      {courseName === '오디오테크놀러지' && courseId && (
                        <AudioTechAttendanceClient courseId={courseId} isAttendanceOpen={isAttendanceOpen} initialAttendances={audioTechAttendances} />
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Quick Actions Grid */}
              <div>
                <h3 className="text-lg font-bold mb-4 px-2">LMS 메뉴</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {courseName !== '오디오테크놀러지' && (
                    <Link href={`/workspace/${user.id}`} className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-white p-6 shadow-sm border border-neutral-200/60 transition hover:border-blue-500 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-blue-500 group">
                      <div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition">
                        <Upload className="w-6 h-6" />
                      </div>
                      <span className="text-sm font-bold">내 학습 공간</span>
                    </Link>
                  )}
                  {!isPrivateLesson && courseName !== '오디오테크놀러지' && (
                    <Link href={`/peer-review${courseId ? `?course=${courseId}` : ''}`} className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-white p-6 shadow-sm border border-neutral-200/60 transition hover:border-purple-500 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-purple-500 group">
                      <div className="p-3 bg-purple-50 text-purple-600 rounded-xl group-hover:bg-purple-600 group-hover:text-white transition">
                        <Users className="w-6 h-6" />
                      </div>
                      <span className="text-sm font-bold">상호 평가</span>
                    </Link>
                  )}
                  {!isPrivateLesson && (
                    <Link href={`/archive${courseId ? `?course=${courseId}` : ''}${viewMode === 'student' ? (courseId ? '&view=student' : '?view=student') : ''}`} className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-white p-6 shadow-sm border border-neutral-200/60 transition hover:border-green-500 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-green-500 group">
                      <div className="p-3 bg-green-50 text-green-600 rounded-xl group-hover:bg-green-600 group-hover:text-white transition">
                        <BookOpen className="w-6 h-6" />
                      </div>
                      <span className="text-sm font-bold">주차별 강의 자료</span>
                    </Link>
                  )}
                  {isPrivateLesson && lessonCourse?.id && (
                    <Link href={`/archive?course=${lessonCourse.id}${viewMode === 'student' ? '&view=student' : ''}`} className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-white p-6 shadow-sm border border-neutral-200/60 transition hover:border-emerald-500 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-emerald-500 group">
                      <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition">
                        <BookOpen className="w-6 h-6" />
                      </div>
                      <span className="text-sm font-bold">내 레슨 자료</span>
                    </Link>
                  )}
                  <Link href={`/board?type=qna${courseId ? `&course=${courseId}` : ''}`} className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-white p-6 shadow-sm border border-neutral-200/60 transition hover:border-cyan-500 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-cyan-500 group">
                    <div className="p-3 bg-cyan-50 text-cyan-600 rounded-xl group-hover:bg-cyan-600 group-hover:text-white transition">
                      <HelpCircle className="w-6 h-6" />
                    </div>
                    <span className="text-sm font-bold">Q&A</span>
                  </Link>
                  {!isPrivateLesson && (
                    <Link href="/board?type=suggestion" className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-white p-6 shadow-sm border border-neutral-200/60 transition hover:border-amber-500 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-amber-500 group">
                      <div className="p-3 bg-amber-50 text-amber-600 rounded-xl group-hover:bg-amber-600 group-hover:text-white transition">
                        <Lightbulb className="w-6 h-6" />
                      </div>
                      <span className="text-sm font-bold">익명 건의</span>
                    </Link>
                  )}
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
                  <h3 className="font-bold">결석 증빙서류제출</h3>
                  <p className="text-sm text-neutral-500">진단서 등 결석 사유 증명 문서를 업로드합니다.</p>
                </div>
                <Link href="/proof-docs" className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 transition">
                  제출하기
                </Link>
              </div>
            </div>
          </StudentDashboardTabs>
        </div>
      </div>
      <BugReportButton
        userId={user.id}
        userName={studentInfo?.name || 'Unknown'}
        userEmail={user.email}
        courseId={courseId || ''}
      />
    </>
  )
}

// --- ADMIN DASHBOARD COMPONENT ---
async function AdminDashboard({ user, isRealAdmin, viewMode, courseId, courseName, initialStudentId }: { user: any, isRealAdmin: boolean, viewMode: string, courseId: string | null, courseName: string, initialStudentId?: string | null }) {
  const supabase = await createClient()

  let usersQuery = supabase.from('users').select('id, email, role, created_at, course_id, private_lesson_id').eq('role', 'user').order('created_at', { ascending: false })
  if (courseId) usersQuery = usersQuery.eq('course_id', courseId)

  let qnaQuery = supabase.from('board_questions').select('user_id, id').eq('type', 'qna')
  if (courseId) qnaQuery = qnaQuery.eq('course_id', courseId)

  let errorQuery = supabase.from('error_reports').select('id', { count: 'exact', head: true }).eq('status', 'open')
  if (courseId) errorQuery = errorQuery.eq('course_id', courseId)

  // Execute all major queries concurrently
  const [
    { data: allUsers },
    { data: allCourses },
    { data: allAssignments },
    { data: allQna },
    { count: openErrorCount }
  ] = await Promise.all([
    usersQuery,
    supabase.from('courses').select('id, name, is_ended, ended_at, late_submission_allowed, is_private_lesson, notice_weekly, notice_assignment, notice_final, notice_midterm, notice_checkpoint, university_name').order('name'),
    supabase.from('assignments').select('user_id, id'),
    qnaQuery,
    errorQuery
  ])

  // Top-level tabs: regular courses + private lesson umbrella
  // Student sub-courses are generated as "[StudentName]의 레슨". Hide them from the top tab.
  const tabCourses = (allCourses || []).filter((c: any) =>
    !c.is_private_lesson || !c.name.endsWith('의 레슨')
  )

  const activeCourse = allCourses?.find((c: any) => c.id === courseId)

  // Calculate stats
  const totalWeeks = 15
  const students = allUsers || []
  const assignments = allAssignments || []
  const qnaList = allQna || []

  // If viewing a private lesson umbrella course, fetch students with private lessons for the chat panel
  let privateLessonStudents: { id: string; name: string | null; email: string; privateLessonId: string }[] = []
  if (activeCourse?.is_private_lesson) {
    const { data: plStudents } = await supabase
      .from('users')
      .select('id, name, email, private_lesson_id')
      .not('private_lesson_id', 'is', null)
      .eq('role', 'user')
      .order('name')
    privateLessonStudents = (plStudents || []).map((s: any) => ({ id: s.id, name: s.name, email: s.email, privateLessonId: s.private_lesson_id }))
  }

  const stats = students.map((s: any) => {
    const sAssignments = assignments.filter((a: any) => a.user_id === s.id)
    const sQna = qnaList.filter((q: any) => q.user_id === s.id)
    const progress = Math.min(100, Math.round((sAssignments.length / totalWeeks) * 100))
    return { ...s, assignmentCount: sAssignments.length, progress, qnaCount: sQna.length }
  })

  return (
    <>
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

          <div className="flex flex-col sm:flex-row items-center gap-4 mt-6 sm:mt-0">
            <Link 
              href="/tools/room-acoustics" 
              target="_blank"
              className="px-4 py-2.5 text-xs font-black bg-purple-600/20 text-purple-300 border border-purple-500/30 hover:bg-purple-600/40 hover:text-white rounded-xl transition flex items-center gap-2"
            >
              🎧 룸 어쿠스틱 (Room Acoustics) 실습 도구
            </Link>
            <DummyTestButton />
            <LogoutButton className="rounded-xl bg-white/10 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/20 transition" />
          </div>
        </header>

        {/* Course Selector Tabs for Admin — two category groups */}
        <div className="space-y-2">
          {/* 클래스 수업 */}
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest px-1 shrink-0">클래스</span>
            {tabCourses?.filter((c: any) => !c.is_private_lesson).map((c: any) => (
              <div key={c.id} className="flex items-center gap-1.5">
                <Link
                  href={`/?view=${viewMode}&course=${c.id}`}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all border ${courseId === c.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'bg-white/10 text-slate-400 border-white/10 hover:bg-white/20 hover:text-white'}`}
                >
                  {c.university_name && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-black tracking-widest ${courseId === c.id ? 'bg-indigo-500/50 text-white' : 'bg-slate-700/50 text-slate-300'}`}>
                      {c.university_name}
                    </span>
                  )}
                  {c.name}
                  {c.is_ended && (
                    <span className="px-1.5 py-0.5 bg-slate-600/80 text-slate-200 text-[10px] font-black rounded-md">종강</span>
                  )}
                </Link>
                {courseId === c.id && !c.is_private_lesson && (
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

          {/* 개인레슨 */}
          {tabCourses?.some((c: any) => c.is_private_lesson) && (
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-[11px] font-black text-emerald-500 uppercase tracking-widest px-1 shrink-0">개인레슨</span>
              {tabCourses?.filter((c: any) => c.is_private_lesson).map((c: any) => (
                <div key={c.id} className="flex items-center gap-1.5">
                  <Link
                    href={`/?view=${viewMode}&course=${c.id}`}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all border ${courseId === c.id ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg' : 'bg-white/10 text-slate-400 border-white/10 hover:bg-white/20 hover:text-white'}`}
                  >
                    {c.university_name && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-black tracking-widest ${courseId === c.id ? 'bg-emerald-500/50 text-white' : 'bg-slate-700/50 text-slate-300'}`}>
                        {c.university_name}
                      </span>
                    )}
                    {c.name}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 개인레슨 과목: 학생 목록(채팅+일지) 최상단 → 설정 패널 하단 */}
        {courseId && activeCourse?.is_private_lesson && (
          <>
            {/* ① 학생 카드 그리드 + 1:1 채팅 + 레슨 일지 */}
            <AdminCourseChatPanel
              courseId={courseId}
              courseName={courseName}
              adminUserId={user.id}
              isPrivateLesson={true}
              privateLessonStudents={privateLessonStudents}
              initialStudentId={initialStudentId ?? undefined}
            />

            {/* ② 설정 패널 (라이브러리) — 토글은 불필요 (이미 is_private_lesson=true인 코스) */}
            <div className="space-y-6">
              <AdminLibraryManager courseId={courseId} />
              <SoundEngineerExamTable />
            </div>
          </>
        )}

        {/* 일반 클래스 과목: 기존 순서 유지 */}
        {courseId && activeCourse && !activeCourse.is_private_lesson && (
          <div className="space-y-6">
            <AdminCourseChatPanel
              courseId={courseId}
              courseName={courseName}
              adminUserId={user.id}
              isPrivateLesson={false}
              privateLessonStudents={[]}
            />
          </div>
        )}

        {/* Admin Dashboard Notices */}
        {courseId && activeCourse && (
          <div className="space-y-6">
            <AdminCourseDashboardNotices
              courseId={courseId}
              courseName={activeCourse.name}
              initialWeekly={activeCourse.notice_weekly || ''}
              initialAssignment={activeCourse.notice_assignment || ''}
              initialFinal={activeCourse.notice_final || ''}
              initialMidterm={activeCourse.notice_midterm || ''}
              initialCheckpoint={activeCourse.notice_checkpoint || ''}
            />
            {activeCourse.name === '레코딩실습1' && (
              <AdminCourseExamManager courseId={courseId} />
            )}
          </div>
        )}

        {/* Central Prominent Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link href={courseId ? `/admin?tab=students&course=${courseId}` : '/admin'} className="group relative overflow-hidden rounded-3xl bg-white p-8 shadow-sm border border-slate-200 hover:border-indigo-300 hover:shadow-xl transition-all dark:bg-slate-900 dark:border-slate-800 dark:hover:border-indigo-500">
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

          {(!activeCourse || !activeCourse.is_private_lesson) && (
            <Link href={courseId ? `/admin?tab=grades&course=${courseId}` : '/admin?tab=grades'} className="group relative overflow-hidden rounded-3xl bg-white p-8 shadow-sm border border-slate-200 hover:border-blue-300 hover:shadow-xl transition-all dark:bg-slate-900 dark:border-slate-800 dark:hover:border-blue-500">
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
          )}

          <Link href={courseId ? `/admin?tab=archive&course=${courseId}` : '/admin?tab=archive'} className="group relative overflow-hidden rounded-3xl bg-white p-8 shadow-sm border border-slate-200 hover:border-emerald-300 hover:shadow-xl transition-all dark:bg-slate-900 dark:border-slate-800 dark:hover:border-emerald-500">
            <div className="absolute -right-6 -top-6 text-emerald-50 dark:text-emerald-900/10 group-hover:scale-110 transition-transform duration-500">
              <BookOpen className="w-40 h-40" />
            </div>
            <div className="relative z-10">
              <div className="mb-6 inline-flex p-4 rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                <BookOpen className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">강의 자료 아카이브 관리</h2>
              <p className="text-slate-500 text-sm font-medium leading-relaxed mb-6">주차별 강의 자료, 레퍼런스 음원 등 전체 학생 전용 자료 업로드.</p>
              <span className="inline-flex items-center gap-2 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                업로드 <ChevronRight className="w-4 h-4" />
              </span>
            </div>
          </Link>

          {(courseName === '오디오테크놀러지' || !courseId) && (
            <Link href={courseId ? `/research?course=${courseId}` : '/research'} className="group relative overflow-hidden rounded-3xl bg-white p-8 shadow-sm border border-slate-200 hover:border-pink-300 hover:shadow-xl transition-all dark:bg-slate-900 dark:border-slate-800 dark:hover:border-pink-500">
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
          {(!activeCourse || !activeCourse.is_private_lesson) && (
            <Link href={courseId ? `/admin/qna?course=${courseId}` : '/admin/qna'} className="group relative overflow-hidden rounded-3xl bg-white p-8 shadow-sm border border-slate-200 hover:border-emerald-300 hover:shadow-xl transition-all dark:bg-slate-900 dark:border-slate-800 dark:hover:border-emerald-500">
              <div className="absolute -right-6 -top-6 text-emerald-50 dark:text-emerald-900/10 group-hover:scale-110 transition-transform duration-500">
                <MessagesSquare className="w-40 h-40" />
              </div>
              <div className="relative z-10">
                <div className="mb-6 inline-flex p-4 rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                  <MessagesSquare className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                  {(activeCourse?.name?.includes('오디오테크놀러지') || activeCourse?.name?.includes('오디오테크롤러지')) ? 'Q&A 관리' : '익명 Q&A 관리'}
                </h2>
                <p className="text-slate-500 text-sm font-medium leading-relaxed mb-6">
                  {(activeCourse?.name?.includes('오디오테크놀러지') || activeCourse?.name?.includes('오디오테크롤러지')) ? '학생 질문 조회, 공지 설정, 개인/공개 답장 관리.' : '학생 익명 질문 조회, 공지 설정, 개인/공개 답장 관리.'}
                </p>
                <span className="inline-flex items-center gap-2 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  관리하기 <ChevronRight className="w-4 h-4" />
                </span>
              </div>
            </Link>
          )}

          {/* 에러 리포트 관리 카드 */}
          <Link href={courseId ? `/admin/error-reports?course=${courseId}` : '/admin/error-reports'} className="group relative overflow-hidden rounded-3xl bg-white p-8 shadow-sm border border-slate-200 hover:border-red-300 hover:shadow-xl transition-all dark:bg-slate-900 dark:border-slate-800 dark:hover:border-red-500">
            <div className="absolute -right-6 -top-6 text-red-50 dark:text-red-900/10 group-hover:scale-110 transition-transform duration-500">
              <Bug className="w-40 h-40" />
            </div>
            <div className="relative z-10">
              <div className="mb-6 inline-flex p-4 rounded-2xl bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400 relative">
                <Bug className="w-8 h-8" />
                {(openErrorCount ?? 0) > 0 && (
                  <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-black w-6 h-6 flex items-center justify-center rounded-full border-2 border-white dark:border-slate-900 shadow-sm animate-pulse">
                    {openErrorCount}
                  </span>
                )}
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">에러 리포트</h2>
              <p className="text-slate-500 text-sm font-medium leading-relaxed mb-6">학생이 신고한 버그 확인 · Antigravity로 즉시 수정.</p>
              <span className="inline-flex items-center gap-2 text-sm font-bold text-red-500 dark:text-red-400">
                확인하기 <ChevronRight className="w-4 h-4" />
              </span>
            </div>
          </Link>

          {/* 지난 강의 / 종료된 레슨 관리 카드 */}
          <Link
            href={activeCourse && activeCourse.is_private_lesson ? `/admin/archived-lessons` : `/past-courses`}
            className="group relative overflow-hidden rounded-3xl bg-white p-8 shadow-sm border border-slate-200 hover:border-slate-400 hover:shadow-xl transition-all dark:bg-slate-900 dark:border-slate-800 dark:hover:border-slate-500"
          >
            <div className="absolute -right-6 -top-6 text-slate-100 dark:text-slate-800/50 group-hover:scale-110 transition-transform duration-500">
              <Archive className="w-40 h-40" />
            </div>
            <div className="relative z-10">
              <div className="mb-6 inline-flex p-4 rounded-2xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                <Archive className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                {activeCourse && activeCourse.is_private_lesson ? '종료된 레슨 보관함' : '지난 강의'}
              </h2>
              <p className="text-slate-500 text-sm font-medium leading-relaxed mb-6">
                {activeCourse && activeCourse.is_private_lesson
                  ? '종료된 레슨 학생 목록을 확인하고 다시 재개할 수 있습니다.'
                  : '종강된 수업을 연도별로 확인하고 보관된 자료를 관리합니다.'}
              </p>
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
        {(!activeCourse || !activeCourse.is_private_lesson) && (
          <CollapsibleSection
            title="실시간 수강생 과제 제출 현황"
            subtitle={`총 ${students.length}명의 학생 목록 및 주차별 진행률`}
            defaultExpanded={true}
            headerRight={
              <Link href="/admin" className="px-5 py-2 text-sm font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl transition dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
                전체 보기
              </Link>
            }
          >
            <div className="divide-y divide-slate-100 dark:divide-slate-800/60 p-2">
              {stats.length > 0 ? stats.map((student) => (
                <div key={student.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6 hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition rounded-2xl">
                  <div className="flex items-center gap-4 sm:w-1/3">
                    <div className="h-12 w-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center font-bold text-lg dark:bg-slate-800 dark:text-slate-400">
                      {student.email.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        {student.email}
                        {student.qnaCount > 0 && (
                          <span className="px-2 py-0.5 bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400 text-[10px] rounded-full font-bold">
                            질문 {student.qnaCount}회
                          </span>
                        )}
                      </h4>
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
          </CollapsibleSection>
        )}
      </div>
    </div>
    <AiAssistant userId={user.id} isAdmin={true} courseId={courseId || ''} />
  </>
  )
}

// --- MAIN EXPORT ROUTE ---
export default async function Home(props: any) {
  const searchParams = await props.searchParams
  const viewMode = searchParams?.view || 'admin'
  const selectedCourseId = searchParams?.course || null
  const initialStudentId = searchParams?.student || null

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  if (user.email === 'hemanpapa@gmail.com') {
    await supabase.from('courses').update({ is_private_lesson: false }).eq('name', '레코딩실습1');
  }

  // Fetch role + course + profile_completed
  const { data: userRecord } = await supabase
    .from('users')
    .select('role, course_id, private_lesson_id, profile_completed')
    .eq('id', user.id)
    .single()

  const role = userRecord?.role || 'user'
  const isRealAdmin = role === 'admin' || user.email === 'hemanpapa@gmail.com'
  const isAdmin = isRealAdmin && viewMode !== 'student'

  // Non-admin users without a completed profile should be redirected to profile setup
  if (!isRealAdmin && !userRecord?.profile_completed) {
    redirect('/profile-setup')
  }

  const cookieStore = await cookies()
  const activeCourseCookie = cookieStore.get('active_course_id')?.value

  // Determine effective courseId: admin uses query param, student uses active cookie or falls back
  let effectiveCourseId = null
  if (isRealAdmin) {
    effectiveCourseId = selectedCourseId || null
  } else {
    if (activeCourseCookie && (activeCourseCookie === userRecord?.course_id || activeCourseCookie === userRecord?.private_lesson_id)) {
      effectiveCourseId = activeCourseCookie
    } else {
      effectiveCourseId = userRecord?.course_id || userRecord?.private_lesson_id || null
    }
  }

  // 관리자가 서브코스 ID로 접근한 경우 → 우산코스로 리다이렉트 (탭 하이라이트 정상화)
  if (isRealAdmin && viewMode === 'admin' && effectiveCourseId) {
    const { data: subCourseCheck } = await supabase
        .from('users').select('id, private_lesson_id').eq('private_lesson_id', effectiveCourseId).maybeSingle()
    if (subCourseCheck) {
        // 서브코스임 → 우산코스 찾기
        const { data: allStudentLessons } = await supabase.from('users').select('private_lesson_id').not('private_lesson_id', 'is', null)
        const usedSubIds = new Set((allStudentLessons || []).map((u: any) => u.private_lesson_id).filter(Boolean))
        const { data: allPrivateLessonCourses } = await supabase.from('courses').select('id').eq('is_private_lesson', true)
        const umbrellaId = (allPrivateLessonCourses || []).find((c: any) => !usedSubIds.has(c.id))?.id
        if (umbrellaId) {
            redirect(`/?view=admin&course=${umbrellaId}&student=${subCourseCheck.id}`)
        }
    }
  }

  // Redirect admin to first course if no course selected AND we are in admin view
  if (isRealAdmin && viewMode === 'admin' && !effectiveCourseId) {
    const { data: firstCourse } = await supabase.from('courses').select('id').order('name').limit(1).single()
    if (firstCourse) {
      redirect(`/?view=${viewMode}&course=${firstCourse.id}`)
    }
  }

  // Intercept Admin in Student View with no course selected -> Render selector
  if (isRealAdmin && viewMode === 'student' && !effectiveCourseId) {
    const { data: courses } = await supabase.from('courses').select('id, name, description, is_private_lesson').order('name')
    return <AdminStudentCourseSelector courses={courses || []} />
  }

  // Prepare concurrent queries for courses
  const cListReq = isRealAdmin ? supabase.from('courses').select('id, name, is_private_lesson').order('name') : Promise.resolve(null)
  const classCourseReq = (!isRealAdmin && userRecord?.course_id) ? supabase.from('courses').select('id, name').eq('id', userRecord.course_id).single() : Promise.resolve(null)
  const lessonCourseReq = (!isRealAdmin && userRecord?.private_lesson_id) ? supabase.from('courses').select('id, name').eq('id', userRecord.private_lesson_id).single() : Promise.resolve(null)
  const effCourseReq = effectiveCourseId ? supabase.from('courses').select('name').eq('id', effectiveCourseId).single() : Promise.resolve(null)

  // Execute concurrently
  const [cListRes, classCourseRes, lessonCourseRes, effCourseRes] = await Promise.all([
    cListReq, classCourseReq, lessonCourseReq, effCourseReq
  ])

  let courseName = ''
  let allCoursesList: any[] = []
  let classCourseData = null
  let lessonCourseData = null

  if (isRealAdmin) {
    if (cListRes?.data) allCoursesList = cListRes.data
  } else {
    if (classCourseRes?.data) classCourseData = classCourseRes.data
    if (lessonCourseRes?.data) lessonCourseData = lessonCourseRes.data
  }

  if (effCourseRes?.data) {
    courseName = effCourseRes.data.name
  }

  // BRANCH LOGIC
  if (isAdmin) {
    return <AdminDashboard user={user} isRealAdmin={isRealAdmin} viewMode={viewMode} courseId={effectiveCourseId} courseName={courseName} initialStudentId={initialStudentId} />
  } else if (courseName === '레코딩실습1') {
    return <RecordingStudentDashboard user={user} isRealAdmin={isRealAdmin} viewMode={viewMode} courseName={courseName} courseId={effectiveCourseId} allCourses={allCoursesList} />
  } else {
    return <StudentDashboard user={user} isRealAdmin={isRealAdmin} viewMode={viewMode} courseName={courseName} courseId={effectiveCourseId} role={role} allCourses={allCoursesList} classCourse={classCourseData} lessonCourse={lessonCourseData} />
  }
}
