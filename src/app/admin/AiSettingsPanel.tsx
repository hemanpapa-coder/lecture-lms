'use client'

import { useState, useEffect } from 'react'
import { Settings, Mic, BookOpen, FileCheck, SpellCheck2, RotateCcw, Sparkles, Zap, Check, Image, MessageSquare, Eye, Volume2, Key } from 'lucide-react'

// ── 타입 정의 ──────────────────────────────────────────────
type AiSetting = { provider: string; model: string; label: string }
type SettingsMap = Record<string, AiSetting>

// ── 모델 목록 ───────────────────────────────────────────────
const GROQ_MODELS = [
  { id: 'llama-3.1-8b-instant', name: 'LLaMA 8B Instant', badge: '빠름', badgeColor: 'bg-green-500', desc: '빠르고 경제적. 간단한 작업에 적합' },
  { id: 'llama-3.3-70b-versatile', name: 'LLaMA 70B Versatile', badge: '고품질', badgeColor: 'bg-violet-500', desc: '높은 품질. 복잡한 작업에 적합' },
]

const GEMINI_MODELS = [
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', badge: '추천', badgeColor: 'bg-blue-500', desc: '빠르고 저렴. 일반 작업에 최적' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', badge: '안정', badgeColor: 'bg-sky-500', desc: '검증된 모델. 빠른 처리' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', badge: '고품질', badgeColor: 'bg-indigo-500', desc: '고품질 출력. 복잡한 내용에 적합' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro ✨', badge: '최고', badgeColor: 'bg-amber-500', desc: '최고 품질. 중요한 피드백·정리에 권장' },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro 🆕', badge: 'NEW', badgeColor: 'bg-rose-500', desc: '최신 SOTA 추론 모델. 멀티모달 이해 탁월' },
]

const OPENAI_MODELS = [
  { id: 'gpt-4o-mini', name: 'GPT-4o mini', badge: '저렴', badgeColor: 'bg-emerald-500', desc: '가장 저렴. 일반 작업에 충분' },
  { id: 'gpt-4o', name: 'GPT-4o', badge: '고품질', badgeColor: 'bg-green-600', desc: '높은 품질. 복잡한 평가에 적합' },
]

// ── 통합 AI 카테고리 (lib/ai.ts 연동) ──────────────────────
const AI_CATEGORIES = [
  {
    key: 'text',
    icon: MessageSquare,
    iconColor: 'text-violet-500',
    bgColor: 'bg-violet-50 dark:bg-violet-900/10',
    borderColor: 'border-violet-200 dark:border-violet-800/30',
    title: '💬 AI 채팅 / 평가 / 리포트',
    desc: 'AI 어시스턴트, 학생 평가 생성, 주간 리포트 등 모든 텍스트 생성',
    providers: ['groq', 'gemini', 'openai'],
    groqModels: GROQ_MODELS,
    geminiModels: GEMINI_MODELS,
    openaiModels: OPENAI_MODELS,
  },
  {
    key: 'vision',
    icon: Eye,
    iconColor: 'text-sky-500',
    bgColor: 'bg-sky-50 dark:bg-sky-900/10',
    borderColor: 'border-sky-200 dark:border-sky-800/30',
    title: '👁️ 이미지 인식 (출석부 OCR)',
    desc: '출석부 사진을 AI가 읽어 학생 명단을 자동 추출',
    providers: ['gemini', 'openai'],
    groqModels: [],
    geminiModels: [
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', badge: '추천', badgeColor: 'bg-blue-500', desc: '빠른 이미지 인식' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', badge: '정확', badgeColor: 'bg-indigo-500', desc: '높은 정확도' },
    ],
    openaiModels: [
      { id: 'gpt-4o-mini', name: 'GPT-4o mini', badge: '저렴', badgeColor: 'bg-emerald-500', desc: '저렴한 이미지 인식' },
      { id: 'gpt-4o', name: 'GPT-4o', badge: '정확', badgeColor: 'bg-green-600', desc: '높은 정확도' },
    ],
  },
  {
    key: 'transcribe',
    icon: Mic,
    iconColor: 'text-emerald-500',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/10',
    borderColor: 'border-emerald-200 dark:border-emerald-800/30',
    title: '🎤 음성 → 텍스트 전사',
    desc: '강의 녹음 파일을 텍스트로 변환',
    providers: ['groq', 'gemini', 'openai'],
    groqModels: [{ id: 'whisper-large-v3', name: 'Groq Whisper v3', badge: '무료', badgeColor: 'bg-emerald-500', desc: '빠른 음성인식 · 무료' }],
    geminiModels: [{ id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', badge: '대안', badgeColor: 'bg-blue-500', desc: '한국어 인식 우수' }],
    openaiModels: [{ id: 'whisper-1', name: 'OpenAI Whisper', badge: '저렴', badgeColor: 'bg-green-500', desc: '$0.006/분 · 고품질' }],
  },
  {
    key: 'image_gen',
    icon: Image,
    iconColor: 'text-rose-500',
    bgColor: 'bg-rose-50 dark:bg-rose-900/10',
    borderColor: 'border-rose-200 dark:border-rose-800/30',
    title: '🖼️ 이미지 생성',
    desc: '강의 자료용 이미지 자동 생성. 비활성화하면 비용 절감',
    providers: ['gemini', 'disabled'],
    groqModels: [],
    geminiModels: [{ id: 'gemini-2.0-flash-preview-image-generation', name: 'Gemini Image Gen', badge: '유료', badgeColor: 'bg-amber-500', desc: '이미지 생성 · 비용 발생' }],
    openaiModels: [],
  },
]

// ── 기능 목록 (기존 호환) ────────────────────────────────────
const TASKS = [
  {
    key: 'transcription',
    icon: Mic,
    iconColor: 'text-emerald-500',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/10',
    borderColor: 'border-emerald-200 dark:border-emerald-800/30',
    title: '🎤 음성 → 텍스트 전사',
    desc: '강의 녹음 파일을 텍스트로 변환합니다 (Groq 이슈 시 Gemini로 전환 가능)',
    providers: ['groq', 'gemini'],
    groqModels: [{ id: 'whisper-large-v3', name: 'Groq Whisper Large v3', badge: '무료', badgeColor: 'bg-emerald-500', desc: '빠른 음성 인식 · 무료 (기본 권장)' }],
    geminiModels: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', badge: '대안', badgeColor: 'bg-blue-500', desc: 'Groq 서버 이슈 시 전환 · 한국어 인식 우수' },
    ],
    locked: false,
  },
  {
    key: 'summarization',
    icon: BookOpen,
    iconColor: 'text-violet-500',
    bgColor: 'bg-violet-50 dark:bg-violet-900/10',
    borderColor: 'border-violet-200 dark:border-violet-800/30',
    title: '강의 내용 정리',
    desc: '전사된 강의 내용을 모드에 따라 정리합니다',
    providers: ['groq', 'gemini'],
    groqModels: GROQ_MODELS,
    geminiModels: GEMINI_MODELS,
    locked: false,
  },
  {
    key: 'assignment_feedback',
    icon: FileCheck,
    iconColor: 'text-blue-500',
    bgColor: 'bg-blue-50 dark:bg-blue-900/10',
    borderColor: 'border-blue-200 dark:border-blue-800/30',
    title: '과제 피드백 / 평가',
    desc: '제출된 과제에 대한 AI 피드백 및 점수를 생성합니다',
    providers: ['groq', 'gemini'],
    groqModels: GROQ_MODELS,
    geminiModels: GEMINI_MODELS,
    locked: false,
  },
  {
    key: 'spell_check',
    icon: SpellCheck2,
    iconColor: 'text-orange-500',
    bgColor: 'bg-orange-50 dark:bg-orange-900/10',
    borderColor: 'border-orange-200 dark:border-orange-800/30',
    title: '맞춤법 / 문법 검사',
    desc: '글의 맞춤법과 문법을 검사하고 교정합니다',
    providers: ['groq', 'gemini'],
    groqModels: GROQ_MODELS,
    geminiModels: GEMINI_MODELS,
    locked: false,
  },
]

const DEFAULT_SETTINGS: SettingsMap = {
  transcription: { provider: 'groq', model: 'whisper-large-v3', label: '음성 → 텍스트 전사' },
  summarization: { provider: 'gemini', model: 'gemini-2.5-pro', label: '강의 내용 정리' },
  assignment_feedback: { provider: 'gemini', model: 'gemini-2.5-pro', label: '과제 피드백 / 평가' },
  spell_check: { provider: 'groq', model: 'llama-3.1-8b-instant', label: '맞춤법 검사' },
  text: { provider: 'groq', model: 'llama-3.3-70b-versatile', label: 'AI 채팅/평가/리포트' },
  vision: { provider: 'gemini', model: 'gemini-1.5-flash', label: '이미지 인식' },
  transcribe: { provider: 'groq', model: 'whisper-large-v3', label: '음성 전사' },
  image_gen: { provider: 'gemini', model: 'gemini-2.0-flash-preview-image-generation', label: '이미지 생성' },
}

// 비용 추정 (1M 토큰당 USD)
const COST_MAP: Record<string, { input: number; output: number; unit: string }> = {
  'llama-3.1-8b-instant':    { input: 0,    output: 0,     unit: '무료' },
  'llama-3.3-70b-versatile': { input: 0,    output: 0,     unit: '무료' },
  'whisper-large-v3':        { input: 0,    output: 0,     unit: '무료' },
  'gemini-2.0-flash':        { input: 0.10, output: 0.40,  unit: '$/1M' },
  'gemini-1.5-flash':        { input: 0.075,output: 0.30,  unit: '$/1M' },
  'gemini-1.5-pro':          { input: 1.25, output: 5.00,  unit: '$/1M' },
  'gemini-2.5-pro':          { input: 1.25, output: 10.00, unit: '$/1M' },
  'gemini-3.1-pro-preview':  { input: 1.25, output: 10.00, unit: '$/1M' },
  'gpt-4o-mini':             { input: 0.15, output: 0.60,  unit: '$/1M' },
  'gpt-4o':                  { input: 2.50, output: 10.00, unit: '$/1M' },
  'whisper-1':               { input: 0,    output: 0,     unit: '$0.006/분' },
  'gemini-2.0-flash-preview-image-generation': { input: 0, output: 0, unit: '이미지당 비용' },
}

function CostBadge({ model }: { model: string }) {
  const cost = COST_MAP[model]
  if (!cost) return null
  if (cost.unit === '무료') {
    return <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded-full">무료</span>
  }
  return (
    <span className="text-[10px] text-neutral-500 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded-full">
      출력 ${cost.output}/1M
    </span>
  )
}

export default function AiSettingsPanel() {
  const [settings, setSettings] = useState<SettingsMap>(DEFAULT_SETTINGS)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/ai-settings')
      .then(r => r.json())
      .then(data => {
        if (data.settings) setSettings(data.settings)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleChange = async (taskKey: string, provider: string, model: string) => {
    const updated = { ...settings, [taskKey]: { ...settings[taskKey], provider, model } }
    setSettings(updated)
    setSaving(taskKey)
    setSaved(null)

    try {
      await fetch('/api/ai-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskKey, provider, model }),
      })
      setSaved(taskKey)
      setTimeout(() => setSaved(null), 2500)
    } catch {}
    setSaving(null)
  }

  const handleReset = async (taskKey: string) => {
    const def = DEFAULT_SETTINGS[taskKey]
    if (def) await handleChange(taskKey, def.provider, def.model)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-neutral-400">
        <div className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
        AI 설정 불러오는 중...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3 pb-4 border-b border-neutral-200 dark:border-neutral-800">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center">
          <Settings className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-black text-neutral-900 dark:text-white">AI 프로바이더 설정</h2>
          <p className="text-xs text-neutral-500">기능별 AI 엔진을 자유롭게 전환하세요 — Groq(무료) / Gemini / OpenAI</p>
        </div>
      </div>

      {/* ── 통합 AI 카테고리 (신규) ── */}
      <div>
        <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">🔧 핵심 기능 (전체 시스템 적용)</p>
        <div className="space-y-3">
        {AI_CATEGORIES.map((task) => {
          const current = settings[task.key] || DEFAULT_SETTINGS[task.key] || { provider: 'gemini', model: '' }
          const currentModels = current.provider === 'openai' ? (task.openaiModels || []) : current.provider === 'groq' ? task.groqModels : task.geminiModels
          const currentModelInfo = currentModels.find((m: any) => m.id === current.model)
          const isSaving = saving === task.key
          const isSaved = saved === task.key
          const Icon = task.icon
          return (
            <div key={task.key} className={`rounded-2xl border ${task.borderColor} ${task.bgColor} p-4 space-y-3`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${task.iconColor}`} />
                  <div>
                    <p className="text-sm font-bold text-neutral-900 dark:text-white">{task.title}</p>
                    <p className="text-[10px] text-neutral-500">{task.desc}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isSaved && <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1"><Check className="w-3 h-3"/>저장</span>}
                  {isSaving && <div className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />}
                  <button onClick={() => { const d = DEFAULT_SETTINGS[task.key]; if(d) handleChange(task.key, d.provider, d.model) }} className="p-1 rounded text-neutral-400 hover:text-neutral-600"><RotateCcw className="w-3 h-3"/></button>
                </div>
              </div>
              {/* 프로바이더 선택 */}
              <div className="flex gap-1.5">
                {task.providers.map(p => (
                  <button key={p} onClick={() => {
                    const models = p === 'openai' ? (task.openaiModels||[]) : p === 'groq' ? task.groqModels : task.geminiModels
                    handleChange(task.key, p, models[0]?.id || '')
                  }} className={`flex-1 py-1.5 px-2 rounded-lg border text-xs font-bold transition ${
                    current.provider === p
                      ? p === 'groq' ? 'bg-violet-600 text-white border-violet-600'
                        : p === 'openai' ? 'bg-green-600 text-white border-green-600'
                        : p === 'disabled' ? 'bg-neutral-600 text-white border-neutral-600'
                        : 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-neutral-900 text-neutral-500 border-neutral-200 dark:border-neutral-700 hover:border-violet-300'
                  }`}>
                    {p === 'groq' ? '🟢 Groq(무료)' : p === 'openai' ? '🟩 OpenAI' : p === 'disabled' ? '⛔ 비활성화' : '🔵 Gemini'}
                  </button>
                ))}
              </div>
              {/* 모델 선택 */}
              {current.provider !== 'disabled' && currentModels.length > 0 && (
                <div className="grid grid-cols-2 gap-1.5">
                  {currentModels.map((m: any) => (
                    <button key={m.id} onClick={() => handleChange(task.key, current.provider, m.id)}
                      className={`text-left px-2.5 py-2 rounded-xl border text-[11px] transition ${
                        current.model === m.id ? 'border-violet-400 bg-violet-50 dark:bg-violet-900/20' : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:border-violet-200'
                      }`}>
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className={`text-[9px] font-black text-white px-1.5 py-0.5 rounded-full ${m.badgeColor}`}>{m.badge}</span>
                        {current.model === m.id && <Check className="w-3 h-3 text-violet-500"/>}
                      </div>
                      <p className="font-bold text-neutral-800 dark:text-white leading-tight">{m.name}</p>
                      <p className="text-neutral-400 mt-0.5">{m.desc}</p>
                      <CostBadge model={m.id}/>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 bg-white/60 dark:bg-neutral-900/40 rounded-lg px-3 py-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/>
                <p className="text-[10px] text-neutral-500">현재: <span className="font-bold text-neutral-800 dark:text-white">{currentModelInfo?.name || current.model || '비활성화'}</span></p>
              </div>
            </div>
          )
        })}
        </div>
      </div>

      <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4">
        <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">기타 기능별 세부 설정</p>
      </div>

      {/* 기능별 설정 카드 (기존) */}
      {TASKS.map((task) => {
        const current = settings[task.key] || DEFAULT_SETTINGS[task.key]
        const currentModels = current.provider === 'gemini' ? task.geminiModels : task.groqModels
        const currentModelInfo = currentModels.find(m => m.id === current.model)
        const isSaving = saving === task.key
        const isSaved = saved === task.key
        const Icon = task.icon

        return (
          <div
            key={task.key}
            className={`rounded-2xl border ${task.borderColor} ${task.bgColor} p-5 space-y-4`}
          >
            {/* 기능 헤더 */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Icon className={`w-5 h-5 ${task.iconColor}`} />
                <div>
                  <p className="text-sm font-bold text-neutral-900 dark:text-white">{task.title}</p>
                  <p className="text-[11px] text-neutral-500">{task.desc}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isSaved && (
                  <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-bold">
                    <Check className="w-3 h-3" /> 저장됨
                  </span>
                )}
                {isSaving && (
                  <div className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                )}
                {!task.locked && (
                  <button
                    onClick={() => handleReset(task.key)}
                    title="기본값으로 재설정"
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-white dark:hover:bg-neutral-800 transition"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {task.locked ? (
              /* 전사: 고정 표시 */
              <div className="flex items-center gap-3 bg-white dark:bg-neutral-900/50 rounded-xl px-4 py-3 border border-neutral-200 dark:border-neutral-700">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-neutral-800 dark:text-white">Groq Whisper Large v3</p>
                  <p className="text-[11px] text-neutral-400">{task.lockedNote}</p>
                </div>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full">무료</span>
              </div>
            ) : (
              <div className="space-y-3">
                {/* 제공자 선택 */}
                <div>
                  <p className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-2">AI 제공자</p>
                  <div className="flex gap-2">
                    {task.providers.includes('groq') && (
                      <button
                        onClick={() => {
                          const defaultModel = task.groqModels[0]?.id || 'llama-3.1-8b-instant'
                          handleChange(task.key, 'groq', defaultModel)
                        }}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-sm font-bold transition ${
                          current.provider === 'groq'
                            ? 'bg-violet-600 text-white border-violet-600'
                            : 'bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700 hover:border-violet-300'
                        }`}
                      >
                        <Zap className="w-3.5 h-3.5" />
                        🟢 Groq (무료)
                      </button>
                    )}
                    {task.providers.includes('gemini') && (
                      <button
                        onClick={() => {
                          const defaultModel = task.geminiModels[0]?.id || 'gemini-2.0-flash'
                          handleChange(task.key, 'gemini', defaultModel)
                        }}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-sm font-bold transition ${
                          current.provider === 'gemini'
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700 hover:border-blue-300'
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        🔵 Gemini (Tier 1)
                      </button>
                    )}
                  </div>
                </div>

                {/* 모델 선택 */}
                <div>
                  <p className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-2">모델</p>
                  <div className="grid grid-cols-2 gap-2">
                    {currentModels.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => handleChange(task.key, current.provider, m.id)}
                        className={`text-left px-3 py-2.5 rounded-xl border transition ${
                          current.model === m.id
                            ? 'border-violet-400 bg-violet-50 dark:bg-violet-900/20'
                            : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:border-violet-200'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={`text-[9px] font-black text-white px-1.5 py-0.5 rounded-full ${m.badgeColor}`}>
                            {m.badge}
                          </span>
                          {current.model === m.id && (
                            <Check className="w-3 h-3 text-violet-500" />
                          )}
                        </div>
                        <p className="text-[11px] font-bold text-neutral-800 dark:text-white leading-tight">{m.name}</p>
                        <p className="text-[10px] text-neutral-400 mt-0.5 leading-tight">{m.desc}</p>
                        <div className="mt-1">
                          <CostBadge model={m.id} />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 현재 설정 요약 */}
                <div className="flex items-center gap-2 bg-white dark:bg-neutral-900/50 rounded-xl px-3 py-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <p className="text-[11px] text-neutral-500">
                    현재: <span className="font-bold text-neutral-800 dark:text-white">
                      {currentModelInfo?.name || current.model}
                    </span>
                    {' · '}
                    <CostBadge model={current.model} />
                  </p>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* 가격 참고 */}
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 p-4">
        <p className="text-xs font-bold text-neutral-600 dark:text-neutral-400 mb-2">💡 비용 참고 (강의 1개당 예상)</p>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="space-y-1">
            <p className="font-bold text-neutral-500">Groq</p>
            <p className="text-neutral-600 dark:text-neutral-400">🟢 8B / 70B → <strong>무료</strong></p>
            <p className="text-neutral-500">(단, 분당 처리량 제한)</p>
          </div>
          <div className="space-y-1">
            <p className="font-bold text-neutral-500">Gemini</p>
            <p className="text-neutral-600 dark:text-neutral-400">Flash → <strong>₩15~50</strong>/강의</p>
            <p className="text-neutral-600 dark:text-neutral-400">2.5 Pro → <strong>₩200~700</strong>/강의</p>
          </div>
        </div>
      </div>
    </div>
  )
}
