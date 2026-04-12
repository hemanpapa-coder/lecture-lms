'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Printer, ArrowLeft, Loader2, Star, Download } from 'lucide-react'

export default function PeerEvalReportPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const courseId = searchParams.get('courseId')
    
    const [stats, setStats] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [courseName, setCourseName] = useState<string>('로딩 중...')

    useEffect(() => {
        if (!courseId) {
            setLoading(false)
            return
        }

        const fetchData = async () => {
            try {
                // Fetch stats
                const statRes = await fetch(`/api/admin/peer-eval-stats?courseId=${courseId}`)
                if (statRes.ok) {
                    const d = await statRes.json()
                    setStats(d.stats || [])
                }
                
                // Fetch course name
                const cRes = await fetch(`/api/admin/course-status?courseId=${courseId}`)
                if (cRes.ok) {
                    const cd = await cRes.json()
                    if (cd.course) setCourseName(cd.course.name)
                }
            } catch (err) {
                console.error(err)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [courseId])

    const handlePrint = () => {
        window.print()
    }

    if (loading) {
        return <div className="p-20 flex justify-center"><Loader2 className="w-10 h-10 animate-spin text-neutral-400" /></div>
    }

    if (!courseId) {
        return <div className="p-10 text-center text-red-500">과목 정보가 없습니다. (courseId 누락)</div>
    }

    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 print:bg-white pb-20">
            {/* Header (Hidden when printing) */}
            <div className="max-w-5xl mx-auto px-6 py-6 print:hidden">
                <button 
                    onClick={() => router.back()}
                    className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition group mb-6"
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    관리자 대시보드로 돌아가기
                </button>
                
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">기말 상호평가 통계</h1>
                        <p className="text-neutral-500 mt-1">과목: {courseName}</p>
                    </div>
                    
                    <button 
                        onClick={handlePrint}
                        className="flex items-center gap-2 px-5 py-2.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 rounded-xl text-sm font-bold shadow-sm transition active:scale-95"
                    >
                        <Printer className="w-4 h-4" />
                        PDF 저장 및 인쇄
                    </button>
                </div>
            </div>

            {/* Print Area */}
            <div className="max-w-5xl mx-auto px-6 print:p-0 print:m-0 print:max-w-full">
                {/* Print Title (Only visible when printing or normally displayed as document view) */}
                <div className="hidden print:block mb-8 border-b-2 border-black pb-4">
                    <h1 className="text-2xl font-bold text-black mb-2">기말 상호평가 결과 보고서</h1>
                    <p className="text-black">평가 대상 과목: {courseName}</p>
                    <p className="text-sm text-black">출력 일자: {new Date().toLocaleDateString()}</p>
                </div>

                {stats.length === 0 ? (
                    <div className="bg-white dark:bg-neutral-800 print:bg-transparent rounded-2xl p-10 text-center border border-neutral-200 dark:border-neutral-700 print:border-none">
                        <p className="text-neutral-500 print:text-black">아직 등록된 상호평가 데이터가 없습니다.</p>
                    </div>
                ) : (
                    <div className="space-y-8 print:space-y-6">
                        {stats.map((stat, i) => (
                            <div key={stat.userId} className="break-inside-avoid shadow-sm print:shadow-none bg-white dark:bg-neutral-800 print:bg-transparent rounded-2xl border border-neutral-200 dark:border-neutral-700 print:border-neutral-300 overflow-hidden">
                                
                                <div className="bg-neutral-50 dark:bg-neutral-900/50 print:bg-neutral-100 p-4 border-b border-neutral-200 dark:border-neutral-700 print:border-neutral-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <h3 className="font-bold text-lg text-neutral-900 dark:text-white print:text-black flex items-center gap-2">
                                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-neutral-200 dark:bg-neutral-700 print:bg-transparent text-sm">{i + 1}</span>
                                        {stat.userName} 
                                    </h3>
                                    <div className="flex items-center gap-1.5 bg-yellow-50 dark:bg-yellow-900/20 print:bg-transparent text-yellow-700 dark:text-yellow-500 print:text-black px-3 py-1 rounded-lg font-bold text-sm">
                                        <Star className="w-4 h-4 fill-yellow-500 text-yellow-500 print:hidden" />
                                        <span>평균 별점: {stat.avgScore?.toFixed(2) || '0.00'}</span>
                                        <span className="text-xs font-normal opacity-70 ml-1">/ 5.0 (총 {stat.receivedReviews.length}명 참여)</span>
                                    </div>
                                </div>

                                <div className="p-0">
                                    <table className="w-full text-left text-sm print:text-[12px]">
                                        <thead className="bg-white dark:bg-neutral-800 print:bg-white text-neutral-500 print:text-neutral-600 border-b border-neutral-100 dark:border-neutral-700 print:border-neutral-300">
                                            <tr>
                                                <th className="py-2 px-4 font-semibold w-1/4">평가자</th>
                                                <th className="py-2 px-4 font-semibold w-1/6">부여 점수</th>
                                                <th className="py-2 px-4 font-semibold">평가 코멘트</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700/50 print:divide-neutral-200">
                                            {stat.receivedReviews.map((r: any, idx: number) => (
                                                <tr key={idx} className="hover:bg-neutral-50 dark:hover:bg-neutral-700/20 print:bg-transparent transition-colors">
                                                    <td className="py-2.5 px-4 font-medium text-neutral-800 dark:text-neutral-300 print:text-black">{r.reviewerName}</td>
                                                    <td className="py-2.5 px-4">
                                                        <div className="flex items-center gap-1">
                                                            <span className="font-bold print:hidden text-yellow-600 dark:text-yellow-500">{r.score}</span>
                                                            <span className="hidden print:inline-block font-bold text-black">{r.score}점</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-2.5 px-4 text-neutral-600 dark:text-neutral-400 print:text-black">{r.comment || <span className="italic text-neutral-400">코멘트 없음</span>}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            
            {/* Print Styles injection */}
            <style jsx global>{`
                @media print {
                    @page { margin: 15mm; size: A4; }
                    body { background: white !important; color: black !important; -webkit-print-color-adjust: exact; }
                }
            `}</style>
        </div>
    )
}
