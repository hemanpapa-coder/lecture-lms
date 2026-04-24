'use client'

import React, { useState, useEffect } from 'react'
import { Save, Loader2, CheckCircle2, Crown } from 'lucide-react'

interface Props {
    courseId: string
    courseName: string
    studentId: string
    studentName: string
    initialData: {
        midterm_score: number | null
        assignment_score: number | null
        susi_score: number | null
        midterm_bonus?: number | null
        final_bonus?: number | null
    }
}

export default function AdminManualEvalPanel({ courseId, courseName, studentId, studentName, initialData }: Props) {
    const [saving, setSaving] = useState(false)
    const [statusMsg, setStatusMsg] = useState<'saved' | 'error' | null>(null)
    const [midterm, setMidterm] = useState<string>(initialData.midterm_score?.toString() ?? '')
    const [assignment, setAssignment] = useState<string>(initialData.assignment_score?.toString() ?? '')
    const [susi, setSusi] = useState<string>(initialData.susi_score?.toString() ?? '')
    const [midtermBonus, setMidtermBonus] = useState<string>(initialData.midterm_bonus?.toString() ?? '0')
    const [finalBonus, setFinalBonus] = useState<string>(initialData.final_bonus?.toString() ?? '0')

    useEffect(() => {
        setMidterm(initialData.midterm_score?.toString() ?? '')
        setAssignment(initialData.assignment_score?.toString() ?? '')
        setSusi(initialData.susi_score?.toString() ?? '')
        setMidtermBonus(initialData.midterm_bonus?.toString() ?? '0')
        setFinalBonus(initialData.final_bonus?.toString() ?? '0')
    }, [initialData])

    const handleSave = async () => {
        setSaving(true)
        setStatusMsg(null)
        try {
            const res = await fetch('/api/admin/evaluations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    studentId,
                    midterm_score: midterm === '' ? null : Number(midterm),
                    assignment_score: assignment === '' ? null : Number(assignment),
                    susi_score: susi === '' ? null : Number(susi),
                    midterm_bonus: midtermBonus === '' ? 0 : Number(midtermBonus),
                    final_bonus: finalBonus === '' ? 0 : Number(finalBonus),
                }),
            })
            if (!res.ok) {
                const d = await res.json()
                throw new Error(d.error || 'Failed to save')
            }
            setStatusMsg('saved')
            setTimeout(() => {
                setStatusMsg(null)
                window.location.reload()
            }, 1000)
        } catch (error) {
            console.error(error)
            setStatusMsg('error')
        } finally {
            setSaving(false)
        }
    }

    const isDirty =
        midterm !== (initialData.midterm_score?.toString() ?? '') ||
        assignment !== (initialData.assignment_score?.toString() ?? '') ||
        susi !== (initialData.susi_score?.toString() ?? '') ||
        midtermBonus !== (initialData.midterm_bonus?.toString() ?? '0') ||
        finalBonus !== (initialData.final_bonus?.toString() ?? '0')

    return (
        <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-neutral-200 dark:border-neutral-700 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-700 pb-3">
                <h4 className="font-bold text-neutral-800 dark:text-neutral-200">
                    <span className="text-blue-600 dark:text-blue-400">{studentName}</span> 학생 수동 평가
                </h4>
            </div>

            {/* 기본 점수 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label className="block text-xs font-semibold text-neutral-500 mb-1">
                        과제 점수 (Assignment)
                    </label>
                    <input
                        type="number"
                        placeholder="0.00"
                        value={assignment}
                        onChange={(e) => setAssignment(e.target.value)}
                        className="w-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                <div>
                    <label className="block text-xs font-semibold text-neutral-500 mb-1">
                        수시 점수 (Rolling/Participation)
                    </label>
                    <input
                        type="number"
                        placeholder="0.00"
                        value={susi}
                        onChange={(e) => setSusi(e.target.value)}
                        className="w-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                <div>
                    <label className="block text-xs font-semibold text-neutral-500 mb-1">
                        중간 점수 (Midterm)
                    </label>
                    <input
                        type="number"
                        placeholder="0.00"
                        value={midterm}
                        onChange={(e) => setMidterm(e.target.value)}
                        className="w-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
            </div>

            {/* 반장 추가점수(가점) */}
            <div className="border border-amber-200 dark:border-amber-800/50 rounded-xl p-4 bg-amber-50/50 dark:bg-amber-900/10 space-y-3">
                <div className="flex items-center gap-2">
                    <Crown className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-bold text-amber-700 dark:text-amber-400">반장 추가점수 (가점)</span>
                    <span className="text-xs text-amber-500 dark:text-amber-500">· 반장에게만 적용하세요</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1">
                            중간고사 가점
                        </label>
                        <input
                            type="number"
                            placeholder="0"
                            min="0"
                            max="10"
                            value={midtermBonus}
                            onChange={(e) => setMidtermBonus(e.target.value)}
                            className="w-full bg-white dark:bg-neutral-900 border border-amber-300 dark:border-amber-700 rounded-lg px-3 py-2 text-sm font-bold text-amber-800 dark:text-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400"
                        />
                        {Number(midtermBonus) > 0 && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                중간 점수: {Number(midterm || 0)} + <span className="font-bold">+{midtermBonus}</span> = {Number(midterm || 0) + Number(midtermBonus)}점
                            </p>
                        )}
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1">
                            기말고사 가점
                        </label>
                        <input
                            type="number"
                            placeholder="0"
                            min="0"
                            max="10"
                            value={finalBonus}
                            onChange={(e) => setFinalBonus(e.target.value)}
                            className="w-full bg-white dark:bg-neutral-900 border border-amber-300 dark:border-amber-700 rounded-lg px-3 py-2 text-sm font-bold text-amber-800 dark:text-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400"
                        />
                        {Number(finalBonus) > 0 && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                <span className="font-bold">기말 +{finalBonus}점</span> 가점 적용됨
                            </p>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
                {statusMsg === 'error' && <span className="text-xs text-red-500">저장에 실패했습니다.</span>}
                <button
                    onClick={handleSave}
                    disabled={!isDirty || saving}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all ${isDirty && !saving
                        ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-md'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed border border-neutral-200 dark:border-neutral-700'
                        }`}
                >
                    {saving
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> 저장 중...</>
                        : statusMsg === 'saved'
                            ? <><CheckCircle2 className="w-4 h-4" /> 저장됨</>
                            : <><Save className="w-4 h-4" /> 저장하기</>}
                </button>
            </div>
        </div>
    )
}
