import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { ArrowLeft, Star, User, FileText, Music, Youtube, CheckCircle2 } from 'lucide-react'
import ReviewForm from './ReviewForm'

export default async function StudentPortfolioPage({
    params,
    searchParams
}: {
    params: { student_id: string }
    searchParams: { course?: string }
}) {
    const supabase = await createClient()

    // 1. Fetch current user (Reviewer)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return <div className="p-8 text-center text-red-500">로그인이 필요합니다.</div>
    }

    const courseId = searchParams.course
    const revieweeId = params.student_id

    if (!courseId || !revieweeId) {
        return <div className="p-8 text-center text-red-500">잘못된 접근입니다.</div>
    }

    // 2. Fetch Reviewee Info
    const { data: reviewee } = await supabase
        .from('users')
        .select('*')
        .eq('id', revieweeId)
        .single()

    if (!reviewee) return <div className="p-8 text-center">학생 정보를 찾을 수 없습니다.</div>

    // 3. Fetch Reviewee's Submissions (Exam/Final)
    const { data: examSubmissions } = await supabase
        .from('exam_submissions')
        .select('*')
        .eq('user_id', revieweeId)
        .eq('course_id', courseId)
        .order('created_at', { ascending: false })

    // 4. Fetch Reviewee's Production Logs (Susi)
    const { data: productionLogs } = await supabase
        .from('production_logs')
        .select('*')
        .eq('user_id', revieweeId)
        .eq('course_id', courseId)
        .order('week_number', { ascending: true })

    // 5. Check if I already reviewed this person
    const { data: existingReview } = await supabase
        .from('portfolio_reviews')
        .select('*')
        .eq('reviewer_id', user.id)
        .eq('reviewee_id', revieweeId)
        .eq('course_id', courseId)
        .single()

    const finalSubmission = examSubmissions?.find(s => s.exam_type === '기말작품')
    const midtermSubmission = examSubmissions?.find(s => s.exam_type === '중간고사' || s.exam_type === '수시과제PDF')

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-20">
            {/* Header */}
            <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href={`/recording-class/gallery?course=${courseId}`} className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                            <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                        </Link>
                        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                            {reviewee.full_name}님의 포트폴리오
                        </h1>
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 sm:px-6 mt-8 space-y-8">

                {/* Profile Section */}
                <section className="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row gap-6 items-center sm:items-start border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div className="w-32 h-32 shrink-0 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-700 border-4 border-white dark:border-slate-800 shadow-lg flex items-center justify-center">
                        {reviewee.profile_image_url ? (
                            <img src={reviewee.profile_image_url} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                            <User className="w-16 h-16 text-slate-300 dark:text-slate-500" />
                        )}
                    </div>
                    <div className="flex-1 text-center sm:text-left">
                        <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">{reviewee.full_name}</h2>
                        <p className="text-slate-500 dark:text-slate-400 font-medium mb-4">{reviewee.major || '전공 미입력'}</p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                                <p className="text-xs font-bold text-indigo-500 mb-1">이 수업을 통해 하고 싶은 목표</p>
                                <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                                    {reviewee.class_goal || '작성된 목표가 없습니다.'}
                                </p>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                                <p className="text-xs font-bold text-indigo-500 mb-1">간략한 자기소개</p>
                                <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                                    {reviewee.introduction || '작성된 자기소개가 없습니다.'}
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Final Submission */}
                <section>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                        <Music className="w-5 h-5 text-indigo-500" /> 기말 최종 작품
                    </h3>
                    {finalSubmission ? (
                        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                            <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap mb-4">
                                {finalSubmission.content || '작품 설명이 없습니다.'}
                            </p>
                            {finalSubmission.file_url ? (
                                <div className="mt-4">
                                    <a href={finalSubmission.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-white rounded-xl transition font-medium text-sm">
                                        <Youtube className="w-4 h-4 text-red-500" /> 작품 링크 열기
                                    </a>
                                </div>
                            ) : (
                                <p className="text-xs text-orange-500">첨부된 링크나 파일이 없습니다.</p>
                            )}
                        </div>
                    ) : (
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-3xl p-8 border border-slate-200 dark:border-slate-700 border-dashed text-center text-slate-500 dark:text-slate-400 text-sm">
                            아직 기말 작품을 제출하지 않았습니다.
                        </div>
                    )}
                </section>

                {/* Additional Works */}
                <section>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-indigo-500" /> 과제 및 일지 스니펫
                    </h3>
                    <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                        {midtermSubmission ? (
                            <div className="mb-4">
                                <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-2">과제물 (PDF 등)</p>
                                <a href={midtermSubmission.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-indigo-600 dark:text-indigo-400 hover:underline text-sm font-medium">
                                    제출된 과제 보기
                                </a>
                            </div>
                        ) : null}

                        <div>
                            <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-2">작업 이력 요약 (최근 3주)</p>
                            {productionLogs && productionLogs.length > 0 ? (
                                <ul className="space-y-3">
                                    {productionLogs.slice(-3).map(log => (
                                        <li key={log.id} className="text-xs bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-700">
                                            <span className="font-bold text-indigo-500 mr-2">{log.week_number}주차:</span>
                                            <span className="text-slate-600 dark:text-slate-300">{log.last_week_done || '기록 없음'}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-xs text-slate-500">기록된 주간 일지가 없습니다.</p>
                            )}
                        </div>
                    </div>
                </section>

                {/* Review Form Section */}
                <section className="pt-8 border-t border-slate-200 dark:border-slate-800">
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                        <Star className="w-6 h-6 text-yellow-500 fill-yellow-500" /> 동료 평가 남기기
                    </h3>

                    {user.id === revieweeId ? (
                        <div className="bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 p-6 rounded-2xl border border-amber-200 dark:border-amber-800/30 text-center font-bold">
                            본인의 작품은 스스로 평가할 수 없습니다.
                        </div>
                    ) : existingReview ? (
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 text-center">
                            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
                            <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-2">이미 평가를 완료했습니다!</h4>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                곡 완성도: ⭐ {existingReview.score_completeness} / 레코딩 품질: ⭐ {existingReview.score_quality}
                            </p>
                            <p className="text-sm text-slate-600 dark:text-slate-300 mt-4 italic">
                                "{existingReview.comment}"
                            </p>
                        </div>
                    ) : (
                        <ReviewForm courseId={courseId} revieweeId={revieweeId} />
                    )}
                </section>

            </main>
        </div>
    )
}
