import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { ArrowLeft, Star, User, CheckCircle2 } from 'lucide-react'

export default async function GalleryListPage({ searchParams }: { searchParams: { course?: string } }) {
    const supabase = await createClient()

    // 1. Fetch current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return <div className="p-8 text-center text-red-500">로그인이 필요합니다.</div>
    }

    const courseId = searchParams.course
    if (!courseId) {
        return <div className="p-8 text-center text-red-500">과목 정보가 없습니다.</div>
    }

    // 2. Fetch all students in this course
    const { data: classAttendances } = await supabase
        .from('class_attendances')
        .select('user_id')
        .eq('course_id', courseId)

    // Extract unique user IDs
    const userIds = Array.from(new Set(classAttendances?.map(a => a.user_id) || []))

    // 3. Fetch detailed user info
    const { data: students } = await supabase
        .from('users')
        .select('*')
        .in('id', userIds)
        .order('full_name')

    // 4. Fetch my reviews to see who I've already evaluated
    const { data: myReviews } = await supabase
        .from('portfolio_reviews')
        .select('reviewee_id')
        .eq('reviewer_id', user.id)
        .eq('course_id', courseId)

    const reviewedStudentIds = new Set(myReviews?.map(r => r.reviewee_id) || [])

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-20">
            {/* Header */}
            <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href={`/?view=student&course=${courseId}`} className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                            <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                        </Link>
                        <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                            상호 평가 갤러리
                        </h1>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 sm:px-6 mt-8">
                <div className="mb-8">
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">동료들의 작품을 감상하세요</h2>
                    <p className="text-slate-500 dark:text-slate-400">
                        한 학기 동안 고생한 동료들의 결과물(수시, 과제, 기말)을 감상하고, 5스타 별점과 코멘트를 남겨주세요. 본인 작품은 평가할 수 없습니다.
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                    {students?.map((student) => {
                        const isMe = student.id === user.id
                        const isReviewed = reviewedStudentIds.has(student.id)

                        return (
                            <Link
                                href={isMe ? '#' : `/recording-class/gallery/${student.id}?course=${courseId}`}
                                key={student.id}
                                className={`group bg-white dark:bg-slate-800 rounded-2xl border ${isMe ? 'border-indigo-500/50 cursor-default opacity-80' : isReviewed ? 'border-green-500/50' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md'} transition-all overflow-hidden flex flex-col`}
                            >
                                <div className="aspect-square bg-slate-100 dark:bg-slate-900 relative flex items-center justify-center overflow-hidden">
                                    {student.profile_image_url ? (
                                        <img src={student.profile_image_url} alt={student.full_name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                    ) : (
                                        <User className="w-16 h-16 text-slate-300 dark:text-slate-600" />
                                    )}
                                    {isMe && (
                                        <div className="absolute inset-x-0 bottom-0 bg-indigo-600/90 py-2 text-center text-xs font-bold text-white">
                                            나의 프로필 (평가 불가)
                                        </div>
                                    )}
                                    {isReviewed && !isMe && (
                                        <div className="absolute inset-x-0 bottom-0 bg-green-500/90 py-2 text-center text-xs font-bold text-white flex items-center justify-center gap-1">
                                            <CheckCircle2 className="w-3.5 h-3.5" /> 평가 완료
                                        </div>
                                    )}
                                </div>
                                <div className="p-5 flex flex-col flex-1">
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">{student.full_name || '이름 없음'}</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">{student.major || '전공 미입력'}</p>

                                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 mt-auto">
                                        {student.class_goal ? `"${student.class_goal}"` : '목표가 아직 등록되지 않았습니다.'}
                                    </p>
                                </div>
                            </Link>
                        )
                    })}
                </div>
            </main>
        </div>
    )
}
