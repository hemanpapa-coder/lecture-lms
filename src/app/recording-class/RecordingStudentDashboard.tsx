import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import RecordingDashboardClient from './RecordingDashboardClient'

export default async function RecordingStudentDashboard({
    user,
    isRealAdmin,
    viewMode,
    courseName,
    courseId
}: {
    user: any,
    isRealAdmin: boolean,
    viewMode: string,
    courseName: string,
    courseId: string | null
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

    // Fetch course details
    const activeCourseId = courseId || userRecord.course_id
    const { data: course } = await supabase
        .from('courses')
        .select('*')
        .eq('id', activeCourseId)
        .single()

    if (!course) return <div>과목 정보를 찾을 수 없습니다.</div>

    // Fetch class attendances for this student
    const { data: attendances } = await supabase
        .from('class_attendances')
        .select('*')
        .eq('user_id', user.id)
        .eq('course_id', course.id)
        .order('week_number', { ascending: true })

    // Fetch production logs for this student
    const { data: productionLogs } = await supabase
        .from('production_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('course_id', course.id)
        .order('week_number', { ascending: true })

    // Fetch exam submissions for this student
    const { data: examSubmissions } = await supabase
        .from('exam_submissions')
        .select('*')
        .eq('user_id', user.id)
        .eq('course_id', course.id)

    // Fetch evaluation scores for this student
    const { data: evaluation } = await supabase
        .from('evaluations')
        .select('*')
        .eq('user_id', user.id)
        .single()

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
        />
    )
}
