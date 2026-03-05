import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()

        // 1. Verify Authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 })
        }

        // 2. Parse Request Body
        const body = await req.json()
        const { course_id, reviewee_id, score_completeness, score_quality, comment } = body

        if (!course_id || !reviewee_id || !score_completeness || !score_quality || !comment) {
            return NextResponse.json({ error: '필수 데이터가 누락되었습니다.' }, { status: 400 })
        }

        if (comment.trim().length < 10) {
            return NextResponse.json({ error: '감상평은 최소 10자 이상 작성해야 합니다.' }, { status: 400 })
        }

        if (user.id === reviewee_id) {
            return NextResponse.json({ error: '본인의 작품은 평가할 수 없습니다.' }, { status: 400 })
        }

        // 3. Insert into Database
        const { error: insertError } = await supabase
            .from('portfolio_reviews')
            .insert({
                reviewer_id: user.id,
                reviewee_id: reviewee_id,
                course_id: course_id,
                score_completeness: score_completeness,
                score_quality: score_quality,
                comment: comment.trim()
            })

        if (insertError) {
            console.error('Insert Review Error:', insertError)
            return NextResponse.json({ error: '이미 평가를 완료했거나 데이터베이스 오류가 발생했습니다.' }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Review API Error:', error)
        return NextResponse.json({ error: '서버 내부 오류가 발생했습니다.' }, { status: 500 })
    }
}
