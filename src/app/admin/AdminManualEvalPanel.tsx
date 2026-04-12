'use client'

import React, { useState, useEffect } from 'react'
import { Save, Loader2, CheckCircle2 } from 'lucide-react'

interface Props {
    courseId: string
    courseName: string
    studentId: string
    studentName: string
    initialData: {
        midterm_score: number | null
        assignment_score: number | null
        susi_score: number | null
    }
}

export default function AdminManualEvalPanel({ courseId, courseName, studentId, studentName, initialData }: Props) {
    const [saving, setSaving] = useState(false)
    const [statusMsg, setStatusMsg] = useState<'saved' | 'error' | null>(null)
    const [midterm, setMidterm] = useState<string>(initialData.midterm_score?.toString() ?? '')
    const [assignment, setAssignment] = useState<string>(initialData.assignment_score?.toString() ?? '')
    const [susi, setSusi] = useState<string>(initialData.susi_score?.toString() ?? '')

    // Update state if initialData changes externally
    useEffect(() => {
        setMidterm(initialData.midterm_score?.toString() ?? '')
        setAssignment(initialData.assignment_score?.toString() ?? '')
        setSusi(initialData.susi_score?.toString() ?? '')
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
                }),
            })
            if (!res.ok) {
                const d = await res.json()
                throw new Error(d.error || 'Failed to save')
            }
            setStatusMsg('saved')
            setTimeout(() => {
                setStatusMsg(null)
                // Reload page to reflect changes in the table
                // Optionally avoid full reload by triggering an event, but reload is safest for now
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
        susi !== (initialData.susi_score?.toString() ?? '')

    return (
        <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-neutral-200 dark:border-neutral-700 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-700 pb-3">
                <h4 className="font-bold text-neutral-800 dark:text-neutral-200">
                    <span className="text-blue-600 dark:text-blue-400">{studentName}</span> 학생 수동 평가
                </h4>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 과제 점수 */}
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

                {/* 수시 점수 */}
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

                {/* 중간 점수 */}
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
