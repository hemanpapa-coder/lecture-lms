import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import WeekPageClient from './WeekPageClient'

export default async function WeekPage({ params, searchParams }: { params: Promise<{ week: string }>, searchParams: Promise<{ course?: string }> }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect('/auth/login')

    const { week } = await params
    const weekNumber = parseInt(week)
    if (isNaN(weekNumber) || weekNumber < 1 || weekNumber > 15) redirect('/archive')

    const { data: userRecord } = await supabase
        .from('users')
        .select('role, course_id')
        .eq('id', user.id)
        .single()

    const isAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com'
    const sp = await searchParams
    const courseId = sp.course || userRecord?.course_id || null

    // Fetch page content for this week + course
    let pageQuery = supabase
        .from('archive_pages')
        .select('*')
        .eq('week_number', weekNumber)
    if (courseId) pageQuery = pageQuery.eq('course_id', courseId)
    const { data: pageData } = await pageQuery.single()

    // Fetch files for this week + course
    let filesQuery = supabase
        .from('archives')
        .select('*')
        .eq('week_number', weekNumber)
        .is('deleted_at', null)
    if (courseId) filesQuery = filesQuery.eq('course_id', courseId)
    const { data: files } = await filesQuery.order('created_at', { ascending: false })

    const page = pageData || {
        week_number: weekNumber,
        title: `${weekNumber}주차 강의 자료`,
        content: '',
        updated_at: null,
    }

    // --- Cross-pollination for Home Recording A & B Q&A ---
    let qnaThreads: any[] = []
    if (courseId) {
        const { data: courseData } = await supabase.from('courses').select('name').eq('id', courseId).single()
        const isHomeRecording = courseData?.name?.includes('홈레코딩과 음향학') || false

        let courseIdsToQuery = [courseId]
        if (isHomeRecording) {
            const { data: hrCourses } = await supabase.from('courses').select('id').like('name', '%홈레코딩과 음향학%')
            if (hrCourses) {
                courseIdsToQuery = hrCourses.map(c => c.id)
            }
        }

        const { data: questions } = await supabase
            .from('board_questions')
            .select(`
                id, title, content, created_at, user_id, type, course_id,
                users ( name )
            `)
            .in('course_id', courseIdsToQuery)
            .eq('target_week', weekNumber)
            .order('created_at', { ascending: false })

        if (questions && questions.length > 0) {
            const qIds = questions.map(q => q.id)
            const { data: replies } = await supabase
                .from('board_replies')
                .select('id, question_id, content, created_at, is_private')
                .in('question_id', qIds)
                .order('created_at', { ascending: true })

            qnaThreads = questions.map(q => ({
                ...q,
                replies: (replies || []).filter(r => r.question_id === q.id)
            }))
        }
    }

    return (
        <WeekPageClient
            isAdmin={isAdmin}
            initialPage={page}
            initialFiles={files || []}
            weekNumber={weekNumber}
            courseId={courseId}
            qnaThreads={qnaThreads}
        />
    )
}
