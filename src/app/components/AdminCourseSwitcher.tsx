'use client'
import { useRouter } from 'next/navigation'
import { ChevronDown } from 'lucide-react'

type Course = {
    id: string
    name: string
    is_private_lesson?: boolean
}

export default function AdminCourseSwitcher({
    courses,
    activeCourseId,
    viewMode = 'student'
}: {
    courses: Course[]
    activeCourseId: string | null
    viewMode?: string
}) {
    const router = useRouter()

    if (!courses || courses.length === 0) return null

    return (
        <div className="relative">
            <div className="flex items-center bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-1.5 shadow-sm group hover:border-indigo-400 transition-colors">
                <select
                    value={activeCourseId || ''}
                    onChange={(e) => {
                        const newCourseId = e.target.value
                        if (newCourseId) {
                            router.push(`/?view=${viewMode}&course=${newCourseId}`)
                        }
                    }}
                    className="w-full bg-transparent text-sm font-bold text-neutral-700 dark:text-neutral-200 appearance-none pr-6 outline-none cursor-pointer"
                >
                    <option value="" disabled>수업 선택...</option>
                    {courses.map(course => (
                        <option key={course.id} value={course.id}>
                            {course.is_private_lesson ? `[실기레슨] ${course.name}` : `[정규수업] ${course.name}`}
                        </option>
                    ))}
                </select>
                <ChevronDown className="absolute right-3 w-4 h-4 text-neutral-400 pointer-events-none group-hover:text-indigo-400" />
            </div>
        </div>
    )
}
