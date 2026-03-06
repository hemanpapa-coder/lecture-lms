import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { google } from 'googleapis'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()

        // 1. Auth check
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await req.json()
        const { id, fileId } = body

        if (!id) {
            return NextResponse.json({ error: 'Missing assignment ID' }, { status: 400 })
        }

        // 2. Fetch assignment to verify ownership or admin status
        const { data: assignment, error: fetchError } = await supabase
            .from('assignments')
            .select('user_id')
            .eq('id', id)
            .single()

        if (fetchError || !assignment) {
            return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
        }

        const { data: userRecord } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single()

        const isRealAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com'

        // Only owner or admin can delete
        if (assignment.user_id !== user.id && !isRealAdmin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // 3. SOFT DELETE: Mark deleted_at instead of hard delete
        const { error: deleteError } = await supabase
            .from('assignments')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id)

        if (deleteError) {
            throw deleteError
        }

        return NextResponse.json({ success: true, message: 'Deleted successfully' })

    } catch (error: any) {
        console.error('Delete API Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
