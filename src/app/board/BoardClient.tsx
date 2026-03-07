'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { MessagesSquare, Pin, MessageCircle, ChevronRight, Plus, X, Send, Lock, Globe, Paperclip, Upload, FileIcon, Trash2, Loader2, Play } from 'lucide-react'
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
    attachment_count: number
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

export default function BoardClient({ userId, courseId }: { userId: string; courseId: string }) {
    const supabase = createClient()
    const [questions, setQuestions] = useState<Question[]>([])
    const [expanded, setExpanded] = useState<string | null>(null)
    const [replyMap, setReplyMap] = useState<Record<string, Reply[]>>({})
    const [attachmentMap, setAttachmentMap] = useState<Record<string, Attachment[]>>({})
    const [showForm, setShowForm] = useState(false)
    const [title, setTitle] = useState('')
    const [content, setContent] = useState('')
    const [files, setFiles] = useState<File[]>([])
    const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState(false)
    const [loading, setLoading] = useState(true)
    const [isDragging, setIsDragging] = useState(false)

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
            const withCounts = await Promise.all(data.map(async (q) => {
                const { count: replyCount } = await supabase
                    .from('board_replies')
                    .select('*', { count: 'exact', head: true })
                    .eq('question_id', q.id)
                const { count: attachCount } = await supabase
                    .from('board_attachments')
                    .select('*', { count: 'exact', head: true })
                    .eq('question_id', q.id)
                return { ...q, reply_count: replyCount || 0, attachment_count: attachCount || 0 }
            }))
            setQuestions(withCounts as Question[])
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

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFiles(prev => [...prev, ...Array.from(e.target.files!)])
        }
    }

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index))
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }
    const handleDragLeave = () => setIsDragging(false)
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
        if (e.dataTransfer.files) {
            setFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)])
        }
    }

    const uploadFileToGoogleDrive = async (file: File): Promise<{ webViewLink: string | null }> => {
        // 1. Get resumable upload URL
        const res = await fetch('/api/board/upload-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: file.name, mimeType: file.type || 'application/octet-stream', fileSize: file.size })
        })
        if (!res.ok) throw new Error('업로드 URL을 가져오지 못했습니다.')
        const { uploadUrl, webViewLink } = await res.json()

        // 2. Upload file via XMLHttpRequest for progress tracking
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest()
            xhr.open('PUT', uploadUrl, true)
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100)
                    setUploadProgress(prev => ({ ...prev, [file.name]: percent }))
                }
            }
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    setUploadProgress(prev => ({ ...prev, [file.name]: 100 }))
                    resolve({ webViewLink })
                } else {
                    reject(new Error(`업로드 실패: ${xhr.status}`))
                }
            }
            xhr.onerror = () => reject(new Error('네트워크 오류'))
            xhr.send(file)
        })
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!title.trim()) { setError('제목을 입력해 주세요.'); return }
        setSubmitting(true)
        setError('')
        setUploadProgress({})

        // 1. Create Question
        const { data: qData, error: qErr } = await supabase.from('board_questions').insert({
            user_id: userId,
            course_id: courseId,
            title: title.trim(),
            content: content.trim() || null,
        }).select('id').single()

        if (qErr) {
            setSubmitting(false)
            setError(qErr.message)
            return
        }

        const questionId = qData.id

        // 2. Upload Files one by one to avoid OOM
        for (const file of files) {
            try {
                const { webViewLink } = await uploadFileToGoogleDrive(file)
                if (webViewLink) {
                    await supabase.from('board_attachments').insert({
                        question_id: questionId,
                        file_name: file.name,
                        file_url: webViewLink,
                        file_type: file.type,
                        file_size: file.size
                    })
                }
            } catch (err: any) {
                console.error('File upload err:', err)
                setError(`파일 업로드 실패 (${file.name}): ${err.message}`)
                // Continue with other files even if one fails
            }
        }

        setSubmitting(false)
        setTitle(''); setContent(''); setFiles([]); setUploadProgress({})
        setShowForm(false)
        setSuccess(true)
        setTimeout(() => setSuccess(false), 3000)
        fetchQuestions()
    }

    const isVideo = (type: string | null) => type?.startsWith('video/')
    const isImage = (type: string | null) => type?.startsWith('image/')

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
                            <p className="text-sm text-neutral-500 mt-0.5">대용량 동영상, 사진을 포함해 익명으로 질문할 수 있어요</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => { setShowForm(v => !v); setFiles([]); setUploadProgress({}) }}
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
                        ✅ 질문이 등록됐습니다! 대용량 파일은 처리되는 데 시간이 조금 걸릴 수 있습니다.
                    </div>
                )}

                {/* New question form */}
                {showForm && (
                    <form onSubmit={handleSubmit} className="rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-6 shadow-sm space-y-4 relative overflow-hidden">
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
                            rows={5}
                            className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                        />

                        {/* File Upload Zone */}
                        <div className="pt-2">
                            <label className="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-2">첨부파일 (선택)</label>

                            <label
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl cursor-pointer transition ${isDragging ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/10' : 'border-neutral-200 dark:border-neutral-700 hover:border-emerald-400'}`}
                            >
                                <Upload className={`w-8 h-8 mb-2 ${isDragging ? 'text-emerald-500' : 'text-neutral-400'}`} />
                                <span className="text-sm font-bold text-neutral-600 dark:text-neutral-300">클릭하거나 파일을 여기로 드래그하세요</span>
                                <span className="text-xs text-neutral-500 mt-1">동영상 (1GB 이상 지원), 사진, 문서 모두 압축 없이 빠르게 전송됩니다.</span>
                                <input type="file" multiple className="hidden" onChange={handleFileChange} />
                            </label>

                            {/* Selected Files List */}
                            {files.length > 0 && (
                                <ul className="mt-3 space-y-2">
                                    {files.map((file, idx) => (
                                        <li key={idx} className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 relative overflow-hidden">
                                            {/* Progress bar background */}
                                            {uploadProgress[file.name] !== undefined && (
                                                <div
                                                    className="absolute left-0 top-0 bottom-0 bg-emerald-100 dark:bg-emerald-900/30 transition-all duration-300"
                                                    style={{ width: `${uploadProgress[file.name]}%` }}
                                                />
                                            )}

                                            <div className="flex items-center gap-3 relative z-10 w-full">
                                                <div className="p-2 bg-white dark:bg-neutral-900 rounded-lg shrink-0 text-emerald-600">
                                                    {isVideo(file.type) ? <Play className="w-4 h-4" /> : isImage(file.type) ? <FileIcon className="w-4 h-4" /> : <Paperclip className="w-4 h-4" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold text-neutral-800 dark:text-neutral-200 truncate">{file.name}</p>
                                                    <div className="flex justify-between items-center text-xs mt-0.5">
                                                        <span className="text-neutral-500">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                                                        {uploadProgress[file.name] !== undefined && (
                                                            <span className="text-emerald-600 font-bold">{uploadProgress[file.name]}%</span>
                                                        )}
                                                    </div>
                                                </div>
                                                {!submitting && (
                                                    <button type="button" onClick={() => removeFile(idx)} className="p-2 text-neutral-400 hover:text-red-500 transition relative z-10 shrink-0">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full flex justify-center items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3.5 text-sm font-bold text-white hover:bg-emerald-500 transition disabled:opacity-50 mt-4"
                        >
                            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                            {submitting ? '파일 업로드 및 요약 등록 중...' : (files.length > 0 ? `${files.length}개 파일과 함께 등록` : '익명으로 등록')}
                        </button>

                        {submitting && (
                            <div className="absolute inset-0 bg-white/50 dark:bg-black/50 backdrop-blur-sm z-20 flex items-center justify-center pointer-events-none" />
                        )}
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
                                        <div className="flex items-center gap-3 ml-3 shrink-0">
                                            {(q.attachment_count || 0) > 0 && (
                                                <span className="flex items-center gap-1 text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-full text-[10px] font-bold">
                                                    <Paperclip className="w-3.5 h-3.5" /> 첨부 {q.attachment_count}
                                                </span>
                                            )}
                                            <span className="flex items-center gap-1 text-neutral-400 bg-neutral-50 dark:bg-neutral-800 px-2.5 py-1 rounded-full text-[10px] font-bold">
                                                <MessageCircle className="w-3 h-3" /> 답변 {q.reply_count}
                                            </span>
                                            <ChevronRight className={`w-4 h-4 text-neutral-400 transition-transform ${expanded === q.id ? 'rotate-90' : ''}`} />
                                        </div>
                                    </button>

                                    {expanded === q.id && (
                                        <div className="px-5 pb-5 space-y-4 border-t border-neutral-100 dark:border-neutral-800">
                                            {q.content && (
                                                <p className="text-sm text-neutral-700 dark:text-neutral-300 pt-3 whitespace-pre-wrap leading-relaxed">{q.content}</p>
                                            )}

                                            {/* Attachments */}
                                            {(attachmentMap[q.id] || []).length > 0 && (
                                                <div className="pt-2">
                                                    <div className="grid gap-2 sm:grid-cols-2">
                                                        {(attachmentMap[q.id] || []).map(att => (
                                                            <a
                                                                key={att.id}
                                                                href={att.file_url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="flex items-center gap-3 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:border-emerald-400 transition group"
                                                            >
                                                                <div className="p-2 bg-white dark:bg-neutral-900 rounded-lg text-emerald-500 group-hover:scale-110 transition shrink-0">
                                                                    {isVideo(att.file_type) ? <Play className="w-4 h-4" /> : isImage(att.file_type) ? <FileIcon className="w-4 h-4" /> : <Paperclip className="w-4 h-4" />}
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-xs font-bold text-neutral-700 dark:text-neutral-300 truncate">{att.file_name}</p>
                                                                    {att.file_size && <p className="text-[10px] text-neutral-400">{(att.file_size / 1024 / 1024).toFixed(2)} MB</p>}
                                                                </div>
                                                            </a>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Replies */}
                                            {(replyMap[q.id] || []).length > 0 && (
                                                <div className="space-y-2 pt-2 border-t border-neutral-100 dark:border-neutral-800 mt-2">
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
