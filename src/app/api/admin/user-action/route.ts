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
            // Hard delete: permanently remove from users table AND Supabase Auth
            // Step 1: Delete from users table
            const { error: dbError } = await adminSupabase
                .from('users')
                .delete()
                .eq('id', targetUserId)

            if (dbError) {
                console.error('[admin/delete] db error:', dbError)
                throw dbError
            }

            // Step 2: Delete from Supabase Auth (only possible with service role key)
            if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
                const { error: authError } = await adminSupabase.auth.admin.deleteUser(targetUserId)
                if (authError) {
                    // Log but don't fail - the users row is already gone
                    console.error('[admin/delete] auth error:', authError)
                }
            }
        } else if (action === 'move_course') {
            const newCourseId = formData.get('newCourseId') as string
            if (!newCourseId) {
                return NextResponse.json({ error: 'Missing newCourseId' }, { status: 400 })
            }

            // Instantly transfer to the new course. Keep them approved.
            const { error } = await adminSupabase
                .from('users')
                .update({
                    course_id: newCourseId,
                    is_approved: true, // Auto-approve them in the new course for convenience
                    course_role: 'student' // Reset special roles when switching courses
                })
                .eq('id', targetUserId)

            if (error) {
                console.error('[admin/move_course] error:', error)
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

