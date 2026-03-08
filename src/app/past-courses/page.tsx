import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Clock, BookOpen, FileUp, ChevronRight, Archive } from 'lucide-react'

type Course = {
    id: string
    name: string
    is_ended: boolean
    ended_at: string | null
    ended_year: number | null
    late_submission_allowed: boolean
    studentCount?: number
}

export const dynamic = 'force-dynamic'

export default async function PastCoursesPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/auth/login')

    const { data: userRecord } = await supabase
        .from('users')
        .select('role, course_id')
        .eq('id', user.id)
        .single()

    const isAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com'

    // Fetch all ended courses
    const { data: coursesRaw } = await supabase
        .from('courses')
        .select('id, name, is_ended, ended_at, ended_year, late_submission_allowed')
        .eq('is_ended', true)
        .order('ended_at', { ascending: false })

    const courses = (coursesRaw || []) as Course[]

    // For non-admin, only show their own course if it's ended
    const visibleCourses = isAdmin
        ? courses
        : courses.filter(c => c.id === userRecord?.course_id)

    // Group by year
    const grouped: Record<number, Course[]> = {}
    for (const c of visibleCourses) {
        const year = c.ended_year || new Date(c.ended_at || '').getFullYear() || 0
        if (!grouped[year]) grouped[year] = []
        grouped[year].push(c)
    }
    const years = Object.keys(grouped).map(Number).sort((a, b) => b - a)

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-8">
            <div className="mx-auto max-w-4xl space-y-8">

                {/* Header */}
                <header className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-slate-800 dark:bg-slate-900 rounded-2xl">
                            <Archive className="w-7 h-7 text-slate-300" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">지난 강의</h1>
                            <p className="text-sm text-slate-500 mt-0.5">종강된 수업의 자료 및 기록을 확인합니다.</p>
                        </div>
                    </div>
                    <Link href="/" className="text-sm font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white transition">
                        ← 메인으로
                    </Link>
                </header>

                {years.length === 0 && (
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-16 text-center border border-slate-200 dark:border-slate-800">
                        <Archive className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                        <p className="text-slate-400 font-medium">아직 종강된 수업이 없습니다.</p>
                    </div>
                )}

                {/* Grouped by year */}
                {years.map(year => (
                    <section key={year} className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="px-3 py-1 bg-slate-800 dark:bg-slate-700 text-white text-xs font-black rounded-xl tracking-widest">
                                {year}년 종강
                            </div>
                            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {grouped[year].map(course => (
                                <div key={course.id}
                                    className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">

                                    {/* Course info */}
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-black rounded uppercase tracking-widest">
                                                    종강
                                                </span>
                                                {course.late_submission_allowed && (
                                                    <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-black rounded uppercase tracking-widest">
                                                        자료 제출 가능
                                                    </span>
                                                )}
                                            </div>
                                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{course.name}</h2>
                                            {course.ended_at && (
                                                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {new Date(course.ended_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })} 종강
                                                </p>
                                            )}
                                        </div>
                                        <BookOpen className="w-5 h-5 text-slate-300 shrink-0 mt-1" />
                                    </div>

                                    {/* Action buttons */}
                                    <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                                        {/* Archive / wiki materials */}
                                        <Link
                                            href={`/archive?course=${course.id}`}
                                            className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                                        >
                                            <BookOpen className="w-3.5 h-3.5" />
                                            강의 자료 보기
                                        </Link>

                                        {/* Late submission — only if allowed */}
                                        {course.late_submission_allowed && (
                                            <Link
                                                href={`/?course=${course.id}&late=1`}
                                                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-xl text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition"
                                            >
                                                <FileUp className="w-3.5 h-3.5" />
                                                자료 제출
                                            </Link>
                                        )}

                                        {/* Admin: full dashboard view */}
                                        {isAdmin && (
                                            <Link
                                                href={`/admin?tab=students&course=${course.id}`}
                                                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 rounded-xl text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition ml-auto"
                                            >
                                                관리 <ChevronRight className="w-3 h-3" />
                                            </Link>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                ))}
            </div>
        </div>
    )
}
