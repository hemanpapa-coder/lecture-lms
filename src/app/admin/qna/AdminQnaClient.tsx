'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Pin, Trash2, Send, Lock, Globe, ChevronDown, ChevronUp, MessageCircle, AlertCircle, Paperclip, Play, FileIcon } from 'lucide-react'

type Question = {
    id: string
    title: string
    content: string | null
    is_pinned: boolean
    created_at: string
    user_id: string
    type?: string
    author_name?: string
    author_email?: string
    reply_count: number
    attachment_count: number
    replies?: Reply[]
}

type Reply = {
    id: string
    content: string
    is_private: boolean
    created_at: string
}

type Attachment = {
    id: string
    file_name: string
    file_url: string
    file_type: string | null
    file_size: number | null
    created_at: string
}

type Course = { id: string; name: string }

export default function AdminQnaClient({ adminId }: { adminId: string }) {
    const supabase = createClient()
    const [courses, setCourses] = useState<Course[]>([])
    const [selectedCourse, setSelectedCourse] = useState<string>('')
    const [questions, setQuestions] = useState<Question[]>([])
    const [expanded, setExpanded] = useState<string | null>(null)
    const [replyMap, setReplyMap] = useState<Record<string, Reply[]>>({})
    const [attachmentMap, setAttachmentMap] = useState<Record<string, Attachment[]>>({})
    const [replyContent, setReplyContent] = useState<Record<string, string>>({})
    const [isPrivate, setIsPrivate] = useState<Record<string, boolean>>({})
    const [targetWeek, setTargetWeek] = useState<Record<string, number | null>>({})
    const [sending, setSending] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        supabase.from('courses').select('id, name').order('name').then(({ data }) => {
            if (data) { setCourses(data); if (data[0]) setSelectedCourse(data[0].id) }
        })
    }, [])

    useEffect(() => {
        if (selectedCourse) fetchQuestions()
    }, [selectedCourse])

    const fetchQuestions = async () => {
        setLoading(true)
        const { data } = await supabase
            .from('board_questions')
            .select('id, title, content, is_pinned, created_at, user_id, type')
            .eq('course_id', selectedCourse)
            .order('is_pinned', { ascending: false })
            .order('created_at', { ascending: false })

        if (data) {
            const enriched = await Promise.all(data.map(async (q) => {
                const { data: u } = await supabase.from('users').select('name, email').eq('id', q.user_id).single()
                const { count: replyCount } = await supabase.from('board_replies').select('*', { count: 'exact', head: true }).eq('question_id', q.id)
                const { count: attachCount } = await supabase.from('board_attachments').select('*', { count: 'exact', head: true }).eq('question_id', q.id)
                return {
                    ...q,
                    author_name: q.type === 'suggestion' ? '익명' : (u?.name || '이름 없음'),
                    author_email: q.type === 'suggestion' ? '' : (u?.email || ''),
                    reply_count: replyCount || 0,
                    attachment_count: attachCount || 0
                }
            }))
            setQuestions(enriched as Question[])
            setExpanded(null)
            setReplyMap({})
            setAttachmentMap({})
        }
        setLoading(false)
    }

    const fetchRepliesAndAttachments = async (questionId: string) => {
        const [rep, att] = await Promise.all([
            supabase.from('board_replies').select('id, content, is_private, created_at').eq('question_id', questionId).order('created_at', { ascending: true }),
            supabase.from('board_attachments').select('*').eq('question_id', questionId).order('created_at', { ascending: true })
        ])
        if (rep.data) setReplyMap(prev => ({ ...prev, [questionId]: rep.data as Reply[] }))
        if (att.data) setAttachmentMap(prev => ({ ...prev, [questionId]: att.data as Attachment[] }))
    }

    const toggleExpand = async (qId: string) => {
        if (expanded === qId) { setExpanded(null); return }
        setExpanded(qId)
        if (!replyMap[qId] || !attachmentMap[qId]) {
            await fetchRepliesAndAttachments(qId)
        }
    }

    const handlePin = async (q: Question) => {
        await supabase.from('board_questions').update({ is_pinned: !q.is_pinned }).eq('id', q.id)
        setQuestions(prev => prev.map(x => x.id === q.id ? { ...x, is_pinned: !x.is_pinned } : x))
    }

    const handleDelete = async (qId: string) => {
        if (!confirm('이 질문을 삭제하시겠습니까? 첨부파일도 DB에서 삭제됩니다 (구글 드라이브 파일 제외).')) return
        await supabase.from('board_questions').delete().eq('id', qId)
        setQuestions(prev => prev.filter(x => x.id !== qId))
    }

    const handleDeleteReply = async (qId: string, rId: string) => {
        await supabase.from('board_replies').delete().eq('id', rId)
        setReplyMap(prev => ({ ...prev, [qId]: prev[qId].filter(r => r.id !== rId) }))
        setQuestions(prev => prev.map(q => q.id === qId ? { ...q, reply_count: q.reply_count - 1 } : q))
    }

    const sendReply = async (qId: string) => {
        const content = replyContent[qId]?.trim()
        if (!content) return
        setSending(qId)
        const isPriv = isPrivate[qId] ?? false
        const tWeek = targetWeek[qId]

        const { data, error } = await supabase.from('board_replies').insert({
            question_id: qId,
            admin_id: adminId,
            content,
            is_private: isPriv,
        }).select().single()

        if (error) { setSending(null); alert('답장 실패: ' + error.message); return }

        // Update target_week if set and public
        if (!isPriv && tWeek) {
            await supabase.from('board_questions').update({ target_week: tWeek }).eq('id', qId)
        }

        setSending(null)
        setReplyMap(prev => ({ ...prev, [qId]: [...(prev[qId] || []), data] }))
        setReplyContent(prev => ({ ...prev, [qId]: '' }))
        setTargetWeek(prev => ({ ...prev, [qId]: null }))
        setQuestions(prev => prev.map(q => q.id === qId ? { ...q, reply_count: q.reply_count + 1 } : q))
    }

    const isVideo = (type: string | null) => type?.startsWith('video/')
    const isImage = (type: string | null) => type?.startsWith('image/')

    return (
        <div className="space-y-6">
            {/* Course selector */}
            <div className="flex items-center gap-3 flex-wrap">
                {courses.map(c => (
                    <button
                        key={c.id}
                        onClick={() => setSelectedCourse(c.id)}
                        className={`px-4 py-2 rounded-xl text-sm font-bold transition border ${selectedCourse === c.id
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:border-indigo-300'}`}
                    >
                        {c.name}
                    </button>
                ))}
            </div>

            {/* Question list */}
            {loading ? (
                <div className="text-center py-12 text-neutral-400">불러오는 중...</div>
            ) : questions.length === 0 ? (
                <div className="text-center py-12 text-neutral-400 text-sm">등록된 질문이 없습니다.</div>
            ) : (
                <div className="rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-sm">
                    <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                        {questions.map(q => (
                            <li key={q.id}>
                                <div className={`p-5 ${q.is_pinned ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}>
                                    {/* Question header */}
                                    <div className="flex items-start justify-between gap-3">
                                        <button onClick={() => toggleExpand(q.id)} className="flex-1 text-left">
                                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                                {q.type === 'suggestion' ? (
                                                    <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] px-2 py-0.5 rounded-full font-black">💡 익명 건의</span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400 text-[10px] px-2 py-0.5 rounded-full font-black">❓ Q&A 질문</span>
                                                )}
                                                {q.is_pinned && (
                                                    <span className="inline-flex items-center gap-1 bg-amber-500 text-white text-[10px] px-2 py-0.5 rounded-full font-black">📌 공지</span>
                                                )}
                                                <span className="font-bold text-neutral-900 dark:text-neutral-100">{q.title}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-neutral-500">
                                                <span className="font-bold text-indigo-600">{q.author_name}</span>
                                                <span className="text-neutral-400">{q.author_email}</span>
                                                <span>{new Date(q.created_at).toLocaleString('ko-KR')}</span>
                                            </div>
                                        </button>
                                        {/* Actions & Badges */}
                                        <div className="flex items-center gap-3 shrink-0">
                                            {(q.attachment_count || 0) > 0 && (
                                                <span className="flex items-center gap-1 text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 px-2.5 py-1 rounded-full text-[10px] font-bold border border-indigo-100 dark:border-indigo-800/50">
                                                    <Paperclip className="w-3.5 h-3.5" /> 첨부 {q.attachment_count}
                                                </span>
                                            )}
                                            <span className="flex items-center gap-1 text-neutral-500 bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1 rounded-full text-[10px] font-bold">
                                                <MessageCircle className="w-3.5 h-3.5" /> 답변 {q.reply_count}
                                            </span>

                                            <button
                                                onClick={() => toggleExpand(q.id)}
                                                className="p-2 ml-1 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
                                                title="펼치기/접기"
                                            >
                                                {expanded === q.id ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
                                            </button>
                                            <button
                                                onClick={() => handlePin(q)}
                                                className={`p-2 rounded-xl transition ${q.is_pinned ? 'bg-amber-100 text-amber-600' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400'}`}
                                                title={q.is_pinned ? '공지 해제' : '공지로 설정'}
                                            >
                                                <Pin className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(q.id)}
                                                className="p-2 rounded-xl hover:bg-red-50 text-neutral-400 hover:text-red-500 transition"
                                                title="삭제"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Expanded content */}
                                    {expanded === q.id && (
                                        <div className="mt-4 space-y-4">
                                            {q.content && (
                                                <div className="bg-neutral-50 dark:bg-neutral-800/60 rounded-2xl p-4 text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap leading-relaxed">
                                                    {q.content}
                                                </div>
                                            )}

                                            {/* Attachments */}
                                            {(attachmentMap[q.id] || []).length > 0 && (
                                                <div className="grid gap-2 sm:grid-cols-2">
                                                    {(attachmentMap[q.id] || []).map(att => (
                                                        <a
                                                            key={att.id}
                                                            href={att.file_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 hover:border-indigo-400 transition group shadow-sm"
                                                        >
                                                            <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg text-indigo-500 group-hover:scale-110 transition shrink-0">
                                                                {isVideo(att.file_type) ? <Play className="w-4 h-4" /> : isImage(att.file_type) ? <FileIcon className="w-4 h-4" /> : <Paperclip className="w-4 h-4" />}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-xs font-bold text-neutral-900 dark:text-neutral-100 truncate">{att.file_name}</p>
                                                                {att.file_size && <p className="text-[10px] text-neutral-500">{(att.file_size / 1024 / 1024).toFixed(2)} MB</p>}
                                                            </div>
                                                        </a>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Replies */}
                                            {(replyMap[q.id] || []).map(r => (
                                                <div key={r.id} className={`rounded-2xl p-4 flex items-start justify-between gap-3 ${r.is_private ? 'bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800' : 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800'}`}>
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="text-xs font-extrabold text-neutral-700 dark:text-neutral-200">내 답변</span>
                                                            {r.is_private
                                                                ? <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-100 dark:bg-indigo-900/40 px-2 py-0.5 rounded-full"><Lock className="w-2.5 h-2.5" />개인 답장</span>
                                                                : <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full"><Globe className="w-2.5 h-2.5" />전체 공개</span>
                                                            }
                                                        </div>
                                                        <p className="text-sm text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap">{r.content}</p>
                                                    </div>
                                                    <button onClick={() => handleDeleteReply(q.id, r.id)} className="p-1.5 text-neutral-300 hover:text-red-500 transition shrink-0">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ))}

                                            {/* Reply composer */}
                                            <div className="space-y-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold text-neutral-500">답장 유형:</span>
                                                    <button
                                                        onClick={() => setIsPrivate(p => ({ ...p, [q.id]: false }))}
                                                        className={`flex items-center gap-1 text-xs px-3 py-1 rounded-full font-bold transition ${!isPrivate[q.id] ? 'bg-emerald-600 text-white' : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-500'}`}
                                                    >
                                                        <Globe className="w-3 h-3" />공개 답변
                                                    </button>
                                                    <button
                                                        onClick={() => setIsPrivate(p => ({ ...p, [q.id]: true }))}
                                                        className={`flex items-center gap-1 text-xs px-3 py-1 rounded-full font-bold transition ${isPrivate[q.id] ? 'bg-indigo-600 text-white' : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-500'}`}
                                                    >
                                                        <Lock className="w-3 h-3" />개인 답장
                                                    </button>
                                                    {isPrivate[q.id] ? (
                                                        <span className="text-[10px] text-indigo-500 font-bold flex items-center gap-1">
                                                            <AlertCircle className="w-3 h-3" />{q.author_name}에게만 보입니다
                                                        </span>
                                                    ) : (
                                                        <select
                                                            value={targetWeek[q.id] || ''}
                                                            onChange={e => setTargetWeek(p => ({ ...p, [q.id]: e.target.value ? parseInt(e.target.value) : null }))}
                                                            className="text-xs border border-emerald-200 dark:border-emerald-800 rounded-lg px-2 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 font-bold outline-none cursor-pointer"
                                                        >
                                                            <option value="">주차 미지정 (공개만)</option>
                                                            {Array.from({ length: 15 }, (_, i) => (
                                                                <option key={i + 1} value={i + 1}>{i + 1}주차에 게시</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                </div>
                                                <div className="flex gap-2">
                                                    <textarea
                                                        value={replyContent[q.id] || ''}
                                                        onChange={e => setReplyContent(p => ({ ...p, [q.id]: e.target.value }))}
                                                        placeholder={isPrivate[q.id] ? `${q.author_name}에게 개인 답장...` : '전체 학생에게 공개되는 답변...'}
                                                        rows={2}
                                                        className="flex-1 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                    />
                                                    <button
                                                        onClick={() => sendReply(q.id)}
                                                        disabled={sending === q.id}
                                                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition flex items-center gap-1 disabled:opacity-50 self-end"
                                                    >
                                                        <Send className="w-4 h-4" />
                                                        {sending === q.id ? '전송 중...' : '전송'}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    )
}
