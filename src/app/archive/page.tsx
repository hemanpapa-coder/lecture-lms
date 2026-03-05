import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import ArchiveClientPage from './ArchiveClientPage'

export default async function ArchiveServerPage(props: any) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect('/auth/login')

    const { data: userRecord } = await supabase
        .from('users')
        .select('role, email, course_id')
        .eq('id', user.id)
        .single()

    const isAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com'

    // Fetch all courses (for admin course selector)
    const { data: courses } = await supabase.from('courses').select('id, name').order('name')

    // Determine effective courseId:
    // - Student: always their own course
    // - Admin: from query param, defaulting to first course
    let courseId: string | null = null
    if (!isAdmin) {
        courseId = userRecord?.course_id || null
    } else {
        const searchParams = await props.searchParams
        const paramCourse = searchParams?.course || null
        // Default to first course if none selected (admin)
        courseId = paramCourse || courses?.[0]?.id || null
    }

    // Fetch course name
    let courseName = '자료 아카이브'
    if (courseId) {
        const found = courses?.find(c => c.id === courseId)
        if (found) courseName = found.name
    }

    return (
        <ArchiveClientPage
            isAdmin={isAdmin}
            courseId={courseId}
            courseName={courseName}
            courses={isAdmin ? (courses || []) : []}
        />
    )
}
