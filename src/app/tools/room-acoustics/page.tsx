import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import RoomAcousticsClient from './RoomAcousticsClient'

export default async function RoomAcousticsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/auth/login')
    }

    // Fetch user details for DB saves
    const { data: userRecord } = await supabase
        .from('users')
        .select('course_id, private_lesson_id, full_name, email')
        .eq('id', user.id)
        .single()

    const courseId = userRecord?.private_lesson_id || userRecord?.course_id || null

    return (
        <RoomAcousticsClient 
            userId={user.id} 
            courseId={courseId}
            userName={userRecord?.full_name || userRecord?.email || 'Student'}
        />
    )
}
