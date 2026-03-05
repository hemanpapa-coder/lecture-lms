import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const body = await req.json()
        const { department, student_id, grade, phone, major } = body

        if (!department || !student_id || !grade || !phone || !major) {
            return NextResponse.json({ error: '모든 항목을 입력해 주세요.' }, { status: 400 })
        }

        const { error } = await supabase
            .from('users')
            .update({
                department,
                student_id,
                grade: parseInt(grade),
                phone,
                major,
                profile_completed: true,
            })
            .eq('id', user.id)

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })

        return NextResponse.json({ success: true })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
