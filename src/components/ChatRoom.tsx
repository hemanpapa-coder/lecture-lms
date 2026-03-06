'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import {
    Send, Megaphone, BarChart3, X, User,
    CheckCircle2, Clock, Trash2, Loader2,
    Plus, ChevronRight, Users
} from 'lucide-react'

interface Message {
    id: string
    user_id: string
    content: string
    type: 'message' | 'notice' | 'poll'
    metadata: any
    created_at: string
    user?: {
        full_name: string
        profile_image_url: string
        role: string
    }
}

interface Vote {
    message_id: string
    user_id: string
    option_index: number
}

export default function ChatRoom({ courseId, userId, isAdmin }: { courseId: string, userId: string, isAdmin: boolean }) {
    const supabase = createClient()
    const [messages, setMessages] = useState<Message[]>([])
    const [votes, setVotes] = useState<Record<string, Vote[]>>({})
    const [input, setInput] = useState('')
    const [sending, setSending] = useState(false)
    const [showPollCreator, setShowPollCreator] = useState(false)
    const [pollQuestion, setPollQuestion] = useState('')
    const [pollOptions, setPollOptions] = useState(['', ''])
    const [messageType, setMessageType] = useState<'message' | 'notice'>('message')

    const chatEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        fetchMessages()
        fetchVotes()

        // Real-time subscription
        const channel = supabase
            .channel(`chat:${courseId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'chat_messages',
                filter: `course_id=eq.${courseId}`
            }, (payload) => {
                const newMessage = payload.new as Message
                // Fetch user info for the new message
                fetchUserInfo(newMessage.user_id).then(user => {
                    setMessages(prev => [...prev, { ...newMessage, user: user || undefined }])
                })
            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'poll_votes'
            }, () => {
                fetchVotes()
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [courseId])

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const fetchUserInfo = async (id: string) => {
        const { data } = await supabase.from('users').select('full_name, profile_image_url, role').eq('id', id).single()
        return data
    }

    const fetchMessages = async () => {
        const { data } = await supabase
            .from('chat_messages')
            .select(`
                *,
                user:users (full_name, profile_image_url, role)
            `)
            .eq('course_id', courseId)
            .order('created_at', { ascending: true })

        if (data) setMessages(data as any)
    }

    const fetchVotes = async () => {
        const { data } = await supabase.from('poll_votes').select('*')
        if (data) {
            const grouped = data.reduce((acc: any, vote: any) => {
                if (!acc[vote.message_id]) acc[vote.message_id] = []
                acc[vote.message_id].push(vote)
                return acc
            }, {})
            setVotes(grouped)
        }
    }

    const sendMessage = async (e?: React.FormEvent) => {
        e?.preventDefault()
        if (!input.trim() || sending) return

        setSending(true)
        try {
            const res = await fetch('/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: input,
                    type: messageType,
                    courseId
                })
            })
            if (!res.ok) throw new Error('전송 실패')
            setInput('')
            setMessageType('message')
        } catch (err) {
            alert('메세지 전송에 실패했습니다.')
        } finally {
            setSending(false)
        }
    }

    const createPoll = async () => {
        if (!pollQuestion.trim() || pollOptions.some(o => !o.trim())) {
            alert('질문과 모든 옵션을 입력해주세요.')
            return
        }

        setSending(true)
        try {
            const res = await fetch('/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: pollQuestion,
                    type: 'poll',
                    courseId,
                    metadata: { options: pollOptions }
                })
            })
            if (!res.ok) throw new Error('투표 생성 실패')
            setShowPollCreator(false)
            setPollQuestion('')
            setPollOptions(['', ''])
        } catch (err) {
            alert('투표 생성에 실패했습니다.')
        } finally {
            setSending(false)
        }
    }

    const handleVote = async (messageId: string, optionIndex: number) => {
        try {
            const res = await fetch('/api/chat/vote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messageId, optionIndex })
            })
            if (!res.ok) throw new Error('투표 실패')
        } catch (err) {
            alert('투표 반영에 실패했습니다.')
        }
    }

    const formatTime = (dateStr: string) => {
        return new Date(dateStr).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    }

    return (
        <div className="flex flex-col h-[600px] bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-lg">
                        <Users className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-900 dark:text-white leading-none">단체 대화창</h3>
                        <p className="text-[10px] text-slate-500 mt-1 font-medium">수업 참여자 전용</p>
                    </div>
                </div>
                {isAdmin && (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowPollCreator(true)}
                            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 transition"
                            title="투표 생성"
                        >
                            <BarChart3 className="w-5 h-5" />
                        </button>
                    </div>
                )}
            </div>

            {/* Messages Area */}
            <div className="flex-grow overflow-y-auto p-4 space-y-4 scrollbar-hide">
                {messages.map((m, idx) => {
                    const isSystem = m.type === 'notice' || m.type === 'poll'
                    const isMine = m.user_id === userId
                    const showAvatar = idx === 0 || messages[idx - 1].user_id !== m.user_id

                    if (m.type === 'notice') {
                        return (
                            <div key={m.id} className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 p-4 rounded-2xl animate-in fade-in slide-in-from-top-2">
                                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-black text-xs mb-2">
                                    <Megaphone className="w-4 h-4" /> 공지사항
                                </div>
                                <p className="text-sm text-slate-800 dark:text-slate-200 font-bold whitespace-pre-wrap">{m.content}</p>
                                <p className="text-[10px] text-slate-400 mt-2">{formatTime(m.created_at)}</p>
                            </div>
                        )
                    }

                    if (m.type === 'poll') {
                        const messageVotes = votes[m.id] || []
                        const totalVotes = messageVotes.length
                        const myVote = messageVotes.find(v => v.user_id === userId)
                        const options = m.metadata.options || []

                        return (
                            <div key={m.id} className="bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-200 dark:border-indigo-800/50 p-5 rounded-3xl space-y-4 relative">
                                <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 font-black text-xs">
                                    <BarChart3 className="w-4 h-4" /> 진행 중인 투표
                                </div>
                                <h4 className="text-base font-extrabold text-slate-900 dark:text-white leading-tight">{m.content}</h4>
                                <div className="space-y-2">
                                    {options.map((opt: string, i: number) => {
                                        const optVotes = messageVotes.filter(v => v.option_index === i).length
                                        const pct = totalVotes > 0 ? (optVotes / totalVotes) * 100 : 0
                                        const isSelected = myVote?.option_index === i

                                        return (
                                            <button
                                                key={i}
                                                onClick={() => handleVote(m.id, i)}
                                                className={`w-full relative h-12 rounded-xl overflow-hidden border transition-all ${isSelected ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-white dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-300'}`}
                                            >
                                                <div
                                                    className="absolute inset-y-0 left-0 bg-indigo-100 dark:bg-indigo-500/20 transition-all duration-1000"
                                                    style={{ width: `${pct}%` }}
                                                />
                                                <div className="absolute inset-0 px-4 flex items-center justify-between pointer-events-none">
                                                    <span className={`text-sm font-bold ${isSelected ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-400'}`}>
                                                        {opt}
                                                    </span>
                                                    <span className="text-xs font-black text-indigo-500">{Math.round(pct)}%</span>
                                                </div>
                                            </button>
                                        )
                                    })}
                                </div>
                                <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold">
                                    <span>총 {totalVotes}명 참여</span>
                                    <span>{formatTime(m.created_at)}</span>
                                </div>
                            </div>
                        )
                    }

                    return (
                        <div key={m.id} className={`flex gap-2 ${isMine ? 'flex-row-reverse' : ''}`}>
                            {!isMine && showAvatar && (
                                <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden flex-shrink-0">
                                    {m.user?.profile_image_url ? (
                                        <img src={m.user.profile_image_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-400">
                                            <User className="w-4 h-4" />
                                        </div>
                                    )}
                                </div>
                            )}
                            {!isMine && !showAvatar && <div className="w-8" />}
                            <div className={`max-w-[70%] space-y-1 ${isMine ? 'items-end' : 'items-start'} flex flex-col`}>
                                {!isMine && showAvatar && (
                                    <span className="text-[10px] font-bold text-slate-500 ml-1">
                                        {m.user?.full_name} {m.user?.role === 'admin' && '👑'}
                                    </span>
                                )}
                                <div className={`px-4 py-2.5 rounded-2xl text-sm font-medium shadow-sm ${isMine ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none'}`}>
                                    {m.content}
                                </div>
                                <span className="text-[9px] text-slate-400 font-medium px-1">{formatTime(m.created_at)}</span>
                            </div>
                        </div>
                    )
                })}
                <div ref={chatEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 space-y-3">
                {isAdmin && (
                    <div className="flex gap-2 mb-2">
                        <button
                            onClick={() => setMessageType(prev => prev === 'message' ? 'notice' : 'message')}
                            className={`px-3 py-1 rounded-full text-[10px] font-black transition-all flex items-center gap-1.5 ${messageType === 'notice' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-500 opacity-60 hover:opacity-100'}`}
                        >
                            <Megaphone className="w-3 h-3" /> 공지로 보내기
                        </button>
                    </div>
                )}
                <form onSubmit={sendMessage} className="flex gap-2">
                    <input
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        placeholder={messageType === 'notice' ? "수강생 전체에게 메일을 발송하는 중요한 공지를 입력하세요..." : "메세지를 입력하세요..."}
                        className={`flex-grow p-3 rounded-2xl border bg-slate-50 dark:bg-slate-950 text-sm outline-none transition-all ${messageType === 'notice' ? 'border-amber-300 focus:ring-2 focus:ring-amber-400' : 'border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-indigo-400'}`}
                    />
                    <button
                        disabled={!input.trim() || sending}
                        className={`p-3 rounded-2xl flex items-center justify-center transition-all bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50`}
                    >
                        {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    </button>
                </form>
            </div>

            {/* Poll Creator Modal */}
            {showPollCreator && (
                <div className="absolute inset-0 bg-white/95 dark:bg-slate-950/95 z-20 flex flex-col p-6 animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                            <BarChart3 className="w-6 h-6 text-indigo-500" /> 투표 만들기
                        </h3>
                        <button onClick={() => setShowPollCreator(false)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"><X /></button>
                    </div>
                    <div className="space-y-6 overflow-y-auto pr-2">
                        <div>
                            <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">질문 (Question)</label>
                            <input
                                value={pollQuestion}
                                onChange={e => setPollQuestion(e.target.value)}
                                placeholder="생각하고 계신 질문을 적어주세요."
                                className="w-full p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-400"
                            />
                        </div>
                        <div className="space-y-3">
                            <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1">선택 항목 (Options)</label>
                            {pollOptions.map((opt, i) => (
                                <div key={i} className="flex gap-2">
                                    <input
                                        value={opt}
                                        onChange={e => {
                                            const newOpts = [...pollOptions]
                                            newOpts[i] = e.target.value
                                            setPollOptions(newOpts)
                                        }}
                                        placeholder={`옵션 ${i + 1}`}
                                        className="flex-grow p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm outline-none focus:border-indigo-500"
                                    />
                                    {pollOptions.length > 2 && (
                                        <button onClick={() => setPollOptions(pollOptions.filter((_, idx) => idx !== i))} className="p-2 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg"><X className="w-4 h-4" /></button>
                                    )}
                                </div>
                            ))}
                            {pollOptions.length < 5 && (
                                <button
                                    onClick={() => setPollOptions([...pollOptions, ''])}
                                    className="w-full py-3 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-400 hover:text-indigo-500 hover:border-indigo-200 transition-all flex items-center justify-center gap-2"
                                >
                                    <Plus className="w-4 h-4" /> 항목 추가하기
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="mt-auto pt-6">
                        <button
                            onClick={createPoll}
                            disabled={sending}
                            className="w-full py-4 rounded-3xl bg-indigo-600 text-white font-black text-base shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 disabled:opacity-50 transition-all active:scale-95"
                        >
                            {sending ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : '투표 등록하고 공유하기'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
