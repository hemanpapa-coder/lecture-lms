import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(req: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { courseId } = await req.json()
    if (!courseId) return NextResponse.json({ error: 'courseId required' }, { status: 400 })

    // Validate course exists
    const { data: course } = await supabase.from('courses').select('id, name').eq('id', courseId).single()
    if (!course) return NextResponse.json({ error: 'Invalid course' }, { status: 400 })

    // Fetch current user record
    const { data: userRecord } = await supabase.from('users').select('course_id, is_approved').eq('id', user.id).single()

    // STRICT SINGLE-COURSE ENFORCEMENT:
    // If student already has a DIFFERENT course_id, refuse the request.
    // Only the admin can change a student's course via the admin dashboard.
    if (userRecord?.course_id && userRecord.course_id !== courseId) {
        const { data: currentCourse } = await supabase.from('courses').select('name').eq('id', userRecord.course_id).single()
        return NextResponse.json({
            error: `이미 다른 과목(${currentCourse?.name || '알 수 없음'})에 수강 신청되어 있습니다. 과목 변경은 관리자에게 문의하세요.`,
            alreadyEnrolled: true,
            currentCourseId: userRecord.course_id
        }, { status: 409 })
    }

    // First-time enrollment or re-selecting the same course
    const keepApproval = userRecord?.course_id === courseId && userRecord?.is_approved === true
    const { error } = await supabase.from('users').update({
        course_id: courseId,
        course_ids: [courseId],  // reset to single course array
        is_approved: keepApproval, // keep approval only if re-selecting same course
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
