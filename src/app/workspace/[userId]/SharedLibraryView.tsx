'use client'

import { useState, useEffect } from 'react'
import { BookText, PlaySquare, Download, Loader2, ExternalLink } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

interface Material {
    id: string
    title: string
    description: string
    type: 'book' | 'video'
    url: string
    created_at: string
}

export default function SharedLibraryView({ courseId }: { courseId: string }) {
    const supabase = createClient()
    const [materials, setMaterials] = useState<Material[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchMaterials = async () => {
            try {
                const { data, error } = await supabase
                    .from('library_materials')
                    .select('*')
                    .eq('course_id', courseId)
                    .order('created_at', { ascending: false })

                if (error) throw error
                if (data) setMaterials(data as Material[])
            } catch (error) {
                console.error('Failed to fetch library materials:', error)
            } finally {
                setLoading(false)
            }
        }
        fetchMaterials()
    }, [courseId])

    if (loading) {
        return (
            <div className="flex justify-center items-center h-48 bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-200">
                <Loader2 className="w-8 h-8 text-neutral-400 animate-spin" />
            </div>
        )
    }

    const books = materials.filter(m => m.type === 'book')
    const videos = materials.filter(m => m.type === 'video')

    return (
        <div className="space-y-6">
            <div className="bg-white dark:bg-neutral-900 rounded-3xl p-8 border border-neutral-200/60 dark:border-neutral-800 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg dark:bg-emerald-900/30 dark:text-emerald-400">
                        <BookText className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">공용 도서관 (교재 및 참고자료)</h2>
                        <p className="text-xs text-neutral-500 mt-1">강의에 필요한 교재나 악보를 열람하고 다운로드할 수 있습니다.</p>
                    </div>
                </div>

                {books.length === 0 ? (
                    <div className="py-12 text-center text-neutral-400 text-sm font-medium italic border-2 border-dashed border-neutral-100 dark:border-neutral-800 rounded-2xl">
                        등록된 도서/교재 자료가 없습니다.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {books.map(book => (
                            <a
                                key={book.id}
                                href={book.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex flex-col p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 hover:border-emerald-500 hover:ring-1 hover:ring-emerald-500 transition group bg-neutral-50 dark:bg-neutral-800/30"
                            >
                                <div className="flex justify-between items-start mb-3">
                                    <div className="w-10 h-10 rounded-xl bg-white dark:bg-neutral-800 shadow-sm flex items-center justify-center text-emerald-500">
                                        <BookText className="w-5 h-5" />
                                    </div>
                                    <Download className="w-4 h-4 text-neutral-400 group-hover:text-emerald-500 transition" />
                                </div>
                                <h3 className="font-bold text-sm text-neutral-900 dark:text-white mb-1 line-clamp-1">{book.title}</h3>
                                {book.description && <p className="text-xs text-neutral-500 line-clamp-2">{book.description}</p>}
                            </a>
                        ))}
                    </div>
                )}
            </div>

            <div className="bg-white dark:bg-neutral-900 rounded-3xl p-8 border border-neutral-200/60 dark:border-neutral-800 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-rose-50 text-rose-600 rounded-lg dark:bg-rose-900/30 dark:text-rose-400">
                        <PlaySquare className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">레슨 영상 아카이브</h2>
                        <p className="text-xs text-neutral-500 mt-1">이전 레슨 영상이나 참고 영상을 시청하세요.</p>
                    </div>
                </div>

                {videos.length === 0 ? (
                    <div className="py-12 text-center text-neutral-400 text-sm font-medium italic border-2 border-dashed border-neutral-100 dark:border-neutral-800 rounded-2xl">
                        등록된 영상 자료가 없습니다.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {videos.map(video => (
                            <a
                                key={video.id}
                                href={video.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-4 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 hover:border-rose-500 transition group bg-neutral-50 dark:bg-neutral-800/30"
                            >
                                <div className="w-16 h-12 rounded-lg bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center shrink-0 group-hover:bg-rose-100 dark:group-hover:bg-rose-900/30 transition">
                                    <PlaySquare className="w-6 h-6 text-neutral-400 group-hover:text-rose-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-sm text-neutral-900 dark:text-white truncate">{video.title}</h3>
                                    {video.description && <p className="text-xs text-neutral-500 truncate">{video.description}</p>}
                                </div>
                                <ExternalLink className="w-4 h-4 text-neutral-400 group-hover:text-rose-500 shrink-0" />
                            </a>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
