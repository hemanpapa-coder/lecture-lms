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

    const enrolledClassId: string | null = userRecord?.course_id || null;
    const enrolledLessonId: string | null = userRecord?.private_lesson_id || null;

    return <CourseSelectClient
        courses={courses || []}
        userId={user.id}
        enrolledClassId={enrolledClassId}
        enrolledLessonId={enrolledLessonId}
        isFirstTime={!enrolledClassId && !enrolledLessonId}
    />
}
