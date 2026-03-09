'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Save, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'

export default function AdminCourseDashboardNotices({
    courseId,
    initialWeekly,
    initialFinal,
    initialMidterm,
    initialCheckpoint
}: {
    courseId: string
    initialWeekly: string
    initialFinal: string
    initialMidterm: string
    initialCheckpoint: string
}) {
    const supabase = createClient()
    const [weekly, setWeekly] = useState(initialWeekly || '')
    const [final, setFinal] = useState(initialFinal || '')
    const [midterm, setMidterm] = useState(initialMidterm || '')
    const [checkpoint, setCheckpoint] = useState(initialCheckpoint || '')

    const [saving, setSaving] = useState(false)
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')

    const handleSave = async () => {
        setSaving(true)
        setSaveStatus('idle')

        try {
            const { error } = await supabase
                .from('courses')
                .update({
                    notice_weekly: weekly,
                    notice_final: final,
                    notice_midterm: midterm,
                    notice_checkpoint: checkpoint
                })
                .eq('id', courseId)

            if (error) throw error
            setSaveStatus('success')
            setTimeout(() => setSaveStatus('idle'), 3000)
        } catch (err) {
            console.error(err)
            setSaveStatus('error')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-6 shadow-sm mb-6 flex flex-col space-y-4">
            <div className="flex justify-between items-center mb-2">
                <div>
                    <h3 className="text-lg font-bold text-neutral-900 dark:text-white">학생 대시보드 진행도 안내글 설정</h3>
                    <p className="text-xs text-neutral-500 mt-1">학생 페이지의 각 진행도 카드 하단에 노출될 안내 문구를 입력합니다.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition disabled:opacity-50"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    저장하기
                </button>
            </div>

            {saveStatus === 'success' && (
                <div className="bg-emerald-50 text-emerald-700 p-3 rounded-xl text-sm font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> 성공적으로 저장되었습니다.
                </div>
            )}
            {saveStatus === 'error' && (
                <div className="bg-red-50 text-red-700 p-3 rounded-xl text-sm font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> 저장에 실패했습니다.
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-sm font-bold text-neutral-700 dark:text-neutral-300">주차별 과제 제출 안내글</label>
                    <textarea
                        value={weekly}
                        onChange={e => setWeekly(e.target.value)}
                        placeholder="예) 매주 금요일 밤 12시까지 제출해주세요."
                        className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 p-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-none h-24"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-bold text-neutral-700 dark:text-neutral-300">기말 프로젝트 상태 안내글</label>
                    <textarea
                        value={final}
                        onChange={e => setFinal(e.target.value)}
                        placeholder="예) 기말 프로젝트의 각 단계를 기한 내에 완수해주세요."
                        className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 p-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-none h-24"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-bold text-neutral-700 dark:text-neutral-300">중간 평가 현황 안내글</label>
                    <textarea
                        value={midterm}
                        onChange={e => setMidterm(e.target.value)}
                        placeholder="예) 8주차에 치러지는 중간 평가 관련 공지입니다."
                        className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 p-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-none h-24"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-bold text-neutral-700 dark:text-neutral-300">수시 과제 현황 안내글</label>
                    <textarea
                        value={checkpoint}
                        onChange={e => setCheckpoint(e.target.value)}
                        placeholder="예) 수시로 부여되는 미니 과제에 대한 안내입니다."
                        className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 p-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-none h-24"
                    />
                </div>
            </div>
        </div>
    )
}
