'use client'

import { useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'

export default function ExamResultsPDFButton({ courseId, courseName }: { courseId: string, courseName: string }) {
    const [loading, setLoading] = useState(false)

    const handlePrintPDF = async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/exam/results?courseId=${courseId}`)
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || '데이터 조회 실패')

            const { results, questions } = data

            if (!results || results.length === 0) {
                alert('제출된 시험 답안이 없습니다.')
                return
            }

            const { default: jsPDF } = await import('jspdf')
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

            // 한국어 지원을 위해 기본 폰트 사용
            const pageWidth = 210
            const pageHeight = 297
            const margin = 15
            const contentWidth = pageWidth - margin * 2

            const addText = (text: string, x: number, y: number, options: any = {}) => {
                doc.text(text, x, y, options)
            }

            results.forEach((student: any, sIdx: number) => {
                if (sIdx > 0) doc.addPage()

                // === 헤더 ===
                doc.setFillColor(67, 56, 202) // indigo-700
                doc.rect(0, 0, pageWidth, 32, 'F')

                doc.setTextColor(255, 255, 255)
                doc.setFontSize(16)
                doc.setFont('helvetica', 'bold')
                addText(courseName + ' - Midterm Exam', margin, 13)

                doc.setFontSize(9)
                doc.setFont('helvetica', 'normal')
                addText('Student Exam Sheet', margin, 21)

                // 점수 뱃지 (오른쪽 상단)
                const scoreText = student.isCheated ? 'BLOCKED' : `${student.score} / ${questions.length}`
                const badgeColor = student.isCheated ? [220, 38, 38] : student.score >= questions.length * 0.8 ? [22, 163, 74] : [234, 88, 12]
                doc.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2])
                doc.roundedRect(pageWidth - margin - 38, 5, 38, 20, 4, 4, 'F')
                doc.setTextColor(255, 255, 255)
                doc.setFontSize(13)
                doc.setFont('helvetica', 'bold')
                addText(scoreText, pageWidth - margin - 19, 16, { align: 'center' })

                // === 학생 정보 ===
                doc.setFillColor(243, 244, 246) // gray-100
                doc.rect(margin, 38, contentWidth, 18, 'F')
                doc.setTextColor(30, 30, 30)
                doc.setFontSize(10)
                doc.setFont('helvetica', 'bold')
                addText('Name: ' + student.fullName, margin + 4, 46)
                if (student.studentId) {
                    addText('ID: ' + student.studentId, margin + 4, 52)
                }
                const dateStr = student.submittedAt
                    ? new Date(student.submittedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
                    : 'N/A'
                addText('Submitted: ' + dateStr, pageWidth - margin - 4, 46, { align: 'right' })

                // 부정행위 경고
                if (student.isCheated) {
                    doc.setFillColor(254, 226, 226)
                    doc.rect(margin, 60, contentWidth, 10, 'F')
                    doc.setTextColor(185, 28, 28)
                    doc.setFontSize(9)
                    doc.setFont('helvetica', 'bold')
                    addText('[CHEATING DETECTED] This exam was forcibly terminated.', margin + 4, 66)
                }

                // === 문제 목록 ===
                let curY = student.isCheated ? 76 : 62
                doc.setTextColor(30, 30, 30)

                questions.forEach((q: any, qIdx: number) => {
                    const studentAnswer = student.answers[qIdx] || '미선택'
                    const correctAnswer = q.answerText || (q.options && q.options[q.answerIndex]) || ''
                    const isCorrect = studentAnswer === correctAnswer || studentAnswer === q.answerIndex

                    // 문제 번호 + 텍스트 (긴 텍스트 처리)
                    doc.setFontSize(9)
                    doc.setFont('helvetica', 'bold')
                    const qLabel = `Q${q.id || qIdx + 1}. `
                    const qText = doc.splitTextToSize(qLabel + (q.text || ''), contentWidth - 10)
                    const qBlockHeight = qText.length * 5 + 2

                    // 페이지 넘김 체크
                    if (curY + qBlockHeight + 20 > pageHeight - 10) {
                        doc.addPage()
                        curY = 20
                    }

                    // 문제 배경
                    doc.setFillColor(isCorrect ? 240 : 254, isCorrect ? 253 : 242, isCorrect ? 244 : 242)
                    doc.roundedRect(margin, curY, contentWidth, qBlockHeight + 18, 2, 2, 'F')
                    doc.setDrawColor(isCorrect ? 134 : 252, isCorrect ? 239 : 165, isCorrect ? 172 : 165)
                    doc.roundedRect(margin, curY, contentWidth, qBlockHeight + 18, 2, 2, 'S')

                    doc.setTextColor(30, 30, 30)
                    doc.setFont('helvetica', 'bold')
                    doc.setFontSize(9)
                    doc.text(qText, margin + 4, curY + 6)

                    curY += qBlockHeight + 2

                    // 학생 답안
                    doc.setFont('helvetica', 'normal')
                    doc.setFontSize(8)
                    doc.setTextColor(isCorrect ? 22 : 153, isCorrect ? 101 : 27, isCorrect ? 52 : 27)
                    addText('내 답: ' + studentAnswer, margin + 6, curY + 5)

                    // 정답 (오른쪽)
                    doc.setTextColor(30, 30, 30)
                    addText('정답: ' + correctAnswer, pageWidth - margin - 6, curY + 5, { align: 'right' })

                    // 정오 아이콘
                    doc.setFontSize(10)
                    doc.setFont('helvetica', 'bold')
                    doc.setTextColor(isCorrect ? 22 : 220, isCorrect ? 163 : 38, isCorrect ? 74 : 38)
                    addText(isCorrect ? 'O' : 'X', margin + contentWidth / 2, curY + 5, { align: 'center' })

                    curY += 14
                })

                // 하단 점수 요약
                if (curY + 20 > pageHeight - 10) {
                    doc.addPage()
                    curY = 20
                }
                doc.setFillColor(238, 242, 255)
                doc.roundedRect(margin, curY + 4, contentWidth, 16, 3, 3, 'F')
                doc.setTextColor(67, 56, 202)
                doc.setFont('helvetica', 'bold')
                doc.setFontSize(11)
                const finalScore = student.isCheated ? '0 / ' + questions.length + '  (부정행위 차단)' : student.score + ' / ' + questions.length
                addText('최종 점수: ' + finalScore, pageWidth / 2, curY + 14, { align: 'center' })
            })

            // 저장
            const fileName = `${courseName}_중간고사_전체시험지_${new Date().toLocaleDateString('ko-KR').replace(/\. /g, '-').replace('.', '')}.pdf`
            doc.save(fileName)
        } catch (e: any) {
            console.error(e)
            alert('PDF 생성 중 오류가 발생했습니다: ' + e.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <button
            onClick={handlePrintPDF}
            disabled={loading}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md shadow-emerald-100 dark:shadow-none transition-all active:scale-95"
        >
            {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> PDF 생성 중...</>
            ) : (
                <><FileText className="w-4 h-4" /> 전체 시험지 PDF 출력</>
            )}
        </button>
    )
}
