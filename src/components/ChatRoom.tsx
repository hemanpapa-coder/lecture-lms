'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import {
    Send, Megaphone, BarChart3, X, User,
    CheckCircle2, Clock, Trash2, Loader2,
    Plus, ChevronRight, Users, Smile, Paperclip, Edit2, Check, Bell
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

export default function ChatRoom({ courseId, userId, isAdmin, userRole, isPrivateMode = false, title = '단체 대화창', subtitle = '수업 참여자 전용' }: { courseId: string, userId: string, isAdmin: boolean, userRole?: string, isPrivateMode?: boolean, title?: string, subtitle?: string }) {
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
    const [notifStatus, setNotifStatus] = useState<'unknown' | 'granted' | 'denied' | 'unsupported'>('unknown')
    const [subscribing, setSubscribing] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const CUTE_EMOJIS = ['🐶', '🐱', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐙', '🦖', '🦄', '🍎', '🍓', '🍒', '🍉', '🍕', '🍩', '🍦', '☕️', '🎈', '🎉', '💖', '✨', '🔥', '👍', '👏', '🙌']

    const chatEndRef = useRef<HTMLDivElement>(null)

    // 서비스워커 등록 및 알림 상태 초기화
    useEffect(() => {
        if (typeof window === 'undefined') return
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            setNotifStatus('unsupported')
            return
        }
        // 현재 알림 권한 확인
        const perm = Notification.permission
        if (perm === 'granted') {
            setNotifStatus('granted')
            // 서비스워커 등록 (아직 안 됐으면)
            navigator.serviceWorker.register('/sw.js').catch(console.error)
        } else if (perm === 'denied') {
            setNotifStatus('denied')
        } else {
            setNotifStatus('unknown')
        }
    }, [])

    // Push 알림 구독 요청
    const subscribeToNotifications = async () => {
        if (subscribing) return
        setSubscribing(true)
        try {
            const perm = await Notification.requestPermission()
            if (perm !== 'granted') {
                setNotifStatus('denied')
                return
            }
            setNotifStatus('granted')

            const reg = await navigator.serviceWorker.register('/sw.js')
            await navigator.serviceWorker.ready

            const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
            if (!vapidKey) { console.warn('[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY 미설정'); return }

            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidKey) as any,
            })

            // 구독 정보 서버에 저장
            await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subscription: sub.toJSON(),
                    courseId: courseId.split('_')[0],
                })
            })
        } catch (err) {
            console.error('[push] 구독 실패:', err)
        } finally {
            setSubscribing(false)
        }
    }

    // VAPID 공개키 → Uint8Array 변환
    function urlBase64ToUint8Array(base64String: string): Uint8Array {
        const padding = '='.repeat((4 - base64String.length % 4) % 4)
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
        const raw = window.atob(base64)
        const arr = new Uint8Array(raw.length)
        for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
        return arr
    }

    useEffect(() => {
        fetchMessages()
        fetchVotes()
        fetchTotalParticipants()
        fetchReadReceipts()
        updateMyReadReceipt()

        const baseCourseId = courseId.includes('_') ? courseId.split('_')[0] : courseId;
        const room = courseId.includes('_') ? courseId.split('_')[1] : 'communal';

        // poll_votes 실시간 구독 디바운스 타이머
        let voteDebounceTimer: ReturnType<typeof setTimeout> | null = null

        // Real-time subscription
        const channel = supabase
            .channel(`chat:${courseId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'chat_messages',
                filter: `course_id=eq.${baseCourseId}`
            }, (payload) => {
                const newMessage = payload.new as Message
                const msgRoom = newMessage.metadata?.room || 'communal'
                if (msgRoom !== room) return;

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
                // 디바운스: delete+insert 사이 경합 조건 방지 (800ms 지연)
                if (voteDebounceTimer) clearTimeout(voteDebounceTimer)
                voteDebounceTimer = setTimeout(() => fetchVotes(), 800)
            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'chat_read_receipts',
                filter: `course_id=eq.${baseCourseId}`
            }, () => {
                fetchReadReceipts()
            })
            .subscribe()

        return () => {
            if (voteDebounceTimer) clearTimeout(voteDebounceTimer)
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
        const baseCourseId = courseId.includes('_') ? courseId.split('_')[0] : courseId;
        const { data } = await supabase.from('chat_read_receipts').select('*').eq('course_id', baseCourseId)
        if (data) {
            const receipts: Record<string, string> = {}
            data.forEach(r => { receipts[r.user_id] = r.last_read_at })
            setReadReceipts(receipts)
        }
    }

    const updateMyReadReceipt = async () => {
        const baseCourseId = courseId.includes('_') ? courseId.split('_')[0] : courseId;
        const now = new Date().toISOString()
        setReadReceipts(prev => ({ ...prev, [userId]: now }))
        await supabase.from('chat_read_receipts').upsert({
            user_id: userId,
            course_id: baseCourseId,
            last_read_at: now
        }, { onConflict: 'user_id,course_id' })
    }

    const fetchMessages = async () => {
        try {
            const res = await fetch(`/api/chat/messages?courseId=${courseId}`)
            if (res.ok) {
                const data = await res.json()
                const formatted = data.map((m: any) => ({ ...m, user: m.users }))
                setMessages(formatted)
            } else {
                console.error("Failed to fetch chat messages:", await res.text())
            }
        } catch (err) {
            console.error(err)
        }
    }

    const fetchVotes = async () => {
        const { data } = await supabase.from('poll_votes').select('*')
        if (data) {
            // 같은 (message_id, user_id) 중복 행이 있을 경우 마지막 것만 유지 (방어적 dedup)
            const dedupedData = Object.values(
                data.reduce((acc: Record<string, any>, vote: any) => {
                    const key = `${vote.message_id}_${vote.user_id}`
                    // 이미 있으면 id가 더 큰 것(최신) 유지
                    if (!acc[key] || (vote.id > acc[key].id)) {
                        acc[key] = vote
                    }
                    return acc
                }, {})
            )
            const grouped = dedupedData.reduce((acc: any, vote: any) => {
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

            const fakeId = `temp-${Date.now()}`;
            const currentUser = messages.find(m => m.user_id === userId)?.user || { name: '나', role: userRole || 'user' };
            const optimisticMsg: Message = {
                id: fakeId,
                user_id: userId,
                content: finalContent,
                type: messageType,
                metadata: {},
                created_at: new Date().toISOString(),
                user: currentUser
            };

            setMessages(prev => [...prev, optimisticMsg]);
            setInput('');
            setShowEmojis(false);
            setMessageType('message');

            const res = await fetch('/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: finalContent,
                    type: messageType,
                    courseId
                })
            })
            if (!res.ok) {
                // Remove optimistic message on failure
                setMessages(prev => prev.filter(m => m.id !== fakeId));
                throw new Error('전송 실패');
            }
        } catch (err) {
            alert('메세지 전송에 실패했습니다.');
        } finally {
            setSending(false);
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
        // Optimistic update: 즉시 UI에 반영
        const prevVotes = votes
        setVotes(prev => {
            const prevMsgVotes = (prev[messageId] || []).filter(v => v.user_id !== userId)
            return {
                ...prev,
                [messageId]: [...prevMsgVotes, { message_id: messageId, user_id: userId, option_index: optionIndex }]
            }
        })
        try {
            const res = await fetch('/api/chat/vote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messageId, optionIndex })
            })
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}))
                console.warn('[투표] 서버 응답 오류:', errData?.error)
                setVotes(prevVotes)
                return
            }
            // 서버 성공 확인 후 300ms 지연 후 최종 동기화 (delete+insert 완료 대기)
            setTimeout(() => fetchVotes(), 500)
        } catch (err) {
            console.error('[투표] 네트워크 오류:', err)
            setVotes(prevVotes)
        }
    }

    const closePoll = async (messageId: string, currentMetadata: any) => {
        if (!confirm('투표를 종료하시겠습니까? 종료 후에는 다시 열 수 없습니다.')) return
        const { error } = await supabase
            .from('chat_messages')
            .update({ metadata: { ...currentMetadata, is_closed: true } })
            .eq('id', messageId)
        if (error) { alert('투표 종료 실패: ' + error.message); return }
        fetchMessages()
    }

    const formatTime = (dateStr: string) => {
        return new Date(dateStr).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    }

    const getRoleBadge = (role?: string) => {
        if (!role) return null
        if (role === 'admin') {
            return (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 ml-1">
                    👑 교수
                </span>
            )
        }
        if (role === 'sound_engineer_rep') {
            return (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 ml-1">
                    🎵 음향반장
                </span>
            )
        }
        if (role === 'musician_rep') {
            return (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/50 dark:text-fuchsia-300 ml-1">
                    🎸 뮤지션반장
                </span>
            )
        }
        return null
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
                        <h3 className="font-bold text-slate-900 dark:text-white leading-none">{title}</h3>
                        <p className="text-[10px] text-slate-500 mt-1 font-medium">{subtitle}</p>
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

            {/* 🔔 Web Push 알림 배너 (학생만 표시, 알림 미허용 시) */}
            {!isAdmin && notifStatus === 'unknown' && (
                <div className="flex items-center justify-between px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-100 dark:border-indigo-800/40">
                    <div className="flex items-center gap-2 text-xs text-indigo-700 dark:text-indigo-300 font-medium">
                        <Bell className="w-3.5 h-3.5" />
                        새 메시지 알림을 받으시겠어요?
                    </div>
                    <button
                        onClick={subscribeToNotifications}
                        disabled={subscribing}
                        className="text-xs font-bold px-3 py-1 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition disabled:opacity-50"
                    >
                        {subscribing ? '설정 중...' : '알림 허용'}
                    </button>
                </div>
            )}
            {!isAdmin && notifStatus === 'granted' && (
                <div className="px-4 py-1 bg-emerald-50 dark:bg-emerald-900/10 border-b border-emerald-100 dark:border-emerald-800/30 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                    <Bell className="w-3 h-3" /> 알림 설정 완료 — 새 메시지가 오면 알림을 보내드려요
                </div>
            )}

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
                        const isClosed = !!m.metadata?.is_closed

                        return (
                            <div key={m.id} className={`border p-5 rounded-3xl space-y-4 relative ${isClosed ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700' : 'bg-indigo-50 dark:bg-indigo-900/10 border-indigo-200 dark:border-indigo-800/50'}`}>
                                <div className={`flex items-center justify-between`}>
                                    <div className={`flex items-center gap-2 font-black text-xs ${isClosed ? 'text-slate-500 dark:text-slate-400' : 'text-indigo-700 dark:text-indigo-400'}`}>
                                        <BarChart3 className="w-4 h-4" />
                                        {isClosed ? '🔒 종료된 투표' : '📊 진행 중인 투표'}
                                    </div>
                                    {isAdmin && !isClosed && (
                                        <button
                                            onClick={() => closePoll(m.id, m.metadata)}
                                            className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 transition"
                                        >
                                            투표 종료
                                        </button>
                                    )}
                                </div>
                                <h4 className="text-base font-extrabold text-slate-900 dark:text-white leading-tight">{m.content}</h4>
                                <div className="space-y-2">
                                    {options.map((opt: string, i: number) => {
                                        const optVotes = messageVotes.filter(v => v.option_index === i).length
                                        const pct = totalVotes > 0 ? (optVotes / totalVotes) * 100 : 0
                                        const isSelected = myVote?.option_index === i
                                        const isWinner = isClosed && optVotes === Math.max(...options.map((_: string, j: number) => messageVotes.filter(v => v.option_index === j).length))

                                        return isClosed ? (
                                            // 종료된 투표: 읽기 전용 결과 바
                                            <div key={i} className={`w-full relative h-12 rounded-xl overflow-hidden border ${isWinner && totalVotes > 0 ? 'border-emerald-400 dark:border-emerald-600' : 'border-slate-200 dark:border-slate-700'}`}>
                                                <div
                                                    className={`absolute inset-y-0 left-0 transition-all duration-1000 ${isWinner && totalVotes > 0 ? 'bg-emerald-100 dark:bg-emerald-500/20' : 'bg-slate-100 dark:bg-slate-700/50'}`}
                                                    style={{ width: `${pct}%` }}
                                                />
                                                <div className="absolute inset-0 px-4 flex items-center justify-between pointer-events-none">
                                                    <span className={`text-sm font-bold ${isWinner && totalVotes > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-600 dark:text-slate-400'}`}>
                                                        {isWinner && totalVotes > 0 ? '🏆 ' : ''}{opt}
                                                    </span>
                                                    <span className="text-xs font-black text-slate-500">{optVotes}표 ({Math.round(pct)}%)</span>
                                                </div>
                                            </div>
                                        ) : (
                                            // 진행 중인 투표: 클릭 가능한 버튼
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
                                    <span>총 {totalVotes}명 참여{isClosed ? ' (최종)' : ''}</span>
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
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm flex-shrink-0 ${
                                    m.user?.role === 'admin' ? 'bg-indigo-500 text-white' :
                                    m.user?.role === 'sound_engineer_rep' ? 'bg-amber-400 text-white' :
                                    m.user?.role === 'musician_rep' ? 'bg-fuchsia-400 text-white' :
                                    'bg-indigo-100 text-indigo-600'
                                }`}>
                                    {m.user?.name?.[0]?.toUpperCase() || <User className="w-4 h-4" />}
                                </div>
                            )}
                            <div className={`max-w-[75%] space-y-1 ${isMine ? 'items-end' : 'items-start'} flex flex-col`}>
                                {!isMine && showAvatar && (
                                    <span className="text-[10px] font-bold text-slate-500 ml-1 flex items-center flex-wrap gap-0.5">
                                        {m.user?.name || '익명'}{getRoleBadge(m.user?.role)}
                                    </span>
                                )}
                                {isMine && showAvatar && (
                                    <span className="text-[10px] font-bold text-slate-500 mr-1 flex items-center justify-end flex-wrap gap-0.5">
                                        나{getRoleBadge(m.user?.role)}
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
