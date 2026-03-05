import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { assignmentId, score, comment } = body

        if (!assignmentId || !score) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        const scoreNum = parseInt(score, 10)
        if (isNaN(scoreNum) || scoreNum < 1 || scoreNum > 10) {
            return NextResponse.json({ error: 'Score must be between 1 and 10' }, { status: 400 })
        }

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Check if user is trying to review their own assignment
        const { data: assignmentData } = await supabase
            .from('assignments')
            .select('user_id')
            .eq('id', assignmentId)
            .single()

        if (assignmentData && assignmentData.user_id === user.id) {
            return NextResponse.json({ error: '자신의 과제는 평가할 수 없습니다.' }, { status: 400 })
        }

        // Insert peer review
        const { error } = await supabase
            .from('peer_reviews')
            .insert({
                assignment_id: assignmentId,
                reviewer_id: user.id,
                score: scoreNum,
                comment,
            })

        if (error) {
            if (error.code === '23505') {
                return NextResponse.json({ error: '이미 평가한 과제입니다.' }, { status: 409 })
            }
            console.error('Peer review insert error:', error)
            return NextResponse.json({ error: '평가 제출에 실패했습니다.' }, { status: 500 })
        }

        return NextResponse.json({ success: true })

    } catch (error) {
        console.error('Peer review submission error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
