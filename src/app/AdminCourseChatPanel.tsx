'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Send, Trash2, Megaphone, Vote, MessageCircle, ChevronDown, ChevronUp } from 'lucide-react'

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
            {/* Avatar */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${isAdminMsg ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                {sender.charAt(0).toUpperCase()}
            </div>

            <div className={`flex flex-col max-w-[70%] ${isSelf ? 'items-end' : 'items-start'}`}>
                {/* Sender + type badge */}
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

                {/* Bubble */}
                <div className={`relative px-4 py-2.5 rounded-2xl shadow-sm text-sm leading-relaxed ${bubbleStyle}`}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>

                    {/* Poll options */}
                    {msg.type === 'poll' && msg.metadata?.options && (
                        <div className="mt-2 space-y-1.5 pt-2 border-t border-white/20 dark:border-slate-600">
                            {(msg.metadata.options as string[]).map((option: string, idx: number) => (
                                <div key={idx} className="text-xs px-2 py-1 rounded bg-white/20 dark:bg-white/10 font-medium">
                                    {idx + 1}. {option}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Delete button — admin only, appears on hover */}
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

export default function AdminCourseChatPanel({ courseId, courseName, adminUserId, isPrivateLesson, privateLessonStudents }: Props) {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [input, setInput] = useState('')
    const [type, setType] = useState<'message' | 'notice' | 'poll'>('message')
    const [pollOptions, setPollOptions] = useState(['', ''])
    const [sending, setSending] = useState(false)
    const [collapsed, setCollapsed] = useState(false)
    const [loading, setLoading] = useState(true)
    const [subRoom, setSubRoom] = useState<'communal' | 'engineer' | 'musician'>('communal')
    // For private lesson: which student is selected for 1:1 chat
    const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
        isPrivateLesson && privateLessonStudents && privateLessonStudents.length > 0
            ? privateLessonStudents[0].id
            : null
    )
    const bottomRef = useRef<HTMLDivElement>(null)
    const supabase = createClient()

    const activeCourseId = subRoom === 'communal' ? courseId : `${courseId}_${subRoom}`

    // Fetch messages
    const fetchMessages = async () => {
        try {
            // For private lesson: fetch 1:1 messages with the selected student
            const url = isPrivateLesson && selectedStudentId
                ? `/api/chat/messages?courseId=${activeCourseId}&targetUserId=${selectedStudentId}`
                : `/api/chat/messages?courseId=${activeCourseId}`
            const res = await fetch(url)
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

        const baseCourseId = activeCourseId.includes('_') ? activeCourseId.split('_')[0] : activeCourseId;
        const room = activeCourseId.includes('_') ? activeCourseId.split('_')[1] : 'communal';

        // Realtime subscription
        const channel = supabase
            .channel(`course-chat-${activeCourseId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'chat_messages',
                    filter: `course_id=eq.${baseCourseId}`,
                },
                async (payload) => {
                    const msgRoom = payload.new.metadata?.room || 'communal';
                    if (msgRoom !== room) return;

                    // Fetch the new message with user info
                    const { data } = await supabase
                        .from('chat_messages')
                        .select(`id, content, type, metadata, created_at, user_id, users:user_id (name, email, role)`)
                        .eq('id', payload.new.id)
                        .single()
                    if (data) {
                        setMessages((prev) => {
                            // Avoid exact duplicates (same real ID)
                            if (prev.find((m) => m.id === data.id)) return prev
                            // If this is my own message, replace the temp optimistic message
                            if ((data as any).user_id === adminUserId) {
                                const withoutTemp = prev.filter(m => !m.id.startsWith('temp-'))
                                return [...withoutTemp, data as unknown as ChatMessage]
                            }
                            return [...prev, data as unknown as ChatMessage]
                        })
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'chat_messages',
                    filter: `course_id=eq.${baseCourseId}`,
                },
                (payload) => {
                    setMessages((prev) => prev.filter((m) => m.id !== payload.old.id))
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [activeCourseId, selectedStudentId])

    // Scroll to bottom when new messages arrive
    useEffect(() => {
        if (!collapsed) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
    }, [messages, collapsed])

    const handleSend = async () => {
        if (!input.trim() || sending) return

        setSending(true)
        try {
            const metadata: Record<string, any> = {}
            if (type === 'poll') {
                const validOptions = pollOptions.filter((o) => o.trim())
                if (validOptions.length < 2) {
                    alert('투표 옵션을 최소 2개 입력해주세요.')
                    setSending(false)
                    return
                }
                metadata.options = validOptions
            }

            const fakeId = `temp-${Date.now()}`
            const optimisticMsg: ChatMessage = {
                id: fakeId,
                user_id: adminUserId,
                content: input.trim(),
                type,
                metadata,
                created_at: new Date().toISOString(),
                users: {
                    name: '나 (관리자)',
                    email: '',
                    role: 'admin'
                }
            }

            setMessages(prev => [...prev, optimisticMsg])
            setInput('')
            if (type === 'poll') setPollOptions(['', ''])

            const res = await fetch('/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: input.trim(),
                    type,
                    courseId: activeCourseId,
                    metadata,
                    // For private lesson: send directly to selected student
                    ...(isPrivateLesson && selectedStudentId ? { targetUserId: selectedStudentId } : {}),
                }),
            })

            if (!res.ok) {
                // Remove optimistic message on failure
                setMessages(prev => prev.filter(m => m.id !== fakeId))
                const err = await res.json()
                console.error('Send error:', err)
            }
        } catch (err) {
            alert('메세지 전송에 실패했습니다.');
        } finally {
            setSending(false)
        }
    }

    const handleDelete = async (messageId: string) => {
        if (!confirm('이 메시지를 삭제하시겠습니까?')) return
        try {
            await fetch(`/api/chat/delete?messageId=${messageId}`, { method: 'DELETE' })
            // Optimistically remove; realtime will also fire
            setMessages((prev) => prev.filter((m) => m.id !== messageId))
        } catch (e) {
            console.error('Delete failed', e)
        }
    }

    return (
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-indigo-50 to-slate-50 dark:from-indigo-950/30 dark:to-slate-900">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-900/50">
                        <MessageCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                        <h2 className="font-bold text-slate-900 dark:text-white text-base">{courseName} 대화창</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            {messages.length}개의 메시지
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => setCollapsed((c) => !c)}
                    className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    title={collapsed ? '펼치기' : '접기'}
                >
                    {collapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                </button>
            </div>

            {!collapsed && (
                <>
                    {/* Private lesson: student selector */}
                    {isPrivateLesson && privateLessonStudents && privateLessonStudents.length > 0 && (
                        <div className="flex bg-slate-50 dark:bg-slate-950/50 p-3 gap-2 border-b border-slate-100 dark:border-slate-800 text-sm font-bold overflow-x-auto">
                            <span className="text-xs text-slate-400 flex items-center px-1 shrink-0">학생 선택:</span>
                            {privateLessonStudents.map(student => (
                                <button
                                    key={student.id}
                                    onClick={() => setSelectedStudentId(student.id)}
                                    className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-all shrink-0 ${selectedStudentId === student.id
                                        ? 'bg-indigo-600 text-white shadow-md'
                                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                                    }`}
                                >
                                    {student.name || student.email}
                                </button>
                            ))}
                        </div>
                    )}
                    {courseName === '레코딩실습1' && (
                        <div className="flex bg-slate-50 dark:bg-slate-950/50 p-3 gap-2 border-b border-slate-100 dark:border-slate-800 text-sm font-bold">
                            <button onClick={() => setSubRoom('communal')} className={`px-4 py-2 rounded-xl transition-all ${subRoom === 'communal' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'}`}>공동 대화창</button>
                            <button onClick={() => setSubRoom('engineer')} className={`px-4 py-2 rounded-xl transition-all ${subRoom === 'engineer' ? 'bg-amber-500 text-white shadow-md' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'}`}>엔지니어 전용</button>
                            <button onClick={() => setSubRoom('musician')} className={`px-4 py-2 rounded-xl transition-all ${subRoom === 'musician' ? 'bg-pink-500 text-white shadow-md' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'}`}>뮤지션 전용</button>
                        </div>
                    )}
                    {/* Messages area */}
                    <div className="h-80 overflow-y-auto p-5 space-y-4 bg-slate-50/50 dark:bg-slate-950/30">
                        {loading ? (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-slate-400 text-sm font-medium animate-pulse">메시지를 불러오는 중...</div>
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                                <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                    <MessageCircle className="w-7 h-7 text-slate-300 dark:text-slate-600" />
                                </div>
                                <p className="text-sm text-slate-400 font-medium">아직 대화가 없습니다.<br />첫 메시지를 보내보세요!</p>
                            </div>
                        ) : (
                            messages.map((msg) => (
                                <MessageBubble
                                    key={msg.id}
                                    msg={msg}
                                    isSelf={msg.user_id === adminUserId}
                                    isAdmin={true}
                                    onDelete={handleDelete}
                                />
                            ))
                        )}
                        <div ref={bottomRef} />
                    </div>

                    {/* Poll options */}
                    {type === 'poll' && (
                        <div className="px-4 py-3 bg-violet-50 dark:bg-violet-950/20 border-t border-violet-100 dark:border-violet-900/30">
                            <p className="text-xs font-bold text-violet-700 dark:text-violet-300 mb-2">투표 선택지</p>
                            <div className="space-y-2">
                                {pollOptions.map((opt, idx) => (
                                    <input
                                        key={idx}
                                        type="text"
                                        value={opt}
                                        onChange={(e) => {
                                            const next = [...pollOptions]
                                            next[idx] = e.target.value
                                            setPollOptions(next)
                                        }}
                                        placeholder={`선택지 ${idx + 1}`}
                                        className="w-full px-3 py-2 text-sm rounded-xl border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-400"
                                    />
                                ))}
                                {pollOptions.length < 6 && (
                                    <button
                                        onClick={() => setPollOptions([...pollOptions, ''])}
                                        className="text-xs font-bold text-violet-600 dark:text-violet-400 hover:underline"
                                    >
                                        + 선택지 추가
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Input toolbar */}
                    <div className="px-5 pt-3 pb-2 border-t border-slate-100 dark:border-slate-800">
                        {/* Type selector */}
                        <div className="flex gap-2 mb-3">
                            {(Object.entries(TYPE_CONFIG) as [keyof typeof TYPE_CONFIG, typeof TYPE_CONFIG['message']][]).map(([key, cfg]) => {
                                const Icon = cfg.icon
                                const isActive = type === key
                                return (
                                    <button
                                        key={key}
                                        onClick={() => setType(key)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${isActive ? cfg.activeColor : cfg.color}`}
                                    >
                                        <Icon className="w-3.5 h-3.5" />
                                        {cfg.label}
                                    </button>
                                )
                            })}
                        </div>

                        {/* Text input + send */}
                        <div className="flex gap-2 pb-2">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault()
                                        handleSend()
                                    }
                                }}
                                placeholder={
                                    type === 'notice'
                                        ? '공지 내용을 입력하세요 (수강생 이메일 발송)...'
                                        : type === 'poll'
                                            ? '투표 질문을 입력하세요...'
                                            : '메시지를 입력하세요...'
                                }
                                className="flex-1 px-4 py-2.5 text-sm rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
                            />
                            <button
                                onClick={handleSend}
                                disabled={sending || !input.trim()}
                                className="px-4 py-2.5 rounded-2xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-2 shrink-0"
                            >
                                <Send className="w-4 h-4" />
                                {sending ? '전송 중...' : '전송'}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
