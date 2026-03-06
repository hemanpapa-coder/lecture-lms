'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';
import { BookOpen, ChevronRight, FolderArchive, Clock } from 'lucide-react';

const WEEK_THEMES = [
    { bg: 'from-blue-500 to-indigo-600', light: 'bg-blue-50 dark:bg-blue-900/20' },
    { bg: 'from-purple-500 to-pink-600', light: 'bg-purple-50 dark:bg-purple-900/20' },
    { bg: 'from-emerald-500 to-teal-600', light: 'bg-emerald-50 dark:bg-emerald-900/20' },
    { bg: 'from-orange-500 to-red-600', light: 'bg-orange-50 dark:bg-orange-900/20' },
    { bg: 'from-cyan-500 to-blue-600', light: 'bg-cyan-50 dark:bg-cyan-900/20' },
];

export default function ArchiveClientPage({
    isAdmin, courseId, courseName, courses = []
}: {
    isAdmin: boolean;
    courseId: string | null;
    courseName: string;
    courses?: { id: string; name: string }[];
}) {
    const supabase = createClient();
    const [pages, setPages] = useState<any[]>([]);
    const [fileCounts, setFileCounts] = useState<Record<number, number>>({});
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        setLoading(true);
        // Fetch page summaries filtered by course
        let pagesQuery = supabase
            .from('archive_pages')
            .select('week_number, title, updated_at')
            .order('week_number', { ascending: true });
        if (courseId) pagesQuery = pagesQuery.eq('course_id', courseId);
        const { data: pagesData } = await pagesQuery;

        // If no pages yet (table newly created), create mock array
        if (!pagesData || pagesData.length === 0) {
            const mock = Array.from({ length: 15 }, (_, i) => ({
                week_number: i + 1,
                title: `${i + 1}주차 강의 자료`,
                updated_at: null,
            }));
            setPages(mock);
        } else {
            setPages(pagesData);
        }

        // Fetch file counts per week filtered by course
        let archivesQuery = supabase.from('archives').select('week_number').is('deleted_at', null);
        if (courseId) archivesQuery = archivesQuery.eq('course_id', courseId);
        const { data: archivesData } = await archivesQuery;

        if (archivesData) {
            const counts: Record<number, number> = {};
            archivesData.forEach((a) => {
                if (a.week_number) {
                    counts[a.week_number] = (counts[a.week_number] || 0) + 1;
                }
            });
            setFileCounts(counts);
        }

        setLoading(false);
    }, [courseId]); // re-fetch when courseId changes

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
            {/* Header */}
            <div className="bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 px-8 py-6">
                <div className="mx-auto max-w-6xl">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl dark:bg-emerald-900/30">
                                <FolderArchive className="w-6 h-6" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-extrabold text-neutral-900 dark:text-white">{courseName}</h1>
                                <p className="text-sm text-neutral-500 mt-0.5">15주차 강의 자료 및 참고 자료를 열람하세요.</p>
                            </div>
                        </div>
                        <Link href="/" className="text-sm font-semibold text-blue-600 hover:underline">
                            ← 대시보드
                        </Link>
                    </div>

                    {/* Course tabs — admin only */}
                    {isAdmin && courses.length > 0 && (
                        <div className="flex gap-2 flex-wrap pt-2">
                            {courses.map((c) => (
                                <Link
                                    key={c.id}
                                    href={`/archive?course=${c.id}`}
                                    className={`px-4 py-2 rounded-2xl text-sm font-bold border transition-all ${courseId === c.id
                                        ? 'bg-emerald-600 text-white border-emerald-600 shadow'
                                        : 'bg-neutral-100 text-neutral-600 border-neutral-200 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:border-neutral-700'
                                        }`}
                                >
                                    {c.name}
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Grid */}
            <div className="mx-auto max-w-6xl p-8">
                {loading ? (
                    <div className="flex justify-center items-center h-64 text-neutral-400">
                        <div className="animate-spin w-8 h-8 border-4 border-neutral-200 border-t-emerald-500 rounded-full"></div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {pages.map((page) => {
                            const rawTitle = page.title || `${page.week_number}주차 강의 자료`;
                            // Strip course name prefix if present
                            const displayTitle = rawTitle.replace(new RegExp(`^${courseName}\\s*`), '') || rawTitle;
                            const theme = WEEK_THEMES[(page.week_number - 1) % WEEK_THEMES.length];
                            const fileCount = fileCounts[page.week_number] || 0;
                            return (
                                <Link
                                    key={page.week_number}
                                    href={courseId ? `/archive/${page.week_number}?course=${courseId}` : `/archive/${page.week_number}`}
                                    className="group relative overflow-hidden rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200/60 dark:border-neutral-800 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 shadow-sm"
                                >
                                    {/* Week banner */}
                                    <div className={`h-2 w-full bg-gradient-to-r ${theme.bg}`} />

                                    <div className="p-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <span className={`text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full ${theme.light} text-neutral-600 dark:text-neutral-400`}>
                                                WEEK {page.week_number}
                                            </span>
                                            <ChevronRight className="w-4 h-4 text-neutral-300 group-hover:text-neutral-500 group-hover:translate-x-1 transition-all" />
                                        </div>

                                        <h2 className="text-lg font-bold text-neutral-900 dark:text-white mb-3 line-clamp-2">
                                            {displayTitle}
                                        </h2>

                                        <div className="flex items-center gap-4 mt-auto pt-4 border-t border-neutral-100 dark:border-neutral-800">
                                            <span className="flex items-center gap-1.5 text-xs font-medium text-neutral-500">
                                                <BookOpen className="w-3.5 h-3.5" />
                                                {fileCount}개 파일
                                            </span>
                                            {page.updated_at && (
                                                <span className="flex items-center gap-1.5 text-xs font-medium text-neutral-400">
                                                    <Clock className="w-3.5 h-3.5" />
                                                    {new Date(page.updated_at).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} 수정
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
