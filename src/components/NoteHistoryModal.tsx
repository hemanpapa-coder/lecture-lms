'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { X, Clock, RotateCcw, Loader2, AlertCircle } from 'lucide-react'

interface HistoryRecord {
    id: string;
    content: string;
    saved_at: string;
}

export default function NoteHistoryModal({
    isOpen,
    onClose,
    noteId,
    onRestore
}: {
    isOpen: boolean;
    onClose: () => void;
    noteId: string | null;
    onRestore: (content: string) => void;
}) {
    const supabase = createClient()
    const [history, setHistory] = useState<HistoryRecord[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        if (isOpen && noteId) {
            fetchHistory()
        }
    }, [isOpen, noteId])

    const fetchHistory = async () => {
        setLoading(true)
        setError('')
        try {
            const { data, error } = await supabase
                .from('student_notes_history')
                .select('id, content, saved_at')
                .eq('note_id', noteId)
                .order('saved_at', { ascending: false })
                .limit(20)

            if (error) throw error
            setHistory(data || [])
        } catch (err: any) {
            console.error('Failed to fetch history:', err)
            setError('저장 기록을 불러오는데 실패했습니다.')
        } finally {
            setLoading(false)
        }
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-neutral-900 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-neutral-200 dark:border-neutral-800 flex flex-col max-h-[85vh]">

                <div className="flex items-center justify-between p-6 border-b border-neutral-100 dark:border-neutral-800">
                    <div className="flex items-center gap-3 text-neutral-900 dark:text-white">
                        <div className="p-2 bg-neutral-100 rounded-xl dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                            <Clock className="w-5 h-5" />
                        </div>
                        <h2 className="text-xl font-bold">노트 복구 (히스토리)</h2>
                    </div>
                    <button onClick={onClose} className="p-2 text-neutral-400 hover:text-neutral-600 transition dark:hover:text-neutral-200">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-neutral-50 dark:bg-neutral-950/50">
                    <p className="text-sm font-medium text-neutral-500 mb-6 flex items-center gap-2">
                        최근에 저장된 20개의 기록을 보여줍니다. 원하는 시점으로 되돌려보세요.
                    </p>

                    {loading ? (
                        <div className="flex justify-center items-center h-40">
                            <Loader2 className="w-8 h-8 text-neutral-400 animate-spin" />
                        </div>
                    ) : error ? (
                        <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm font-bold flex items-center gap-2">
                            <AlertCircle className="w-5 h-5" /> {error}
                        </div>
                    ) : history.length === 0 ? (
                        <div className="text-center py-12 text-neutral-400 font-medium">
                            <Clock className="w-12 h-12 mx-auto mb-3 opacity-20" />
                            저장된 기록이 없습니다.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {history.map((record) => {
                                const date = new Date(record.saved_at)
                                const timeString = date.toLocaleString('ko-KR', {
                                    year: 'numeric', month: '2-digit', day: '2-digit',
                                    hour: '2-digit', minute: '2-digit', second: '2-digit'
                                })

                                // Simple extraction for preview, stripping html
                                const plainText = record.content.replace(/<[^>]+>/g, ' ').substring(0, 100) + '...'

                                return (
                                    <div key={record.id} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-sm hover:border-neutral-300 transition group">
                                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-bold text-neutral-900 dark:text-white mb-1 tracking-tight">
                                                    {timeString}
                                                </div>
                                                <div className="text-sm text-neutral-500 truncate mt-2 font-mono bg-neutral-50 dark:bg-neutral-950 p-2 rounded-lg">
                                                    {plainText}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    if (confirm('이 버전의 내용으로 노트를 덮어쓰시겠습니까?')) {
                                                        onRestore(record.content)
                                                        onClose()
                                                    }
                                                }}
                                                className="flex items-center gap-2 px-4 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-sm font-bold rounded-xl transition whitespace-nowrap dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 hover:text-indigo-600 dark:hover:text-indigo-400"
                                            >
                                                <RotateCcw className="w-4 h-4" />
                                                이 버전으로 복구
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
