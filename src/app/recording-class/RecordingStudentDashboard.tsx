import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import RecordingDashboardClient from './RecordingDashboardClient'

export default async function RecordingStudentDashboard({
    user,
    isRealAdmin,
    viewMode,
    courseName,
    courseId,
    allCourses
}: {
    user: any,
    isRealAdmin: boolean,
    viewMode: string,
    courseName: string,
    courseId: string | null,
    allCourses?: any[]
}) {
    const supabase = await createClient()

    // Fetch user details
    const { data: userRecord } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()

    // Add full_name from auth user to userRecord
    if (userRecord && !userRecord.full_name) {
        userRecord.full_name = user?.user_metadata?.full_name || ''
    }

    // Fetch course details and dashboard data in parallel
    const activeCourseId = courseId || userRecord.course_id

    const [
        { data: course },
        { data: attendances },
        { data: productionLogs },
        { data: examSubmissions },
        { data: evaluation }
    ] = await Promise.all([
        supabase.from('courses').select('*').eq('id', activeCourseId).single(),
        supabase.from('class_attendances').select('*').eq('user_id', user.id).eq('course_id', activeCourseId).order('week_number', { ascending: true }),
        supabase.from('production_logs').select('*').eq('user_id', user.id).eq('course_id', activeCourseId).order('week_number', { ascending: true }),
        supabase.from('exam_submissions').select('*').eq('user_id', user.id).eq('course_id', activeCourseId),
        supabase.from('evaluations').select('*').eq('user_id', user.id).single()
    ])

    if (!course) return <div>과목 정보를 찾을 수 없습니다.</div>

    return (
        <RecordingDashboardClient
            user={userRecord}
            course={course}
            attendances={attendances || []}
            productionLogs={productionLogs || []}
            examSubmissions={examSubmissions || []}
            evaluation={evaluation || null}
            isRealAdmin={isRealAdmin}
            viewMode={viewMode}
            allCourses={allCourses || []}
        />
    )
}
