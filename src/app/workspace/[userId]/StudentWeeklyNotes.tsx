'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Loader2, Download, Lock, CheckCircle2, AlertCircle, FileText, Upload, History } from 'lucide-react'
import RichTextEditor from '@/components/Editor'
import NoteHistoryModal from '@/components/NoteHistoryModal'
import React from 'react'

export default function StudentWeeklyNotes({
    userId,
    courseId,
    targetEmail,
    isPrivateLesson = false
}: {
    userId: string
    courseId: string
    targetEmail: string
    isPrivateLesson?: boolean
}) {
    const supabase = createClient()
    const [selectedWeek, setSelectedWeek] = useState(1)
    const [noteContent, setNoteContent] = useState('')
    const [noteId, setNoteId] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
    const [isLocked, setIsLocked] = useState(false)
    const [isHistoryOpen, setIsHistoryOpen] = useState(false)

    // Private Lesson Extra Fields
    const [lessonLocation, setLessonLocation] = useState('')
    const [lessonTime, setLessonTime] = useState('')

    const noteContainerRef = useRef<HTMLDivElement>(null)
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const lastSavedContentRef = useRef<string>('')
    const isInitialLoadRef = useRef(true)

    // Reset initial load flag when context changes
    useEffect(() => {
        isInitialLoadRef.current = true
        fetchNote()
    }, [selectedWeek, courseId, userId])

    // Auto-save effect
    useEffect(() => {
        if (isInitialLoadRef.current) {
            isInitialLoadRef.current = false
            return
        }

        if (isLocked || selectedWeek === 0) return

        if (noteContent !== lastSavedContentRef.current) {
            setSaveStatus('saving')

            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current)
            }

            typingTimeoutRef.current = setTimeout(() => {
                performSave(noteContent, lessonLocation, lessonTime)
            }, 2000)
        }

        return () => {
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
        }
    }, [noteContent, lessonLocation, lessonTime, isLocked, selectedWeek])

    const fetchNote = async () => {
        setLoading(true)
        setIsLocked(false)
        setSaveStatus('idle')
        try {
            if (selectedWeek === 0) {
                // All Weeks View
                const { data, error } = await supabase
                    .from('student_notes')
                    .select('*')
                    .eq('user_id', userId)
                    .eq('course_id', courseId)
                    .order('week_number', { ascending: true })

                if (error) throw error

                if (data && data.length > 0) {
                    let stitchedContent = ''
                    data.forEach(note => {
                        stitchedContent += `<h2 style="color: #4f46e5; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; margin-top: 32px;">${note.week_number}주차 학습 노트</h2>`
                        if (isPrivateLesson && (note.lesson_location || note.lesson_time)) {
                            stitchedContent += `<p style="color: #6b7280; font-size: 14px; margin-bottom: 12px;"><strong>📍 장소:</strong> ${note.lesson_location || '-'} &nbsp;&nbsp; <strong>⏰ 시간:</strong> ${note.lesson_time || '-'}</p>`
                        }
                        stitchedContent += note.content || '<p style="color: #9ca3af; font-style: italic;">작성된 노트가 없습니다.</p>'
                    })
                    setNoteContent(stitchedContent)
                    lastSavedContentRef.current = stitchedContent
                } else {
                    setNoteContent('<p class="text-neutral-400 font-medium italic text-center py-12">작성된 주차별 노트가 전혀 없습니다.</p>')
                    lastSavedContentRef.current = ''
                }

                setIsLocked(true) // All weeks is Read-Only
                setNoteId(null)

            } else {
                // Single Week View
                const { data, error } = await supabase
                    .from('student_notes')
                    .select('*')
                    .eq('user_id', userId)
                    .eq('course_id', courseId)
                    .eq('week_number', selectedWeek)
                    .maybeSingle()

                if (error) throw error

                if (data) {
                    setNoteContent(data.content || '')
                    setNoteId(data.id)
                    setLessonLocation(data.lesson_location || '')
                    setLessonTime(data.lesson_time || '')
                    lastSavedContentRef.current = data.content || ''
                    checkLockStatus(data.created_at)
                } else {
                    setNoteContent('')
                    setNoteId(null)
                    setLessonLocation('')
                    setLessonTime('')
                    lastSavedContentRef.current = ''
                    setIsLocked(false)
                }
            }
        } catch (error) {
            console.error('Error fetching note:', error)
        } finally {
            setLoading(false)
        }
    }

    const checkLockStatus = (createdAtDateString: string) => {
        const createdAt = new Date(createdAtDateString).getTime()
        const now = Date.now()
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000

        if (now - createdAt > sevenDaysMs) {
            setIsLocked(true)
        } else {
            setIsLocked(false)
        }
    }

    const performSave = async (contentToSave: string, locToSave?: string, timeToSave?: string) => {
        setSaving(true)
        try {
            const upsertPayload: any = {
                user_id: userId,
                course_id: courseId,
                week_number: selectedWeek,
                content: contentToSave,
                updated_at: new Date().toISOString()
            }
            if (isPrivateLesson) {
                upsertPayload.lesson_location = locToSave !== undefined ? locToSave : lessonLocation;
                upsertPayload.lesson_time = timeToSave !== undefined ? timeToSave : lessonTime;
            }

            const { data, error } = await supabase
                .from('student_notes')
                .upsert(upsertPayload, { onConflict: 'user_id,course_id,week_number' })
                .select('id, created_at')
                .single()

            if (error) throw error

            setSaveStatus('success')
            lastSavedContentRef.current = contentToSave

            if (data) {
                if (!noteId) setNoteId(data.id)
                // Need to evaluate lock status silently
                const createdAt = new Date(data.created_at).getTime()
                if (Date.now() - createdAt > 7 * 24 * 60 * 60 * 1000) {
                    setIsLocked(true)
                }
            }

            setTimeout(() => { if (saveStatus !== 'saving') setSaveStatus('idle') }, 3000)
        } catch (error) {
            console.error('Error saving note:', error)
            setSaveStatus('error')
        } finally {
            setSaving(false)
        }
    }

    const handleRestoreHistory = (content: string) => {
        setNoteContent(content)
        performSave(content)
    }

    const handleExportPDF = async () => {
        if (typeof window === 'undefined' || !noteContainerRef.current) return;

        try {
            // Dynamically import to avoid SSR issues
            const html2pdf = (await import('html2pdf.js')).default;
            const element = noteContainerRef.current;

            const opt = {
                margin: 10,
                filename: `${targetEmail.split('@')[0]}_${selectedWeek === 0 ? '전체_통합' : `${selectedWeek}주차`}_노트.pdf`,
                image: { type: 'jpeg' as 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as 'portrait' }
            };

            html2pdf().set(opt).from(element).save();
        } catch (err) {
            console.error("PDF Export failed:", err)
            alert("PDF 내보내기에 실패했습니다.")
        }
    }

    return (
        <div className="rounded-3xl bg-white p-8 shadow-sm border border-neutral-200/60 dark:border-neutral-800 dark:bg-neutral-900 flex flex-col mt-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-50 text-purple-600 rounded-lg dark:bg-purple-900/30 dark:text-purple-400">
                        <FileText className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">주차별 학습 공간 (노트)</h2>
                        <p className="text-xs text-neutral-500 mt-1">입력된 노트는 7일이 경과하면 자동으로 잠금 처리됩니다.</p>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                    <select
                        value={selectedWeek}
                        onChange={(e) => setSelectedWeek(Number(e.target.value))}
                        className="rounded-xl border border-neutral-200 py-2 px-4 bg-neutral-50 text-sm font-bold focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition dark:border-neutral-700 dark:bg-neutral-800"
                    >
                        <option value={0}>전체 주차 (통합 보기)</option>
                        {[...Array(15)].map((_, i) => (
                            <option key={i + 1} value={i + 1}>{i + 1}주차</option>
                        ))}
                    </select>

                    <button
                        onClick={handleExportPDF}
                        title="PDF 내보내기"
                        className="whitespace-nowrap shrink-0 p-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl transition dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 font-bold flex items-center gap-2 text-sm"
                    >
                        <Download className="w-4 h-4" />
                        <span className="hidden sm:inline">PDF</span>
                    </button>

                    {!isLocked && selectedWeek !== 0 && (
                        <button
                            onClick={() => setIsHistoryOpen(true)}
                            title="히스토리 복구"
                            disabled={!noteId}
                            className="whitespace-nowrap shrink-0 p-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl transition dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50 font-bold flex items-center gap-2 text-sm disabled:opacity-50"
                        >
                            <History className="w-4 h-4" />
                            <span className="hidden sm:inline">복구</span>
                        </button>
                    )}
                </div>
            </div>

            {!isLocked && selectedWeek !== 0 && (
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-bold border border-emerald-100 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-400 shrink-0 whitespace-nowrap">
                    {saveStatus === 'saving' || saving ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> 자동 저장 중...</>
                    ) : saveStatus === 'error' ? (
                        <><AlertCircle className="w-4 h-4 text-red-500" /> 저장 실패</>
                    ) : (
                        <><CheckCircle2 className="w-4 h-4" /> 자동 저장됨</>
                    )}
                </div>
            )}

            {/* Private Lesson Details */}
            {isPrivateLesson && selectedWeek !== 0 && (
                <div className="flex flex-col sm:flex-row gap-4 mb-6 p-5 bg-neutral-50 dark:bg-neutral-800/50 rounded-2xl border border-neutral-200 dark:border-neutral-700">
                    <div className="flex-1">
                        <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 mb-1.5 uppercase tracking-wide">레슨 장소</label>
                        <input
                            type="text"
                            value={lessonLocation}
                            onChange={(e) => setLessonLocation(e.target.value)}
                            disabled={isLocked}
                            placeholder="예: 스튜디오 A"
                            className="w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition disabled:opacity-50"
                        />
                    </div>
                    <div className="flex-1">
                        <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 mb-1.5 uppercase tracking-wide">레슨 시간</label>
                        <input
                            type="text"
                            value={lessonTime}
                            onChange={(e) => setLessonTime(e.target.value)}
                            disabled={isLocked}
                            placeholder="예: 14:00 - 14:50"
                            className="w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition disabled:opacity-50"
                        />
                    </div>
                </div>
            )}

            {isLocked && (
                <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl text-sm font-bold flex items-center gap-2">
                    <Lock className="w-4 h-4" /> 작성 후 7일이 경과하여 수정이 불가합니다.
                </div>
            )}

            <div className={`relative border rounded-2xl ${isLocked ? 'border-amber-200 bg-amber-50/30' : 'border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 p-1'}`}>
                {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
                    </div>
                ) : (
                    <div className="h-full">
                        {isLocked ? (
                            <div
                                className="p-8 prose dark:prose-invert max-w-none bg-white min-h-[500px]"
                                dangerouslySetInnerHTML={{ __html: noteContent || '<p className="text-neutral-400 font-medium italic">작성된 노트가 없습니다.</p>' }}
                            />
                        ) : (
                            <RichTextEditor
                                placeholder="노션/페이지 스타일로 이번 주차의 학습 내용을 자유롭게 필기하세요. (사진, 링크 첨부 가능)"
                                value={noteContent} // Pass value down to editor to set initial state upon fetching
                                onChange={setNoteContent}
                            />
                        )}
                    </div>
                )}
            </div>

            {/* Hidden container specifically formatted for PDF Export */}
            <div className="hidden">
                <div ref={noteContainerRef} className="p-10 bg-white text-black" style={{ width: '800px' }}>
                    <div className="border-b-2 border-black pb-4 mb-6">
                        <h1 className="text-3xl font-black">{selectedWeek === 0 ? '전체 주차 (통합)' : `${selectedWeek}주차`} 학습 노트</h1>
                        <p className="text-gray-500 mt-2 font-medium">학생: {targetEmail.split('@')[0]}</p>
                    </div>
                    <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: noteContent || '<p>작성된 노트가 없습니다.</p>' }} />
                </div>
            </div>

            {/* Note History Recovery Modal */}
            <NoteHistoryModal
                isOpen={isHistoryOpen}
                onClose={() => setIsHistoryOpen(false)}
                noteId={noteId}
                onRestore={handleRestoreHistory}
            />
        </div>
    )
}
