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

    // Fetch all courses (for admin course selector) — 개인레슨 과목 제외 (아카이브 탭 불필요)
    const { data: coursesRaw } = await supabase.from('courses').select('id, name, is_private_lesson').order('name')
    const courses = (coursesRaw || []).filter(c => !c.is_private_lesson)

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

    // Fetch course name + private lesson flag
    let courseName = '자료 아카이브'
    let isPrivateLesson = false
    if (courseId) {
        const found = courses?.find(c => c.id === courseId)
        if (found) courseName = found.name
        const { data: courseInfo } = await supabase.from('courses').select('is_private_lesson, name').eq('id', courseId).single()
        isPrivateLesson = !!courseInfo?.is_private_lesson
        if (courseInfo?.name) courseName = courseInfo.name

        // ── 개인레슨 서브코스(학생 전용 sub-course) 직접 접근 방지 ──
        // 이 코스가 학생의 private_lesson_id로 연결된 서브코스인지 확인
        const { data: studentForCourse } = await supabase
            .from('users')
            .select('id, private_lesson_id')
            .eq('private_lesson_id', courseId)
            .maybeSingle()

        if (studentForCourse?.private_lesson_id === courseId) {
            // 서브코스임 → 우산(umbrella) 개인레슨 코스 찾기
            // 우산코스 = is_private_lesson=true 이면서 어떤 학생의 private_lesson_id에도 쓰이지 않은 코스
            const { data: allStudentLessons } = await supabase
                .from('users').select('private_lesson_id').not('private_lesson_id', 'is', null)
            const usedSubIds = new Set((allStudentLessons || []).map((u: any) => u.private_lesson_id).filter(Boolean))
            const { data: allPrivateLessonCourses } = await supabase
                .from('courses').select('id').eq('is_private_lesson', true)
            const umbrellaId = (allPrivateLessonCourses || []).find((c: any) => !usedSubIds.has(c.id))?.id

            if (isAdmin) {
                redirect(`/?view=admin&course=${umbrellaId || courseId}&student=${studentForCourse.id}`)
            } else {
                redirect(`/archive/1?course=${courseId}`)
            }
        }
    }

    // 개인레슨 여부 확인 (탭 표시에 사용)
    const hasBothCourses = !isAdmin && !!userRecord?.course_id && !!userRecord?.private_lesson_id
    const myCourses = !isAdmin ? [
        userRecord?.course_id ? (courses?.find(c => c.id === userRecord.course_id) || null) : null,
        // 개인레슨 과목은 아카이브 탭에서 숨김
        // userRecord?.private_lesson_id ? (courses?.find(c => c.id === userRecord.private_lesson_id) || null) : null,
    ].filter(Boolean) as { id: string; name: string }[] : []

    return (
        <ArchiveClientPage
            isAdmin={isAdmin}
            courseId={courseId}
            courseName={courseName}
            courses={isAdmin ? (courses || []) : []}
            myCourses={hasBothCourses ? myCourses : []}
            isPrivateLesson={isPrivateLesson}
        />
    )
}
