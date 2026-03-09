'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import {
    Send, Megaphone, BarChart3, X, User,
    CheckCircle2, Clock, Trash2, Loader2,
    Plus, ChevronRight, Users, Smile, Paperclip, Edit2, Check
} from 'lucide-react'

interface Message {
    id: string
    user_id: string
    content: string
    type: 'message' | 'notice' | 'poll'
    metadata: any
    created_at: string
    user?: {
        name: string
        role: string
    }
}

interface Vote {
    message_id: string
    user_id: string
    option_index: number
}

export default function ChatRoom({ courseId, userId, isAdmin, isPrivateMode = false }: { courseId: string, userId: string, isAdmin: boolean, isPrivateMode?: boolean }) {
    const supabase = createClient()
    const [messages, setMessages] = useState<Message[]>([])
    const [votes, setVotes] = useState<Record<string, Vote[]>>({})
    const [input, setInput] = useState('')
    const [sending, setSending] = useState(false)
    const [showPollCreator, setShowPollCreator] = useState(false)
    const [pollQuestion, setPollQuestion] = useState('')
    const [pollOptions, setPollOptions] = useState(['', ''])
    const [messageType, setMessageType] = useState<'message' | 'notice'>('message')
    const [readReceipts, setReadReceipts] = useState<Record<string, string>>({})
    const [totalParticipants, setTotalParticipants] = useState(0)

    // Kakao-style features
    const [showEmojis, setShowEmojis] = useState(false)
    const [uploadingFile, setUploadingFile] = useState(false)
    const [uploadProgress, setUploadProgress] = useState(0)
    const [editingMsgId, setEditingMsgId] = useState<string | null>(null)
    const [editContent, setEditContent] = useState('')
    const [spellCheckEnabled, setSpellCheckEnabled] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const CUTE_EMOJIS = ['🐶', '🐱', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐙', '🦖', '🦄', '🍎', '🍓', '🍒', '🍉', '🍕', '🍩', '🍦', '☕️', '🎈', '🎉', '💖', '✨', '🔥', '👍', '👏', '🙌']

    const chatEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        fetchMessages()
        fetchVotes()
        fetchTotalParticipants()
        fetchReadReceipts()
        updateMyReadReceipt()

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
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'chat_read_receipts',
                filter: `course_id=eq.${courseId}`
            }, () => {
                fetchReadReceipts()
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [courseId])

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        if (messages.length > 0) {
            updateMyReadReceipt()
        }
    }, [messages])

    const fetchUserInfo = async (id: string) => {
        const { data } = await supabase.from('users').select('name, role').eq('id', id).single()
        return data
    }

    const fetchTotalParticipants = async () => {
        const { count } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('course_id', courseId)
        setTotalParticipants(count || 0)
    }

    const fetchReadReceipts = async () => {
        const { data } = await supabase.from('chat_read_receipts').select('*').eq('course_id', courseId)
        if (data) {
            const receipts: Record<string, string> = {}
            data.forEach(r => { receipts[r.user_id] = r.last_read_at })
            setReadReceipts(receipts)
        }
    }

    const updateMyReadReceipt = async () => {
        const now = new Date().toISOString()
        setReadReceipts(prev => ({ ...prev, [userId]: now }))
        await supabase.from('chat_read_receipts').upsert({
            user_id: userId,
            course_id: courseId,
            last_read_at: now
        }, { onConflict: 'user_id,course_id' })
    }

    const fetchMessages = async () => {
        const { data } = await supabase
            .from('chat_messages')
            .select(`
                *,
                user:users (name, role)
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
            let finalContent = input

            // Spell-check intervention
            if (spellCheckEnabled && messageType === 'message') {
                try {
                    const spRes = await fetch('/api/spell-check', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: input })
                    })
                    if (spRes.ok) {
                        const { corrected } = await spRes.json()
                        if (corrected) finalContent = corrected
                    }
                } catch (spErr) {
                    console.error('Spell check failed:', spErr)
                }
            }

            const res = await fetch('/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: finalContent,
                    type: messageType,
                    courseId
                })
            })
            if (!res.ok) throw new Error('전송 실패')
            setInput('')
            setMessageType('message')
            setShowEmojis(false)
        } catch (err) {
            alert('메세지 전송에 실패했습니다.')
        } finally {
            setSending(false)
        }
    }

    const saveEdit = async () => {
        if (!editingMsgId || !editContent.trim()) return

        // Optimistic UI update
        setMessages(prev => prev.map(m => m.id === editingMsgId ? { ...m, content: editContent, metadata: { ...m.metadata, is_edited: true } } : m))

        await supabase.from('chat_messages').update({
            content: editContent,
            metadata: { ...messages.find(m => m.id === editingMsgId)?.metadata, is_edited: true }
        }).eq('id', editingMsgId)

        setEditingMsgId(null)
        setEditContent('')
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setUploadingFile(true)
        setUploadProgress(0)

        try {
            // 1. Get resumable upload URL
            const res = await fetch('/api/board/upload-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileName: file.name, mimeType: file.type || 'application/octet-stream', fileSize: file.size })
            })
            if (!res.ok) throw new Error('업로드 URL을 가져오지 못했습니다.')
            const { uploadUrl, webViewLink } = await res.json()

            // 2. Upload file via XHR
            await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest()
                xhr.open('PUT', uploadUrl, true)
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        setUploadProgress(Math.round((e.loaded / e.total) * 100))
                    }
                }
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) resolve(true)
                    else reject(new Error(`업로드 실패: ${xhr.status}`))
                }
                xhr.onerror = () => reject(new Error('네트워크 오류'))
                xhr.send(file)
            })

            // 3. Send Message with Attachment
            const msgRes = await fetch('/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: `첨부파일: ${file.name}`,
                    type: 'message',
                    courseId,
                    metadata: { file_url: webViewLink, file_name: file.name, file_size: file.size }
                })
            })
            if (!msgRes.ok) throw new Error('메세지 전송 실패')

        } catch (err: any) {
            alert(`파일 업로드 실패: ${err.message}`)
        } finally {
            setUploadingFile(false)
            setUploadProgress(0)
            if (fileInputRef.current) fileInputRef.current.value = ''
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
                {isAdmin && !isPrivateMode && (
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

                    // Calculate Unread Count
                    let unreadCount = 0
                    if (totalParticipants > 0) {
                        const readCount = Object.values(readReceipts).filter(readAt => new Date(readAt) >= new Date(m.created_at)).length
                        unreadCount = Math.max(0, totalParticipants - readCount)
                    }

                    return (
                        <div key={m.id} className={`flex gap-2 ${isMine ? 'flex-row-reverse' : ''}`}>
                            {!isMine && showAvatar && (
                                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-600 font-bold text-sm">
                                    {m.user?.name?.[0]?.toUpperCase() || <User className="w-4 h-4" />}
                                </div>
                            )}
                            <div className={`max-w-[75%] space-y-1 ${isMine ? 'items-end' : 'items-start'} flex flex-col`}>
                                {!isMine && showAvatar && (
                                    <span className="text-[10px] font-bold text-slate-500 ml-1">
                                        {m.user?.name || '익명'} {m.user?.role === 'admin' && '👑'}
                                    </span>
                                )}
                                <div className="flex items-end gap-1.5 flex-row">
                                    {isMine && (
                                        <div className="flex flex-col items-end pb-1 min-w-[20px]">
                                            {unreadCount > 0 && <span className="text-[10px] text-amber-500 font-bold leading-none mb-1">{unreadCount}</span>}
                                            <span className="text-[9px] text-slate-400 font-medium leading-none">{formatTime(m.created_at)}</span>
                                        </div>
                                    )}

                                    <div className={`px-4 py-2.5 rounded-2xl text-sm font-medium shadow-sm break-all ${isMine ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none'}`}>
                                        {editingMsgId === m.id ? (
                                            <div className="flex items-center gap-2">
                                                <input autoFocus value={editContent} onChange={e => setEditContent(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveEdit()} className="bg-white/20 text-white placeholder-white/50 border-none outline-none rounded px-2 py-1 text-sm w-full" />
                                                <button onClick={saveEdit} className="p-1 hover:bg-white/20 rounded"><Check className="w-4 h-4" /></button>
                                                <button onClick={() => setEditingMsgId(null)} className="p-1 hover:bg-white/20 rounded"><X className="w-4 h-4" /></button>
                                            </div>
                                        ) : (
                                            <>
                                                {m.metadata?.file_url ? (
                                                    <a href={m.metadata.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 underline underline-offset-2 hover:bg-white/10 p-1 rounded transition">
                                                        <Paperclip className="w-4 h-4" /> {m.metadata.file_name}
                                                    </a>
                                                ) : m.content}
                                                {m.metadata?.is_edited && <span className="text-[10px] opacity-70 ml-2 inline-block whitespace-nowrap">(수정됨)</span>}
                                                {isMine && !m.metadata?.file_url && m.type === 'message' && (
                                                    <button onClick={() => { setEditingMsgId(m.id); setEditContent(m.content); }} className="text-xs ml-2 opacity-50 hover:opacity-100 transition inline-flex items-center align-middle hover:scale-110">
                                                        <Edit2 className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>

                                    {!isMine && (
                                        <div className="flex flex-col items-start pb-1 min-w-[20px]">
                                            {unreadCount > 0 && <span className="text-[10px] text-amber-500 font-bold leading-none mb-1">{unreadCount}</span>}
                                            <span className="text-[9px] text-slate-400 font-medium leading-none">{formatTime(m.created_at)}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                })}
                <div ref={chatEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <div className="flex gap-2 mb-2 items-center text-[10px] font-black">
                    {isAdmin && !isPrivateMode && (
                        <button
                            onClick={() => setMessageType(prev => prev === 'message' ? 'notice' : 'message')}
                            className={`px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${messageType === 'notice' ? 'bg-amber-100 text-amber-700 border border-amber-200 shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-700'}`}
                        >
                            <Megaphone className="w-3 h-3" /> 공지로 보내기
                        </button>
                    )}
                    <button
                        onClick={() => setSpellCheckEnabled(!spellCheckEnabled)}
                        className={`px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${spellCheckEnabled ? 'bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-sm dark:bg-indigo-900/40 dark:text-indigo-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                        🪄 자동 맞춤법 교정 {spellCheckEnabled ? 'ON' : 'OFF'}
                    </button>
                </div>
                <form onSubmit={sendMessage} className="relative flex gap-2">
                    <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-2xl hover:bg-slate-200 transition">
                        {uploadingFile ? <span className="text-xs font-bold text-indigo-600">{uploadProgress}%</span> : <Plus className="w-5 h-5" />}
                    </button>
                    <button type="button" onClick={() => setShowEmojis(!showEmojis)} className={`p-3 rounded-2xl transition ${showEmojis ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200'}`}>
                        <Smile className="w-5 h-5" />
                    </button>

                    {showEmojis && (
                        <div className="absolute bottom-full mb-3 left-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl rounded-2xl p-4 grid grid-cols-8 gap-3 w-[360px] z-10 animate-in fade-in slide-in-from-bottom-2">
                            <div className="col-span-8 text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Cute Emojis</div>
                            {CUTE_EMOJIS.map(emoji => (
                                <button key={emoji} type="button" onClick={() => { setInput(prev => prev + emoji); setShowEmojis(false); }} className="text-2xl hover:scale-125 transition-transform">
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    )}

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
