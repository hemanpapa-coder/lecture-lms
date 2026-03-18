import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import CourseSelectClient from './CourseSelectClient'

export default async function CourseSelectPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/auth/login')

    const { data: userRecord } = await supabase.from('users').select('course_id, private_lesson_id, role').eq('id', user.id).single()
    if (userRecord?.role === 'admin') redirect('/')

    // Fetch all courses including is_private_lesson
    const { data: courses } = await supabase.from('courses').select('id, name, description, is_private_lesson').order('name')

    // Correctly classify: course_id might have been set to a private lesson by admin (data issue)
    const courseRecord = courses?.find(c => c.id === userRecord?.course_id)
    const isPrivateLessonStoredAsCourse = courseRecord?.is_private_lesson === true

    // enrolledClassId must be a regular (non-private) class
    const enrolledClassId: string | null = (!isPrivateLessonStoredAsCourse && userRecord?.course_id) ? userRecord.course_id : null
    // enrolledLessonId: use private_lesson_id, or fall back if course_id was incorrectly a private lesson
    const enrolledLessonId: string | null = userRecord?.private_lesson_id
        || (isPrivateLessonStoredAsCourse ? userRecord?.course_id : null)
        || null

    return <CourseSelectClient
        courses={courses || []}
        userId={user.id}
        enrolledClassId={enrolledClassId}
        enrolledLessonId={enrolledLessonId}
        isFirstTime={!enrolledClassId && !enrolledLessonId}
    />
}
