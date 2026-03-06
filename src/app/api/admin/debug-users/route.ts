import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
    try {
        // First, verify the calling user is admin
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })

        const isAdminEmail = user.email === 'hemanpapa@gmail.com'

        // Simple query (no join)
        const { data: sessionUsers, error: sessionError } = await supabase
            .from('users')
            .select('id, email, role, deleted_at')
            .eq('role', 'user')

        // Exact same query as admin/page.tsx
        const { data: adminPageUsers, error: adminPageError } = await supabase
            .from('users')
            .select('id, email, role, created_at, is_approved, department, name, student_id, course_id, courses(name)')
            .eq('role', 'user')
            .is('deleted_at', null)
            .order('created_at', { ascending: false })

        // Also check admin's own role in the DB
        const { data: myRecord } = await supabase
            .from('users')
            .select('id, email, role')
            .eq('id', user.id)
            .single()

        // Check if courses table exists
        const { data: coursesData, error: coursesError } = await supabase
            .from('courses')
            .select('id, name')
            .limit(1)

        // Check if evaluations table exists
        const { data: evaluationsData, error: evaluationsError } = await supabase
            .from('evaluations')
            .select('*')
            .limit(1)

        return NextResponse.json({
            loggedIn: user.email,
            isAdminEmail,
            myRoleInDb: myRecord?.role,
            myIdInDb: myRecord?.id,
            coursesTableExists: !coursesError,
            coursesError: coursesError,
            evaluationsTableExists: !evaluationsError,
            evaluationsError: evaluationsError,
            simpleQueryCount: sessionUsers?.length ?? 0,
            simpleQueryError: sessionError,
            adminPageQueryCount: adminPageUsers?.length ?? 0,
            adminPageQueryError: adminPageError,
            adminPageUsers: adminPageUsers,
        })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
