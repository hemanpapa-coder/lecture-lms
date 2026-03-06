import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const body = await req.json()
        const { name, department, student_id, grade, phone, major, course_id } = body

        if (!name || !department || !student_id) {
            return NextResponse.json({ error: '이름, 학부/학과, 학번은 필수 항목입니다.' }, { status: 400 })
        }

        if (!course_id) {
            return NextResponse.json({ error: '과목을 선택해 주세요.' }, { status: 400 })
        }

        const { error } = await supabase
            .from('users')
            .update({
                name,
                department,
                student_id,
                grade: grade ? parseInt(grade) : null,
                phone: phone || null,
                major: major || null,
                course_id,
                course_ids: [course_id],
                profile_completed: true,
                is_approved: false,
                approval_request_count: 1,
                last_requested_at: new Date().toISOString(),
            })
            .eq('id', user.id)

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })

        return NextResponse.json({ success: true })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
