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

            // 학생별 HTML 생성
            const studentsHtml = results.map((student: any, sIdx: number) => {
                const scorePercent = Math.round((student.score / questions.length) * 100)
                const badgeColor = student.isCheated ? '#dc2626'
                    : scorePercent >= 80 ? '#16a34a'
                    : scorePercent >= 60 ? '#d97706'
                    : '#dc2626'

                const questionsHtml = student.hasDetail
                    ? questions.map((q: any, qIdx: number) => {
                        const studentAnswer = student.answers[qIdx] ?? '미선택'
                        const correctAnswer = q.answerText || (q.options && q.options[q.answerIndex]) || ''
                        const isCorrect = studentAnswer === correctAnswer || studentAnswer === q.answerIndex
                        return `
                        <div class="question-block ${isCorrect ? 'correct' : 'wrong'}">
                            <div class="question-header">
                                <span class="q-num">Q${qIdx + 1}</span>
                                <span class="q-result">${isCorrect ? '✓' : '✗'}</span>
                            </div>
                            <p class="q-text">${q.text || ''}</p>
                            <div class="answer-row">
                                <span class="my-answer ${isCorrect ? 'my-correct' : 'my-wrong'}">내 답: ${studentAnswer}</span>
                                ${!isCorrect ? `<span class="correct-answer">정답: ${correctAnswer}</span>` : ''}
                            </div>
                        </div>`
                    }).join('')
                    : `<div class="no-detail-notice">
                        <p>⚠️ 상세 답안 기록이 없습니다 (점수만 기록됨)</p>
                        <p style="margin-top:8px;font-size:14px;color:#6b7280;">오늘 시험에서 발생한 저장 오류로 인해 문항별 결과는 표시되지 않습니다.</p>
                        <div class="score-only-box">최종 점수: ${student.score} / ${questions.length}점</div>
                       </div>`

                return `
                <div class="student-sheet ${sIdx < results.length - 1 ? 'page-break' : ''}">
                    <!-- 헤더 -->
                    <div class="sheet-header">
                        <div class="header-left">
                            <div class="course-name">${courseName}</div>
                            <div class="exam-label">중간고사 시험 결과지</div>
                        </div>
                        <div class="score-badge" style="background:${badgeColor}">
                            ${student.isCheated ? '부정행위' : `${student.score} / ${questions.length}`}
                        </div>
                    </div>

                    <!-- 학생 정보 -->
                    <div class="student-info">
                        <div class="info-row">
                            <span class="info-label">이름</span>
                            <span class="info-value">${student.fullName}</span>
                            <span class="info-label">학번</span>
                            <span class="info-value">${student.studentId || '-'}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">제출 시각</span>
                            <span class="info-value">${student.submittedAt ? new Date(student.submittedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '-'}</span>
                            <span class="info-label">정답률</span>
                            <span class="info-value" style="color:${badgeColor};font-weight:700">${student.isCheated ? '0%' : scorePercent + '%'}</span>
                        </div>
                    </div>

                    ${student.isCheated ? `
                    <div class="cheat-warning">⚠️ 부정행위 감지 — 이 시험지는 강제 종료되었습니다.</div>
                    ` : ''}

                    <!-- 문항별 결과 -->
                    <div class="questions-area">
                        ${questionsHtml}
                    </div>

                    <!-- 하단 점수 요약 -->
                    <div class="score-summary">
                        최종 점수: <strong>${student.isCheated ? '0점 (부정행위 차단)' : student.score + ' / ' + questions.length + '점 (' + scorePercent + '%)'}</strong>
                    </div>
                </div>`
            }).join('')

            const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${courseName}_중간고사_전체시험지</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', '맑은 고딕', Arial, sans-serif; background: #fff; color: #1f2937; font-size: 13px; }

  .student-sheet { padding: 24px 28px; min-height: 100vh; position: relative; }
  .page-break { page-break-after: always; border-bottom: 3px dashed #e5e7eb; }

  .sheet-header { background: linear-gradient(135deg, #4338ca, #3b82f6); color: white; border-radius: 12px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
  .course-name { font-size: 18px; font-weight: 800; margin-bottom: 2px; }
  .exam-label { font-size: 11px; opacity: 0.8; }
  .score-badge { padding: 8px 18px; border-radius: 8px; font-size: 18px; font-weight: 900; color: white; background: #16a34a; }

  .student-info { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 16px; margin-bottom: 12px; }
  .info-row { display: flex; gap: 8px; align-items: center; margin-bottom: 4px; }
  .info-row:last-child { margin-bottom: 0; }
  .info-label { font-size: 11px; color: #6b7280; font-weight: 600; background: #e5e7eb; padding: 2px 8px; border-radius: 4px; white-space: nowrap; }
  .info-value { font-size: 13px; font-weight: 700; color: #111827; flex: 1; }

  .cheat-warning { background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c; padding: 10px 14px; border-radius: 8px; font-weight: 700; margin-bottom: 12px; text-align: center; }

  .no-detail-notice { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 10px; padding: 20px; text-align: center; color: #92400e; font-weight: 600; margin: 16px 0; }
  .score-only-box { margin-top: 16px; background: #4338ca; color: white; padding: 14px 24px; border-radius: 8px; font-size: 20px; font-weight: 900; display: inline-block; }

  .questions-area { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; }
  .question-block { border-radius: 8px; padding: 10px 12px; border: 1px solid; }
  .question-block.correct { background: #f0fdf4; border-color: #86efac; }
  .question-block.wrong { background: #fef2f2; border-color: #fca5a5; }

  .question-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
  .q-num { font-size: 11px; font-weight: 800; color: #6b7280; }
  .q-result { font-size: 16px; font-weight: 900; }
  .correct .q-result { color: #16a34a; }
  .wrong .q-result { color: #dc2626; }

  .q-text { font-size: 12px; color: #1f2937; line-height: 1.5; margin-bottom: 6px; }
  .answer-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .my-answer { font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
  .my-correct { background: #dcfce7; color: #15803d; }
  .my-wrong { background: #fee2e2; color: #b91c1c; }
  .correct-answer { font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 600; background: #dbeafe; color: #1d4ed8; }

  .score-summary { background: #eef2ff; border: 2px solid #a5b4fc; border-radius: 10px; padding: 12px 20px; text-align: center; font-size: 16px; color: #4338ca; }
  .score-summary strong { font-size: 18px; }

  @media print {
    body { background: white; }
    .student-sheet { padding: 16px 20px; }
    .page-break { page-break-after: always; border: none; }
    @page { margin: 10mm; size: A4; }
  }
</style>
</head>
<body>
${studentsHtml}
<script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`

            const printWindow = window.open('', '_blank')
            if (!printWindow) {
                alert('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.')
                return
            }
            printWindow.document.write(html)
            printWindow.document.close()

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
                <><Loader2 className="w-4 h-4 animate-spin" /> 생성 중...</>
            ) : (
                <><FileText className="w-4 h-4" /> 전체 시험지 PDF 출력</>
            )}
        </button>
    )
}
