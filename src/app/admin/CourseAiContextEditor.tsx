'use client'

import { useState, useEffect } from 'react'
import { Brain, Save, Check, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react'

type Props = {
  courseId: string
  courseName: string
}

const PLACEHOLDER = `예시:
이 수업은 레코딩 스튜디오 실습 과목으로 아래 주제들을 다룹니다.

[전문 용어]
- 마이크 종류: 다이나믹, 콘덴서, 리본
- 신호 흐름: 마이크 → 프리앰프 → 컴프레서 → AD 변환 → DAW
- EQ, 컴프레서, 리버브, 딜레이 등 이펙터
- Pro Tools, Logic Pro, Ableton Live 사용

[수업 특징]
- 오결음향학 기반의 음향 이론 포함
- 실습: 레코딩 세션 운영, 믹싱, 마스터링

[보정 지침]
- 전문 용어가 잘못 발음되거나 불명확하게 전사된 경우 올바른 용어로 교정
- 강의에서 언급된 개념에 대해 필요한 경우 정의나 설명을 보완`

export default function CourseAiContextEditor({ courseId, courseName }: Props) {
  const [context, setContext] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/ai-settings?courseId=${courseId}`)
      .then(r => r.json())
      .then(data => {
        if (data.courseContext) setContext(data.courseContext)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [courseId])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await fetch('/api/ai-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskKey: `course_context_${courseId}`, provider: 'context', model: context }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {}
    setSaving(false)
  }

  const charCount = context.length

  return (
    <div className="mb-6 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/50 dark:bg-indigo-950/20 overflow-hidden">
      {/* 헤더 */}
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <Brain className="w-5 h-5 text-indigo-500" />
          <div>
            <p className="text-sm font-bold text-neutral-800 dark:text-white">🤖 AI 수업 맥락 설정</p>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              {context ? `${charCount.toLocaleString()}자 설정됨 · 녹취 정리 시 AI가 참고` : 'AI가 이 수업의 전문 지식을 학습합니다'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {context && (
            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100 dark:bg-indigo-900/40 px-2 py-0.5 rounded-full">활성</span>
          )}
          {open ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-3 border-t border-indigo-100 dark:border-indigo-900/40 pt-4">
          <p className="text-[11px] text-neutral-500">
            이 수업의 전문 분야, 용어, 보정 방향을 작성하세요. AI가 강의 녹취를 정리할 때 이 내용을 참고하여
            <strong className="text-indigo-600"> 전문 용어 교정, 누락 내용 보완, 오류 수정</strong>을 수행합니다.
          </p>

          {loading ? (
            <div className="flex items-center gap-2 py-6 text-neutral-400 text-sm">
              <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              불러오는 중...
            </div>
          ) : (
            <textarea
              value={context}
              onChange={e => setContext(e.target.value)}
              placeholder={PLACEHOLDER}
              rows={12}
              className="w-full rounded-xl border border-indigo-200 dark:border-indigo-800/50 bg-white dark:bg-neutral-900 p-4 text-sm text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-300 dark:placeholder:text-neutral-600 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono leading-relaxed"
            />
          )}

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-neutral-400">{charCount.toLocaleString()}자</span>
            <div className="flex gap-2">
              <button
                onClick={() => setContext('')}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
              >
                <RotateCcw className="w-3 h-3" /> 초기화
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition ${
                  saved
                    ? 'bg-emerald-500 text-white'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                }`}
              >
                {saving ? (
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : saved ? (
                  <><Check className="w-3 h-3" /> 저장됨</>
                ) : (
                  <><Save className="w-3 h-3" /> 저장</>
                )}
              </button>
            </div>
          </div>

          {/* 예시 템플릿 */}
          <details className="text-[11px]">
            <summary className="cursor-pointer text-indigo-500 hover:text-indigo-700 font-medium">📝 작성 예시 보기</summary>
            <pre className="mt-2 p-3 bg-white dark:bg-neutral-900 rounded-lg border border-indigo-100 dark:border-indigo-900/30 text-neutral-500 whitespace-pre-wrap leading-relaxed">{PLACEHOLDER}</pre>
          </details>
        </div>
      )}
    </div>
  )
}
