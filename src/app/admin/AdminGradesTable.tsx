'use client'

import React, { useState } from 'react'
import { Sparkles, ChevronDown, ChevronUp, Edit3 } from 'lucide-react'
import AIEvalPanel from './AIEvalPanel'
import AdminManualEvalPanel from './AdminManualEvalPanel'

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
    const [expandedManualId, setExpandedManualId] = useState<string | null>(null)

    const toggleRow = (userId: string) => {
        if (expandedRowId === userId) {
            setExpandedRowId(null)
        } else {
            setExpandedRowId(userId)
            setExpandedManualId(null)
        }
    }

    const toggleManual = (userId: string) => {
        if (expandedManualId === userId) {
            setExpandedManualId(null)
        } else {
            setExpandedManualId(userId)
            setExpandedRowId(null)
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
                            <th className="p-3 font-semibold text-neutral-500">학생정보</th>
                            <th className="p-3 font-semibold text-neutral-500">출석{gradesCourseName?.includes('홈레코딩과 음향학') ? '(20)' : ' 점수'}</th>
                            <th className="p-3 font-semibold text-neutral-500">수시{gradesCourseName?.includes('홈레코딩과 음향학') ? '(20)' : ' 점수'}</th>
                            <th className="p-3 font-semibold text-neutral-500">과제{gradesCourseName?.includes('홈레코딩과 음향학') ? '(20)' : ' 점수'}</th>
                            <th className="p-3 font-semibold text-neutral-500">중간{gradesCourseName?.includes('홈레코딩과 음향학') ? '(20)' : ' 점수'}</th>
                            <th className="p-3 font-semibold text-neutral-500">기말{gradesCourseName?.includes('홈레코딩과 음향학') ? '(20)' : ' 점수'}</th>
                            <th className="p-3 font-semibold text-neutral-500">총점</th>
                            <th className="p-3 font-semibold text-neutral-500">학점</th>
                            <th className="p-3 font-semibold text-neutral-500 text-right">평가 관리</th>
                        </tr>
                    </thead>
                    <tbody>
                        {courseUsers?.map((student: any) => {
                            const ev = evaluations?.find((e: any) => e.user_id === student.id) || {}
                            const userId = student.id
                            const isExpanded = expandedRowId === userId
                            const isManualExpanded = expandedManualId === userId
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
                                        <td className="p-3">{ev.susi_score ?? '-'}</td>
                                        <td className="p-3">{ev.assignment_score ?? '-'}</td>
                                        <td className="p-3">
                                            {ev.midterm_score === -1 ? (
                                                <div className="flex flex-col gap-1 items-start">
                                                    <span className="text-xs font-bold text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded">차단됨</span>
                                                    <button 
                                                        onClick={async () => {
                                                            if(!confirm('재응시를 허가하시겠습니까? 학생의 시험 기록이 초기화됩니다.')) return;
                                                            try {
                                                                const res = await fetch('/api/admin/unblock-exam', {
                                                                    method: 'POST',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({ studentId: userId, courseId: gradesCourseId })
                                                                });
                                                                if(!res.ok) throw new Error('처리 중 오류가 발생했습니다.');
                                                                alert('재응시가 허가되었습니다. 새로고침을 해주세요.');
                                                                window.location.reload();
                                                            } catch(err: any) {
                                                                alert(err.message);
                                                            }
                                                        }}
                                                        className="text-[10px] font-bold bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:border-red-400 text-neutral-600 dark:text-neutral-400 hover:text-red-500 rounded px-2 py-1 transition-colors"
                                                    >
                                                        재응시 허가
                                                    </button>
                                                </div>
                                            ) : (
                                                ev.midterm_score ?? '-'
                                            )}
                                        </td>
                                        <td className="p-3">{ev.final_score ?? '-'}</td>
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
                                            <div className="flex items-center justify-end gap-2">
                                                <button 
                                                    onClick={() => toggleManual(userId)}
                                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${isManualExpanded ? 'bg-blue-600 text-white shadow-sm' : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-300'}`}
                                                >
                                                    <Edit3 className="w-3.5 h-3.5" />
                                                    수동 평가
                                                </button>
                                                <button 
                                                    onClick={() => toggleRow(userId)}
                                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${isExpanded ? 'bg-amber-500 text-white shadow-sm' : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-300'}`}
                                                >
                                                    <Sparkles className="w-3.5 h-3.5" />
                                                    AI 평가
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr>
                                            <td colSpan={9} className="p-0 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50">
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
                                    {isManualExpanded && (
                                        <tr>
                                            <td colSpan={9} className="p-0 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50">
                                                <div className="p-6">
                                                    <AdminManualEvalPanel 
                                                        courseId={gradesCourseId}
                                                        courseName={gradesCourseName}
                                                        studentId={userId}
                                                        studentName={studentName}
                                                        initialData={{
                                                            midterm_score: ev.midterm_score,
                                                            assignment_score: ev.assignment_score,
                                                            susi_score: ev.susi_score
                                                        }}
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
