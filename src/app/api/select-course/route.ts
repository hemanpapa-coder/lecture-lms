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

    // Fetch existing course_ids for this user
    const { data: userRecord } = await supabase.from('users').select('course_ids, course_id').eq('id', user.id).single()
    const existingIds: string[] = userRecord?.course_ids || []

    // Add to course_ids array if not already present
    const newCourseIds = existingIds.includes(courseId) ? existingIds : [...existingIds, courseId]

    // Update user record: set course_id (primary) and add to course_ids array
    const { error } = await supabase.from('users').update({
        course_id: courseId,  // keep for backward compat
        course_ids: newCourseIds
    }).eq('id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Set active_course_id cookie in response
    const response = NextResponse.json({ success: true })
    response.cookies.set('active_course_id', courseId, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/'
    })
    return response
}
