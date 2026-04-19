import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

async function getAdminClient() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY
        ? createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY)
        : await createClient()
}

export async function GET(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const courseId = req.nextUrl.searchParams.get('courseId')
        if (!courseId) return NextResponse.json({ error: 'courseId required' }, { status: 400 })

        // Check if admin
        const db = await getAdminClient()
        const { data: adminCheck } = await db.from('users').select('role').eq('id', user.id).single()
        if (adminCheck?.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden. Admin only.' }, { status: 403 })
        }

        // 1. 이 과목의 전체 학생 목록 (관리자 제외)
        //    course_ids 배열 타입과 course_id 단일 타입 모두 지원
        const [{ data: studentsArr }, { data: studentsSingle }] = await Promise.all([
            db.from('users')
                .select('id, name')
                .contains('course_ids', [courseId])
                .neq('role', 'admin'),
            db.from('users')
                .select('id, name')
                .eq('course_id', courseId)
                .neq('role', 'admin'),
        ])

        // 중복 제거 후 전체 수강생 맵
        const allStudents = [...(studentsArr || []), ...(studentsSingle || [])]
        const userMap = new Map(allStudents.map((u: any) => [u.id, u.name || '알 수 없음']))
        const totalStudents = userMap.size

        // 2. 이 과목의 모든 상호평가 데이터 가져오기
        const { data: reviews, error: reviewsError } = await db
            .from('final_peer_reviews')
            .select('id, score, comment, created_at, reviewer_id, reviewee_id')
            .eq('course_id', courseId)

        if (reviewsError) return NextResponse.json({ error: reviewsError.message }, { status: 500 })

        const reviewList = reviews || []

        // 3. 투표율(참여율) 계산
        //    - 최소 1건이라도 평가를 제출한 고유 학생 수 / 전체 수강생 수
        const uniqueReviewers = new Set(reviewList.map((r: any) => r.reviewer_id))
        const totalReviewers = uniqueReviewers.size
        const participationRate = totalStudents > 0
            ? parseFloat(((totalReviewers / totalStudents) * 100).toFixed(1))
            : 0

        // 4. 피평가자(reviewee) 기준으로 집계
        const statsMap = new Map<string, {
            userId: string
            userName: string
            receivedReviews: any[]
            avgScore: number
        }>()

        for (const review of reviewList) {
            const revieweeId = (review as any).reviewee_id
            if (!statsMap.has(revieweeId)) {
                statsMap.set(revieweeId, {
                    userId: revieweeId,
                    userName: userMap.get(revieweeId) || '알 수 없음',
                    receivedReviews: [],
                    avgScore: 0
                })
            }
            const stat = statsMap.get(revieweeId)!
            stat.receivedReviews.push({
                reviewerId: (review as any).reviewer_id,
                reviewerName: userMap.get((review as any).reviewer_id) || '알 수 없음',
                score: (review as any).score,
                comment: (review as any).comment
            })
        }

        // 5. 평균 점수 계산 및 점수 내림차순 정렬
        const results = Array.from(statsMap.values()).map(stat => {
            if (stat.receivedReviews.length > 0) {
                const total = stat.receivedReviews.reduce((sum, r) => sum + r.score, 0)
                stat.avgScore = parseFloat((total / stat.receivedReviews.length).toFixed(2))
            }
            return stat
        }).sort((a, b) => b.avgScore - a.avgScore)

        return NextResponse.json({
            stats: results,
            summary: {
                totalStudents,          // 전체 수강생 수
                totalReviewers,         // 평가를 1건 이상 제출한 학생 수
                totalReviews: reviewList.length,  // 제출된 총 평가 건수
                participationRate,      // 투표율 (%)
            }
        })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
