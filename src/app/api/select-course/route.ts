import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(req: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { classId, lessonId, isAuditor = false } = await req.json()
    if (!classId) return NextResponse.json({ error: 'classId required' }, { status: 400 })

    // Validate class exists
    const { data: classCourse } = await supabase.from('courses').select('id, name').eq('id', classId).eq('is_private_lesson', false).single()
    if (!classCourse) return NextResponse.json({ error: 'Invalid class' }, { status: 400 })

    let lessonCourse = null;
    if (lessonId) {
        const { data: lesson } = await supabase.from('courses').select('id, name').eq('id', lessonId).eq('is_private_lesson', true).single()
        if (!lesson) return NextResponse.json({ error: 'Invalid private lesson' }, { status: 400 })
        lessonCourse = lesson;
    }

    // Fetch current user record
    const { data: userRecord } = await supabase.from('users').select('course_id, private_lesson_id, is_approved').eq('id', user.id).single()

    // Note: Course changes are allowed. Admin approval will be reset if course changes.
    // This allows students to correct wrong course assignments.

    // Determine if we need to require approval again.
    // If they were already approved for this exact class, let's keep it approved.
    const wasAlreadyApproved = userRecord?.course_id === classId && userRecord?.is_approved === true;

    // Perform dual update
    const { error } = await supabase.from('users').update({
        course_id: classId,
        private_lesson_id: lessonId || null,
        is_approved: wasAlreadyApproved,
        is_auditor: isAuditor
    }).eq('id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Set active_course_id cookie in response. Always default to their regular class upon select.
    const response = NextResponse.json({ success: true })
    response.cookies.set('active_course_id', classId, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/'
    })
    return response
}
