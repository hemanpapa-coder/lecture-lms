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
        const { course_id, score } = body

        if (!course_id || score === undefined) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
        }
        
        const participationScore = parseInt(score, 10);
        
        if (isNaN(participationScore) || participationScore < 0 || participationScore > 20) {
            return NextResponse.json({ error: 'Invalid score value' }, { status: 400 })
        }

        // We use midterm_score field for the Audio Tech "Participation" score.
        // We do an upsert so that it creates an evaluation record if it doesn't exist.
        const { error } = await supabase
            .from('evaluations')
            .upsert({
                user_id: user.id,
                course_id,
                midterm_score: participationScore,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id,course_id'
            })

        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (e: any) {
        console.error('Participation save error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
