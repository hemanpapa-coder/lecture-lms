'use client'
import { useState, useRef } from 'react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { Download } from 'lucide-react'

export default function PdfGenerator({
    user, course, logs, attendances, onUploadComplete, title, examType
}: {
    user: any, course: any, logs: any[], attendances: any[], onUploadComplete: () => void, title: string, examType: string
}) {
    const [isGenerating, setIsGenerating] = useState(false)
    const printRef = useRef<HTMLDivElement>(null)

    const handleGeneratePdf = async () => {
        setIsGenerating(true)
        try {
            if (!printRef.current) return

            // Temporarily display block to render it properly if we need to
            printRef.current.style.display = 'block'

            const canvas = await html2canvas(printRef.current, {
                scale: 1.5,
                useCORS: true,
                logging: false,
                windowWidth: 1000
            })

            printRef.current.style.display = 'none'

            const imgData = canvas.toDataURL('image/jpeg', 0.7)
            const pdf = new jsPDF('p', 'mm', 'a4')
            const pdfWidth = pdf.internal.pageSize.getWidth()
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width

            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight)
            const pdfBlob = pdf.output('blob')

            // Generate File object
            const filename = `${course.name}_${user.student_id}_${user.name}_제작일지.pdf`

            // Auto-upload
            const formData = new FormData()
            formData.append('userId', user.id)
            formData.append('courseId', course.id)
            formData.append('examType', examType)
            formData.append('file', pdfBlob, filename)
            formData.append('content', '주차별 자동 생성 PDF 제출')

            const res = await fetch('/api/recording-class/exam-upload', {
                method: 'POST',
                body: formData
            })

            const json = await res.json()
            if (!res.ok) throw new Error(json.error || '업로드 중 오류 발생')

            alert('PDF 생성 및 자동 제출이 완료되었습니다!')
            onUploadComplete()

        } catch (error: any) {
            console.error(error)
            alert('PDF 생성 중 오류가 발생했습니다: ' + error.message)
        } finally {
            setIsGenerating(false)
        }
    }

    return (
        <>
            <button
                onClick={handleGeneratePdf}
                disabled={isGenerating}
                className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-xl font-bold text-sm hover:bg-slate-800 dark:hover:bg-white transition shadow-lg disabled:opacity-50"
            >
                <Download className="w-4 h-4" /> {isGenerating ? 'PDF 생성 및 전송 중...' : '제출용 PDF 자동 변환'}
            </button>

            {/* Hidden printable area */}
            <div className="absolute left-[-9999px] top-[-9999px] bg-white overflow-hidden pointer-events-none w-[800px]">
                <div ref={printRef} className="p-10 min-h-[1122px]" style={{ display: 'none', backgroundColor: '#ffffff', color: '#000000' }}>
                    <div className="text-center mb-8 border-b-2 pb-4" style={{ borderColor: '#000000' }}>
                        <h1 className="text-3xl font-black mb-2">{course.name} - {title}</h1>
                        <p className="text-lg">이름: {user.name} | 학번: {user.student_id} | 소속: {user.department}</p>
                    </div>

                    <div className="space-y-6">
                        {Array.from({ length: 15 }, (_, i) => i + 1).map(week => {
                            const att = attendances.find(a => a.week_number === week)
                            const log = logs.find(l => l.week_number === week)

                            if (!att && (!log || (!log.last_week_done && !log.this_week_plan))) {
                                return null
                            }

                            return (
                                <div key={week} className="border p-4 rounded-lg break-inside-avoid shadow-sm" style={{ borderColor: '#d1d5db' }}>
                                    <h3 className="text-lg font-bold mb-3 border-b pb-2" style={{ borderColor: '#e5e7eb' }}>
                                        Week {week} <span className="text-sm font-normal ml-2" style={{ color: '#6b7280' }}>출석: {att?.status || '미기록'}</span>
                                    </h3>

                                    <div className="text-sm space-y-3">
                                        <div>
                                            <p className="font-bold" style={{ color: '#374151' }}>지난주 작업 완료 내용:</p>
                                            <p className="whitespace-pre-wrap">{log?.last_week_done || '기록 없음'}</p>
                                        </div>
                                        <div>
                                            <p className="font-bold" style={{ color: '#374151' }}>이번주 작업 계획 및 향후 스케줄:</p>
                                            <p className="whitespace-pre-wrap">{log?.this_week_plan || '기록 없음'}</p>
                                        </div>
                                        <div>
                                            <p className="font-bold" style={{ color: '#374151' }}>곡 완성 진척도: <span style={{ color: '#2563eb' }}>{log?.progress_percent || 0}%</span></p>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    <div className="mt-12 text-center text-sm" style={{ color: '#6b7280' }}>
                        본 문서는 과제 제출용으로 자동 생성되었습니다.
                    </div>
                </div>
            </div>
        </>
    )
}
