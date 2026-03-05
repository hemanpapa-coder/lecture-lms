/**
 * Grade calculation utilities handling absence rules and missing final projects.
 */

interface EvaluationData {
    attendance_score: number
    absence_count: number
    midterm_score: number
    final_score: number
    assignment_score: number // Should ideally include peer review averages
    susi_score: number
    qa_penalty_count: number
    has_final_project: boolean
}

interface GradingResult {
    totalScore: number
    finalGrade: string
}

const QA_PENALTY_AMOUNT = 2 // 감점 기본 단위 설정 (예: 1회 미제출당 2점 감점)

export function calculateFinalGrade(evalData: EvaluationData): GradingResult {
    // 1. Calculate raw total score (Base 100 assumed as max)
    const rawTotal =
        evalData.attendance_score +
        evalData.midterm_score +
        evalData.final_score +
        evalData.assignment_score +
        evalData.susi_score -
        (evalData.qa_penalty_count * QA_PENALTY_AMOUNT)

    const totalScore = Math.max(0, Math.min(100, Math.round(rawTotal * 10) / 10))

    // 2. Base grade calculation
    let baseGrade = 'F'
    if (totalScore >= 95) baseGrade = 'A+'
    else if (totalScore >= 90) baseGrade = 'A'
    else if (totalScore >= 85) baseGrade = 'B+'
    else if (totalScore >= 80) baseGrade = 'B'
    else if (totalScore >= 75) baseGrade = 'C+'
    else if (totalScore >= 70) baseGrade = 'C'
    else if (totalScore >= 60) baseGrade = 'D'

    // 3. Applying rigid penalty conditions
    let finalGrade = baseGrade

    // Rule A: Final project audio missing -> block 'A' grade (Max B+)
    if (!evalData.has_final_project && (finalGrade === 'A+' || finalGrade === 'A')) {
        finalGrade = 'B+'
    }

    // Rule B: Absence limits (Absence rules override others)
    if (evalData.absence_count >= 3) {
        // 3회 이상 결석 시 F
        finalGrade = 'F'
    } else if (evalData.absence_count === 2) {
        // 2회 결석 시 Max C+
        const allowedGrades = ['C+', 'C', 'D', 'F']
        if (!allowedGrades.includes(finalGrade)) {
            finalGrade = 'C+'
        }
    } else if (evalData.absence_count === 1) {
        // 1회 결석 시 Max B+
        const allowedGrades = ['B+', 'B', 'C+', 'C', 'D', 'F']
        if (!allowedGrades.includes(finalGrade)) {
            finalGrade = 'B+'
        }
    }

    return {
        totalScore,
        finalGrade
    }
}
