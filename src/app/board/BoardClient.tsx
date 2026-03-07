'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { MessagesSquare, Pin, MessageCircle, ChevronRight, Plus, X, Send, Lock, Globe } from 'lucide-react'
import Link from 'next/link'

type Question = {
    id: string
    title: string
    content: string | null
    is_pinned: boolean
    created_at: string
    user_id: string
    course_id: string
    reply_count: number
    replies?: Reply[]
}

type Reply = {
    id: string
    content: string
    is_private: boolean
    created_at: string
}

export default function BoardClient({ userId, courseId }: { userId: string; courseId: string }) {
    const supabase = createClient()
    const [questions, setQuestions] = useState<Question[]>([])
    const [expanded, setExpanded] = useState<string | null>(null)
    const [replyMap, setReplyMap] = useState<Record<string, Reply[]>>({})
    const [showForm, setShowForm] = useState(false)
    const [title, setTitle] = useState('')
    const [content, setContent] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState(false)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchQuestions()
    }, [courseId])

    const fetchQuestions = async () => {
        setLoading(true)
        const { data } = await supabase
            .from('board_questions')
            .select('id, title, content, is_pinned, created_at, user_id, course_id')
            .eq('course_id', courseId)
            .order('is_pinned', { ascending: false })
            .order('created_at', { ascending: false })

        if (data) {
            // Count replies for each question
            const withCounts = await Promise.all(data.map(async (q) => {
                const { count } = await supabase
                    .from('board_replies')
                    .select('*', { count: 'exact', head: true })
                    .eq('question_id', q.id)
                return { ...q, reply_count: count || 0 }
            }))
            setQuestions(withCounts as Question[])
        }
        setLoading(false)
    }

    const fetchReplies = async (questionId: string) => {
        const { data } = await supabase
            .from('board_replies')
            .select('id, content, is_private, created_at')
            .eq('question_id', questionId)
            .order('created_at', { ascending: true })
        if (data) setReplyMap(prev => ({ ...prev, [questionId]: data }))
    }

    const toggleExpand = async (qId: string) => {
        if (expanded === qId) { setExpanded(null); return }
        setExpanded(qId)
        if (!replyMap[qId]) await fetchReplies(qId)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!title.trim()) { setError('제목을 입력해 주세요.'); return }
        setSubmitting(true)
        setError('')
        const { error: err } = await supabase.from('board_questions').insert({
            user_id: userId,
            course_id: courseId,
            title: title.trim(),
            content: content.trim() || null,
        })
        setSubmitting(false)
        if (err) { setError(err.message); return }
        setTitle(''); setContent('')
        setShowForm(false)
        setSuccess(true)
        setTimeout(() => setSuccess(false), 3000)
        fetchQuestions()
    }

    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-6">
            <div className="mx-auto max-w-3xl space-y-6">

                {/* Header */}
                <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl bg-white p-7 shadow-sm dark:bg-neutral-900 border border-neutral-200/60 dark:border-neutral-800">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl dark:bg-emerald-900/30">
                            <MessagesSquare className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-xl font-extrabold text-neutral-900 dark:text-white">익명 Q&A / 건의</h1>
                            <p className="text-sm text-neutral-500 mt-0.5">완전 익명 · 교수님이 개인 답장을 드릴 수 있어요</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setShowForm(v => !v)}
                            className="flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 transition"
                        >
                            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                            {showForm ? '취소' : '질문 작성'}
                        </button>
                        <Link href="/" className="text-sm font-semibold text-blue-600 hover:underline shrink-0 px-2">메인으로</Link>
                    </div>
                </header>

                {/* Success banner */}
                {success && (
                    <div className="rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 px-5 py-3 text-sm font-bold">
                        ✅ 질문이 등록됐습니다! 교수님이 확인 후 답변해 드립니다.
                    </div>
                )}

                {/* New question form */}
                {showForm && (
                    <form onSubmit={handleSubmit} className="rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-6 shadow-sm space-y-4">
                        <h2 className="font-extrabold text-neutral-900 dark:text-white text-base">새 질문 작성 (완전 익명)</h2>
                        {error && <p className="text-red-500 text-sm font-bold">{error}</p>}
                        <input
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="질문 제목을 입력하세요"
                            className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <textarea
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            placeholder="자세한 내용 (선택)"
                            rows={4}
                            className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                        />
                        <button
                            type="submit"
                            disabled={submitting}
                            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 transition disabled:opacity-50"
                        >
                            <Send className="w-4 h-4" />
                            {submitting ? '등록 중...' : '익명으로 등록'}
                        </button>
                    </form>
                )}

                {/* Question list */}
                <div className="rounded-3xl bg-white dark:bg-neutral-900 shadow-sm border border-neutral-200/60 dark:border-neutral-800 overflow-hidden">
                    {loading ? (
                        <div className="p-10 text-center text-neutral-400 text-sm">불러오는 중...</div>
                    ) : questions.length === 0 ? (
                        <div className="p-10 text-center text-neutral-400 text-sm">아직 등록된 질문이 없습니다.</div>
                    ) : (
                        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                            {questions.map(q => (
                                <li key={q.id}>
                                    <button
                                        onClick={() => toggleExpand(q.id)}
                                        className={`w-full p-5 flex items-start justify-between text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition ${q.is_pinned ? 'bg-amber-50/40 dark:bg-amber-900/10' : ''}`}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                                {q.is_pinned && (
                                                    <span className="inline-flex items-center gap-1 bg-amber-500 text-white text-[10px] px-2 py-0.5 rounded-full font-black">
                                                        <Pin className="w-2.5 h-2.5" /> 공지/FAQ
                                                    </span>
                                                )}
                                                <span className="font-bold text-neutral-900 dark:text-neutral-100 text-sm">{q.title}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-neutral-400 font-medium">
                                                <span>익명</span>
                                                <span>{new Date(q.created_at).toLocaleDateString('ko-KR')}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 ml-3 shrink-0">
                                            <span className="flex items-center gap-1 text-neutral-400 bg-neutral-50 dark:bg-neutral-800 px-2.5 py-1 rounded-full text-xs font-bold">
                                                <MessageCircle className="w-3.5 h-3.5" /> {q.reply_count}
                                            </span>
                                            <ChevronRight className={`w-4 h-4 text-neutral-400 transition-transform ${expanded === q.id ? 'rotate-90' : ''}`} />
                                        </div>
                                    </button>
                                    {expanded === q.id && (
                                        <div className="px-5 pb-5 space-y-3 border-t border-neutral-100 dark:border-neutral-800">
                                            {q.content && (
                                                <p className="text-sm text-neutral-700 dark:text-neutral-300 pt-3 whitespace-pre-wrap leading-relaxed">{q.content}</p>
                                            )}
                                            {/* Replies */}
                                            {(replyMap[q.id] || []).length > 0 && (
                                                <div className="space-y-2 pt-2">
                                                    {(replyMap[q.id] || []).map(r => (
                                                        <div key={r.id} className={`rounded-2xl p-4 ${r.is_private ? 'bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800' : 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800'}`}>
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className="text-xs font-extrabold text-neutral-700 dark:text-neutral-200">👑 교수님 답변</span>
                                                                {r.is_private ? (
                                                                    <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-100 dark:bg-indigo-900/40 px-2 py-0.5 rounded-full"><Lock className="w-2.5 h-2.5" />나만 보는 개인 답장</span>
                                                                ) : (
                                                                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full"><Globe className="w-2.5 h-2.5" />전체 공개</span>
                                                                )}
                                                            </div>
                                                            <p className="text-sm text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap">{r.content}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {(replyMap[q.id] || []).length === 0 && (
                                                <p className="text-xs text-neutral-400 pt-2">아직 답변이 없습니다.</p>
                                            )}
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    )
}
