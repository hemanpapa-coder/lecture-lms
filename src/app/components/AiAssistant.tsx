'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Send, Loader2, Sparkles, ChevronDown, Bot, User } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const QUICK_PROMPTS_ADMIN = [
  '승인 대기 중인 학생 있어?',
  '과제 미제출 학생 현황',
  '열린 버그 리포트 있어?',
  '등록된 과목 목록',
]

const QUICK_PROMPTS_STUDENT = [
  '최근 강의 노트 보여줘',
  '최근 Q&A 질문 있어?',
]

export default function AiAssistant({
  userId,
  isAdmin,
  courseId,
}: {
  userId: string
  isAdmin: boolean
  courseId?: string
}) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: isAdmin
        ? '안녕하세요! LMS AI 비서입니다 🤖\n학생 조회, 과제 현황, 버그 리포트 등 뭐든 물어보세요!'
        : '안녕하세요! 무엇이든 질문해보세요 🤖',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // 새 메시지 도착 시 스크롤 하단 이동
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // 열릴 때 input 포커스
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  const handleSend = async (text?: string) => {
    const userMsg = (text || input).trim()
    if (!userMsg || loading) return
    setInput('')
    setError('')

    const newMessages: Message[] = [...messages, { role: 'user', content: userMsg }]
    setMessages(newMessages)
    setLoading(true)

    try {
      const res = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          courseId: courseId || '',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '응답 오류')
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    } catch (e: any) {
      setError(e.message || '오류가 발생했습니다.')
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${e.message || '오류가 발생했습니다.'}` }])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const quickPrompts = isAdmin ? QUICK_PROMPTS_ADMIN : QUICK_PROMPTS_STUDENT

  return (
    <>
      {/* Floating 버튼 */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-[5.5rem] z-50 flex items-center gap-2 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white px-4 py-2.5 text-sm font-bold shadow-lg shadow-violet-900/30 transition-all hover:scale-105 active:scale-95"
        title="AI 비서"
      >
        <Sparkles className="w-4 h-4" />
        <span className="hidden sm:inline">AI 비서</span>
      </button>

      {/* 채팅 패널 */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-[360px] max-w-[calc(100vw-2rem)] flex flex-col rounded-3xl shadow-2xl shadow-violet-900/20 border border-violet-200 dark:border-violet-800/40 bg-white dark:bg-neutral-900 overflow-hidden"
          style={{ height: '520px' }}
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-violet-600 to-indigo-600 shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-white/20 rounded-xl">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-extrabold text-white">AI 비서</p>
                <p className="text-[10px] text-violet-200 font-medium">Gemini Function Calling</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMessages([{ role: 'assistant', content: isAdmin ? '안녕하세요! LMS AI 비서입니다 🤖\n학생 조회, 과제 현황, 버그 리포트 등 뭐든 물어보세요!' : '안녕하세요! 무엇이든 질문해보세요 🤖' }])}
                className="p-1.5 rounded-xl hover:bg-white/20 transition text-white/70 hover:text-white text-[10px] font-bold px-2"
                title="대화 초기화"
              >
                초기화
              </button>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-xl hover:bg-white/20 transition text-white/70 hover:text-white">
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 메시지 영역 */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scroll-smooth">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ${msg.role === 'user' ? 'bg-indigo-500' : 'bg-gradient-to-br from-violet-500 to-indigo-600'}`}>
                  {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                </div>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-tr-sm'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 rounded-tl-sm'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}

            {/* 로딩 애니메이션 */}
            {loading && (
              <div className="flex gap-2.5">
                <div className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="bg-neutral-100 dark:bg-neutral-800 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* 빠른 질문 버튼 (첫 메시지만 있을 때) */}
          {messages.length <= 1 && (
            <div className="px-4 pb-2 flex flex-wrap gap-1.5 shrink-0">
              {quickPrompts.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(q)}
                  disabled={loading}
                  className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-700/50 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* 입력 영역 */}
          <div className="px-4 pb-4 pt-2 shrink-0 border-t border-neutral-100 dark:border-neutral-800">
            <div className="flex gap-2 items-end bg-neutral-50 dark:bg-neutral-800 rounded-2xl border border-neutral-200 dark:border-neutral-700 px-3 py-2 focus-within:border-violet-400 focus-within:ring-1 focus-within:ring-violet-400 transition">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                placeholder="메시지를 입력하세요... (Enter로 전송)"
                rows={1}
                className="flex-1 bg-transparent text-sm resize-none focus:outline-none text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 max-h-24 overflow-y-auto"
                style={{ minHeight: '20px' }}
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || loading}
                className="shrink-0 p-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
