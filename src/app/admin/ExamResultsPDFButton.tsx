'use client'

import { useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'

const OPTION_LABELS = ['①', '②', '③', '④', '⑤']

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
                const totalQ = questions.length
                const score = student.score ?? 0
                const scorePercent = Math.round((score / totalQ) * 100)
                const badgeColor = student.isCheated ? '#dc2626'
                    : scorePercent >= 80 ? '#16a34a'
                    : scorePercent >= 60 ? '#d97706' : '#dc2626'

                // 문항별 렌더링 (모든 문항 + 보기 전부 표시)
                const questionsHtml = questions.map((q: any, qIdx: number) => {
                    const studentAnswer = student.hasDetail ? (student.answers[qIdx] ?? null) : null
                    const correctAnswer = q.answerText || (q.options && q.options[q.answerIndex]) || ''

                    // 정답 여부 판단
                    const isCorrect = studentAnswer !== null && (
                        studentAnswer === correctAnswer ||
                        studentAnswer === q.answerIndex ||
                        (typeof studentAnswer === 'number' && q.options && q.options[studentAnswer] === correctAnswer)
                    )

                    const optionsHtml = (q.options || []).map((opt: string, oIdx: number) => {
                        const label = OPTION_LABELS[oIdx] || `${oIdx + 1}`
                        const isCorrectOpt = opt === correctAnswer

                        let optStyle = 'opt-normal'
                        let markHtml = ''

                        if (student.hasDetail) {
                            const isStudentPick = studentAnswer !== null && (
                                studentAnswer === opt ||
                                studentAnswer === oIdx ||
                                (typeof studentAnswer === 'string' && studentAnswer.includes(opt.slice(0, 10)))
                            )
                            if (isStudentPick && isCorrectOpt) { optStyle = 'opt-correct'; markHtml = '<span class="opt-mark">✓ 정답</span>' }
                            else if (isStudentPick && !isCorrectOpt) { optStyle = 'opt-wrong'; markHtml = '<span class="opt-mark">✗ 오답</span>' }
                            else if (!isStudentPick && isCorrectOpt) { optStyle = 'opt-answer'; markHtml = '<span class="opt-mark ans-mark">← 정답</span>' }
                        } else {
                            // 답안 없는 경우: 정답만 초록으로 강조
                            if (isCorrectOpt) { optStyle = 'opt-answer'; markHtml = '<span class="opt-mark ans-mark">◀ 정답</span>' }
                        }

                        return `<div class="opt-row ${optStyle}">
                            <span class="opt-label">${label}</span>
                            <span class="opt-text">${opt}</span>
                            ${markHtml}
                        </div>`
                    }).join('')

                    const statusIcon = !student.hasDetail ? '' : isCorrect ? '✓' : '✗'
                    const qHeaderClass = !student.hasDetail ? 'q-header-neutral'
                        : isCorrect ? 'q-header-correct' : 'q-header-wrong'

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

                return `
                <div class="student-sheet ${sIdx < results.length - 1 ? 'page-break' : ''}">

                    <!-- ── 헤더 (기존 유지) ── -->
                    <div class="sheet-header">
                        <div class="header-left">
                            <div class="course-name">${courseName}</div>
                            <div class="exam-label">중간고사 시험 결과지</div>
                        </div>
                        <div class="score-badge" style="background:${badgeColor}">
                            ${student.isCheated ? '부정행위' : `${score} / ${totalQ}`}
                        </div>
                    </div>

                    <!-- ── 학생 정보 (기존 유지) ── -->
                    <div class="student-info">
                        <div class="info-row">
                            <span class="info-label">이름</span>
                            <span class="info-value">${student.fullName}</span>
                            <span class="info-label">학번</span>
                            <span class="info-value">${student.studentId || '-'}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">제출 시각</span>
                            <span class="info-value">${submittedDate}</span>
                            <span class="info-label">정답률</span>
                            <span class="info-value" style="color:${badgeColor};font-weight:700">
                                ${student.isCheated ? '0%' : scorePercent + '%'}
                                ${student.hasDetail ? '' : ' (답안 기록 없음)'}
                            </span>
                        </div>
                    </div>

                    ${student.isCheated ? `<div class="cheat-warning">⚠️ 부정행위 감지 — 이 시험지는 강제 종료되었습니다.</div>` : ''}
                    ${!student.hasDetail ? `<div class="no-detail-notice">⚠️ 시스템 오류로 이 학생의 문항별 선택 답안이 저장되지 않았습니다. <strong>초록색 = 정답</strong>을 참고하여 직접 채점 결과와 비교해주세요. 최종 점수: <strong>${score} / ${totalQ}점</strong></div>` : ''}

                    <!-- ── 전체 문항 출력 ── -->
                    <div class="questions-area">
                        ${questionsHtml}
                    </div>

                    <!-- ── 점수 요약 ── -->
                    <div class="score-summary">
                        최종 점수: <strong>${student.isCheated ? '0점 (부정행위 차단)' : score + ' / ' + totalQ + '점 (' + scorePercent + '%)'}</strong>
                    </div>
                </div>`
            }).join('')

            const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${courseName}_중간고사_전체시험지</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Apple SD Gothic Neo','Malgun Gothic','맑은 고딕',Arial,sans-serif; background:#fff; color:#1f2937; font-size:12px; }

  /* ── 학생 시트 ── */
  .student-sheet { padding:20px 24px; }
  .page-break { page-break-after:always; border-bottom:2px dashed #e5e7eb; margin-bottom:0; padding-bottom:20px; }

  /* ── 헤더 ── */
  .sheet-header { background:linear-gradient(135deg,#4338ca,#3b82f6); color:white; border-radius:10px; padding:14px 18px; display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
  .course-name { font-size:17px; font-weight:800; margin-bottom:2px; }
  .exam-label { font-size:11px; opacity:0.8; }
  .score-badge { padding:7px 16px; border-radius:8px; font-size:17px; font-weight:900; color:white; }

  /* ── 학생 정보 ── */
  .student-info { background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; padding:10px 14px; margin-bottom:10px; }
  .info-row { display:flex; gap:6px; align-items:center; margin-bottom:3px; }
  .info-row:last-child { margin-bottom:0; }
  .info-label { font-size:10px; color:#6b7280; font-weight:600; background:#e5e7eb; padding:2px 7px; border-radius:4px; white-space:nowrap; }
  .info-value { font-size:12px; font-weight:700; color:#111827; flex:1; }

  .cheat-warning { background:#fef2f2; border:1px solid #fca5a5; color:#b91c1c; padding:8px 12px; border-radius:6px; font-weight:700; margin-bottom:8px; text-align:center; }
  .no-detail-notice { background:#fffbeb; border:1px solid #fcd34d; color:#92400e; padding:7px 12px; border-radius:6px; font-weight:600; margin-bottom:8px; font-size:11px; }

  /* ── 문항 영역 ── */
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

  /* ── 보기 ── */
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

  /* ── 해설 ── */
  .explanation { margin:0 8px 8px; background:#f0f9ff; border-left:3px solid #38bdf8; padding:6px 8px; border-radius:0 5px 5px 0; font-size:10px; color:#0c4a6e; line-height:1.5; }
  .exp-label { font-weight:800; margin-right:4px; }

  /* ── 점수 요약 ── */
  .score-summary { background:#eef2ff; border:2px solid #a5b4fc; border-radius:8px; padding:10px 16px; text-align:center; font-size:14px; color:#4338ca; }
  .score-summary strong { font-size:16px; }

  @media print {
    body { background:white; }
    .student-sheet { padding:12px 16px; }
    .page-break { page-break-after:always; border:none; }
    @page { margin:8mm; size:A4; }
    .questions-area { grid-template-columns:1fr 1fr; }
  }
</style>
</head>
<body>
${studentsHtml}
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
