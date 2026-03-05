import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import CourseSelectClient from './CourseSelectClient'

export default async function CourseSelectPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/auth/login')

    // If already has course, go home
    const { data: userRecord } = await supabase.from('users').select('course_id, role').eq('id', user.id).single()
    if (userRecord?.course_id) redirect('/')
    if (userRecord?.role === 'admin') redirect('/')

    // Fetch all courses
    const { data: courses } = await supabase.from('courses').select('id, name, description').order('name')

    return <CourseSelectClient courses={courses || []} userId={user.id} />
}
