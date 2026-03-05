'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
export default function AttendanceToggle({
    courseId,
    initialState,
    courseName
}: {
    courseId: string,
    initialState: boolean,
    courseName: string
}) {
    const [isOpen, setIsOpen] = useState(initialState)
    const [isLoading, setIsLoading] = useState(false)
    const supabase = createClient()

    const toggleAttendance = async () => {
        setIsLoading(true)
        const newState = !isOpen

        const { error } = await supabase
            .from('courses')
            .update({ is_attendance_open: newState })
            .eq('id', courseId)

        if (!error) {
            setIsOpen(newState)
        } else {
            alert('출석체크 상태 변경에 실패했습니다.')
        }
        setIsLoading(false)
    }

    return (
        <div className="flex items-center justify-between p-4 bg-indigo-50 dark:bg-indigo-950/30 rounded-2xl border border-indigo-100 dark:border-indigo-900/50 mb-6">
            <div>
                <h3 className="text-lg font-bold text-indigo-900 dark:text-indigo-300">
                    [{courseName}] 출석 체크 활성화 모드
                </h3>
                <p className="text-sm text-indigo-700 dark:text-indigo-400/80 mt-1">
                    수업 시간에 스위치를 켜면 학생들의 대시보드에서 '출석' 버튼이 활성화됩니다.
                </p>
            </div>
            <button
                onClick={toggleAttendance}
                disabled={isLoading}
                className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 ${isOpen ? 'bg-indigo-600' : 'bg-neutral-300 dark:bg-neutral-600'
                    } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                role="switch"
                aria-checked={isOpen}
            >
                <span className="sr-only">출석 체크 활성화</span>
                <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isOpen ? 'translate-x-6' : 'translate-x-0'
                        }`}
                />
            </button>
        </div>
    )
}
