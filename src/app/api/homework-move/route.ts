import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

// POST: 과제 제출 주차 이동 (관리자 전용)
// body: { submissionId, submissionType: 'board' | 'assign', newWeek }
export async function POST(req: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: userRecord } = await supabase.from('users').select('role').eq('id', user.id).single()
    const isAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com'
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { submissionId, submissionType, newWeek } = await req.json()
    if (!submissionId || !newWeek) return NextResponse.json({ error: 'submissionId and newWeek required' }, { status: 400 })

    if (submissionType === 'assign') {
        // assignments 테이블
        const { error } = await supabase
            .from('assignments')
            .update({ week_number: newWeek })
            .eq('id', submissionId)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
        // board_questions 테이블 — metadata.week_number 업데이트
        const { data: row, error: fetchErr } = await supabase
            .from('board_questions')
            .select('metadata')
            .eq('id', submissionId)
            .single()
        if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

        const updatedMeta = { ...(row?.metadata || {}), week_number: newWeek }
        const { error } = await supabase
            .from('board_questions')
            .update({ metadata: updatedMeta })
            .eq('id', submissionId)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
}
