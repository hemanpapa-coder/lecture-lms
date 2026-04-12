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

        // 1. Fetch all reviews for this course
        const { data: reviews, error: reviewsError } = await db
            .from('final_peer_reviews')
            .select(`
                id, score, comment, created_at,
                reviewer_id, reviewee_id
            `)
            .eq('course_id', courseId)
            
        if (reviewsError) return NextResponse.json({ error: reviewsError.message }, { status: 500 })

        // 2. Fetch users in this course to map names
        const { data: users, error: usersError } = await db
            .from('users')
            .select('id, name')
        
        if (usersError) return NextResponse.json({ error: usersError.message }, { status: 500 })
        
        const userMap = new Map(users.map(u => [u.id, u.name || '알 수 없음']))

        // Aggregate by reviewee
        const statsMap = new Map<string, {
            userId: string,
            userName: string,
            receivedReviews: any[],
            avgScore: number
        }>()

        for (const review of (reviews || [])) {
            const revieweeId = review.reviewee_id
            if (!statsMap.has(revieweeId)) {
                statsMap.set(revieweeId, {
                    userId: revieweeId,
                    userName: userMap.get(revieweeId) || 'User',
                    receivedReviews: [],
                    avgScore: 0
                })
            }
            const stat = statsMap.get(revieweeId)!
            stat.receivedReviews.push({
                reviewerId: review.reviewer_id,
                reviewerName: userMap.get(review.reviewer_id) || 'User',
                score: review.score,
                comment: review.comment
            })
        }

        // Calculate averages
        const results = Array.from(statsMap.values()).map(stat => {
            if (stat.receivedReviews.length > 0) {
                const total = stat.receivedReviews.reduce((sum, r) => sum + r.score, 0)
                stat.avgScore = parseFloat((total / stat.receivedReviews.length).toFixed(2))
            }
            return stat
        }).sort((a, b) => b.avgScore - a.avgScore) // Sort by highest score

        return NextResponse.json({ stats: results })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
