import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

async function getAdminClient() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY
        ? createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY)
        : await createClient()
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { studentId, midterm_score, assignment_score, susi_score, midterm_bonus, final_bonus } = await req.json()
        if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 })

        const db = await getAdminClient()
        const { data: adminCheck } = await db.from('users').select('role').eq('id', user.id).single()
        if (adminCheck?.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden. Admin only.' }, { status: 403 })
        }

        // 현재 저장된 점수 조회 (가점 계산 기준 필요)
        const { data: currentEval } = await db
            .from('evaluations')
            .select('midterm_score, midterm_bonus, final_bonus')
            .eq('user_id', studentId)
            .single()

        // 중간 점수 계산:
        // - midterm_bonus가 전달된 경우: 원점수(raw) + 새 가점으로 midterm_score를 업데이트
        // - midterm_score가 직접 전달된 경우: 그 값을 원점수로 사용
        let finalMidtermScore: number | null = midterm_score !== undefined ? midterm_score : null
        const prevBonus = currentEval?.midterm_bonus ?? 0
        const prevScore = currentEval?.midterm_score ?? 0

        if (midterm_bonus !== undefined) {
            // 원점수(raw) = 현재 저장된 점수 - 이전 가점
            const rawScore = midterm_score !== undefined
                ? midterm_score  // 관리자가 직접 원점수를 바꾼 경우
                : Math.max(0, prevScore - prevBonus) // 기존 원점수 복원

            // 새 적용 점수 = 원점수 + 새 가점
            finalMidtermScore = rawScore + (midterm_bonus ?? 0)
        }

        const updatePayload: any = {
            midterm_score: finalMidtermScore,
            assignment_score: assignment_score !== undefined ? assignment_score : null,
            susi_score: susi_score !== undefined ? susi_score : null,
            updated_at: new Date().toISOString()
        }
        if (midterm_bonus !== undefined) updatePayload.midterm_bonus = midterm_bonus ?? 0
        if (final_bonus !== undefined) updatePayload.final_bonus = final_bonus ?? 0

        const { error } = await db
            .from('evaluations')
            .update(updatePayload)
            .eq('user_id', studentId)

        if (error) {
            const upsertPayload: any = {
                user_id: studentId,
                midterm_score: finalMidtermScore ?? 0,
                assignment_score: assignment_score !== undefined ? assignment_score : 0,
                susi_score: susi_score !== undefined ? susi_score : 0,
                updated_at: new Date().toISOString()
            }
            if (midterm_bonus !== undefined) upsertPayload.midterm_bonus = midterm_bonus ?? 0
            if (final_bonus !== undefined) upsertPayload.final_bonus = final_bonus ?? 0

            const { error: upsertError } = await db.from('evaluations').upsert(upsertPayload)
            if (upsertError) {
                return NextResponse.json({ error: upsertError.message }, { status: 500 })
            }
        }

        return NextResponse.json({ success: true })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
