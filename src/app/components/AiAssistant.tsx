'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Loader2, Sparkles, ChevronDown, Bot, User, Mic, MicOff, Volume2, VolumeX, Phone, PhoneOff } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const QUICK_PROMPTS_ADMIN = [
  '승인 대기 중인 학생 있어?',
  '과제 미제출 학생 현황',
  '오늘 할 일 정리해줘',
  '강의 공지 초안 써줘',
]

const QUICK_PROMPTS_STUDENT = [
  '최근 강의 노트 보여줘',
  '오늘 공부 계획 세워줘',
  '이 개념 설명해줘',
  '영어로 번역해줘',
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
  const initMsg = isAdmin
    ? '안녕하세요! 만능 AI 비서입니다 🤖\n학생 관리, 번역, 계산, 글쓰기 등 무엇이든 말씀하세요!\n🎙️ 음성입력 · 📞 라이브 대화도 지원합니다.'
    : '안녕하세요! AI 학습 비서입니다 🤖\n공부, 번역, 강의 노트 등 무엇이든 질문하세요!\n🎙️ 음성입력 · 📞 라이브 대화도 지원합니다.'

  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', content: initMsg }])
  const messagesRef = useRef<Message[]>([{ role: 'assistant', content: initMsg }])
  // messagesRef를 항상 최신으로 유지
  useEffect(() => { messagesRef.current = messages }, [messages])

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  // ── 음성 입력 (STT) ──
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<any>(null)

  // ── 음성 출력 (TTS) ──
  const [ttsEnabled, setTtsEnabled] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const liveAudioRef = useRef<HTMLAudioElement | null>(null)

  // ── 라이브 대화 모드 ──
  const [liveMode, setLiveMode] = useState(false)
  const liveModeRef = useRef(false)
  const [liveStatus, setLiveStatus] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle')
  // 루프 재귀 호출을 위한 ref — stale closure 방지
  const startLiveLoopRef = useRef<() => void>(() => {})

  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => { liveModeRef.current = liveMode }, [liveMode])

  // 라이브 모드 종료 시 정리
  useEffect(() => {
    if (!liveMode) {
      setLiveStatus('idle')
      recognitionRef.current?.stop()
      liveAudioRef.current?.pause()
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
      setSpeaking(false)
    }
  }, [liveMode])

  // ── TTS: OpenAI 서버 음성 (자연스러운 한국어) ──
  const speakWithServer = useCallback(async (text: string, onDone?: () => void) => {
    if (!text.trim()) { onDone?.(); return }
    // 기존 오디오 중지
    if (liveAudioRef.current) {
      liveAudioRef.current.pause()
      liveAudioRef.current = null
    }
    setSpeaking(true)
    try {
      const clean = text.replace(/[#*`>_~\[\]]/g, '').replace(/\n+/g, ' ').trim().slice(0, 1000)
      const res = await fetch('/api/openai-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: clean, maxChars: 1000 }),
      })
      if (!res.ok) throw new Error('TTS 실패')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      liveAudioRef.current = audio
      audio.onended = () => { setSpeaking(false); URL.revokeObjectURL(url); onDone?.() }
      audio.onerror = () => { setSpeaking(false); URL.revokeObjectURL(url); onDone?.() }
      await audio.play()
    } catch {
      // 폴백: Mac 기본 TTS
      setSpeaking(false)
      if ('speechSynthesis' in window) {
        const utt = new SpeechSynthesisUtterance(text.slice(0, 500))
        utt.lang = 'ko-KR'
        utt.onend = () => { setSpeaking(false); onDone?.() }
        utt.onerror = () => { setSpeaking(false); onDone?.() }
        window.speechSynthesis.speak(utt)
      } else {
        onDone?.()
      }
    }
  }, [])

  // ── 브라우저 TTS (기본 음성 출력 토글용) ──
  const speakBrowser = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const clean = text.replace(/[#*`>_~\[\]]/g, '').replace(/\n+/g, ' ').trim()
    if (!clean) return
    const utt = new SpeechSynthesisUtterance(clean)
    utt.lang = 'ko-KR'; utt.rate = 1.05
    utt.onstart = () => setSpeaking(true)
    utt.onend = () => setSpeaking(false)
    utt.onerror = () => setSpeaking(false)
    window.speechSynthesis.speak(utt)
  }, [])

  useEffect(() => {
    if (!ttsEnabled && !liveMode && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel(); setSpeaking(false)
    }
  }, [ttsEnabled, liveMode])

  // ── 페이지 특정 버튼 클릭 실행 ──
  // AI 응답에서 [ACTION:버튼텍스트] 파싱 → DOM에서 해당 버튼 검색하여 클릭
  const executePageAction = useCallback((reply: string): string => {
    const match = reply.match(/\[ACTION:([^\]]+)\]/)
    if (!match) return reply
    const targetText = match[1].trim()
    const cleanReply = reply.replace(/\[ACTION:[^\]]+\]/, '').trim()
    // 버튼 검색: 텍스트 포함 확인
    const allBtns = Array.from(document.querySelectorAll('button, [role="button"], a[role="button"]')) as HTMLElement[]
    const target = allBtns.find(el => {
      const t = el.textContent?.trim() || ''
      return t.includes(targetText) || targetText.includes(t.replace(/\s+/g, '').slice(0, 8))
    })
    if (target) {
      setTimeout(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setTimeout(() => {
          target.click()
          // 시각적 하이라이트
          target.style.outline = '3px solid #7c3aed'
          target.style.outlineOffset = '3px'
          setTimeout(() => { target.style.outline = ''; target.style.outlineOffset = '' }, 1500)
        }, 400)
      }, 200)
    } else {
      console.warn('[ACTION] 버튼을 찾을 수 없음:', targetText)
    }
    return cleanReply
  }, [])

  // ── AI 응답 요청 (메시지 배열 직접 받기) ──
  const fetchAiReply = useCallback(async (msgs: Message[]): Promise<string> => {
    const res = await fetch('/api/ai-assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: msgs, courseId: courseId || '' }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '응답 오류')
    return data.reply
  }, [courseId])

  // ── 일반 메시지 전송 ──
  const handleSend = useCallback(async (text?: string) => {
    const userMsg = (text || input).trim()
    if (!userMsg || loading) return
    setInput('')
    const newMessages: Message[] = [...messagesRef.current, { role: 'user', content: userMsg }]
    setMessages(newMessages)
    setLoading(true)
    try {
      const reply = await fetchAiReply(newMessages)
      const cleanReply = executePageAction(reply)
      setMessages(prev => [...prev, { role: 'assistant', content: cleanReply }])
      if (ttsEnabled) speakBrowser(cleanReply)
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${e.message || '오류'}` }])
    } finally {
      setLoading(false)
    }
  }, [input, loading, fetchAiReply, ttsEnabled, speakBrowser])

  // ── STT 시작 ──
  const startSTT = useCallback((onResult: (transcript: string) => void) => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { alert('Chrome 또는 Edge에서 사용 가능합니다.'); return }
    try {
      const rec = new SR()
      rec.lang = 'ko-KR'
      rec.continuous = false
      rec.interimResults = true
      rec.onstart = () => setListening(true)
      rec.onresult = (e: any) => {
        const transcript = Array.from(e.results).map((r: any) => r[0].transcript).join('')
        setInput(transcript)
        if (e.results[e.results.length - 1].isFinal) onResult(transcript)
      }
      rec.onerror = (e: any) => {
        setListening(false)
        if (liveModeRef.current) {
          // 라이브 모드 중 에러: 잠깐 후 재시도
          setTimeout(() => { if (liveModeRef.current) startLiveLoopRef.current() }, 1000)
        }
        if (e.error === 'not-allowed') alert('마이크 권한이 필요합니다.')
      }
      rec.onend = () => setListening(false)
      rec.start()
      recognitionRef.current = rec
    } catch (e: any) { console.error('STT 시작 실패:', e) }
  }, [])

  // ── 일반 STT 버튼 핸들러 ──
  const handleMicClick = () => {
    if (listening) { recognitionRef.current?.stop(); setListening(false); return }
    startSTT(() => {})
  }

  // ── 라이브 대화 루프 (ref로 stale closure 방지) ──
  const startLiveLoop = useCallback(() => {
    if (!liveModeRef.current) return
    setLiveStatus('listening')
    setInput('')
    startSTT(async (transcript) => {
      if (!liveModeRef.current) return
      if (!transcript.trim()) {
        // 빈 말 → 바로 다시 듣기
        setTimeout(() => { if (liveModeRef.current) startLiveLoopRef.current() }, 300)
        return
      }
      setInput('')
      setLiveStatus('thinking')

      // messagesRef로 항상 최신 메시지 참조 (stale closure 완전 방지)
      const currentMsgs = messagesRef.current
      const newMsgs: Message[] = [...currentMsgs, { role: 'user', content: transcript }]
      setMessages(newMsgs)

      try {
        const reply = await fetchAiReply(newMsgs)
        const cleanReply = executePageAction(reply)
        setMessages(prev => [...prev, { role: 'assistant', content: cleanReply }])

        if (!liveModeRef.current) { setLiveStatus('idle'); return }
        setLiveStatus('speaking')

        // OpenAI TTS로 답변 → 완료 후 다시 듣기 (루프)
        speakWithServer(cleanReply, () => {
          if (liveModeRef.current) {
            setTimeout(() => { if (liveModeRef.current) startLiveLoopRef.current() }, 500)
          } else {
            setLiveStatus('idle')
          }
        })
      } catch (e: any) {
        console.error('[live] AI 오류:', e)
        if (liveModeRef.current) setTimeout(() => startLiveLoopRef.current(), 1000)
      }
    })
  }, [fetchAiReply, speakWithServer, startSTT])  // messages 제거! messagesRef 사용

  // startLiveLoopRef를 항상 최신으로 유지
  useEffect(() => { startLiveLoopRef.current = startLiveLoop }, [startLiveLoop])

  const toggleLiveMode = () => {
    if (liveMode) {
      setLiveMode(false)
      liveModeRef.current = false
    } else {
      setLiveMode(true)
      liveModeRef.current = true
      setTtsEnabled(true)
      setTimeout(() => startLiveLoopRef.current(), 300)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const quickPrompts = isAdmin ? QUICK_PROMPTS_ADMIN : QUICK_PROMPTS_STUDENT
  const liveStatusLabel = { idle: '', listening: '🎙️ 듣는 중...', thinking: '🧠 생각 중...', speaking: '🔊 말하는 중...' }[liveStatus]

  return (
    <>
      {/* Floating 버튼 */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`fixed bottom-6 right-[5.5rem] z-50 flex items-center gap-2 rounded-2xl text-white px-4 py-2.5 text-sm font-bold shadow-lg transition-all hover:scale-105 active:scale-95 ${
          liveMode
            ? 'bg-gradient-to-br from-red-500 to-pink-600 shadow-red-900/30 animate-pulse'
            : 'bg-gradient-to-br from-violet-600 to-indigo-600 shadow-violet-900/30 hover:from-violet-500 hover:to-indigo-500'
        }`}
      >
        {liveMode ? <Phone className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
        <span className="hidden sm:inline">{liveMode ? '라이브 중' : 'AI 비서'}</span>
      </button>

      {/* 채팅 패널 */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-[400px] max-w-[calc(100vw-2rem)] flex flex-col rounded-3xl shadow-2xl shadow-violet-900/20 border border-violet-200 dark:border-violet-800/40 bg-white dark:bg-neutral-900 overflow-hidden" style={{ height: '600px' }}>
          {/* 헤더 */}
          <div className={`flex items-center justify-between px-5 py-3.5 shrink-0 ${liveMode ? 'bg-gradient-to-r from-red-500 to-pink-600' : 'bg-gradient-to-r from-violet-600 to-indigo-600'}`}>
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-white/20 rounded-xl">
                {liveMode ? <Phone className="w-4 h-4 text-white" /> : <Sparkles className="w-4 h-4 text-white" />}
              </div>
              <div>
                <p className="text-sm font-extrabold text-white">AI 비서</p>
                <p className="text-[10px] text-violet-200 font-medium">
                  {liveMode ? `🔴 라이브 대화 중 · ${liveStatusLabel}` : 'Gemini 3.1 · 음성 지원'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {!liveMode && (
                <button onClick={() => setTtsEnabled(v => !v)}
                  className={`p-1.5 rounded-xl transition flex items-center ${ttsEnabled ? 'bg-white/30 text-white' : 'hover:bg-white/20 text-white/60 hover:text-white'}`}>
                  {ttsEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                </button>
              )}
              <button onClick={() => setMessages([{ role: 'assistant', content: initMsg }])}
                className="p-1.5 rounded-xl hover:bg-white/20 transition text-white/70 hover:text-white text-[10px] font-bold px-2">초기화</button>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-xl hover:bg-white/20 transition text-white/70 hover:text-white">
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 라이브 모드 상태 */}
          {liveMode && (
            <div className="px-4 py-3 bg-red-50 dark:bg-red-950/30 border-b border-red-100 dark:border-red-900/30 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${liveStatus === 'listening' ? 'bg-red-500 animate-pulse' : liveStatus === 'thinking' ? 'bg-yellow-500 animate-bounce' : liveStatus === 'speaking' ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                  <span className="text-sm font-semibold text-red-700 dark:text-red-300">{liveStatusLabel || '라이브 대화 준비 중...'}</span>
                </div>
                <button onClick={toggleLiveMode}
                  className="flex items-center gap-1.5 text-xs font-bold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 px-3 py-1.5 rounded-xl transition">
                  <PhoneOff className="w-3.5 h-3.5" /> 종료
                </button>
              </div>
            </div>
          )}

          {/* 메시지 영역 */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scroll-smooth">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ${msg.role === 'user' ? 'bg-indigo-500' : 'bg-gradient-to-br from-violet-500 to-indigo-600'}`}>
                  {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                </div>
                <div
                  className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 rounded-tl-sm'}`}
                  onClick={() => msg.role === 'assistant' && ttsEnabled && speakBrowser(msg.content)}
                  style={{ cursor: msg.role === 'assistant' && ttsEnabled ? 'pointer' : 'default' }}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-2.5">
                <div className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center"><Bot className="w-3.5 h-3.5 text-white" /></div>
                <div className="bg-neutral-100 dark:bg-neutral-800 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* 빠른 질문 */}
          {messages.length <= 1 && !liveMode && (
            <div className="px-4 pb-2 flex flex-wrap gap-1.5 shrink-0">
              {quickPrompts.map((q, i) => (
                <button key={i} onClick={() => handleSend(q)} disabled={loading}
                  className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-700/50 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition disabled:opacity-50">
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* 입력 영역 */}
          {!liveMode && (
            <div className="px-4 pb-4 pt-2 shrink-0 border-t border-neutral-100 dark:border-neutral-800">
              <div className="flex gap-2 items-end bg-neutral-50 dark:bg-neutral-800 rounded-2xl border border-neutral-200 dark:border-neutral-700 px-3 py-2 focus-within:border-violet-400 focus-within:ring-1 focus-within:ring-violet-400 transition">
                <button onClick={handleMicClick} disabled={loading}
                  className={`shrink-0 p-1.5 rounded-xl transition ${listening ? 'bg-red-500 text-white animate-pulse' : 'text-neutral-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20'} disabled:opacity-40`}>
                  {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={loading}
                  placeholder={listening ? '🎙️ 듣는 중...' : '메시지 입력... (Enter 전송)'}
                  rows={1}
                  className="flex-1 bg-transparent text-sm resize-none focus:outline-none text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 max-h-24 overflow-y-auto caret-violet-500"
                />
                <button onClick={() => handleSend()} disabled={!input.trim() || loading}
                  className="shrink-0 p-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
              <button onClick={toggleLiveMode}
                className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-400 hover:to-pink-500 text-white text-xs font-bold transition hover:scale-[1.01] shadow-sm">
                <Phone className="w-3.5 h-3.5" /> 📞 라이브 대화 시작 (말하면 바로 AI가 답변)
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
