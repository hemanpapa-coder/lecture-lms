'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Save, Loader2, Edit3, Settings, ShieldAlert } from 'lucide-react'

export interface Question {
    id: number;
    text: string;
    options: string[];
    answerIndex: number;
}

export default function AdminCourseExamManager({ courseId }: { courseId: string }) {
    const [questions, setQuestions] = useState<Question[]>([])
    const [isMidtermOpen, setIsMidtermOpen] = useState(false)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)

    useEffect(() => {
        if (isExpanded && questions.length === 0) {
            fetchQuestions()
        }
    }, [isExpanded])

    const fetchQuestions = async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/exam/questions?courseId=${courseId}`)
            const data = await res.json()
            if (data.questions) {
                setQuestions(data.questions)
            }
            if (data.isMidtermOpen !== undefined) {
                setIsMidtermOpen(data.isMidtermOpen)
            }
        } catch (e) {
            console.error("Failed to load questions", e)
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            const res = await fetch('/api/exam/questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ courseId, questions, isMidtermOpen })
            })
            if (!res.ok) throw new Error("저장 실패")
            alert("객관식 문제가 성공적으로 저장되었습니다.")
        } catch (e: any) {
            alert(e.message)
        } finally {
            setSaving(false)
        }
    }

    const addQuestion = () => {
        setQuestions([...questions, {
            id: questions.length + 1,
            text: "새로운 문제입니다.",
            options: ["보기 1", "보기 2", "보기 3", "보기 4"],
            answerIndex: 0
        }])
    }

    const removeQuestion = (idx: number) => {
        if (!confirm('문제를 삭제하시겠습니까?')) return;
        const newQ = [...questions]
        newQ.splice(idx, 1)
        // 재정렬
        setQuestions(newQ.map((q, i) => ({ ...q, id: i + 1 })))
    }

    const updateQuestion = (idx: number, field: keyof Question, value: any) => {
        const newQ = [...questions]
        newQ[idx] = { ...newQ[idx], [field]: value }
        setQuestions(newQ)
    }

    const updateOption = (qIdx: number, oIdx: number, value: string) => {
        const newQ = [...questions]
        newQ[qIdx].options[oIdx] = value
        setQuestions(newQ)
    }

    return (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-6 shadow-sm mb-6 flex flex-col space-y-4">
            <div 
                className="flex justify-between items-center cursor-pointer group"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-pink-50 text-pink-600 rounded-lg dark:bg-pink-900/30 dark:text-pink-400">
                        <Settings className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-neutral-900 dark:text-white">객관식 시험 문제 관리 (MCQ)</h3>
                        <p className="text-xs text-neutral-500 mt-1">학생들의 스마트폰 중간고사용 객관식 문제를 출제하고 관리합니다.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 text-[10px] text-red-500 font-bold bg-red-50 px-2 py-1 rounded">
                        <ShieldAlert className="w-3 h-3" /> 부정행위 차단 연동
                    </div>
                </div>
            </div>

            {isExpanded && (
                <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 space-y-6 animate-in fade-in slide-in-from-top-2">
                    {loading ? (
                        <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-neutral-400" /></div>
                    ) : (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800">
                                <div>
                                    <h4 className="font-bold text-indigo-900 dark:text-indigo-200">중간고사 응시 오픈</h4>
                                    <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">학생들이 중간고사에 응시할 수 있도록 버튼을 다이얼로그나 대시보드에서 활성화합니다.</p>
                                </div>
                                <button
                                    onClick={() => setIsMidtermOpen(!isMidtermOpen)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                        isMidtermOpen ? 'bg-indigo-600' : 'bg-neutral-300 dark:bg-neutral-600'
                                    }`}
                                >
                                    <span className={`inline-block w-4 h-4 transform rounded-full bg-white transition-transform ${isMidtermOpen ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>

                            {questions.map((q, qIdx) => (
                                <div key={qIdx} className="p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-2xl border border-neutral-200 dark:border-neutral-700 relative">
                                    <div className="flex justify-between mb-3">
                                        <div className="font-bold flex items-center gap-2">
                                            <span className="bg-pink-100 text-pink-700 text-xs px-2 py-1 rounded">Q {q.id}</span>
                                        </div>
                                        <button onClick={() => removeQuestion(qIdx)} className="text-red-400 hover:text-red-600 transition">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <textarea 
                                        value={q.text} 
                                        onChange={e => updateQuestion(qIdx, 'text', e.target.value)}
                                        className="w-full p-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm font-bold resize-none mb-3 outline-none focus:border-pink-400"
                                        rows={2}
                                        placeholder="질문을 입력하세요"
                                    />
                                    <div className="space-y-2">
                                        {q.options.map((opt, oIdx) => (
                                            <div key={oIdx} className="flex items-center gap-2">
                                                <input 
                                                    type="radio" 
                                                    name={`q-${qIdx}-answer`}
                                                    checked={q.answerIndex === oIdx}
                                                    onChange={() => updateQuestion(qIdx, 'answerIndex', oIdx)}
                                                    className="w-4 h-4 accent-pink-500 cursor-pointer"
                                                />
                                                <input 
                                                    type="text"
                                                    value={opt}
                                                    onChange={e => updateOption(qIdx, oIdx, e.target.value)}
                                                    className={`w-full p-2 rounded-lg border text-sm outline-none transition ${q.answerIndex === oIdx ? 'border-pink-300 bg-pink-50 text-pink-900 dark:bg-pink-900/30 dark:text-pink-100 dark:border-pink-800' : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-200'}`}
                                                    placeholder={`보기 ${oIdx + 1}`}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}

                            <button 
                                onClick={addQuestion}
                                className="w-full py-4 rounded-2xl border-2 border-dashed border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:border-pink-400 hover:text-pink-600 hover:bg-pink-50 dark:hover:bg-neutral-800 transition font-bold"
                            >
                                + 새로운 문제 추가
                            </button>
                            
                            <div className="flex justify-end pt-4">
                                <button 
                                    onClick={handleSave} 
                                    disabled={saving}
                                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold shadow-md transition disabled:opacity-50"
                                >
                                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                    저장하기
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
