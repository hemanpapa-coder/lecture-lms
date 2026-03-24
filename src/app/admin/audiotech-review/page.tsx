import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import AudioTechReviewClient from './AudioTechReviewClient'

export const dynamic = 'force-dynamic'

export default async function AudioTechReviewPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/auth/login')

    const { data: userRecord } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

    const isAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com'
    if (!isAdmin) redirect('/')

    // 오디오테크놀러지 관련 과목만 가져오기
    const { data: coursesRaw } = await supabase
        .from('courses')
        .select('id, name')
        .or('name.ilike.%오디오테크놀러지%,name.ilike.%오디오 테크놀러지%')
        .order('name')

    const courses = (coursesRaw || []) as { id: string; name: string }[]

    return <AudioTechReviewClient courses={courses} />
}
