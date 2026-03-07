'use client'
import LogoutButton from '@/app/components/LogoutButton'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronUp, Save, CheckCircle2, AlertCircle, FileText, Upload, CalendarCheck, BookOpen, MessagesSquare, Users, Image as ImageIcon, Music, Youtube, Download, User, Volume2, VolumeX, Star } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useRouter } from 'next/navigation'
import PdfGenerator from './PdfGenerator'
import ChatRoom from '@/components/ChatRoom'

export default function RecordingDashboardClient({
    user,
    course,
    attendances,
    productionLogs,
    examSubmissions,
    evaluation,
    isRealAdmin,
    viewMode
}: {
    user: any, course: any, attendances: any[], productionLogs: any[], examSubmissions: any[], evaluation: any, isRealAdmin: boolean, viewMode: string
}) {
    const router = useRouter()
    const [selectedWeek, setSelectedWeek] = useState<number>(1)
    const [expandedGuide, setExpandedGuide] = useState(false)
    const [saving, setSaving] = useState(false)
    const [savingProfile, setSavingProfile] = useState(false)
    const [isSpeaking, setIsSpeaking] = useState(false)
    const [activeTab, setActiveTab] = useState<'log' | 'chat'>('log')

    const speakTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    // Cleanup speech synthesis on unmount
    useEffect(() => {
        return () => {
            if (speakTimeoutRef.current) clearTimeout(speakTimeoutRef.current)
            if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                window.speechSynthesis.cancel()
            }
        }
    }, [])

    const toggleSpeech = (e: React.MouseEvent) => {
        e.stopPropagation() // Prevent accordion toggle

        if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
            alert('이 브라우저는 음성 읽기 기능을 지원하지 않습니다.')
            return
        }

        if (isSpeaking) {
            window.speechSynthesis.cancel()
            if (speakTimeoutRef.current) clearTimeout(speakTimeoutRef.current)
            setIsSpeaking(false)
        } else {
            setIsSpeaking(true)

            const lines = course.operation_guide.split('\n')
            let currentLineIndex = 0

            const speakNextLine = () => {
                if (!window.speechSynthesis) return

                while (currentLineIndex < lines.length) {
                    const line = lines[currentLineIndex]
                    currentLineIndex++

                    const isHeadingOrList = /^[#*\-\d]/.test(line.trim())

                    const cleanText = line
                        .replace(/#+\s/g, '') // headers
                        .replace(/(\*\*|__)(.*?)\1/g, '$2') // bold
                        .replace(/(\*|_)(.*?)\1/g, '$2') // italic
                        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1') // links
                        .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '') // images
                        .replace(/`{1,3}[^`\n]*`{1,3}/g, '') // inline code
                        .replace(/^\s*[-*+]\s+/gm, '') // unordered lists
                        .replace(/^\s*\d+\.\s+/gm, '') // ordered lists
                        .replace(/^\s*>+\s+/gm, '') // blockquotes
                        .replace(/---+/g, '') // horizontal rules
                        .trim()

                    if (cleanText) {
                        const utterance = new SpeechSynthesisUtterance(cleanText)
                        utterance.lang = 'ko-KR'
                        utterance.rate = 0.85 // Slower rate
                        utterance.pitch = 0.6 // Lower pitch

                        utterance.onend = () => {
                            if (isHeadingOrList) {
                                speakTimeoutRef.current = setTimeout(() => {
                                    speakNextLine()
                                }, 400) // 400ms pause
                            } else {
                                speakNextLine()
                            }
                        }

                        utterance.onerror = (event) => {
                            if (event.error !== 'canceled') {
                                setIsSpeaking(false)
                            }
                        }

                        window.speechSynthesis.speak(utterance)
                        return // Exit loop, wait for onend
                    }
                }

                // If we reach here, we're done
                setIsSpeaking(false)
            }

            speakNextLine()
        }
    }

    // Current specific week data
    const weekAttendance = attendances.find(a => a.week_number === selectedWeek) || { status: '', reason_text: '' }
    const weekLog = productionLogs.find(p => p.week_number === selectedWeek) || { last_week_done: '', this_week_plan: '', progress_percent: 0 }

    const [formLog, setFormLog] = useState({ ...weekLog })
    const [formAtt, setFormAtt] = useState({ ...weekAttendance })

    // Profile form state
    const [formProfile, setFormProfile] = useState({
        full_name: user.full_name || '',
        student_id: user.student_id || '',
        major: user.major || '',
        phone: user.phone || '',
        email: user.email || '',
        profile_image_url: user.profile_image_url || null,
        class_goal: user.class_goal || '',
        introduction: user.introduction || ''
    })

    // Change week
    const handleWeekChange = (w: number) => {
        const att = attendances.find(a => a.week_number === w) || { status: '', reason_text: '' }
        const log = productionLogs.find(p => p.week_number === w) || { last_week_done: '', this_week_plan: '', progress_percent: 0 }
        setFormLog(log)
        setFormAtt(att)
        setSelectedWeek(w)
    }

    const saveProfileData = async () => {
        setSavingProfile(true)
        try {
            const res = await fetch('/api/recording-class/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formProfile)
            })
            if (!res.ok) throw new Error('프로필 저장 실패')
            alert('프로필이 성공적으로 저장되었습니다.')
            router.refresh()
        } catch (error: any) {
            alert(error.message)
        } finally {
            setSavingProfile(false)
        }
    }

    const saveWeekData = async () => {
        setSaving(true)
        try {
            // Save Log
            await fetch('/api/recording-class/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    course_id: course.id,
                    week_number: selectedWeek,
                    last_week_done: formLog.last_week_done,
                    this_week_plan: formLog.this_week_plan,
                    progress_percent: formLog.progress_percent
                })
            })

            // Save Attendance (if attendance is officially open or if modifying previously saved excuse)
            // Even if closed, allowing them to upload excuse text might be needed, but strictly we can check course.is_attendance_open.
            if (formAtt.status) {
                await fetch('/api/recording-class/attendance', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        course_id: course.id,
                        week_number: selectedWeek,
                        status: formAtt.status,
                        reason_text: formAtt.reason_text
                    })
                })
            }

            alert('저장되었습니다.')
            router.refresh()
        } catch (e: any) {
            alert('저장 실패: ' + e.message)
        } finally {
            setSaving(false)
        }
    }

    // Midterm/Final Submissions
    const midterm = examSubmissions.find(e => e.exam_type === '중간고사')
    const finalProject = examSubmissions.find(e => e.exam_type === '기말작품')

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-8 font-sans">
            <div className="mx-auto max-w-6xl space-y-8">
                {/* Header */}
                <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between rounded-3xl bg-white p-8 shadow-sm dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-black tracking-widest uppercase dark:bg-indigo-900/50 dark:text-indigo-400">
                                {course.university_name || '대학명 미지정'}
                            </span>
                            <span className="text-sm font-bold text-slate-500">담당교수: {course.professor_name || '미설정'}</span>
                        </div>
                        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{course.name}</h1>
                        <p className="text-sm text-slate-500 mt-2 font-medium">
                            환영합니다, {user.email} 님
                        </p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 mt-6 sm:mt-0">
                        {isRealAdmin && (
                            <Link href="/?view=admin" className="px-5 py-2.5 text-sm font-bold bg-indigo-600 text-white rounded-xl shadow-sm hover:bg-indigo-700 transition w-full sm:w-auto justify-center flex">
                                Admin View
                            </Link>
                        )}
                        <LogoutButton className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition" />
                    </div>
                </header>

                {/* Profile Form */}
                {viewMode === 'student' && (
                    <div className="bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/20 dark:to-slate-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-indigo-100 dark:border-indigo-900/50 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-5">
                            <User className="w-32 h-32" />
                        </div>
                        <div className="relative z-10">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
                                <User className="w-6 h-6 text-indigo-500" /> 나의 프로필 정보 (내 페이지)
                            </h3>
                            <p className="text-sm text-slate-500 mb-6 font-medium">
                                자신의 이름, 학번, 전공, 연락처를 확인하고 수정할 수 있습니다.
                            </p>

                            <div className="flex flex-col sm:flex-row gap-6 mb-6">
                                {/* Profile Image Upload Area */}
                                <div className="flex-shrink-0 flex flex-col items-center">
                                    <div className="relative w-28 h-28 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 flex items-center justify-center group">
                                        {formProfile.profile_image_url ? (
                                            <img src={formProfile.profile_image_url} alt="Profile" className="w-full h-full object-cover" />
                                        ) : (
                                            <User className="w-10 h-10 text-slate-400" />
                                        )}
                                        <label className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center cursor-pointer transition">
                                            <Upload className="w-6 h-6 text-white" />
                                            <input
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0]
                                                    if (!file) return
                                                    const reader = new FileReader()
                                                    reader.onload = (event) => {
                                                        const img = new window.Image()
                                                        img.onload = () => {
                                                            const canvas = document.createElement('canvas')
                                                            const maxSize = 300
                                                            let width = img.width
                                                            let height = img.height
                                                            if (width > height) {
                                                                if (width > maxSize) {
                                                                    height = Math.round((height * maxSize) / width)
                                                                    width = maxSize
                                                                }
                                                            } else {
                                                                if (height > maxSize) {
                                                                    width = Math.round((width * maxSize) / height)
                                                                    height = maxSize
                                                                }
                                                            }
                                                            canvas.width = width
                                                            canvas.height = height
                                                            const ctx = canvas.getContext('2d')
                                                            ctx?.drawImage(img, 0, 0, width, height)
                                                            const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
                                                            setFormProfile(prev => ({ ...prev, profile_image_url: dataUrl }))
                                                        }
                                                        img.src = event.target?.result as string
                                                    }
                                                    reader.readAsDataURL(file)
                                                }}
                                            />
                                        </label>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-2 font-medium text-center">클릭하여 사진 변경</p>
                                </div>

                                {/* Form Fields */}
                                <div className="flex-grow grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1.5">이름 (Name)</label>
                                        <input
                                            type="text"
                                            value={formProfile.full_name}
                                            onChange={e => setFormProfile({ ...formProfile, full_name: e.target.value })}
                                            className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1.5">학번 (Student ID)</label>
                                        <input
                                            type="text"
                                            value={formProfile.student_id}
                                            readOnly
                                            className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-500 text-sm outline-none cursor-not-allowed"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1.5">전공/악기 (Major)</label>
                                        <input
                                            type="text"
                                            value={formProfile.major}
                                            onChange={e => setFormProfile({ ...formProfile, major: e.target.value })}
                                            className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1.5">전화번호 (Phone)</label>
                                        <input
                                            type="text"
                                            value={formProfile.phone}
                                            onChange={e => setFormProfile({ ...formProfile, phone: e.target.value })}
                                            className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-bold text-slate-500 mb-1.5">이메일 (Email)</label>
                                        <input
                                            type="email"
                                            value={formProfile.email}
                                            readOnly
                                            className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-500 text-sm outline-none cursor-not-allowed"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Evaluation Scores Display */}
                            <div className="mt-8 border-t border-slate-100 dark:border-slate-800 pt-6">
                                <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-indigo-500" /> 종합 성적 (Evaluation Scores)
                                </h3>

                                {evaluation ? (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                                        <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700/50 text-center">
                                            <div className="text-xs text-slate-500 font-medium mb-1">중간 (Mid)</div>
                                            <div className="text-lg font-bold text-slate-800 dark:text-white">{evaluation.midterm_score || 0}</div>
                                        </div>
                                        <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700/50 text-center">
                                            <div className="text-xs text-slate-500 font-medium mb-1">수시 (Susi)</div>
                                            <div className="text-lg font-bold text-slate-800 dark:text-white">{evaluation.susi_score || 0}</div>
                                        </div>
                                        <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700/50 text-center">
                                            <div className="text-xs text-slate-500 font-medium mb-1">과제 (Task)</div>
                                            <div className="text-lg font-bold text-slate-800 dark:text-white">{evaluation.assignment_score || 0}</div>
                                        </div>
                                        <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700/50 text-center">
                                            <div className="text-xs text-slate-500 font-medium mb-1">기말 (Final)</div>
                                            <div className="text-lg font-bold text-slate-800 dark:text-white">{evaluation.final_score || 0}</div>
                                        </div>
                                        <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-xl border border-indigo-100 dark:border-indigo-800/30 text-center">
                                            <div className="text-xs text-indigo-600 dark:text-indigo-400 font-bold mb-1">총점 (Total)</div>
                                            <div className="text-xl font-black text-indigo-700 dark:text-indigo-300">{evaluation.total_score || 0}</div>
                                        </div>
                                        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-3 rounded-xl text-center shadow-sm">
                                            <div className="text-xs text-white/90 font-medium mb-1">최종 등급</div>
                                            <div className="text-xl font-black text-white">{evaluation.final_grade || '-'}</div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-sm text-slate-500 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl text-center">
                                        아직 산출된 성적 데이터가 없습니다.
                                    </div>
                                )}
                            </div>

                            {/* Additional Profile Fields (Goal & Intro) */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1.5">이 수업을 통해 하고 싶은 목표</label>
                                    <textarea
                                        value={formProfile.class_goal}
                                        onChange={e => setFormProfile({ ...formProfile, class_goal: e.target.value })}
                                        className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm outline-none focus:border-indigo-500 min-h-[100px] resize-none"
                                        placeholder="예) 자신만의 믹싱 노하우를 쌓고 싶습니다. 홈레코딩 장비를 제대로 다뤄보고 싶습니다."
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1.5">간략한 자기소개</label>
                                    <textarea
                                        value={formProfile.introduction}
                                        onChange={e => setFormProfile({ ...formProfile, introduction: e.target.value })}
                                        className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm outline-none focus:border-indigo-500 min-h-[100px] resize-none"
                                        placeholder="예) 평소에 밴드 음악을 즐겨 듣고, 작곡에 관심이 많습니다. 잘 부탁드립니다!"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end border-t border-slate-100 dark:border-slate-800 pt-4 mt-6">
                                <button
                                    onClick={saveProfileData}
                                    disabled={savingProfile}
                                    className="px-6 py-2.5 bg-indigo-600 font-bold text-white text-sm rounded-xl hover:bg-indigo-700 transition flex items-center gap-2 disabled:opacity-50"
                                >
                                    <Save className="w-4 h-4" /> {savingProfile ? '저장 중...' : '프로필 저장'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Course Guide Accordion */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
                    <div
                        onClick={() => setExpandedGuide(!expandedGuide)}
                        className="w-full flex items-center justify-between text-left font-bold text-lg text-slate-900 dark:text-white cursor-pointer"
                    >
                        <span className="flex items-center gap-2">
                            <BookOpen className="w-5 h-5 text-indigo-500" /> 수업 운영 방식 및 가이드
                            <button
                                onClick={toggleSpeech}
                                className={`ml-2 p-1.5 rounded-full transition-colors flex items-center justify-center ${isSpeaking ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400' : 'hover:bg-slate-100 text-slate-400 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300'}`}
                                title={isSpeaking ? "읽기 중지" : "음성으로 듣기"}
                            >
                                {isSpeaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                            </button>
                        </span>
                        {expandedGuide ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                    {expandedGuide && (
                        <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 prose prose-slate dark:prose-invert max-w-none prose-sm sm:prose-base">
                            <ReactMarkdown>{course.operation_guide}</ReactMarkdown>
                        </div>
                    )}
                </div>

                <div className="flex bg-white dark:bg-slate-900 p-1 rounded-2xl w-fit shadow-sm border border-slate-200 dark:border-slate-800">
                    <button
                        onClick={() => setActiveTab('log')}
                        className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'log' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                        <FileText className="w-4 h-4" /> 일지 및 출석
                    </button>
                    <button
                        onClick={() => setActiveTab('chat')}
                        className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'chat' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                        <MessagesSquare className="w-4 h-4" /> 대화창 {activeTab !== 'chat' && <span className="flex h-2 w-2 rounded-full bg-red-500"></span>}
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left: Weekly Logs & Attendance OR Chat */}
                    <div className="lg:col-span-2 space-y-6">
                        {activeTab === 'log' ? (
                            <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-sm border border-slate-200 dark:border-slate-800">
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                                    <FileText className="w-6 h-6 text-indigo-500" /> 주차별 역량 기록 및 출석
                                </h2>

                                {/* Week Selector */}
                                <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide mb-6">
                                    {Array.from({ length: 15 }, (_, i) => i + 1).map(w => (
                                        <button
                                            key={w}
                                            onClick={() => handleWeekChange(w)}
                                            className={`flex-shrink-0 w-12 h-12 rounded-2xl font-bold transition-all flex items-center justify-center border ${selectedWeek === w
                                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-indigo-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                                                }`}
                                        >
                                            {w}
                                        </button>
                                    ))}
                                </div>

                                <div className="space-y-8 bg-slate-50 dark:bg-slate-950 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-inner">
                                    <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                                        <h3 className="text-lg font-black text-slate-900 dark:text-white">WEEK {selectedWeek}</h3>
                                        <span className="text-xs font-bold text-slate-400 bg-slate-200 dark:bg-slate-800 px-3 py-1 rounded-full uppercase tracking-wider">
                                            기록 중
                                        </span>
                                    </div>

                                    {/* Attendance */}
                                    <div className="space-y-4">
                                        <h4 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                            <CalendarCheck className="w-5 h-5 text-emerald-500" /> 셀프 출석 체크
                                        </h4>
                                        {course.is_attendance_open || formAtt.status ? (
                                            <div className="space-y-4 max-w-xl">
                                                <div className="flex gap-2 flex-wrap">
                                                    {['출석', '지각', '결석', '병출석', '사유출석'].map(s => (
                                                        <button
                                                            key={s} onClick={() => course.is_attendance_open && setFormAtt({ ...formAtt, status: s })}
                                                            disabled={!course.is_attendance_open && formAtt.status !== s}
                                                            className={`px-4 py-2 text-sm font-bold border rounded-xl transition ${formAtt.status === s
                                                                ? s === '출석' ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                                                                    : s === '결석' ? 'bg-red-500 text-white border-red-500 shadow-sm'
                                                                        : 'bg-orange-500 text-white border-orange-500 shadow-sm'
                                                                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 disabled:opacity-50'}`}
                                                        >
                                                            {s}
                                                        </button>
                                                    ))}
                                                </div>
                                                {(!course.is_attendance_open && !formAtt.status) && (
                                                    <p className="text-xs text-red-500 font-bold">* 현재 교수님이 출석체크를 닫아두었습니다.</p>
                                                )}
                                                {(formAtt.status === '병출석' || formAtt.status === '사유출석') && (
                                                    <div className="animate-in fade-in slide-in-from-top-2">
                                                        <textarea
                                                            value={formAtt.reason_text}
                                                            onChange={e => setFormAtt({ ...formAtt, reason_text: e.target.value })}
                                                            placeholder="사유를 상세히 적어주세요. 병원 진단서 등은 파일 링크나 스크린샷 텍스트 정보로 남길 수 있습니다."
                                                            className="w-full mt-2 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                                            rows={3}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="p-4 bg-slate-100 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-500 font-medium">
                                                현재 수업 출석 시간이 아닙니다. 교수님이 출석을 열어주시면 버튼이 활성화됩니다.
                                            </div>
                                        )}
                                    </div>

                                    {/* Production Log */}
                                    <div className="space-y-5">
                                        <h4 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                            <Music className="w-5 h-5 text-blue-500" /> 주간 창작 & 제작 일지
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">지난주 작업 완료 내용</label>
                                                <textarea
                                                    value={formLog.last_week_done || ''}
                                                    onChange={e => setFormLog({ ...formLog, last_week_done: e.target.value })}
                                                    className="w-full p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 outline-none h-32 resize-none"
                                                    placeholder="예) 코드 스케치 완성, 가녹음 1절 완료 등"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">이번주 작업 계획 및 향후 스케줄</label>
                                                <textarea
                                                    value={formLog.this_week_plan || ''}
                                                    onChange={e => setFormLog({ ...formLog, this_week_plan: e.target.value })}
                                                    className="w-full p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 outline-none h-32 resize-none"
                                                    placeholder="예) 스튜디오 예약 후 드럼 녹음 진행, 편곡 수정 등"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <div className="flex justify-between items-center mb-2">
                                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400">곡 완성 진척도 (Progress)</label>
                                                <span className="text-sm font-black text-blue-600">{formLog.progress_percent || 0}%</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0" max="100" step="5"
                                                value={formLog.progress_percent || 0}
                                                onChange={e => setFormLog({ ...formLog, progress_percent: parseInt(e.target.value) })}
                                                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700 accent-blue-600"
                                            />
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
                                        <button
                                            onClick={saveWeekData}
                                            disabled={saving}
                                            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition disabled:opacity-50"
                                        >
                                            <Save className="w-5 h-5" /> {saving ? '저장 중...' : '이번 주 기록 저장'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <ChatRoom courseId={course.id} userId={user.id} isAdmin={isRealAdmin || user.role === 'admin'} />
                        )}
                    </div>

                    {/* Right: Submissions & Quick Links */}
                    <div className="space-y-6">
                        {/* Final Project Upload */}
                        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-orange-100 text-orange-600 rounded-lg dark:bg-orange-900/30">
                                    <Youtube className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white">기말 작품 제출</h3>
                            </div>
                            <p className="text-sm text-slate-500 mb-6 leading-relaxed">자작곡 발매 음원 링크, 뮤직비디오 유튜브 링크, 음원 파일 등을 기말 평가용으로 제출합니다.</p>

                            {finalProject ? (
                                <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                                        <div>
                                            <p className="font-bold text-emerald-900 dark:text-emerald-400">제출 완료</p>
                                            <p className="text-xs text-emerald-600/70 truncate w-32">{finalProject.file_name || '링크 제출됨'}</p>
                                        </div>
                                    </div>
                                    <Link href={`/workspace/${user.id}/exam?course=${course.id}&type=final`} className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-lg hover:bg-emerald-200 transition">관리/조회</Link>
                                </div>
                            ) : (
                                <Link href={`/workspace/${user.id}/exam?course=${course.id}&type=final`} className="block w-full text-center py-4 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/10 transition text-sm font-bold text-slate-600 dark:text-slate-400 hover:text-orange-600">
                                    작품 제출하러 가기
                                </Link>
                            )}
                        </div>

                        {/* Midterm Upload */}
                        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-pink-100 text-pink-600 rounded-lg dark:bg-pink-900/30">
                                    <ImageIcon className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white">중간고사 필기 제출</h3>
                            </div>
                            <p className="text-sm text-slate-500 mb-4">평가 완료한 음향학 필기시험지를 스캔하거나 사진으로 찍어 제출하세요.</p>
                            {midterm ? (
                                <div className="flex items-center justify-between">
                                    <div className="text-sm font-bold text-emerald-600 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> 제출됨</div>
                                    <Link href={`/workspace/${user.id}/exam?course=${course.id}&type=midterm`} className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-lg hover:bg-emerald-200 transition">관리/조회</Link>
                                </div>
                            ) : (
                                <Link href={`/workspace/${user.id}/exam?course=${course.id}&type=midterm`} className="text-sm font-bold text-indigo-600 flex items-center gap-1 hover:underline"><Upload className="w-4 h-4" /> 사진 업로드하기</Link>
                            )}
                        </div>

                        {/* PDF Generation Auto */}
                        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white">수시/과제 자동제출</h3>
                            </div>
                            <p className="text-sm text-slate-500 mb-4 leading-relaxed">평소 작성해둔 주차별 제작 일지를 취합하여 한 장의 PDF 요약본 수시와 전체 내용 과제를 자동 생성하여 제출합니다.</p>

                            {examSubmissions.find(s => s.exam_type === '수시과제PDF') ? (
                                <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-2xl flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <CheckCircle2 className="w-6 h-6 text-blue-500" />
                                        <div>
                                            <p className="font-bold text-blue-900 dark:text-blue-400">PDF 제출 완료</p>
                                            <a href={examSubmissions.find(s => s.exam_type === '수시과제PDF')?.file_url} target="_blank" className="text-xs text-blue-600 hover:underline">업로드된 파일 보기</a>
                                        </div>
                                    </div>
                                    {isRealAdmin && (
                                        <Link href={`/workspace/${user.id}/exam?course=${course.id}&type=pdf`} className="text-xs font-bold text-blue-700 bg-blue-100 px-3 py-1.5 rounded-lg hover:bg-blue-200 transition">관리/조회</Link>
                                    )}
                                </div>
                            ) : (
                                <PdfGenerator
                                    user={user}
                                    course={course}
                                    logs={productionLogs}
                                    attendances={attendances}
                                    onUploadComplete={() => router.refresh()}
                                />
                            )}
                        </div>

                        {/* LMS Quick Links */}
                        <div className="grid grid-cols-2 gap-4">
                            <Link href={`/recording-class/gallery?course=${course.id}`} className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center justify-center gap-3 hover:border-amber-500 group transition">
                                <Star className="w-6 h-6 text-amber-500 fill-amber-500 group-hover:scale-110 transition" />
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-300 group-hover:text-amber-600">상호 평가 갤러리</span>
                            </Link>
                            <Link href="/board" className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center justify-center gap-3 hover:border-emerald-500 group transition">
                                <MessagesSquare className="w-6 h-6 text-emerald-500 group-hover:scale-110 transition" />
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-300 group-hover:text-emerald-600">익명 Q&A / 건의</span>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
