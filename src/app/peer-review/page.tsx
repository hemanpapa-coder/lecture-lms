import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import PeerReviewClient from './PeerReviewClient'

export default async function PeerReviewPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect('/auth/login')

    // Fetch anonymous assignments from OTHER users (not yet reviewed by current user)
    const { data: assignments } = await supabase
        .from('assignments')
        .select('id, week_number, file_url, content, status')
        .eq('is_anonymous', true)
        .neq('user_id', user.id)
        .limit(8)

    // Fetch reviews already submitted by this user
    const { data: myReviews } = await supabase
        .from('peer_reviews')
        .select('assignment_id, score, comment, created_at')
        .eq('reviewer_id', user.id)
        .order('created_at', { ascending: false })

    const myReviewMap = Object.fromEntries(
        (myReviews || []).map(r => [r.assignment_id, r])
    )

    // For each assignment, fetch its existing reviews (from all dummy users) to show as sample
    const assignmentIds = (assignments || []).map(a => a.id)
    const { data: allReviews } = await supabase
        .from('peer_reviews')
        .select('assignment_id, score, comment, created_at')
        .in('assignment_id', assignmentIds.length > 0 ? assignmentIds : ['00000000-0000-0000-0000-000000000000'])
        .order('created_at', { ascending: false })

    // Group reviews by assignment
    const reviewsByAssignment: Record<string, any[]> = {}
    for (const review of allReviews || []) {
        if (!reviewsByAssignment[review.assignment_id]) {
            reviewsByAssignment[review.assignment_id] = []
        }
        reviewsByAssignment[review.assignment_id].push(review)
    }

    return (
        <PeerReviewClient
            currentUserId={user.id}
            assignments={assignments || []}
            myReviewMap={myReviewMap}
            reviewsByAssignment={reviewsByAssignment}
        />
    )
}
