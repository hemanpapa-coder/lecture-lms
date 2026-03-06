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

        // Query via session client (subject to RLS)
        const { data: sessionUsers, error: sessionError } = await supabase
            .from('users')
            .select('id, email, role, deleted_at')
            .eq('role', 'user')

        // Also check admin's own role in the DB
        const { data: myRecord } = await supabase
            .from('users')
            .select('id, email, role')
            .eq('id', user.id)
            .single()

        return NextResponse.json({
            loggedIn: user.email,
            isAdminEmail,
            myRoleInDb: myRecord?.role,
            myIdInDb: myRecord?.id,
            sessionUsersCount: sessionUsers?.length ?? 0,
            sessionUsers: sessionUsers,
            sessionError: sessionError
        })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
