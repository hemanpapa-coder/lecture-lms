'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { User, BookOpen, GraduationCap, Phone, Building2, Hash } from 'lucide-react'

type Course = {
    id: string
    name: string
    description: string
}

export default function ProfileSetupPage() {
    const router = useRouter()
    const supabase = createClient()

    const [courses, setCourses] = useState<Course[]>([])
    const [loading, setLoading] = useState(false)
    const [step, setStep] = useState<'profile' | 'course'>('profile')

    const [form, setForm] = useState({
        name: '',
        department: '',
        student_id: '',
        grade: '1',
        phone: '',
        major: '',
        course_id: '',
    })

    useEffect(() => {
        const fetchCourses = async () => {
            const { data } = await supabase.from('courses').select('id, name, description').order('name')
            if (data) setCourses(data)
        }
        fetchCourses()
    }, [])

    const handleProfileSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.name.trim()) return alert('이름을 입력해 주세요.')
        if (!form.department.trim()) return alert('학부/학과를 입력해 주세요.')
        if (!form.student_id.trim()) return alert('학번을 입력해 주세요.')
        setStep('course')
    }

    const handleCourseSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.course_id) return alert('수강 신청할 과목을 선택해 주세요.')

        setLoading(true)
        try {
            const res = await fetch('/api/profile-setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: form.name,
                    department: form.department,
                    student_id: form.student_id,
                    grade: form.grade,
                    phone: form.phone,
                    major: form.major,
                    course_id: form.course_id,
                }),
            })

            const data = await res.json()
            if (!res.ok) {
                alert(data.error || '저장에 실패했습니다.')
                setLoading(false)
                return
            }

            router.push('/')
            router.refresh()
        } catch (err) {
            alert('오류가 발생했습니다.')
            setLoading(false)
        }
    }

    const courseColors = [
        'from-indigo-500 to-blue-600',
        'from-purple-500 to-pink-600',
        'from-emerald-500 to-teal-600',
        'from-orange-500 to-amber-600',
    ]

    return (
        <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6">
            <div className="w-full max-w-lg">

                {/* Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-500/20 rounded-2xl border border-indigo-500/30 mb-4">
                        {step === 'profile'
                            ? <User className="w-8 h-8 text-indigo-400" />
                            : <BookOpen className="w-8 h-8 text-indigo-400" />}
                    </div>
                    <h1 className="text-3xl font-black text-white">
                        {step === 'profile' ? '프로필 입력' : '수강 신청'}
                    </h1>
                    <p className="text-neutral-400 mt-2 text-sm">
                        {step === 'profile'
                            ? '정보를 입력하면 교수님이 확인 후 수업에 참여할 수 있습니다.'
                            : '수강할 과목을 선택해 주세요. 교수님이 확인 후 승인합니다.'}
                    </p>

                    {/* Step Indicator */}
                    <div className="flex items-center justify-center gap-2 mt-5">
                        <div className={`h-2 w-16 rounded-full transition-all ${step === 'profile' ? 'bg-indigo-500' : 'bg-indigo-500'}`} />
                        <div className={`h-2 w-16 rounded-full transition-all ${step === 'course' ? 'bg-indigo-500' : 'bg-neutral-800'}`} />
                    </div>
                </div>

                {/* Step 1: Profile Form */}
                {step === 'profile' && (
                    <form onSubmit={handleProfileSubmit} className="bg-neutral-900 rounded-3xl p-8 border border-neutral-800 space-y-5">
                        <div>
                            <label className="block text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">
                                이름 *
                            </label>
                            <div className="flex items-center gap-3 bg-neutral-800 rounded-xl px-4 py-3 border border-neutral-700 focus-within:border-indigo-500 transition">
                                <User className="w-4 h-4 text-neutral-500 shrink-0" />
                                <input
                                    type="text"
                                    placeholder="홍길동"
                                    value={form.name}
                                    onChange={e => setForm({ ...form, name: e.target.value })}
                                    className="bg-transparent text-white text-sm font-medium w-full outline-none placeholder:text-neutral-600"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">
                                학부 / 학과 *
                            </label>
                            <div className="flex items-center gap-3 bg-neutral-800 rounded-xl px-4 py-3 border border-neutral-700 focus-within:border-indigo-500 transition">
                                <Building2 className="w-4 h-4 text-neutral-500 shrink-0" />
                                <input
                                    type="text"
                                    placeholder="예) 실용음악학부"
                                    value={form.department}
                                    onChange={e => setForm({ ...form, department: e.target.value })}
                                    className="bg-transparent text-white text-sm font-medium w-full outline-none placeholder:text-neutral-600"
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">
                                    학번 *
                                </label>
                                <div className="flex items-center gap-3 bg-neutral-800 rounded-xl px-4 py-3 border border-neutral-700 focus-within:border-indigo-500 transition">
                                    <Hash className="w-4 h-4 text-neutral-500 shrink-0" />
                                    <input
                                        type="text"
                                        placeholder="20240001"
                                        value={form.student_id}
                                        onChange={e => setForm({ ...form, student_id: e.target.value })}
                                        className="bg-transparent text-white text-sm font-medium w-full outline-none placeholder:text-neutral-600"
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">
                                    학년
                                </label>
                                <div className="flex items-center gap-3 bg-neutral-800 rounded-xl px-4 py-3 border border-neutral-700 focus-within:border-indigo-500 transition">
                                    <GraduationCap className="w-4 h-4 text-neutral-500 shrink-0" />
                                    <select
                                        value={form.grade}
                                        onChange={e => setForm({ ...form, grade: e.target.value })}
                                        className="bg-transparent text-white text-sm font-medium w-full outline-none"
                                    >
                                        <option value="1">1학년</option>
                                        <option value="2">2학년</option>
                                        <option value="3">3학년</option>
                                        <option value="4">4학년</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">
                                전화번호 (선택)
                            </label>
                            <div className="flex items-center gap-3 bg-neutral-800 rounded-xl px-4 py-3 border border-neutral-700 focus-within:border-indigo-500 transition">
                                <Phone className="w-4 h-4 text-neutral-500 shrink-0" />
                                <input
                                    type="tel"
                                    placeholder="010-0000-0000"
                                    value={form.phone}
                                    onChange={e => setForm({ ...form, phone: e.target.value })}
                                    className="bg-transparent text-white text-sm font-medium w-full outline-none placeholder:text-neutral-600"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">
                                전공 (선택)
                            </label>
                            <div className="flex items-center gap-3 bg-neutral-800 rounded-xl px-4 py-3 border border-neutral-700 focus-within:border-indigo-500 transition">
                                <BookOpen className="w-4 h-4 text-neutral-500 shrink-0" />
                                <input
                                    type="text"
                                    placeholder="예) 음향프로덕션"
                                    value={form.major}
                                    onChange={e => setForm({ ...form, major: e.target.value })}
                                    className="bg-transparent text-white text-sm font-medium w-full outline-none placeholder:text-neutral-600"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm transition mt-2"
                        >
                            다음: 수강 과목 선택 →
                        </button>
                    </form>
                )}

                {/* Step 2: Course Selection */}
                {step === 'course' && (
                    <form onSubmit={handleCourseSubmit} className="bg-neutral-900 rounded-3xl p-8 border border-neutral-800 space-y-4">
                        <p className="text-sm text-neutral-400 font-medium mb-2">
                            <span className="text-white font-bold">{form.name}</span>님, 수강할 과목을 선택해 주세요.
                        </p>

                        <div className="space-y-3">
                            {courses.map((course, i) => (
                                <label
                                    key={course.id}
                                    className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${form.course_id === course.id
                                        ? 'border-indigo-500 bg-indigo-500/10'
                                        : 'border-neutral-800 bg-neutral-800/50 hover:border-neutral-700'
                                        }`}
                                >
                                    <input
                                        type="radio"
                                        name="course"
                                        value={course.id}
                                        checked={form.course_id === course.id}
                                        onChange={() => setForm({ ...form, course_id: course.id })}
                                        className="sr-only"
                                    />
                                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${courseColors[i % courseColors.length]} flex items-center justify-center shrink-0`}>
                                        <BookOpen className="w-5 h-5 text-white" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-bold text-white text-sm">{course.name}</div>
                                        {course.description && (
                                            <div className="text-xs text-neutral-400 mt-0.5">{course.description}</div>
                                        )}
                                    </div>
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${form.course_id === course.id ? 'border-indigo-500 bg-indigo-500' : 'border-neutral-600'}`}>
                                        {form.course_id === course.id && (
                                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                        )}
                                    </div>
                                </label>
                            ))}
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setStep('profile')}
                                className="flex-1 py-4 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-sm transition"
                            >
                                ← 뒤로
                            </button>
                            <button
                                type="submit"
                                disabled={loading || !form.course_id}
                                className="flex-1 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-sm transition"
                            >
                                {loading ? '저장 중...' : '수강 신청 완료 ✓'}
                            </button>
                        </div>
                    </form>
                )}

            </div>
        </div>
    )
}
