import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

// GET /api/student/peer-eval-list?courseId=xxx
export async function GET(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const courseId = req.nextUrl.searchParams.get('courseId')
        if (!courseId) return NextResponse.json({ error: 'courseId required' }, { status: 400 })

        // 1. Get all users in this course (excluding the current user, or maybe keep them but hide in UI)
        // For simplicity, just fetch all users who have this courseId in course_ids array or course_id.
        // We'll rely on the courses association.
        // Wait, 'users' table has course_ids array or course_id string. 
        const { data: peers, error: peersError } = await supabase
            .from('users')
            .select('id, name, email')
            .contains('course_ids', [courseId])

        // Fallback for single course_id users
        const { data: peersFallback, error: fallbackError } = await supabase
            .from('users')
            .select('id, name, email')
            .eq('course_id', courseId)

        if (peersError && fallbackError) {
            return NextResponse.json({ error: peersError?.message || fallbackError?.message }, { status: 500 })
        }

        // Merge and deduplicate peers
        const allPeers = [...(peers || []), ...(peersFallback || [])]
        const uniquePeers = Array.from(new Map(allPeers.map(item => [item.id, item])).values())
            .filter(p => p.id !== user.id) // Exclude oneself

        // 2. Get my submitted reviews
        const { data: myReviews, error: reviewsError } = await supabase
            .from('final_peer_reviews')
            .select('reviewee_id, score, comment')
            .eq('course_id', courseId)
            .eq('reviewer_id', user.id)

        if (reviewsError) return NextResponse.json({ error: reviewsError.message }, { status: 500 })

        // 3. Map the reviews to the peers
        const peerList = uniquePeers.map((p: any) => {
            const review = myReviews?.find((r: any) => r.reviewee_id === p.id)
            return {
                ...p,
                score: review?.score || null,
                comment: review?.comment || ''
            }
        })

        return NextResponse.json({ peers: peerList })

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

// POST /api/student/peer-eval-list
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { courseId, revieweeId, score, comment } = await req.json()
        if (!courseId || !revieweeId || !score) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        // Insert or Update the rating
        const { error } = await supabase
            .from('final_peer_reviews')
            .upsert({
                course_id: courseId,
                reviewer_id: user.id,
                reviewee_id: revieweeId,
                score,
                comment,
                created_at: new Date().toISOString()
            }, {
                onConflict: 'course_id,reviewer_id,reviewee_id'
            })

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
