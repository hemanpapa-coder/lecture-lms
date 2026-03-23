import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// POST: 과제 제출 주차 이동 (관리자 전용, RLS bypass)
export async function POST(req: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: userRecord } = await supabase.from('users').select('role').eq('id', user.id).single()
    const isAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com'
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { submissionId, submissionType, newWeek } = await req.json()
    if (!submissionId || !newWeek) {
        return NextResponse.json({ error: 'submissionId and newWeek required' }, { status: 400 })
    }

    // ── 관리자: 서비스 롤 키로 RLS bypass ──
    const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    if (!svcKey) {
        return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, { status: 500 })
    }
    const db = createAdminClient(url, svcKey)

    if (submissionType === 'assign') {
        // assignments 테이블 — week_number 업데이트
        const { data: updated, error } = await db
            .from('assignments')
            .update({ week_number: newWeek })
            .eq('id', submissionId)
            .select('id')

        if (error) return NextResponse.json({ error: `DB error: ${error.message}` }, { status: 500 })
        if (!updated || updated.length === 0) {
            return NextResponse.json({
                error: `assignments 테이블에서 ID를 찾지 못했습니다: ${submissionId}`
            }, { status: 404 })
        }
    } else {
        // board_questions 테이블 — metadata.week_number 업데이트
        const { data: row, error: fetchErr } = await db
            .from('board_questions')
            .select('id, metadata')
            .eq('id', submissionId)
            .single()

        if (fetchErr || !row) {
            return NextResponse.json({
                error: `board_questions 테이블에서 ID를 찾지 못했습니다: ${submissionId} (${fetchErr?.message || 'not found'})`
            }, { status: 404 })
        }

        const updatedMeta = { ...(row.metadata as any || {}), week_number: newWeek }
        const { data: updated, error: updateErr } = await db
            .from('board_questions')
            .update({ metadata: updatedMeta })
            .eq('id', submissionId)
            .select('id')

        if (updateErr) return NextResponse.json({ error: `Update error: ${updateErr.message}` }, { status: 500 })
        if (!updated || updated.length === 0) {
            return NextResponse.json({ error: `업데이트된 행 없음 (ID: ${submissionId})` }, { status: 500 })
        }
    }

    return NextResponse.json({ ok: true })
}
