import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        // Check if admin
        const { data: adminRecord } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single()

        const isRealAdmin = adminRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com'
        if (!isRealAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const formData = await req.formData()
        const targetUserId = formData.get('userId') as string
        const action = formData.get('action') as string

        if (!targetUserId || !action) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
        }

        // Use service role client if available (bypasses RLS)
        const adminSupabase = process.env.SUPABASE_SERVICE_ROLE_KEY
            ? createAdminClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY
            )
            : supabase

        if (action === 'approve') {
            const { error } = await adminSupabase
                .from('users')
                .update({ is_approved: true })
                .eq('id', targetUserId)

            if (error) {
                console.error('[admin/approve] error:', error)
                throw error
            }
        } else if (action === 'delete') {
            // Soft remove from course: clear course info but keep the user account
            // This allows the user to log in and select a different course.
            const { error } = await adminSupabase
                .from('users')
                .update({
                    course_id: null,
                    is_approved: false,
                    course_role: 'student'
                })
                .eq('id', targetUserId)

            if (error) {
                console.error('[admin/delete] error:', error)
                throw error
            }
        }

        // Redirect back to admin page
        return NextResponse.redirect(new URL('/admin?tab=students', req.url), 303)
    } catch (err: any) {
        console.error('Admin action error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

