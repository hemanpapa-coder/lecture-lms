import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import PeerReviewClient from './PeerReviewClient'

export default async function PeerReviewPage({ searchParams }: { searchParams: { course?: string } }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect('/auth/login')

    // 1. Determine active course (fallback to a default logic or require the param if needed)
    // If no course explicitly requested via param, we could fetch their first enrolled course.
    let courseId = searchParams.course;
    if (!courseId) {
        const { data: attendance } = await supabase
            .from('class_attendances')
            .select('course_id')
            .eq('user_id', user.id)
            .limit(1)
            .single();
        if (attendance) courseId = attendance.course_id;
    }

    if (!courseId) {
        return <div className="p-8 text-center text-red-500">소속된 강의를 찾을 수 없습니다. 대시보드로 돌아가 강의를 선택해주세요.</div>
    }

    // 2. Fetch all classmates
    const { data: attendances } = await supabase
        .from('class_attendances')
        .select('user_id')
        .eq('course_id', courseId)
        .eq('role', 'student');

    const classmateIds = Array.from(new Set(attendances?.map(a => a.user_id) || []));

    const { data: students } = await supabase
        .from('users')
        .select('id, full_name, profile_image_url, major')
        .in('id', classmateIds)
        .order('full_name');

    // 3. Fetch Exam Submissions (수시과제PDF, 중간고사, 기말작품)
    const { data: examSubmissions } = await supabase
        .from('exam_submissions')
        .select('id, user_id, exam_type, file_url, content, status')
        .eq('course_id', courseId)
        .in('user_id', classmateIds);

    // 4. Fetch Weekly Assignments (We can just grab the latest or list them all)
    // Here we'll grab all and the client will group them.
    const { data: weeklyAssignments } = await supabase
        .from('assignments')
        .select('id, user_id, week_number, file_url, original_filename')
        .eq('course_id', courseId)
        .in('user_id', classmateIds)
        .is('deleted_at', null)
        .order('week_number', { ascending: false });

    // 5. Fetch Reviews I have given or received
    // To see what I've evaluated so far
    const { data: myReviews } = await supabase
        .from('portfolio_reviews')
        .select('reviewee_id, score_completeness, score_quality, comment')
        .eq('reviewer_id', user.id)
        .eq('course_id', courseId);

    const reviewedMap = Object.fromEntries((myReviews || []).map(r => [r.reviewee_id, r]));

    // Aggregate stats to show overall class review participation
    const { data: allReviews } = await supabase
        .from('portfolio_reviews')
        .select('reviewee_id')
        .eq('course_id', courseId);

    const reviewCounts: Record<string, number> = {};
    (allReviews || []).forEach(r => {
        reviewCounts[r.reviewee_id] = (reviewCounts[r.reviewee_id] || 0) + 1;
    });

    return (
        <PeerReviewClient
            currentUserId={user.id}
            courseId={courseId}
            students={students || []}
            examSubmissions={examSubmissions || []}
            weeklyAssignments={weeklyAssignments || []}
            reviewedMap={reviewedMap}
            reviewCounts={reviewCounts}
        />
    )
}

