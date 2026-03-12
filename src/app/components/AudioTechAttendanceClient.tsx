'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarCheck, Save } from 'lucide-react'

export default function AudioTechAttendanceClient({
    courseId,
    isAttendanceOpen,
    initialAttendances
}: {
    courseId: string,
    isAttendanceOpen: boolean,
    initialAttendances: any[]
}) {
    const router = useRouter()
    const [selectedWeek, setSelectedWeek] = useState<number>(1)
    const [saving, setSaving] = useState(false)

    // Find attendance for selected week
    const weekAttendance = initialAttendances.find(a => a.week_number === selectedWeek) || { status: '', reason_text: '' }
    const [formAtt, setFormAtt] = useState({ ...weekAttendance })

    const handleWeekChange = (w: number) => {
        const att = initialAttendances.find(a => a.week_number === w) || { status: '', reason_text: '' }
        setFormAtt(att)
        setSelectedWeek(w)
    }

    const saveAttendance = async () => {
        if (!formAtt.status) {
            alert('출석 상태를 선택해주세요.')
            return
        }

        setSaving(true)
        try {
            const res = await fetch('/api/recording-class/attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    course_id: courseId,
                    week_number: selectedWeek,
                    status: formAtt.status,
                    reason_text: formAtt.reason_text
                })
            })
            if (!res.ok) throw new Error('저장 실패')
            alert('출석 정보가 저장되었습니다.')
            router.refresh()
        } catch (e: any) {
            alert(e.message)
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="mt-6 border-t border-neutral-200 dark:border-neutral-800 pt-6">
            <h3 className="text-sm font-bold text-neutral-800 dark:text-neutral-200 mb-4 flex items-center gap-2">
                <CalendarCheck className="w-5 h-5 text-indigo-500" /> 주차별 셀프 출석체크
            </h3>

            {/* Week Selector */}
            <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide mb-4">
                {Array.from({ length: 15 }, (_, i) => i + 1).map(w => {
                    const hasRecord = initialAttendances.some(a => a.week_number === w && a.status)
                    return (
                        <button
                            key={w}
                            onClick={() => handleWeekChange(w)}
                            className={`flex-shrink-0 w-10 h-10 rounded-xl font-bold transition-all flex items-center justify-center border text-xs relative ${selectedWeek === w
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                                : 'bg-neutral-50 text-neutral-600 border-neutral-200 hover:border-indigo-300 dark:bg-neutral-800 dark:text-neutral-400 dark:border-neutral-700'
                                }`}
                        >
                            {w}
                            {hasRecord && selectedWeek !== w && (
                                <span className="absolute top-0 right-0 w-2 h-2 bg-emerald-500 rounded-full translate-x-1/2 -translate-y-1/2 border border-white dark:border-neutral-900"></span>
                            )}
                        </button>
                    )
                })}
            </div>

            <div className="bg-neutral-50 dark:bg-neutral-950 p-5 rounded-2xl border border-neutral-100 dark:border-neutral-800">
                <div className="flex items-center justify-between mb-4">
                    <h4 className="font-black text-indigo-900 dark:text-indigo-400">WEEK {selectedWeek}</h4>
                </div>

                <div className="space-y-4">
                    <div className="flex gap-2 flex-wrap">
                        {['출석', '지각', '결석', '병출석', '사유출석'].map(s => (
                            <button
                                key={s} onClick={() => setFormAtt({ ...formAtt, status: s })}
                                className={`px-3 py-1.5 text-xs font-bold border rounded-lg transition ${formAtt.status === s
                                    ? s === '출석' ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                                        : s === '결석' ? 'bg-red-500 text-white border-red-500 shadow-sm'
                                            : 'bg-orange-500 text-white border-orange-500 shadow-sm'
                                    : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400 dark:bg-neutral-800 dark:text-neutral-400 dark:border-neutral-700 disabled:opacity-50'}`}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                    {(formAtt.status === '병출석' || formAtt.status === '사유출석') && (
                        <div className="animate-in fade-in slide-in-from-top-2">
                            <textarea
                                value={formAtt.reason_text || ''}
                                onChange={e => setFormAtt({ ...formAtt, reason_text: e.target.value })}
                                placeholder="사유를 상세히 적어주세요. 병원 진단서 등은 파일 링크나 텍스트로 남길 수 있습니다."
                                className="w-full mt-2 p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                                rows={2}
                            />
                        </div>
                    )}
                    <div className="flex justify-end pt-2">
                        <button
                            onClick={saveAttendance}
                            disabled={saving}
                            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition disabled:opacity-50"
                        >
                            <Save className="w-4 h-4" /> {saving ? '저장 중...' : '확인/저장'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
