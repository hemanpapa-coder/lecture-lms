'use client'

import React, { useState } from 'react'
import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import AIEvalPanel from './AIEvalPanel'

export default function AdminGradesTable({ 
    evaluations, 
    courseUsers, 
    gradesCourseId, 
    gradesCourseName,
    avgScore,
    gradeCounts,
    totalValidStudents 
}: any) {
    const [expandedRowId, setExpandedRowId] = useState<string | null>(null)

    const toggleRow = (userId: string) => {
        if (expandedRowId === userId) {
            setExpandedRowId(null)
        } else {
            setExpandedRowId(userId)
        }
    }

    return (
        <div className="space-y-6">
            {/* Stats Widget (Excluding Auditors) */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 bg-indigo-50/50 dark:bg-indigo-900/10 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-800/30">
                <div className="bg-white dark:bg-neutral-800 p-4 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-700">
                    <p className="text-xs text-neutral-500 font-medium mb-1">정규 평균 총점</p>
                    <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{avgScore}<span className="text-sm text-neutral-400 font-normal ml-1">점</span></p>
                </div>
                <div className="bg-white dark:bg-neutral-800 p-4 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-700">
                    <p className="text-xs text-neutral-500 font-medium mb-1">A 학점</p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-500">{gradeCounts.A}<span className="text-sm text-neutral-400 font-normal ml-1">명</span></p>
                </div>
                <div className="bg-white dark:bg-neutral-800 p-4 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-700">
                    <p className="text-xs text-neutral-500 font-medium mb-1">B 학점</p>
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-500">{gradeCounts.B}<span className="text-sm text-neutral-400 font-normal ml-1">명</span></p>
                </div>
                <div className="bg-white dark:bg-neutral-800 p-4 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-700">
                    <p className="text-xs text-neutral-500 font-medium mb-1">C 학점</p>
                    <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-500">{gradeCounts.C}<span className="text-sm text-neutral-400 font-normal ml-1">명</span></p>
                </div>
                <div className="bg-white dark:bg-neutral-800 p-4 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-700">
                    <p className="text-xs text-neutral-500 font-medium mb-1">정규 수강 인원</p>
                    <p className="text-2xl font-bold text-neutral-800 dark:text-neutral-200">{totalValidStudents}<span className="text-sm text-neutral-400 font-normal ml-1">명</span></p>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                    <thead>
                        <tr className="border-b border-neutral-200 dark:border-neutral-800">
                            <th className="p-3 font-semibold text-neutral-500">학생 정보</th>
                            <th className="p-3 font-semibold text-neutral-500">출석 점수</th>
                            <th className="p-3 font-semibold text-neutral-500">참여 점수</th>
                            <th className="p-3 font-semibold text-neutral-500">기말 점수</th>
                            <th className="p-3 font-semibold text-neutral-500">과제 점수</th>
                            <th className="p-3 font-semibold text-neutral-500">총점</th>
                            <th className="p-3 font-semibold text-neutral-500">학점</th>
                            <th className="p-3 font-semibold text-neutral-500 text-right">AI 평가 관리</th>
                        </tr>
                    </thead>
                    <tbody>
                        {courseUsers?.map((student: any) => {
                            const ev = evaluations?.find((e: any) => e.user_id === student.id) || {}
                            const userId = student.id
                            const isExpanded = expandedRowId === userId
                            const studentName = student.name || '이름 없음'
                            const is_auditor = ev.is_auditor || student.is_auditor
                            
                            return (
                                <React.Fragment key={userId}>
                                    <tr className={`border-b border-neutral-100 dark:border-neutral-800/50 hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition ${is_auditor ? 'opacity-50 bg-neutral-50/50' : ''}`}>
                                        <td className="p-3">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-neutral-900 dark:text-white">{studentName}</span>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="font-mono text-[10px] text-neutral-500">{userId.slice(0, 8)}…</span>
                                                    {is_auditor && <span className="text-[10px] font-bold bg-neutral-200 text-neutral-600 px-1.5 py-0.5 rounded">청강</span>}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-3">{ev.attendance_score ?? '-'}</td>
                                        <td className="p-3">{ev.midterm_score ?? '-'}</td>
                                        <td className="p-3">{ev.final_score ?? '-'}</td>
                                        <td className="p-3">{ev.assignment_score ?? '-'}</td>
                                        <td className="p-3 font-bold">{ev.total_score ?? '-'}</td>
                                        <td className="p-3">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${ev.final_grade?.startsWith('A') ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                                ev.final_grade?.startsWith('B') ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                                    ev.final_grade?.startsWith('C') ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                                        ev.final_grade === 'F' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                                            'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                                                }`}>
                                                {ev.final_grade || '미확정'}
                                            </span>
                                        </td>
                                        <td className="p-3 text-right">
                                            <button 
                                                onClick={() => toggleRow(userId)}
                                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${isExpanded ? 'bg-amber-500 text-white shadow-sm' : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-300'}`}
                                            >
                                                <Sparkles className="w-3.5 h-3.5" />
                                                AI 평가
                                                {isExpanded ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
                                            </button>
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr>
                                            <td colSpan={8} className="p-0 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50">
                                                <div className="p-6">
                                                    <AIEvalPanel 
                                                        courseId={gradesCourseId} 
                                                        courseName={gradesCourseName}
                                                        studentId={userId} 
                                                        studentName={studentName} 
                                                    />
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
