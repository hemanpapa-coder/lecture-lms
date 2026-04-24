'use client'

import React, { useCallback, useRef, useState } from 'react'
import { Upload, FileImage, FileText, Loader2, CheckCircle, AlertCircle, Edit2, Save, X, ChevronDown, ChevronUp } from 'lucide-react'

interface Student {
    order: number
    studentId: string
    name: string
    matched?: boolean   // DB에서 매칭 여부
}

interface WeekDate {
    week: number
    date: string
}

interface ParseResult {
    courseName: string | null
    students: Student[]
    weekDates: WeekDate[]
    fileUrl?: string
}

interface Props {
    courseId: string
    courseName: string
    fileUrl?: string | null
    onApplied?: () => void
}

export default function AdminAttendanceSheetUploader({ courseId, courseName, fileUrl, onApplied }: Props) {
    const [isDragging, setIsDragging] = useState(false)
    const [file, setFile] = useState<File | null>(null)
    const [preview, setPreview] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<ParseResult | null>(null)
    const [editStudents, setEditStudents] = useState<Student[]>([])
    const [editDates, setEditDates] = useState<WeekDate[]>([])
    const [applying, setApplying] = useState(false)
    const [applied, setApplied] = useState(false)
    const [showDates, setShowDates] = useState(true)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleFile = useCallback((f: File) => {
        setFile(f)
        setResult(null)
        setError(null)
        setApplied(false)
        if (f.type.startsWith('image/')) {
            const reader = new FileReader()
            reader.onload = e => setPreview(e.target?.result as string)
            reader.readAsDataURL(f)
        } else {
            setPreview(null)
        }
    }, [])

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
        const f = e.dataTransfer.files[0]
        if (f) handleFile(f)
    }, [handleFile])

    const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]
        if (f) handleFile(f)
    }

    const handleParse = async () => {
        if (!file) return
        setLoading(true)
        setError(null)
        setResult(null)

        try {
            const fd = new FormData()
            fd.append('file', file)
            fd.append('courseId', courseId)

            const res = await fetch('/api/admin/parse-attendance-sheet', { method: 'POST', body: fd })
            const data = await res.json()

            if (!res.ok || !data.success) {
                setError(data.error || 'AI 처리 중 오류가 발생했습니다.')
                return
            }

            setResult(data)
            setEditStudents(data.students.map((s: Student) => ({ ...s })))
            setEditDates(data.weekDates.map((d: WeekDate) => ({ ...d })))
        } catch (err: any) {
            setError(err.message || '네트워크 오류')
        } finally {
            setLoading(false)
        }
    }

    const updateStudent = (idx: number, field: keyof Student, value: string | number) => {
        setEditStudents(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s))
    }

    const updateDate = (idx: number, field: keyof WeekDate, value: string | number) => {
        setEditDates(prev => prev.map((d, i) => i === idx ? { ...d, [field]: value } : d))
    }

    const addStudent = () => {
        const maxOrder = editStudents.reduce((m, s) => Math.max(m, s.order), 0)
        setEditStudents(prev => [...prev, { order: maxOrder + 1, studentId: '', name: '' }])
    }

    const removeStudent = (idx: number) => {
        setEditStudents(prev => prev.filter((_, i) => i !== idx))
    }

    const handleApply = async () => {
        if (!editStudents.length) return
        setApplying(true)
        setError(null)

        try {
            const res = await fetch('/api/admin/apply-attendance-roster', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ courseId, students: editStudents, weekDates: editDates, fileUrl: result?.fileUrl })
            })
            const data = await res.json()
            if (!res.ok || !data.success) {
                setError(data.error || '적용 중 오류')
                return
            }
            setApplied(true)
            onApplied?.()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setApplying(false)
        }
    }

    return (
        <div className="space-y-5">
            {fileUrl && (
                <div className="flex items-center justify-between bg-indigo-50 dark:bg-indigo-900/20 px-4 py-3 rounded-xl border border-indigo-100 dark:border-indigo-800/40">
                    <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-indigo-500" />
                        <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">현재 등록된 출석부 파일</span>
                    </div>
                    <a 
                        href={fileUrl} 
                        download
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 text-xs font-bold text-indigo-600 bg-white dark:bg-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-700 rounded-lg hover:bg-indigo-50 transition"
                    >
                        다운로드
                    </a>
                </div>
            )}

            {/* 업로드 영역 */}
            <div
                className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer
                    ${isDragging
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 scale-[1.01]'
                        : 'border-neutral-300 dark:border-neutral-700 hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10'
                    }`}
                onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                    className="hidden"
                    onChange={onInputChange}
                />
                <div className="flex flex-col items-center gap-3">
                    {file ? (
                        <>
                            {file.type.startsWith('image/') ? (
                                <FileImage className="w-10 h-10 text-indigo-500" />
                            ) : (
                                <FileText className="w-10 h-10 text-indigo-500" />
                            )}
                            <div>
                                <p className="font-bold text-indigo-700 dark:text-indigo-300">{file.name}</p>
                                <p className="text-xs text-neutral-500 mt-1">{(file.size / 1024).toFixed(0)} KB · 클릭하여 다른 파일 선택</p>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="w-16 h-16 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                                <Upload className="w-8 h-8 text-indigo-500" />
                            </div>
                            <div>
                                <p className="font-bold text-neutral-700 dark:text-neutral-200 text-lg">출석부를 여기에 드래그하세요</p>
                                <p className="text-sm text-neutral-500 mt-1">또는 클릭하여 파일 선택</p>
                                <p className="text-xs text-neutral-400 mt-2">지원 형식: JPG, PNG, WEBP, HEIC, PDF</p>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* 이미지 미리보기 */}
            {preview && (
                <div className="rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800 max-h-64">
                    <img src={preview} alt="출석부 미리보기" className="w-full object-contain max-h-64 bg-neutral-100 dark:bg-neutral-900" />
                </div>
            )}

            {/* AI 분석 버튼 */}
            {file && !result && (
                <button
                    onClick={handleParse}
                    disabled={loading}
                    className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 transition flex items-center justify-center gap-2 text-sm"
                >
                    {loading ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Gemini AI 분석 중...</>
                    ) : (
                        <><FileImage className="w-4 h-4" /> AI로 출석부 자동 인식</>
                    )}
                </button>
            )}

            {/* 오류 */}
            {error && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                </div>
            )}

            {/* 분석 결과 */}
            {result && (
                <div className="space-y-4">
                    {/* 헤더 */}
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                        <div className="flex-1">
                            <p className="font-bold text-emerald-700 dark:text-emerald-300 text-sm">
                                AI 인식 완료 — {editStudents.length}명 · {editDates.length}개 주차
                                {result.courseName && <span className="ml-2 text-emerald-500">({result.courseName})</span>}
                            </p>
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">아래 내용을 확인하고 수정 후 "적용"을 누르세요</p>
                        </div>
                    </div>

                    {/* 학생 목록 편집 */}
                    <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
                        <div className="bg-neutral-50 dark:bg-neutral-900 px-4 py-3 flex items-center justify-between">
                            <p className="font-bold text-sm text-neutral-700 dark:text-neutral-300">수강생 명단 ({editStudents.length}명)</p>
                            <button
                                onClick={addStudent}
                                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                            >+ 학생 추가</button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50">
                                        <th className="p-3 text-left font-semibold text-neutral-500 w-16">순번</th>
                                        <th className="p-3 text-left font-semibold text-neutral-500 w-36">학번</th>
                                        <th className="p-3 text-left font-semibold text-neutral-500">이름</th>
                                        <th className="p-3 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {editStudents.map((s, idx) => (
                                        <tr key={idx} className="border-b border-neutral-100 dark:border-neutral-800/50">
                                            <td className="p-2">
                                                <input
                                                    type="number"
                                                    value={s.order}
                                                    onChange={e => updateStudent(idx, 'order', Number(e.target.value))}
                                                    className="w-14 bg-transparent border border-neutral-200 dark:border-neutral-700 rounded-lg px-2 py-1 text-center font-bold text-indigo-600 dark:text-indigo-400 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                                />
                                            </td>
                                            <td className="p-2">
                                                <input
                                                    type="text"
                                                    value={s.studentId}
                                                    onChange={e => updateStudent(idx, 'studentId', e.target.value)}
                                                    placeholder="학번 없음"
                                                    className="w-full bg-transparent border border-neutral-200 dark:border-neutral-700 rounded-lg px-2 py-1 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                                />
                                            </td>
                                            <td className="p-2">
                                                <input
                                                    type="text"
                                                    value={s.name}
                                                    onChange={e => updateStudent(idx, 'name', e.target.value)}
                                                    placeholder="이름"
                                                    className="w-full bg-transparent border border-neutral-200 dark:border-neutral-700 rounded-lg px-2 py-1 font-bold text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                                />
                                            </td>
                                            <td className="p-2 text-center">
                                                <button
                                                    onClick={() => removeStudent(idx)}
                                                    className="text-neutral-400 hover:text-red-500 transition"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* 주차별 날짜 편집 */}
                    {editDates.length > 0 && (
                        <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
                            <button
                                className="w-full bg-neutral-50 dark:bg-neutral-900 px-4 py-3 flex items-center justify-between"
                                onClick={() => setShowDates(v => !v)}
                            >
                                <p className="font-bold text-sm text-neutral-700 dark:text-neutral-300">주차별 수업 날짜 ({editDates.length}주차)</p>
                                {showDates ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
                            </button>
                            {showDates && (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 p-3">
                                    {editDates.map((d, idx) => (
                                        <div key={idx} className="flex items-center gap-2 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg px-3 py-2">
                                            <span className="text-xs font-bold text-indigo-500 w-8 shrink-0">{d.week}주</span>
                                            <input
                                                type="date"
                                                value={d.date}
                                                onChange={e => updateDate(idx, 'date', e.target.value)}
                                                className="bg-transparent text-xs text-neutral-700 dark:text-neutral-300 focus:outline-none w-full"
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 적용 버튼 */}
                    {applied ? (
                        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle className="w-5 h-5 text-emerald-500" />
                            <p className="font-bold text-emerald-700 dark:text-emerald-300 text-sm">
                                ✅ {editStudents.length}명 명단과 {editDates.length}개 주차 날짜가 저장됐습니다!
                            </p>
                        </div>
                    ) : (
                        <div className="flex gap-3">
                            <button
                                onClick={() => { setResult(null); setFile(null); setPreview(null) }}
                                className="flex-1 py-3 rounded-xl font-bold text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition text-sm"
                            >
                                다시 업로드
                            </button>
                            <button
                                onClick={handleApply}
                                disabled={applying || !editStudents.length}
                                className="flex-2 flex-grow py-3 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 transition flex items-center justify-center gap-2 text-sm"
                            >
                                {applying ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> 적용 중...</>
                                ) : (
                                    <><Save className="w-4 h-4" /> {editStudents.length}명 명단 + 날짜 저장</>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
