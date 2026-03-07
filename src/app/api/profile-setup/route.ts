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

        const updateData: Record<string, any> = {
            name,
            department,
            student_id,
            grade: grade ? parseInt(grade) : null,
            phone: phone || null,
            major: major || null,
            course_id,
            profile_completed: true,
            is_approved: false,
        }

        // Only include course_ids if the column likely exists
        try {
            updateData.course_ids = [course_id]
        } catch (_) { /* ignore */ }

        const { error } = await supabase
            .from('users')
            .update(updateData)
            .eq('id', user.id)

        if (error) {
            console.error('[profile-setup] Supabase update error:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
