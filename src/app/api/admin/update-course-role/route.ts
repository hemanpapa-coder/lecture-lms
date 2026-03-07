import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        // 1. Check if the current user is an admin
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { data: adminUser } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single()

        if (adminUser?.role !== 'admin' && user.email !== 'hemanpapa@gmail.com') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // 2. Parse request
        const body = await req.json()
        const { targetUserId, newRole } = body

        if (!targetUserId) {
            return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 })
        }

        // 3. Update the course_role
        // newRole can be 'student', 'sound_engineer_rep', 'musician_rep', or null
        const { error } = await supabase
            .from('users')
            .update({ course_role: newRole || 'student' })
            .eq('id', targetUserId)

        if (error) {
            console.error('Error updating course_role:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true })

    } catch (e: any) {
        console.error('Update Course Role Error:', e)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
