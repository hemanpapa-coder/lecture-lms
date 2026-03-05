import { createClient } from '@/utils/supabase/server'
import ExamUploadClient from './ExamUploadClient'
import { redirect } from 'next/navigation'
import BackButton from './BackButton'

export default async function ExamPage(
    props: { params: Promise<{ userId: string }>, searchParams: Promise<{ course?: string, view?: string, type?: string }> }
) {
    const params = await props.params
    const searchParams = await props.searchParams
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/auth/login')
    }

    const { data: currentUser } = await supabase.from('users').select('*').eq('id', user.id).single()
    const isRealAdmin = currentUser?.role === 'admin'
    const isOwnProfile = user.id === params.userId

    if (!isRealAdmin && !isOwnProfile) {
        return <div className="p-8 text-center text-red-500 font-bold">권한이 없습니다.</div>
    }

    const { data: student } = await supabase.from('users').select('*').eq('id', params.userId).single()
    if (!student) {
        return <div className="p-8 text-center text-slate-500 font-bold">학생 정보를 찾을 수 없습니다.</div>
    }

    const activeCourseId = searchParams?.course || student.course_id
    if (!activeCourseId) {
        return <div className="p-8 text-center text-slate-500 font-bold">과목 정보를 찾을 수 없습니다.</div>
    }

    const { data: course } = await supabase.from('courses').select('*').eq('id', activeCourseId).single()
    if (!course) {
        return <div className="p-8 text-center text-slate-500 font-bold">과목 정보를 찾을 수 없거나 삭제되었습니다.</div>
    }

    // Fetch existing submissions
    const { data: submissions } = await supabase
        .from('exam_submissions')
        .select('*')
        .eq('user_id', params.userId)
        .eq('course_id', course.id)

    const viewType = searchParams?.type || 'all'

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-8">
            <div className="max-w-4xl mx-auto space-y-6">
                <div>
                    <BackButton />
                </div>

                <header className="bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-sm border border-slate-200 dark:border-slate-800">
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white mb-2">
                        {course.name} - {viewType === 'midterm' ? '중간고사 필기 사진 제출' : viewType === 'final' ? '기말 작품 제출' : viewType === 'pdf' ? '수시/과제 결과물 자동 생성 제출 내역' : '평가 및 작품 제출'}
                    </h1>
                    <p className="text-sm text-slate-500 font-medium">
                        {student.name} ({student.student_id}) 님의 {viewType === 'midterm' ? '중간고사' : viewType === 'final' ? '기말고사' : viewType === 'pdf' ? '수시/과제 PDF' : '중간/기말'} 제출 페이지입니다.
                    </p>
                </header>

                <ExamUploadClient
                    userId={params.userId}
                    courseId={course.id}
                    submissions={submissions || []}
                    isRealAdmin={isRealAdmin}
                    viewType={viewType}
                />
            </div>
        </div>
    )
}
