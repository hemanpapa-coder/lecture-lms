import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import ArchiveClientPage from './ArchiveClientPage'

export default async function ArchiveServerPage(props: any) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect('/auth/login')

    const { data: userRecord } = await supabase
        .from('users')
        .select('role, email, course_id, private_lesson_id')
        .eq('id', user.id)
        .single()

    const isAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com'

    // Fetch all courses (for admin course selector)
    const { data: courses } = await supabase.from('courses').select('id, name').order('name')

    // Determine effective courseId:
    // - Student: their course_id OR private_lesson_id (whichever is set)
    // - Admin: from query param, defaulting to first course
    let courseId: string | null = null
    if (!isAdmin) {
        // 일반 학생: 쿼리 파라미터로 본인 소속 코스 선택 가능
        const searchParams = await props.searchParams
        const paramCourse = searchParams?.course || null

        // 본인 소속 코스만 허용 (보안)
        const myIds = [userRecord?.course_id, userRecord?.private_lesson_id].filter(Boolean)
        if (paramCourse && myIds.includes(paramCourse)) {
            courseId = paramCourse
        } else {
            courseId = userRecord?.course_id || userRecord?.private_lesson_id || null
        }
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

    // 개인레슨 여부 확인 (탭 표시에 사용)
    const hasBothCourses = !isAdmin && !!userRecord?.course_id && !!userRecord?.private_lesson_id
    const myCourses = !isAdmin ? [
        userRecord?.course_id ? (courses?.find(c => c.id === userRecord.course_id) || null) : null,
        userRecord?.private_lesson_id ? (courses?.find(c => c.id === userRecord.private_lesson_id) || null) : null,
    ].filter(Boolean) as { id: string; name: string }[] : []

    return (
        <ArchiveClientPage
            isAdmin={isAdmin}
            courseId={courseId}
            courseName={courseName}
            courses={isAdmin ? (courses || []) : []}
            myCourses={hasBothCourses ? myCourses : []}
        />
    )
}
