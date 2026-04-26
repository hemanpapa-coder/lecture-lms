'use client'

import { useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'

const OPTION_LABELS = ['①', '②', '③', '④', '⑤']

export default function StudentExamPDFButton({
    userId,
    courseId,
    courseName,
    studentName,
}: {
    userId: string
    courseId: string
    courseName: string
    studentName?: string
}) {
    const [loading, setLoading] = useState(false)

    const handlePrint = async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/exam/results?courseId=${courseId}&userId=${userId}`)
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || '데이터 조회 실패')

            const { results, questions } = data
            if (!results || results.length === 0) {
                alert('제출된 시험 답안이 없습니다.')
                return
            }

            const student = results[0]
            const totalQ = questions.length
            const score = student.score ?? 0
            const scorePercent = Math.round((score / totalQ) * 100)
            const badgeColor = scorePercent >= 80 ? '#16a34a' : scorePercent >= 60 ? '#d97706' : '#dc2626'

            const questionsHtml = questions.map((q: any, qIdx: number) => {
                const studentAnswer = student.hasDetail ? (student.answers[qIdx] ?? null) : null
                const correctAnswer = q.answerText || (q.options && q.options[q.answerIndex]) || ''
                const isCorrect = studentAnswer !== null && (
                    studentAnswer === correctAnswer ||
                    studentAnswer === q.answerIndex ||
                    (typeof studentAnswer === 'number' && q.options && q.options[studentAnswer] === correctAnswer)
                )

                const optionsHtml = (q.options || []).map((opt: string, oIdx: number) => {
                    const label = OPTION_LABELS[oIdx] || `${oIdx + 1}`
                    const isCorrectOpt = opt === correctAnswer
                    const isStudentPick = studentAnswer !== null && (
                        studentAnswer === opt ||
                        studentAnswer === oIdx ||
                        (typeof studentAnswer === 'string' && studentAnswer === opt)
                    )

                    let optStyle = 'opt-normal'
                    let markHtml = ''

                    if (student.hasDetail) {
                        if (isStudentPick && isCorrectOpt) { optStyle = 'opt-correct'; markHtml = '<span class="opt-mark">✓ 정답</span>' }
                        else if (isStudentPick && !isCorrectOpt) { optStyle = 'opt-wrong'; markHtml = '<span class="opt-mark">✗ 오답</span>' }
                        else if (!isStudentPick && isCorrectOpt) { optStyle = 'opt-answer'; markHtml = '<span class="opt-mark ans-mark">← 정답</span>' }
                    } else {
                        if (isCorrectOpt) { optStyle = 'opt-answer'; markHtml = '<span class="opt-mark ans-mark">◀ 정답</span>' }
                    }

                    return `<div class="opt-row ${optStyle}">
                        <span class="opt-label">${label}</span>
                        <span class="opt-text">${opt}</span>
                        ${markHtml}
                    </div>`
                }).join('')

                const statusIcon = !student.hasDetail ? '' : isCorrect ? '✓' : '✗'
                const qHeaderClass = !student.hasDetail ? 'q-header-neutral' : isCorrect ? 'q-header-correct' : 'q-header-wrong'

                return `<div class="question-block">
                    <div class="q-header ${qHeaderClass}">
                        <span class="q-num">문제 ${qIdx + 1}</span>
                        ${student.hasDetail ? `<span class="q-status">${statusIcon}</span>` : ''}
                    </div>
                    <p class="q-text">${q.text || ''}</p>
                    <div class="options-area">${optionsHtml}</div>
                    ${student.hasDetail && !isCorrect && q.explanation ? `
                    <div class="explanation">
                        <span class="exp-label">해설</span>${q.explanation}
                    </div>` : ''}
                </div>`
            }).join('')

            const submittedDate = student.submittedAt
                ? new Date(student.submittedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
                : '-'

            const displayName = studentName || student.fullName || '더미 학생'

            const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${courseName}_중간고사_${displayName}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Apple SD Gothic Neo','Malgun Gothic','맑은 고딕',Arial,sans-serif; background:#fff; color:#1f2937; font-size:12px; }

  .student-sheet { padding:20px 24px; }

  .sheet-header { background:linear-gradient(135deg,#4338ca,#3b82f6); color:white; border-radius:10px; padding:14px 18px; display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
  .course-name { font-size:17px; font-weight:800; margin-bottom:2px; }
  .exam-label { font-size:11px; opacity:0.8; }
  .score-badge { padding:7px 16px; border-radius:8px; font-size:17px; font-weight:900; color:white; background:${badgeColor}; }

  .info-table { width:100%; border-collapse:collapse; margin-bottom:6px; font-size:12px; }
  .info-table th { background:#f3f4f6; border:1px solid #d1d5db; padding:5px 8px; font-weight:700; color:#374151; text-align:center; white-space:nowrap; }
  .info-table td { border:1px solid #d1d5db; padding:6px 10px; text-align:center; font-weight:600; color:#111827; }
  .exam-subtitle { font-size:12px; font-weight:700; color:#1f2937; background:#f9fafb; border:1px solid #e5e7eb; border-radius:5px; padding:6px 12px; margin-bottom:8px; }

  .no-detail-notice { background:#fffbeb; border:1px solid #fcd34d; color:#92400e; padding:7px 12px; border-radius:6px; font-weight:600; margin-bottom:8px; font-size:11px; }

  .questions-area { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px; }
  .question-block { border:1px solid #e5e7eb; border-radius:8px; overflow:hidden; background:#fff; }
  .q-header { display:flex; justify-content:space-between; align-items:center; padding:6px 10px; }
  .q-header-neutral { background:#f3f4f6; }
  .q-header-correct  { background:#dcfce7; }
  .q-header-wrong    { background:#fee2e2; }
  .q-num { font-size:11px; font-weight:800; color:#374151; }
  .q-status { font-size:14px; font-weight:900; }
  .q-header-correct .q-status { color:#16a34a; }
  .q-header-wrong   .q-status { color:#dc2626; }
  .q-text { font-size:11.5px; font-weight:600; color:#111827; padding:8px 10px 6px; line-height:1.55; }
  .options-area { padding:0 8px 8px; display:flex; flex-direction:column; gap:4px; }
  .opt-row { display:flex; align-items:flex-start; gap:5px; padding:4px 6px; border-radius:5px; font-size:11px; line-height:1.45; }
  .opt-normal  { background:#f9fafb; }
  .opt-correct { background:#dcfce7; border:1.5px solid #86efac; }
  .opt-wrong   { background:#fee2e2; border:1.5px solid #fca5a5; }
  .opt-answer  { background:#eff6ff; border:1.5px dashed #93c5fd; }
  .opt-label { font-weight:800; color:#4b5563; white-space:nowrap; flex-shrink:0; }
  .opt-text  { flex:1; color:#1f2937; }
  .opt-mark  { font-size:10px; font-weight:700; white-space:nowrap; margin-left:3px; align-self:center; }
  .opt-correct .opt-mark { color:#15803d; }
  .opt-wrong   .opt-mark { color:#b91c1c; }
  .ans-mark { color:#1d4ed8; }
  .explanation { margin:0 8px 8px; background:#f0f9ff; border-left:3px solid #38bdf8; padding:6px 8px; border-radius:0 5px 5px 0; font-size:10px; color:#0c4a6e; line-height:1.5; }
  .exp-label { font-weight:800; margin-right:4px; }

  .score-summary { background:#eef2ff; border:2px solid #a5b4fc; border-radius:8px; padding:10px 16px; text-align:center; font-size:14px; color:#4338ca; }
  .score-summary strong { font-size:16px; }

  @media print {
    body { background:white; }
    .student-sheet { padding:12px 16px; }
    @page { margin:8mm; size:A4; }
    .questions-area { grid-template-columns:1fr 1fr; }
  }
</style>
</head>
<body>
<div class="student-sheet">
    <div class="sheet-header">
        <div class="header-left">
            <div class="course-name">${courseName}</div>
            <div class="exam-label">중간고사 시험 결과지</div>
        </div>
        <div class="score-badge">${score} / ${totalQ}</div>
    </div>

    <table class="info-table">
        <thead>
            <tr>
                <th>전공</th><th>학번</th><th>반</th><th>성명</th>
                <th>학습과정명</th><th>담당교수</th><th>점수</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>${student.major || '실용음악'}</td>
                <td>${student.studentId || '-'}</td>
                <td>2</td>
                <td>${displayName}</td>
                <td>${courseName}</td>
                <td>김한상</td>
                <td style="color:${badgeColor};font-weight:900">${score}</td>
            </tr>
        </tbody>
    </table>
    <div class="exam-subtitle">'26-1학기 중간고사(${totalQ}점 만점, 문항당 1점 배점) — 제출일시: ${submittedDate}</div>

    ${!student.hasDetail ? `<div class="no-detail-notice">⚠️ 문항별 선택 답안이 저장되지 않았습니다. 초록색 = 정답을 참고하세요. 최종 점수: <strong>${score} / ${totalQ}점</strong></div>` : ''}

    <div class="questions-area">${questionsHtml}</div>

    <div class="score-summary">
        최종 점수: <strong>${score} / ${totalQ}점 (${scorePercent}%)</strong>
    </div>
</div>
<script>window.onload=function(){window.print();}<\/script>
</body>
</html>`

            const printWindow = window.open('', '_blank')
            if (!printWindow) { alert('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.'); return }
            printWindow.document.write(html)
            printWindow.document.close()

        } catch (e: any) {
            alert('PDF 생성 오류: ' + e.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <button
            onClick={handlePrint}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold shadow-md transition-all active:scale-95"
        >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> 생성 중...</> : <><FileText className="w-4 h-4" /> 내 시험지 PDF 출력</>}
        </button>
    )
}
