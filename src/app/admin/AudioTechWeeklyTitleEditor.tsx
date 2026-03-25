'use client'

import { useState, useEffect } from 'react'
import { Calendar, Save, Check, RotateCcw, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

type Props = {
  courseId: string
  courseName: string
}

export default function AudioTechWeeklyTitleEditor({ courseId, courseName }: Props) {
  const [titles, setTitles] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [open, setOpen] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    async function loadTitles() {
      try {
        const { data, error } = await supabase
          .from('courses')
          .select('weekly_presentation_titles')
          .eq('id', courseId)
          .single()
        if (!error && data?.weekly_presentation_titles) {
          setTitles(data.weekly_presentation_titles as Record<string, string>)
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    loadTitles()
  }, [courseId, supabase])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const { error } = await supabase
        .from('courses')
        .update({ weekly_presentation_titles: titles })
        .eq('id', courseId)
      
      if (!error) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } else {
        alert('저장에 실패했습니다: ' + error.message)
      }
    } catch {
      alert('오류가 발생했습니다.')
    }
    setSaving(false)
  }

  const handleTitleChange = (week: number, value: string) => {
    setTitles(prev => ({ ...prev, [week.toString()]: value }))
  }

  const activeTitlesCount = Object.values(titles).filter(t => t.trim() !== '').length

  return (
    <div className="mb-6 rounded-2xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-blue-500" />
          <div>
            <p className="text-sm font-bold text-neutral-800 dark:text-white">📅 주차별 발표 제목 설정 ({courseName})</p>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              {activeTitlesCount > 0 
                ? `${activeTitlesCount}개의 주차 제목이 설정됨 · 학생 업로드 화면에 표시` 
                : '각 주차별 발표의 주제나 제목을 입력하세요'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeTitlesCount > 0 && (
            <span className="text-[10px] font-bold text-blue-600 bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 rounded-full">설정됨</span>
          )}
          {open ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-blue-100 dark:border-blue-900/40 pt-4">
          <p className="text-[11px] text-neutral-500">
            학생들이 과제/발표 자료를 업로드할 때 선택하는 주차 드롭다운에 추가로 표시될 <strong>발표 제목</strong>을 설정합니다. (예: &quot;중간 프로젝트 기획안 발표&quot;)
          </p>

          {loading ? (
            <div className="flex items-center gap-2 py-6 text-neutral-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
              불러오는 중...
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {Array.from({ length: 15 }, (_, i) => i + 1).map(week => (
                <div key={week} className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-neutral-600 dark:text-neutral-400 pl-1">
                    발표 {week}주차
                  </label>
                  <input
                    type="text"
                    value={titles[week.toString()] || ''}
                    onChange={(e) => handleTitleChange(week, e.target.value)}
                    placeholder={`예: ${week}주차 발표 주제`}
                    className="w-full rounded-xl border border-blue-200 dark:border-blue-800/50 bg-white dark:bg-neutral-900 p-2 text-xs font-semibold text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-300 dark:placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-end mt-4 pt-4 border-t border-blue-100 dark:border-blue-900/40">
            <div className="flex gap-2">
              <button
                onClick={() => setTitles({})}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
              >
                <RotateCcw className="w-3 h-3" /> 모두 비우기
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition ${
                  saved
                    ? 'bg-emerald-500 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {saving ? (
                  <Loader2 className="w-3 h-3 animate-spin border-transparent" />
                ) : saved ? (
                  <><Check className="w-3 h-3" /> 저장됨</>
                ) : (
                  <><Save className="w-3 h-3" /> 저장하기</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
