import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import BoardClient from './BoardClient'

export default async function BoardPage(props: any) {
    const searchParams = await props.searchParams
    const boardType = searchParams?.type === 'suggestion' ? 'suggestion' : 'qna'

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect('/auth/login')

    // Get user's course_id so we scope Q&A by course
    const { data: userRecord } = await supabase
        .from('users')
        .select('course_id, role')
        .eq('id', user.id)
        .single()

    // Admins get the first course by default if no course_id
    const courseId = userRecord?.course_id
    if (!courseId) {
        // No course assigned, redirect home
        return (
            <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
                <div className="text-center space-y-3 p-8">
                    <p className="text-neutral-600 dark:text-neutral-400 font-bold">수강 중인 과목이 없습니다.</p>
                    <a href="/" className="text-blue-600 hover:underline text-sm font-semibold">← 홈으로</a>
                </div>
            </div>
        )
    }

    return <BoardClient userId={user.id} courseId={courseId} boardType={boardType} />
}
