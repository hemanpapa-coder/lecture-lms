import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: dbUser } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (dbUser?.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    try {
        const body = await request.json()
        const { studentId, courseId } = body

        if (!studentId || !courseId) {
            return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
        }

        // 재응시 허가: evaluations 의 midterm_score 를 강제로 null 로 만듭니다.
        const { error: evalError } = await supabase
            .from('evaluations')
            .update({ midterm_score: null })
            .eq('user_id', studentId)
            .eq('course_id', courseId)
            
        if (evalError) throw evalError

        // exam_submissions 에서도 해당하는 제출 내역 삭제하거나 status 를 업데이트합니다.
        // 여기서는 그냥 해당 기록을 삭제하여 아예 새로 제출한 것과 같은 상태로 만듭니다.
        const { error: subError } = await supabase
            .from('exam_submissions')
            .delete()
            .eq('user_id', studentId)
            .eq('course_id', courseId)
            .eq('exam_type', '중간고사')

        if (subError) throw subError

        return NextResponse.json({ success: true })
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
