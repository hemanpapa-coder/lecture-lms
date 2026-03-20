'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Send, Trash2, Megaphone, Vote, MessageCircle, ChevronDown, ChevronUp, User, BookOpen, ChevronLeft } from 'lucide-react'
import Link from 'next/link'

interface ChatMessage {
    id: string
    content: string
    type: 'message' | 'notice' | 'poll'
    metadata: Record<string, any>
    created_at: string
    user_id: string
    users: {
        name: string | null
        email: string
        role: string
    } | null
}

interface Student {
    id: string
    name: string | null
    email: string
    privateLessonId?: string
}

interface Props {
    courseId: string
    courseName: string
    adminUserId: string
    isPrivateLesson?: boolean
    privateLessonStudents?: Student[]
}

const TYPE_CONFIG = {
    message: {
        label: '일반 메시지',
        icon: MessageCircle,
        color: 'text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300',
        activeColor: 'bg-slate-700 text-white',
    },
    notice: {
        label: '공지 (이메일 알림)',
        icon: Megaphone,
        color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-300',
        activeColor: 'bg-amber-500 text-white',
    },
    poll: {
        label: '투표',
        icon: Vote,
        color: 'text-violet-600 bg-violet-50 dark:bg-violet-900/30 dark:text-violet-300',
        activeColor: 'bg-violet-600 text-white',
    },
}

function MessageBubble({
    msg,
    isSelf,
    isAdmin,
    onDelete,
}: {
    msg: ChatMessage
    isSelf: boolean
    isAdmin: boolean
    onDelete: (id: string) => void
}) {
    const sender = msg.users?.name || msg.users?.email || '알 수 없음'
    const isAdminMsg = msg.users?.role === 'admin'
    const time = new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })

    const bubbleStyle = isAdminMsg
        ? 'bg-indigo-600 text-white'
        : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700'

    return (
        <div className={`flex gap-3 group ${isSelf ? 'flex-row-reverse' : 'flex-row'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${isAdminMsg ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                {sender.charAt(0).toUpperCase()}
            </div>
            <div className={`flex flex-col max-w-[70%] ${isSelf ? 'items-end' : 'items-start'}`}>
                <div className={`flex items-center gap-2 mb-1 ${isSelf ? 'flex-row-reverse' : ''}`}>
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{isSelf ? '나' : sender}</span>
                    {msg.type === 'notice' && (
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 flex items-center gap-0.5">
                            <Megaphone className="w-2.5 h-2.5" /> 공지
                        </span>
                    )}
                    {msg.type === 'poll' && (
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 flex items-center gap-0.5">
                            <Vote className="w-2.5 h-2.5" /> 투표
                        </span>
                    )}
                </div>
                <div className={`relative px-4 py-2.5 rounded-2xl shadow-sm text-sm leading-relaxed ${bubbleStyle}`}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    {msg.type === 'poll' && msg.metadata?.options && (
                        <div className="mt-2 space-y-1.5 pt-2 border-t border-white/20 dark:border-slate-600">
                            {(msg.metadata.options as string[]).map((option: string, idx: number) => (
                                <div key={idx} className="text-xs px-2 py-1 rounded bg-white/20 dark:bg-white/10 font-medium">
                                    {idx + 1}. {option}
                                </div>
                            ))}
                        </div>
                    )}
                    {isAdmin && (
                        <button
                            onClick={() => onDelete(msg.id)}
                            className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md hover:bg-red-600"
                            title="메시지 삭제"
                        >
                            <Trash2 className="w-3 h-3" />
                        </button>
                    )}
                </div>
                <span className="text-[10px] text-slate-400 mt-1">{time}</span>
            </div>
        </div>
    )
}

// ── 1:1 채팅창 컴포넌트 ──────────────────────────────────────────
function PrivateChatBox({ courseId, adminUserId, student }: { courseId: string; adminUserId: string; student: Student }) {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [input, setInput] = useState('')
    const [type, setType] = useState<'message' | 'notice' | 'poll'>('message')
    const [pollOptions, setPollOptions] = useState(['', ''])
    const [sending, setSending] = useState(false)
    const [loading, setLoading] = useState(true)
    const messagesContainerRef = useRef<HTMLDivElement>(null)
    const supabase = createClient()

    const fetchMessages = async () => {
        try {
            const res = await fetch(`/api/chat/messages?courseId=${courseId}&targetUserId=${student.id}`)
            if (res.ok) {
                const data = await res.json()
                setMessages(data)
            }
        } catch (e) {
            console.error('Failed to fetch messages', e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        setLoading(true)
        setMessages([])
        fetchMessages()

        const channel = supabase
            .channel(`private-chat-${courseId}-${student.id}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `course_id=eq.${courseId}` },
                async (payload) => {
                    const { data } = await supabase
                        .from('chat_messages')
                        .select(`id, content, type, metadata, created_at, user_id, users:user_id (name, email, role)`)
                        .eq('id', payload.new.id)
                        .single()
                    if (data) {
                        setMessages((prev) => {
                            if (prev.find((m) => m.id === data.id)) return prev
                            if ((data as any).user_id === adminUserId) {
                                return [...prev.filter(m => !m.id.startsWith('temp-')), data as unknown as ChatMessage]
                            }
                            return [...prev, data as unknown as ChatMessage]
                        })
                    }
                }
            )
            .on(
                'postgres_changes',
                { event: 'DELETE', schema: 'public', table: 'chat_messages', filter: `course_id=eq.${courseId}` },
                (payload) => { setMessages((prev) => prev.filter((m) => m.id !== payload.old.id)) }
            )
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [courseId, student.id])

    useEffect(() => {
        if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
        }
    }, [messages])

    const handleSend = async () => {
        if (!input.trim() || sending) return
        setSending(true)
        try {
            const metadata: Record<string, any> = {}
            if (type === 'poll') {
                const validOptions = pollOptions.filter((o) => o.trim())
                if (validOptions.length < 2) { alert('투표 옵션을 최소 2개 입력해주세요.'); setSending(false); return }
                metadata.options = validOptions
            }
            const fakeId = `temp-${Date.now()}`
            setMessages(prev => [...prev, { id: fakeId, user_id: adminUserId, content: input.trim(), type, metadata, created_at: new Date().toISOString(), users: { name: '나 (관리자)', email: '', role: 'admin' } }])
            setInput('')
            if (type === 'poll') setPollOptions(['', ''])

            const res = await fetch('/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: input.trim(), type, courseId, metadata, targetUserId: student.id }),
            })
            if (!res.ok) {
                setMessages(prev => prev.filter(m => m.id !== fakeId))
                console.error('Send error:', await res.json())
            }
        } catch { alert('메세지 전송에 실패했습니다.') }
        finally { setSending(false) }
    }

    const handleDelete = async (messageId: string) => {
        if (!confirm('이 메시지를 삭제하시겠습니까?')) return
        await fetch(`/api/chat/delete?messageId=${messageId}`, { method: 'DELETE' })
        setMessages((prev) => prev.filter((m) => m.id !== messageId))
    }

    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-emerald-50 dark:bg-emerald-950/30 border-b border-emerald-100 dark:border-emerald-900/50">
                <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="font-bold text-emerald-900 dark:text-emerald-300 text-sm">
                    {student.name || student.email}님과의 1:1 대화창
                </span>
                <span className="ml-auto text-xs text-slate-400">{messages.length}개</span>
            </div>
            <div ref={messagesContainerRef} className="h-72 overflow-y-auto p-4 space-y-4 bg-slate-50/50 dark:bg-slate-950/30">
                {loading ? (
                    <div className="flex items-center justify-center h-full text-slate-400 text-sm animate-pulse">메시지 불러오는 중...</div>
                ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
                        <MessageCircle className="w-8 h-8 text-slate-200 dark:text-slate-700" />
                        <p className="text-sm text-slate-400">아직 대화가 없습니다.</p>
                    </div>
                ) : messages.map((msg) => (
                    <MessageBubble key={msg.id} msg={msg} isSelf={msg.user_id === adminUserId} isAdmin={true} onDelete={handleDelete} />
                ))}
            </div>
            {type === 'poll' && (
                <div className="px-4 py-3 bg-violet-50 dark:bg-violet-950/20 border-t border-violet-100 dark:border-violet-900/30">
                    <p className="text-xs font-bold text-violet-700 dark:text-violet-300 mb-2">투표 선택지</p>
                    <div className="space-y-2">
                        {pollOptions.map((opt, idx) => (
                            <input key={idx} type="text" value={opt}
                                onChange={(e) => { const next = [...pollOptions]; next[idx] = e.target.value; setPollOptions(next) }}
                                placeholder={`선택지 ${idx + 1}`}
                                className="w-full px-3 py-2 text-sm rounded-xl border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-400"
                            />
                        ))}
                        {pollOptions.length < 6 && (
                            <button onClick={() => setPollOptions([...pollOptions, ''])} className="text-xs font-bold text-violet-600 hover:underline">+ 선택지 추가</button>
                        )}
                    </div>
                </div>
            )}
            <div className="px-4 pt-3 pb-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex gap-2 mb-2 flex-wrap">
                    {(Object.entries(TYPE_CONFIG) as [keyof typeof TYPE_CONFIG, typeof TYPE_CONFIG['message']][]).map(([key, cfg]) => {
                        const Icon = cfg.icon
                        return (
                            <button key={key} onClick={() => setType(key)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${type === key ? cfg.activeColor : cfg.color}`}>
                                <Icon className="w-3.5 h-3.5" />{cfg.label}
                            </button>
                        )
                    })}
                </div>
                <div className="flex gap-2">
                    <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                        placeholder={type === 'notice' ? '공지 내용 (이메일 발송)...' : type === 'poll' ? '투표 질문...' : '메시지를 입력하세요...'}
                        className="flex-1 px-4 py-2.5 text-sm rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition"
                    />
                    <button onClick={handleSend} disabled={sending || !input.trim()}
                        className="px-4 py-2.5 rounded-2xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-2 shrink-0">
                        <Send className="w-4 h-4" />{sending ? '전송 중...' : '전송'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── 레슨 일지 (아카이브 15주 링크) ──────────────────────────────
function LessonDiaryLinks({ privateLessonId, parentCourseId }: { privateLessonId?: string; parentCourseId?: string }) {
    if (!privateLessonId) return null
    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-violet-50 dark:bg-violet-950/30 border-b border-violet-100 dark:border-violet-900/50">
                <BookOpen className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                <span className="font-bold text-violet-900 dark:text-violet-300 text-sm">15주차 레슨 일지</span>
            </div>
            <div className="p-4 grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-15 gap-2">
                {Array.from({ length: 15 }, (_, i) => i + 1).map(week => (
                    <Link
                        key={week}
                        href={`/archive/${week}?course=${privateLessonId}${parentCourseId ? `&adminCourse=${parentCourseId}` : ''}`}
                        className="flex items-center justify-center aspect-square rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 text-sm font-bold text-violet-700 dark:text-violet-400 hover:bg-violet-600 hover:text-white hover:border-violet-600 transition"
                    >
                        {week}
                    </Link>
                ))}
            </div>
            <div className="px-5 pb-4">
                <Link
                    href={`/archive?course=${privateLessonId}`}
                    className="inline-flex items-center gap-2 text-xs font-bold text-violet-600 dark:text-violet-400 hover:underline"
                >
                    <BookOpen className="w-3.5 h-3.5" /> 전체 레슨 아카이브 보기
                </Link>
            </div>
        </div>
    )
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────
export default function AdminCourseChatPanel({ courseId, courseName, adminUserId, isPrivateLesson, privateLessonStudents }: Props) {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [input, setInput] = useState('')
    const [type, setType] = useState<'message' | 'notice' | 'poll'>('message')
    const [pollOptions, setPollOptions] = useState(['', ''])
    const [sending, setSending] = useState(false)
    const [collapsed, setCollapsed] = useState(false)
    const [loading, setLoading] = useState(true)
    const [subRoom, setSubRoom] = useState<'communal' | 'engineer' | 'musician'>('communal')
    // 개인레슨 모드: 선택된 학생 (null = 학생 카드 그리드 표시)
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
    const messagesContainerRef = useRef<HTMLDivElement>(null)
    const supabase = createClient()

    const activeCourseId = subRoom === 'communal' ? courseId : `${courseId}_${subRoom}`

    // 개인레슨이 아닌 경우 그룹 채팅 메시지 fetch
    const fetchMessages = async () => {
        if (isPrivateLesson) return // 개인레슨은 PrivateChatBox에서 자체 처리
        try {
            const res = await fetch(`/api/chat/messages?courseId=${activeCourseId}`)
            if (res.ok) { const data = await res.json(); setMessages(data) }
        } catch (e) { console.error('Failed to fetch messages', e) }
        finally { setLoading(false) }
    }

    useEffect(() => {
        if (isPrivateLesson) { setLoading(false); return }
        setLoading(true); setMessages([])
        fetchMessages()

        const baseCourseId = activeCourseId.includes('_') ? activeCourseId.split('_')[0] : activeCourseId
        const room = activeCourseId.includes('_') ? activeCourseId.split('_')[1] : 'communal'

        const channel = supabase
            .channel(`course-chat-${activeCourseId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `course_id=eq.${baseCourseId}` },
                async (payload) => {
                    const msgRoom = payload.new.metadata?.room || 'communal'
                    if (msgRoom !== room) return
                    const { data } = await supabase.from('chat_messages').select(`id, content, type, metadata, created_at, user_id, users:user_id (name, email, role)`).eq('id', payload.new.id).single()
                    if (data) setMessages((prev) => {
                        if (prev.find((m) => m.id === data.id)) return prev
                        if ((data as any).user_id === adminUserId) return [...prev.filter(m => !m.id.startsWith('temp-')), data as unknown as ChatMessage]
                        return [...prev, data as unknown as ChatMessage]
                    })
                }
            )
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages', filter: `course_id=eq.${baseCourseId}` },
                (payload) => { setMessages((prev) => prev.filter((m) => m.id !== payload.old.id)) }
            )
            .subscribe()
        return () => { supabase.removeChannel(channel) }
    }, [activeCourseId, isPrivateLesson])

    useEffect(() => {
        if (!collapsed && messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
        }
    }, [messages, collapsed])

    const handleSend = async () => {
        if (!input.trim() || sending) return
        setSending(true)
        try {
            const metadata: Record<string, any> = {}
            if (type === 'poll') {
                const validOptions = pollOptions.filter((o) => o.trim())
                if (validOptions.length < 2) { alert('투표 옵션을 최소 2개 입력해주세요.'); setSending(false); return }
                metadata.options = validOptions
            }
            const fakeId = `temp-${Date.now()}`
            setMessages(prev => [...prev, { id: fakeId, user_id: adminUserId, content: input.trim(), type, metadata, created_at: new Date().toISOString(), users: { name: '나 (관리자)', email: '', role: 'admin' } }])
            setInput(''); if (type === 'poll') setPollOptions(['', ''])
            const res = await fetch('/api/chat/send', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: input.trim(), type, courseId: activeCourseId, metadata }),
            })
            if (!res.ok) { setMessages(prev => prev.filter(m => m.id !== fakeId)); console.error('Send error:', await res.json()) }
        } catch { alert('메세지 전송에 실패했습니다.') }
        finally { setSending(false) }
    }

    const handleDelete = async (messageId: string) => {
        if (!confirm('이 메시지를 삭제하시겠습니까?')) return
        await fetch(`/api/chat/delete?messageId=${messageId}`, { method: 'DELETE' })
        setMessages((prev) => prev.filter((m) => m.id !== messageId))
    }

    // ── 개인레슨 모드: 학생 카드 그리드 + 선택된 학생 패널 ──────
    if (isPrivateLesson) {
        return (
            <div className="space-y-6">
                {/* 학생 카드 그리드 */}
                {!selectedStudent ? (
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-emerald-50 to-slate-50 dark:from-emerald-950/30 dark:to-slate-900">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-900/50">
                                    <User className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <div>
                                    <h2 className="font-bold text-slate-900 dark:text-white text-base">수강 학생 목록</h2>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">학생을 선택하면 1:1 대화창과 레슨 일지가 표시됩니다</p>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {privateLessonStudents && privateLessonStudents.length > 0 ? (
                                privateLessonStudents.map(student => (
                                    <button
                                        key={student.id}
                                        onClick={() => setSelectedStudent(student)}
                                        className="flex flex-col items-center gap-3 p-5 rounded-2xl border-2 border-slate-200 dark:border-slate-700 hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 dark:hover:border-emerald-600 transition-all group text-center"
                                    >
                                        <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-2xl font-black text-emerald-700 dark:text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white transition-all">
                                            {(student.name || student.email).charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="font-bold text-sm text-slate-900 dark:text-white">{student.name || '이름 없음'}</p>
                                            <p className="text-[11px] text-slate-400 truncate max-w-[100px]">{student.email}</p>
                                        </div>
                                    </button>
                                ))
                            ) : (
                                <div className="col-span-full text-center py-10 text-slate-400 text-sm">등록된 학생이 없습니다.</div>
                            )}
                        </div>
                    </div>
                ) : (
                    /* 선택된 학생 패널: 뒤로가기 + 채팅 + 레슨 일지 */
                    <div className="space-y-4">
                        {/* 헤더: 선택된 학생 + 뒤로가기 */}
                        <div className="flex items-center gap-4 px-1">
                            <button
                                onClick={() => setSelectedStudent(null)}
                                className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white transition"
                            >
                                <ChevronLeft className="w-5 h-5" />
                                학생 목록으로
                            </button>
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-sm font-black text-emerald-700 dark:text-emerald-400">
                                    {(selectedStudent.name || selectedStudent.email).charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <p className="font-bold text-slate-900 dark:text-white text-sm">{selectedStudent.name || '이름 없음'}</p>
                                    <p className="text-[11px] text-slate-400">{selectedStudent.email}</p>
                                </div>
                            </div>
                            {selectedStudent.privateLessonId && (
                                <Link
                                    href={`/workspace/${selectedStudent.id}`}
                                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 rounded-xl hover:bg-violet-100 dark:hover:bg-violet-900/50 transition"
                                >
                                    <User className="w-3.5 h-3.5" /> 워크스페이스 열기
                                </Link>
                            )}
                        </div>

                        {/* 1:1 대화창 */}
                        <PrivateChatBox courseId={selectedStudent.privateLessonId || courseId} adminUserId={adminUserId} student={selectedStudent} />

                        {/* 레슨 일지 (15주) */}
                        <LessonDiaryLinks privateLessonId={selectedStudent.privateLessonId} parentCourseId={courseId} />
                    </div>
                )}
            </div>
        )
    }

    // ── 일반 그룹 채팅 (기존 UI 유지) ────────────────────────────
    return (
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-indigo-50 to-slate-50 dark:from-indigo-950/30 dark:to-slate-900">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-900/50">
                        <MessageCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                        <h2 className="font-bold text-slate-900 dark:text-white text-base">{courseName} 대화창</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{messages.length}개의 메시지</p>
                    </div>
                </div>
                <button onClick={() => setCollapsed((c) => !c)} className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition" title={collapsed ? '펼치기' : '접기'}>
                    {collapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                </button>
            </div>

            {!collapsed && (
                <>
                    {courseName === '레코딩실습1' && (
                        <div className="flex bg-slate-50 dark:bg-slate-950/50 p-3 gap-2 border-b border-slate-100 dark:border-slate-800 text-sm font-bold">
                            <button onClick={() => setSubRoom('communal')} className={`px-4 py-2 rounded-xl transition-all ${subRoom === 'communal' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800'}`}>공동 대화창</button>
                            <button onClick={() => setSubRoom('engineer')} className={`px-4 py-2 rounded-xl transition-all ${subRoom === 'engineer' ? 'bg-amber-500 text-white shadow-md' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800'}`}>엔지니어 전용</button>
                            <button onClick={() => setSubRoom('musician')} className={`px-4 py-2 rounded-xl transition-all ${subRoom === 'musician' ? 'bg-pink-500 text-white shadow-md' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800'}`}>뮤지션 전용</button>
                        </div>
                    )}
                    <div ref={messagesContainerRef} className="h-80 overflow-y-auto p-5 space-y-4 bg-slate-50/50 dark:bg-slate-950/30">
                        {loading ? (
                            <div className="flex items-center justify-center h-full"><div className="text-slate-400 text-sm font-medium animate-pulse">메시지를 불러오는 중...</div></div>
                        ) : messages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                                <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><MessageCircle className="w-7 h-7 text-slate-300 dark:text-slate-600" /></div>
                                <p className="text-sm text-slate-400 font-medium">아직 대화가 없습니다.<br />첫 메시지를 보내보세요!</p>
                            </div>
                        ) : messages.map((msg) => <MessageBubble key={msg.id} msg={msg} isSelf={msg.user_id === adminUserId} isAdmin={true} onDelete={handleDelete} />)}
                    </div>
                    {type === 'poll' && (
                        <div className="px-4 py-3 bg-violet-50 dark:bg-violet-950/20 border-t border-violet-100 dark:border-violet-900/30">
                            <p className="text-xs font-bold text-violet-700 dark:text-violet-300 mb-2">투표 선택지</p>
                            <div className="space-y-2">
                                {pollOptions.map((opt, idx) => (
                                    <input key={idx} type="text" value={opt}
                                        onChange={(e) => { const next = [...pollOptions]; next[idx] = e.target.value; setPollOptions(next) }}
                                        placeholder={`선택지 ${idx + 1}`}
                                        className="w-full px-3 py-2 text-sm rounded-xl border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-400"
                                    />
                                ))}
                                {pollOptions.length < 6 && <button onClick={() => setPollOptions([...pollOptions, ''])} className="text-xs font-bold text-violet-600 dark:text-violet-400 hover:underline">+ 선택지 추가</button>}
                            </div>
                        </div>
                    )}
                    <div className="px-5 pt-3 pb-2 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex gap-2 mb-3">
                            {(Object.entries(TYPE_CONFIG) as [keyof typeof TYPE_CONFIG, typeof TYPE_CONFIG['message']][]).map(([key, cfg]) => {
                                const Icon = cfg.icon
                                return (
                                    <button key={key} onClick={() => setType(key)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${type === key ? cfg.activeColor : cfg.color}`}>
                                        <Icon className="w-3.5 h-3.5" />{cfg.label}
                                    </button>
                                )
                            })}
                        </div>
                        <div className="flex gap-2 pb-2">
                            <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                                placeholder={type === 'notice' ? '공지 내용을 입력하세요 (수강생 이메일 발송)...' : type === 'poll' ? '투표 질문을 입력하세요...' : '메시지를 입력하세요...'}
                                className="flex-1 px-4 py-2.5 text-sm rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
                            />
                            <button onClick={handleSend} disabled={sending || !input.trim()}
                                className="px-4 py-2.5 rounded-2xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-2 shrink-0">
                                <Send className="w-4 h-4" />{sending ? '전송 중...' : '전송'}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
