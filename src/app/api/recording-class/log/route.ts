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
        const { course_id, week_number, last_week_done, this_week_plan, progress_percent } = body

        if (!course_id || !week_number) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
        }

        const { error } = await supabase
            .from('production_logs')
            .upsert({
                user_id: user.id,
                course_id,
                week_number,
                last_week_done,
                this_week_plan,
                progress_percent,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id,course_id,week_number'
            })

        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (e: any) {
        console.error('Log save error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
