import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import CourseSelectClient from './CourseSelectClient'

export default async function CourseSelectPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/auth/login')

    const { data: userRecord } = await supabase.from('users').select('course_id, course_ids, role').eq('id', user.id).single()
    if (userRecord?.role === 'admin') redirect('/')

    // Fetch all courses
    const { data: courses } = await supabase.from('courses').select('id, name, description').order('name')

    // Get enrolled course_ids for this student
    const enrolledIds: string[] = userRecord?.course_ids ||
        (userRecord?.course_id ? [userRecord.course_id] : [])

    return <CourseSelectClient
        courses={courses || []}
        userId={user.id}
        enrolledIds={enrolledIds}
        isFirstTime={enrolledIds.length === 0}
    />
}
