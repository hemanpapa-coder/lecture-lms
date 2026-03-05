import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import ProfileSetupClient from './ProfileSetupClient'

export default async function ProfileSetupPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/auth/login')

    const { data: userRecord } = await supabase
        .from('users')
        .select('role, course_id, profile_completed, email, department, student_id, grade, phone, major')
        .eq('id', user.id)
        .single()

    // Admins skip this
    if (userRecord?.role === 'admin') redirect('/')
    // Must have course first
    if (!userRecord?.course_id) redirect('/auth/select-course')
    // Already done
    if (userRecord?.profile_completed) redirect('/')

    // Fetch course name
    const { data: courseData } = await supabase
        .from('courses')
        .select('name')
        .eq('id', userRecord.course_id)
        .single()

    return (
        <ProfileSetupClient
            email={user.email || ''}
            courseName={courseData?.name || ''}
            existingData={{
                department: userRecord?.department || '',
                student_id: userRecord?.student_id || '',
                grade: userRecord?.grade || 1,
                phone: userRecord?.phone || '',
                major: userRecord?.major || '',
            }}
        />
    )
}
