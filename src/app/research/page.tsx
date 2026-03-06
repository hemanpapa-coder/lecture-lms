import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import ResearchClient from './ResearchClient'

export default async function ResearchPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/auth/login')

    const { data: userRecord } = await supabase
        .from('users')
        .select('role, course_id')
        .eq('id', user.id)
        .single()

    const isAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com'

    // Find 오디오테크놀러지 course
    const { data: course } = await supabase
        .from('courses')
        .select('id, name')
        .eq('name', '오디오테크놀러지')
        .single()

    // For non-admin: must be enrolled in this course
    if (!isAdmin && userRecord?.course_id !== course?.id) {
        redirect('/')
    }

    const courseId = course?.id || null

    // Fetch my uploads
    const { data: myUploads } = await supabase
        .from('research_uploads')
        .select('*')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

    // Fetch published uploads (all in this course)
    const { data: published } = await supabase
        .from('research_uploads')
        .select('*, users(email)')
        .eq('course_id', courseId || '')
        .eq('is_published', true)
        .is('deleted_at', null)
        .order('published_at', { ascending: false })

    return (
        <ResearchClient
            isAdmin={isAdmin}
            courseId={courseId || ''}
            courseName={course?.name || '오디오테크놀러지'}
            myUploads={myUploads || []}
            published={published || []}
            userId={user.id}
        />
    )
}
