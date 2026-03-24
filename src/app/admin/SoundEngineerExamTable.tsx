'use client'

import { useState, useCallback, useEffect } from 'react'

type ExamRow = {
    id: string
    grade_semester: string   // 학년 학기
    lesson_topic: string     // 레슨 주제
    schedule: string         // 일정
    content: string          // 내용
    examiner: string         // 담당 및 평가
    method: string           // 방법
    exam_date: string        // 시험일시
    is_inperson: string      // 대면/비대면
}

const INITIAL_ROWS: ExamRow[] = [
    {
        id: '1',
        grade_semester: '1학년 1학기',
        lesson_topic: '프로툴즈 기반 레코딩 퀄리티 / Studio 운용',
        schedule: '중간고사',
        content: '레코딩실습실과 B1 Studio의 DM2000 기반 프로툴즈 시스템 시그널 플로우 이해와 녹음을 위한 프로툴즈 기본 운용',
        examiner: '김한상',
        method: 'Google 설문지',
        exam_date: '일시 공지 예정',
        is_inperson: '비대면',
    },
    {
        id: '2',
        grade_semester: '1학년 1학기',
        lesson_topic: '프로툴즈 기반 레코딩 퀄리티 / Studio 운용',
        schedule: '기말고사',
        content: '무대음향 교재의 음향이론 (2과), 마이크 (5과), 공연장 마이크 설치 (13과) 과정',
        examiner: '안태봉',
        method: '시험지',
        exam_date: '토요일',
        is_inperson: '대면',
    },
    {
        id: '3',
        grade_semester: '1학년 2학기',
        lesson_topic: '전기(3과), 음향효과기(8과), 케이블(10과), 플러그인 기본 운용: 멜로다인/오토튠, 비트 디텍티브, 노이즈 리덕션',
        schedule: '중간고사',
        content: '프로툴즈 101 6주차 자료',
        examiner: '안태봉',
        method: 'Google 설문지',
        exam_date: '일시 공지 예정',
        is_inperson: '비대면',
    },
    {
        id: '4',
        grade_semester: '1학년 2학기',
        lesson_topic: '전기(3과), 음향효과기(8과), 케이블(10과), 플러그인 기본 운용: 멜로다인/오토튠, 비트 디텍티브, 노이즈 리덕션',
        schedule: '기말고사',
        content: '라이브 또는 스튜디오나 홈레코딩으로 녹음 한 후 음로다인을 이용하여 마치와 타임을 에디팅 한 프로툴즈 세션 Zip 압축파일과 44.1Khz, 16bit 이상의 mp3 라믹스 파일',
        examiner: '김한상, 김현부, 안태봉',
        method: 'USB 메모리로 가져와서 컴퓨터에 복사 후 평가 순서에 맞춰 발표.',
        exam_date: '토요일',
        is_inperson: '대면',
    },
    {
        id: '5',
        grade_semester: '2학년 1학기',
        lesson_topic: '프로툴즈 기반 믹싱 퀄리티',
        schedule: '중간고사',
        content: '없음',
        examiner: '없음',
        method: '없음',
        exam_date: '없음',
        is_inperson: '없음',
    },
    {
        id: '6',
        grade_semester: '2학년 1학기',
        lesson_topic: '프로툴즈 기반 믹싱 퀄리티',
        schedule: '기말고사',
        content: '라이브 또는 스튜디오나 홈레코딩으로 녹음 후 믹스하여 프로툴즈 세션 Zip 압축파일과 44.1Khz, 16bit 이상의 mp3 파일',
        examiner: '김한상, 김현부, 안태봉',
        method: 'USB 메모리로 가져와서 컴퓨터에 복사 후 평가 순서에 맞춰 발표.',
        exam_date: '토요일',
        is_inperson: '대면',
    },
    {
        id: '7',
        grade_semester: '2학년 2학기',
        lesson_topic: '졸업작품',
        schedule: '중간과제',
        content: '음악 장르별 분석 자기주도 학습',
        examiner: '김현부',
        method: '체크',
        exam_date: '일시 공지 예정',
        is_inperson: '비대면',
    },
    {
        id: '8',
        grade_semester: '2학년 2학기',
        lesson_topic: '졸업작품',
        schedule: '기말고사',
        content: '졸업작품을 녹음, 편집, 믹스, 마스터링 한 mp3 파일',
        examiner: '김한상, 김현부, 안태봉',
        method: 'USB 메모리로 가져와서 컴퓨터에 복사 후 평가 순서에 맞춰 발표.',
        exam_date: '토요일',
        is_inperson: '대면',
    },
]

const COLUMNS: { key: keyof ExamRow; label: string; width: string }[] = [
    { key: 'grade_semester', label: '학년 학기', width: 'w-24' },
    { key: 'lesson_topic', label: '레슨 주제', width: 'w-40' },
    { key: 'schedule', label: '일정', width: 'w-20' },
    { key: 'content', label: '내용', width: 'w-64' },
    { key: 'examiner', label: '담당 및 평가', width: 'w-28' },
    { key: 'method', label: '방법', width: 'w-48' },
    { key: 'exam_date', label: '시험일시', width: 'w-24' },
    { key: 'is_inperson', label: '대면/비대면', width: 'w-20' },
]

function EditableCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
        <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full min-h-[52px] resize-none bg-transparent text-xs text-neutral-800 dark:text-neutral-100 leading-snug focus:outline-none focus:ring-2 focus:ring-indigo-400/50 rounded p-1 transition-all"
            rows={3}
        />
    )
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export default function SoundEngineerExamTable() {
    const [rows, setRows] = useState<ExamRow[]>(INITIAL_ROWS)
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
    const [loading, setLoading] = useState(true)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    // Load from Google Drive on mount
    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch('/api/se-exam-table')
                if (!res.ok) throw new Error('로드 실패')
                const data = await res.json()
                if (data.rows && Array.isArray(data.rows)) {
                    setRows(data.rows)
                }
            } catch (e: any) {
                // If load fails, silently keep initial rows
                console.warn('[ExamTable] load failed, using initial data:', e.message)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [])

    const updateCell = useCallback((id: string, key: keyof ExamRow, value: string) => {
        setRows(prev => prev.map(r => r.id === id ? { ...r, [key]: value } : r))
        setSaveStatus('idle')
    }, [])

    const addRow = () => {
        const newRow: ExamRow = {
            id: Date.now().toString(),
            grade_semester: '',
            lesson_topic: '',
            schedule: '',
            content: '',
            examiner: '',
            method: '',
            exam_date: '',
            is_inperson: '',
        }
        setRows(prev => [...prev, newRow])
        setSaveStatus('idle')
    }

    const deleteRow = (id: string) => {
        setRows(prev => prev.filter(r => r.id !== id))
        setSaveStatus('idle')
    }

    const handleSave = async () => {
        setSaveStatus('saving')
        setErrorMsg(null)
        try {
            const res = await fetch('/api/se-exam-table', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rows }),
            })
            const data = await res.json()
            if (!res.ok || !data.ok) throw new Error(data.error || '저장 실패')
            setSaveStatus('saved')
            setTimeout(() => setSaveStatus('idle'), 3000)
        } catch (e: any) {
            setErrorMsg(e.message || '저장 실패')
            setSaveStatus('error')
            setTimeout(() => { setSaveStatus('idle'); setErrorMsg(null) }, 5000)
        }
    }

    return (
        <div className="rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 dark:border-neutral-800 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/10">
                <div>
                    <h3 className="text-base font-extrabold text-neutral-900 dark:text-white flex items-center gap-2">
                        🎛️ 사운드엔지니어 전공 실기 시험 계획
                    </h3>
                    <p className="text-xs text-neutral-500 mt-0.5">셀을 클릭하여 내용을 수정하고 저장하세요. <span className="text-indigo-400 font-bold">☁️ Google Drive에 자동 저장됩니다.</span></p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={addRow}
                        className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 transition"
                    >
                        ＋ 행 추가
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saveStatus === 'saving'}
                        className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition disabled:opacity-60 ${saveStatus === 'saved'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                : saveStatus === 'error'
                                    ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                    : saveStatus === 'saving'
                                        ? 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                        : 'bg-slate-900 text-white hover:bg-slate-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200'
                            }`}
                    >
                        {saveStatus === 'saving' ? '⏳ 저장 중...'
                            : saveStatus === 'saved' ? '✅ 저장됨 (Drive)'
                                : saveStatus === 'error' ? '❌ 저장 실패'
                                    : '💾 Drive에 저장'}
                    </button>
                </div>
            </div>

            {errorMsg && (
                <div className="px-6 py-2 text-xs font-bold text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-300 border-b border-red-100 dark:border-red-800/30">
                    ⚠️ {errorMsg}
                </div>
            )}

            {/* Table */}
            {loading ? (
                <div className="flex items-center justify-center py-16 text-xs text-neutral-400 font-bold animate-pulse">
                    ☁️ Google Drive에서 불러오는 중...
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm min-w-[900px]">
                        <thead>
                            <tr className="bg-neutral-50 dark:bg-neutral-950/50 border-b border-neutral-200 dark:border-neutral-700">
                                {COLUMNS.map(col => (
                                    <th key={col.key} className={`${col.width} px-3 py-2.5 text-left text-[11px] font-black text-neutral-500 uppercase tracking-wider whitespace-nowrap`}>
                                        {col.label}
                                    </th>
                                ))}
                                <th className="w-10 px-2 py-2.5" />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, idx) => {
                                const prevSemester = idx > 0 ? rows[idx - 1].grade_semester : null
                                const isNewSection = row.grade_semester !== prevSemester
                                return (
                                    <tr
                                        key={row.id}
                                        className={`border-b border-neutral-100 dark:border-neutral-800/50 align-top transition hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 ${isNewSection ? 'border-t-2 border-t-indigo-200 dark:border-t-indigo-800/50' : ''}`}
                                    >
                                        {COLUMNS.map(col => (
                                            <td key={col.key} className={`${col.width} px-2 py-2 align-top`}>
                                                <EditableCell
                                                    value={row[col.key]}
                                                    onChange={(v) => updateCell(row.id, col.key, v)}
                                                />
                                            </td>
                                        ))}
                                        <td className="px-2 py-2 align-top">
                                            <button
                                                onClick={() => deleteRow(row.id)}
                                                title="행 삭제"
                                                className="text-neutral-300 hover:text-red-500 transition p-1 rounded"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
