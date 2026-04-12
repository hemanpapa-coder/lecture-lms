import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

async function getAdminClient() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY
        ? createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY)
        : await createClient()
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { studentId, midterm_score, assignment_score, susi_score } = await req.json()
        if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 })

        // Check if admin
        const db = await getAdminClient()
        const { data: adminCheck } = await db.from('users').select('role').eq('id', user.id).single()
        if (adminCheck?.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden. Admin only.' }, { status: 403 })
        }

        // Update evaluations table
        const { error } = await db
            .from('evaluations')
            .update({
                midterm_score: midterm_score !== undefined ? midterm_score : null,
                assignment_score: assignment_score !== undefined ? assignment_score : null,
                susi_score: susi_score !== undefined ? susi_score : null,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', studentId)

        if (error) {
            // If the row doesn't exist, we might need to insert it. Upsert is safer.
            const { error: upsertError } = await db
                .from('evaluations')
                .upsert({
                    user_id: studentId,
                    midterm_score: midterm_score !== undefined ? midterm_score : 0,
                    assignment_score: assignment_score !== undefined ? assignment_score : 0,
                    susi_score: susi_score !== undefined ? susi_score : 0,
                    updated_at: new Date().toISOString()
                })
            
            if (upsertError) {
                return NextResponse.json({ error: upsertError.message }, { status: 500 })
            }
        }

        return NextResponse.json({ success: true })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
