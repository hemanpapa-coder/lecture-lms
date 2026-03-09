import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import ArchivedLessonsClient from './ArchivedLessonsClient'

export const dynamic = 'force-dynamic'

export default async function ArchivedLessonsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/auth/login')

    const { data: adminRecord } = await supabase.from('users').select('role').eq('id', user.id).single()
    const isRealAdmin = adminRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com'
    if (!isRealAdmin) redirect('/')

    // Fetch ended students
    const { data: endedStudents } = await supabase
        .from('users')
        .select('id, email, name, department, student_id, private_lesson_id, created_at')
        .eq('private_lesson_ended', true)
        .order('name')

    // Fetch courses
    const { data: courses } = await supabase.from('courses').select('id, name')

    return <ArchivedLessonsClient students={endedStudents || []} courses={courses || []} />
}
