import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

/**
 * Admin-only: Manage course active/ended status
 * POST { action: 'end' | 'reopen' | 'toggle-late-submission', courseId }
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: adminRecord } = await supabase
            .from('users').select('role').eq('id', user.id).single()
        const isAdmin = adminRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com'
        if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const { action, courseId } = await req.json()
        if (!courseId) return NextResponse.json({ error: 'courseId required' }, { status: 400 })

        const db = process.env.SUPABASE_SERVICE_ROLE_KEY
            ? createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY)
            : supabase

        if (action === 'end') {
            const now = new Date()
            const { error } = await db.from('courses').update({
                is_ended: true,
                ended_at: now.toISOString(),
                ended_year: now.getFullYear(),
                semester_end_date: now.toISOString().slice(0, 10), // also set privacy retention date
            }).eq('id', courseId)
            if (error) return NextResponse.json({ error: error.message }, { status: 500 })
            return NextResponse.json({ success: true, action: 'ended' })
        }

        if (action === 'reopen') {
            const { error } = await db.from('courses').update({
                is_ended: false,
                ended_at: null,
                ended_year: null,
            }).eq('id', courseId)
            if (error) return NextResponse.json({ error: error.message }, { status: 500 })
            return NextResponse.json({ success: true, action: 'reopened' })
        }

        if (action === 'toggle-late-submission') {
            // First get current value
            const { data: course } = await db.from('courses').select('late_submission_allowed').eq('id', courseId).single()
            const newVal = !(course?.late_submission_allowed ?? true)
            const { error } = await db.from('courses').update({ late_submission_allowed: newVal }).eq('id', courseId)
            if (error) return NextResponse.json({ error: error.message }, { status: 500 })
            return NextResponse.json({ success: true, late_submission_allowed: newVal })
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
