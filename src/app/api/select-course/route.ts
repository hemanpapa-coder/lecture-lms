import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(req: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { courseId } = await req.json()
    if (!courseId) return NextResponse.json({ error: 'courseId required' }, { status: 400 })

    // Validate course exists
    const { data: course } = await supabase.from('courses').select('id').eq('id', courseId).single()
    if (!course) return NextResponse.json({ error: 'Invalid course' }, { status: 400 })

    // Update user's course
    const { error } = await supabase.from('users').update({ course_id: courseId }).eq('id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
}
