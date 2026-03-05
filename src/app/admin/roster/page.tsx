import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import RosterClient from './RosterClient'

export default async function RosterPage(props: any) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/auth/login')

    const { data: userRecord } = await supabase.from('users').select('role').eq('id', user.id).single()
    const isAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com'
    if (!isAdmin) redirect('/')

    const searchParams = await props.searchParams
    const selectedCourseId: string | null = searchParams?.course || null

    // Fetch all courses that have roster data
    const { data: courses } = await supabase
        .from('courses')
        .select('id, name')
        .order('name')

    // TEMP: Update Recording Class 1 students to grade 3
    const recordingCourseId = courses?.find(c => c.name === '레코딩실습1')?.id
    if (recordingCourseId) {
        await supabase
            .from('student_roster')
            .update({ grade: 3 })
            .eq('course_id', recordingCourseId)
    }

    // Determine active course
    const activeCourseId = selectedCourseId || courses?.[0]?.id || null
    const activeCourseName = courses?.find(c => c.id === activeCourseId)?.name || ''

    // Fetch roster for selected course
    const { data: rawStudents } = activeCourseId
        ? await supabase
            .from('student_roster')
            .select('*')
            .eq('course_id', activeCourseId)
            .order('no', { ascending: true })
        : { data: [] }

    // Fetch users for profile images
    const { data: users } = activeCourseId
        ? await supabase
            .from('users')
            .select('student_id, profile_image_url')
        : { data: [] }

    // Merge profile images into students
    const students = rawStudents?.map(s => {
        const u = users?.find(user => user.student_id === s.student_number)
        return {
            ...s,
            profile_image_url: u?.profile_image_url || null
        }
    }) || []

    return (
        <RosterClient
            courses={courses || []}
            activeCourseId={activeCourseId}
            activeCourseName={activeCourseName}
            students={students || []}
        />
    )
}
