'use client'

import { useState, useEffect } from 'react'
import { Settings, Mic, BookOpen, FileCheck, SpellCheck2, ChevronDown, Save, RotateCcw, Sparkles, Zap, Check } from 'lucide-react'

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

// ── 기능 목록 ───────────────────────────────────────────────
const TASKS = [
  {
    key: 'transcription',
    icon: Mic,
    iconColor: 'text-emerald-500',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/10',
    borderColor: 'border-emerald-200 dark:border-emerald-800/30',
    title: '음성 → 텍스트 전사',
    desc: '강의 녹음 파일을 텍스트로 변환합니다',
    providers: ['groq'],  // Whisper는 Groq만
    groqModels: [{ id: 'whisper-large-v3', name: 'Whisper Large v3', badge: '전용', badgeColor: 'bg-emerald-500', desc: '음성 인식 전용 모델. 자동 선택 (변경 불가)' }],
    geminiModels: [],
    locked: true,  // 전사는 Groq Whisper 고정
    lockedNote: '음성 전사는 Groq Whisper가 고정 사용됩니다',
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
          <h2 className="text-lg font-black text-neutral-900 dark:text-white">AI 모델 설정</h2>
          <p className="text-xs text-neutral-500">기능별 AI 엔진과 모델을 설정합니다</p>
        </div>
      </div>

      {/* 기능별 설정 카드 */}
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
