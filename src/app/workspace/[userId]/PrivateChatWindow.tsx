'use client'

import { useState, useEffect, useRef } from 'react'
import { Send, Loader2, User, UserCheck } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

interface Message {
    id: string
    content: string
    created_at: string
    user_id: string
    target_user_id: string | null
    users: { name: string; email: string; role: string }
}

interface PrivateChatWindowProps {
    courseId: string
    workspaceUserId: string
    currentUserId: string
}

export default function PrivateChatWindow({ courseId, workspaceUserId, currentUserId }: PrivateChatWindowProps) {
    const supabase = createClient()
    const [messages, setMessages] = useState<Message[]>([])
    const [newMessage, setNewMessage] = useState('')
    const [loading, setLoading] = useState(true)
    const [sending, setSending] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const fetchMessages = async () => {
        try {
            const res = await fetch(`/api/chat/messages?courseId=${courseId}&targetUserId=${workspaceUserId}`)
            if (res.ok) {
                const data = await res.json()
                setMessages(data)
            }
        } catch (error) {
            console.error('Failed to fetch messages:', error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchMessages()

        // Realtime subscription
        const channel = supabase
            .channel(`private-chat-${courseId}-${workspaceUserId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'chat_messages',
                    filter: `course_id=eq.${courseId}`
                },
                (payload) => {
                    // Check if it belongs to this room
                    const msg = payload.new as any
                    if (msg.user_id === workspaceUserId || msg.target_user_id === workspaceUserId) {
                        fetchMessages() // Re-fetch to get user details
                    }
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [courseId, workspaceUserId])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newMessage.trim() || sending) return

        setSending(true)
        try {
            await fetch('/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    courseId,
                    content: newMessage,
                    targetUserId: workspaceUserId // route specifically to this user's room
                })
            })
            setNewMessage('')
        } catch (error) {
            console.error('Error sending message:', error)
        } finally {
            setSending(false)
        }
    }

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200">
                <Loader2 className="w-8 h-8 text-neutral-400 animate-spin" />
            </div>
        )
    }

    return (
        <div className="flex flex-col h-[600px] bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-200 shadow-sm overflow-hidden flex-1 mt-8 lg:mt-0">
            {/* Header */}
            <div className="px-6 py-4 border-b border-neutral-200 bg-neutral-50 dark:bg-neutral-800/50 flex items-center gap-3 shrink-0">
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <UserCheck className="w-5 h-5" />
                </div>
                <div>
                    <h3 className="font-bold text-neutral-900 dark:text-white">교수님과의 1:1 대화</h3>
                    <p className="text-xs text-neutral-500">실시간으로 피드백을 주고받으세요</p>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-neutral-400 space-y-4">
                        <User className="w-12 h-12 opacity-20" />
                        <p className="text-sm font-medium">대화 내역이 없습니다. 첫 메시지를 보내보세요!</p>
                    </div>
                ) : (
                    messages.map((msg, index) => {
                        const isMe = msg.user_id === currentUserId
                        const showAvatar = index === messages.length - 1 || messages[index + 1]?.user_id !== msg.user_id

                        return (
                            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} gap-3 max-w-full group`}>
                                {!isMe && showAvatar && (
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800 flex items-center justify-center shrink-0 mt-auto">
                                        <span className="text-[10px] font-bold text-neutral-600 dark:text-neutral-300">
                                            {msg.users?.name?.charAt(0) || 'U'}
                                        </span>
                                    </div>
                                )}
                                {!isMe && !showAvatar && <div className="w-8 shrink-0" />}

                                <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[75%]`}>
                                    {showAvatar && (
                                        <span className="text-[10px] text-neutral-400 mb-1 px-1">
                                            {msg.users?.name || 'User'}
                                            {msg.users?.role === 'admin' ? ' (관리자)' : ''}
                                        </span>
                                    )}
                                    <div
                                        className={`px-4 py-2.5 rounded-2xl text-[15px] leading-relaxed break-words whitespace-pre-wrap ${isMe
                                                ? 'bg-blue-600 text-white rounded-tr-sm'
                                                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 rounded-tl-sm'
                                            }`}
                                    >
                                        {msg.content}
                                    </div>
                                    <span className="text-[10px] text-neutral-400 mt-1 opacity-0 group-hover:opacity-100 transition-opacity px-1">
                                        {new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            </div>
                        )
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 bg-neutral-50 dark:bg-neutral-800/50 border-t border-neutral-200">
                <form onSubmit={handleSend} className="relative flex items-end gap-2">
                    <textarea
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="메시지를 입력하세요..."
                        className="w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-2xl pl-4 pr-12 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none max-h-32 min-h-[44px]"
                        rows={newMessage.split('\n').length > 1 ? Math.min(newMessage.split('\n').length, 4) : 1}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                handleSend(e)
                            }
                        }}
                    />
                    <button
                        type="submit"
                        disabled={!newMessage.trim() || sending}
                        className="absolute right-2 bottom-2 p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition disabled:opacity-50 disabled:hover:bg-blue-600"
                    >
                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                </form>
            </div>
        </div>
    )
}
