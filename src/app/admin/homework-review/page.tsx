import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import HomeworkReviewClient from './HomeworkReviewClient'

export const dynamic = 'force-dynamic'

export default async function HomeworkReviewPage() {
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

    // 홈레코딩 관련 과목만 가져오기
    const { data: coursesRaw } = await supabase
        .from('courses')
        .select('id, name')
        .or('name.ilike.%홈레코딩%,name.ilike.%음향학%,name.ilike.%home%recording%')
        .order('name')

    const courses = (coursesRaw || []) as { id: string; name: string }[]

    return <HomeworkReviewClient courses={courses} />
}
