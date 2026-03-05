import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const body = await request.json()
        const { course_id, week_number, status, reason_text } = body

        if (!course_id || !week_number || !status) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
        }

        const { error } = await supabase
            .from('class_attendances')
            .upsert({
                user_id: user.id,
                course_id,
                week_number,
                status,
                reason_text,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id,course_id,week_number'
            })

        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (e: any) {
        console.error('Attendance save error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
