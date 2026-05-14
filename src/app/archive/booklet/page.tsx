import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import BookletClient from './BookletClient'

export const metadata = {
  title: '강의 소책자',
}

export default async function BookletServerPage(props: any) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect('/auth/login')

    const searchParams = await props.searchParams
    const courseId = searchParams?.course || null

    if (!courseId) {
        redirect('/archive')
    }

    // Fetch course name
    const { data: courseInfo } = await supabase.from('courses').select('name').eq('id', courseId).single()
    const courseName = courseInfo?.name || '강의 자료'

    // Fetch all pages for the course
    const { data: pages } = await supabase
        .from('archive_pages')
        .select('week_number, title, ai_summary_html')
        .eq('course_id', courseId)
        .order('week_number', { ascending: true })

    if (!pages || pages.length === 0) {
        return (
            <div className="p-8 text-center text-neutral-500">
                <h2>등록된 강의 자료가 없습니다.</h2>
            </div>
        )
    }

    return (
        <BookletClient courseName={courseName} pages={pages} />
    )
}
