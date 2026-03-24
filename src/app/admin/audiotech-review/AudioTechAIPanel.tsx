'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Loader2, Sparkles, Save, Edit3, Send, CheckCircle2 } from 'lucide-react'

type AIEvalResult = {
    total_score: number
    attendance_score: number
    participation_score: number
    assignment_score: number
    overall_feedback: string
    assignment_feedbacks: { exam_type: string, feedback: string }[]
}

type Props = {
    courseId: string
    studentId: string
    studentName: string
}

export default function AudioTechAIPanel({ courseId, studentId, studentName }: Props) {
    const supabase = createClient()
    const [loading, setLoading] = useState(false)
    const [evalData, setEvalData] = useState<AIEvalResult | null>(null)
    const [recordId, setRecordId] = useState<string | null>(null)
    const [status, setStatus] = useState<'draft' | 'published'>('draft')
    
    const [instructions, setInstructions] = useState('')
    const [revising, setRevising] = useState(false)
    const [saving, setSaving] = useState(false)
    const [successMsg, setSuccessMsg] = useState('')

    // Fetch existing AI Evaluation upon mount/change
    useEffect(() => {
        async function fetchExisting() {
            setLoading(true)
            const { data, error } = await supabase
                .from('board_questions')
                .select('id, content, is_private')
                .eq('course_id', courseId)
                .eq('author_id', studentId)
                .eq('type', 'ai_eval')
                .maybeSingle()

            if (data && data.content) {
                try {
                    const parsed = JSON.parse(data.content)
                    setEvalData(parsed)
                    setRecordId(data.id)
                    setStatus(data.is_private ? 'draft' : 'published')
                } catch(e) { console.error('Parse err:', e) }
            } else {
                setEvalData(null)
                setRecordId(null)
                setStatus('draft')
            }
            setLoading(false)
        }
        fetchExisting()
    }, [courseId, studentId, supabase])

    const handleGenerate = async (isRevision = false) => {
        if (isRevision) setRevising(true)
        else setLoading(true)

        try {
            const body: any = { courseId, studentId }
            if (isRevision) {
                body.previousEvaluation = evalData
                body.instructions = instructions
            }

            const res = await fetch('/api/audio-tech/generate-ai-eval', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })

            const json = await res.json()
            if (!res.ok) throw new Error(json.error)

            setEvalData(json.evaluation)
            if (isRevision) setInstructions('')
        } catch (e: any) {
            alert(e.message)
        } finally {
            setLoading(false)
            setRevising(false)
        }
    }

    const handleSave = async (publish: boolean) => {
        if (!evalData) return
        setSaving(true)
        
        try {
            const payload = {
                course_id: courseId,
                author_id: studentId,
                type: 'ai_eval',
                title: '오디오테크놀러지 기말 종합 평가',
                content: JSON.stringify(evalData),
                is_private: !publish
            }

            if (recordId) {
                await supabase.from('board_questions').update(payload).eq('id', recordId)
            } else {
                const { data } = await supabase.from('board_questions').insert(payload).select('id').single()
                if (data) setRecordId(data.id)
            }
            
            setStatus(publish ? 'published' : 'draft')
            setSuccessMsg(publish ? '학생에게 평가서가 발송(공개)되었습니다.' : '임시 저장되었습니다.')
            setTimeout(() => setSuccessMsg(''), 3000)
        } catch (e: any) {
            alert('저장 실패: ' + e.message)
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-neutral-400">
                <Loader2 className="w-8 h-8 animate-spin text-rose-500 mb-4" />
                <p className="font-bold">AI가 학생 데이터를 분석하여 평가서를 작성 중입니다...</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-6 animate-in fade-in duration-300">
            {/* Context/Header Area */}
            <div className="flex items-center justify-between bg-neutral-900 border border-neutral-800 p-5 rounded-2xl shadow-sm">
                <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-amber-400" />
                        AI 자동 성적 평가 시스템
                    </h3>
                    <p className="text-sm text-neutral-400 mt-1">
                        {studentName} 학생의 출석, 참여, 과제물 메타데이터를 기반으로 종합 평가를 생성합니다.
                    </p>
                </div>
                {!evalData && (
                    <button
                        onClick={() => handleGenerate(false)}
                        className="bg-rose-600 hover:bg-rose-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-rose-900/20 transition-all active:scale-95"
                    >
                        <Sparkles className="w-4 h-4" />
                        AI 평가 생성하기
                    </button>
                )}
            </div>

            {successMsg && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-xl flex items-center gap-2 text-sm font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    {successMsg}
                </div>
            )}

            {evalData && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left: Score Overview */}
                    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-sm flex flex-col gap-6 h-fit">
                        <div>
                            <h4 className="text-xs font-black text-rose-400 uppercase tracking-widest mb-4">점수 집계표</h4>
                            <div className="text-center bg-neutral-950 p-6 rounded-xl border border-neutral-800 shadow-inner">
                                <p className="text-[10px] font-bold text-neutral-500 uppercase">총점 (100점 만점)</p>
                                <p className="text-5xl font-black text-white my-2">{evalData.total_score}</p>
                            </div>
                        </div>

                        <ul className="space-y-3">
                            <li className="flex justify-between items-center p-3 bg-neutral-800/50 rounded-lg">
                                <span className="text-sm font-bold text-neutral-300">출석 (30%)</span>
                                <span className="text-sm font-black text-white">{evalData.attendance_score}점</span>
                            </li>
                            <li className="flex justify-between items-center p-3 bg-neutral-800/50 rounded-lg">
                                <span className="text-sm font-bold text-neutral-300">참여 (20%)</span>
                                <span className="text-sm font-black text-white">{evalData.participation_score}점</span>
                            </li>
                            <li className="flex justify-between items-center p-3 bg-neutral-800/50 rounded-lg">
                                <span className="text-sm font-bold text-neutral-300">과제/발표 (50%)</span>
                                <span className="text-sm font-black text-white">{evalData.assignment_score}점</span>
                            </li>
                        </ul>

                        <div className="pt-4 border-t border-neutral-800 flex flex-col gap-2">
                            <button
                                onClick={() => handleSave(false)}
                                disabled={saving}
                                className="w-full bg-neutral-800 hover:bg-neutral-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                임시 저장 (학생 비공개)
                            </button>
                            <button
                                onClick={() => handleSave(true)}
                                disabled={saving}
                                className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition ${
                                    status === 'published' 
                                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/30' 
                                    : 'bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-900/30'
                                }`}
                            >
                                <Send className="w-4 h-4" />
                                {status === 'published' ? '공개 완료됨 (수정 후 재발송)' : '학생에게 평가서 발송 (선택)'}
                            </button>
                        </div>
                    </div>

                    {/* Right: Feedback content & Revision prompt */}
                    <div className="lg:col-span-2 flex flex-col gap-6">
                        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-sm">
                            <h4 className="text-xs font-black text-rose-400 uppercase tracking-widest mb-4">종합 평가서</h4>
                            <p className="text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap selection:bg-rose-500/30">
                                {evalData.overall_feedback}
                            </p>
                        </div>

                        {evalData.assignment_feedbacks?.length > 0 && (
                            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-sm">
                                <h4 className="text-xs font-black text-rose-400 uppercase tracking-widest mb-4">과제/발표별 세부 평가</h4>
                                <ul className="space-y-4">
                                    {evalData.assignment_feedbacks.map((af, i) => (
                                        <li key={i} className="flex flex-col gap-1.5 p-4 rounded-xl bg-neutral-950 border border-neutral-800">
                                            <span className="text-xs font-bold text-rose-300">{af.exam_type}</span>
                                            <span className="text-sm text-neutral-300 leading-relaxed">{af.feedback}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="bg-neutral-900 border border-neutral-700/50 rounded-2xl p-6 shadow-inner ring-1 ring-inset ring-neutral-800">
                            <h4 className="text-xs font-black text-amber-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <Edit3 className="w-4 h-4" /> AI 평가 수정 지시 (수동 개입)
                            </h4>
                            <p className="text-xs text-neutral-400 mb-4">
                                AI가 작성한 평가 내용이나 산출된 점수가 마음에 들지 않으신가요? 
                                수정해야 할 방향이나 점수 조정 지시를 적어주시면 AI가 전체 평가서를 다시 작성합니다.
                            </p>
                            <textarea
                                value={instructions}
                                onChange={e => setInstructions(e.target.value)}
                                placeholder="예: 첫 번째 과제 피드백은 너무 딱딱하니 부드럽게 수정해주고, 총점은 90점으로 높여서 다시 작성해줘."
                                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-4 text-sm text-white focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition min-h-[100px] resize-y mb-4"
                            />
                            <div className="flex justify-end">
                                <button
                                    onClick={() => handleGenerate(true)}
                                    disabled={!instructions.trim() || revising}
                                    className="bg-neutral-100 text-black hover:bg-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    {revising ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                    이 지시대로 평가서 재작성
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
