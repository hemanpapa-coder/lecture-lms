import { NextRequest, NextResponse } from 'next/server'
import { generateVision } from '@/lib/ai'

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData()
        const file = formData.get('file') as File | null
        const courseId = formData.get('courseId') as string

        if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })

        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json({ error: 'JPG, PNG, WEBP, PDF만 가능합니다.' }, { status: 400 })
        }

        const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
        const mimeType = file.type === 'application/pdf' ? 'application/pdf' : file.type

        const prompt = `이 출석부 이미지/문서를 분석하여 다음 정보를 JSON 형식으로 정확히 추출해주세요.
추출: 1) students: [{order(순번), studentId(학번), name(이름)}] 2) weekDates: [{week(주차), date(YYYY-MM-DD)}] 3) courseName
규칙: 학번은 숫자문자열, 날짜없으면 빈배열, 다른텍스트없이 JSON만 출력.
{"courseName":"과목명","students":[{"order":1,"studentId":"2026413020","name":"고은서"}],"weekDates":[{"week":1,"date":"2026-03-07"}]}`

        const rawText = await generateVision(prompt, base64, mimeType)
        const jsonMatch = rawText.match(/\{[\s\S]*\}/)
        if (!jsonMatch) return NextResponse.json({ error: 'AI 인식 실패', rawText }, { status: 422 })

        const parsed = JSON.parse(jsonMatch[0])
        return NextResponse.json({
            success: true, courseId,
            courseName: parsed.courseName || null,
            students: parsed.students || [],
            weekDates: parsed.weekDates || [],
        })
    } catch (err: any) {
        return NextResponse.json({ error: err.message || '서버 오류' }, { status: 500 })
    }
}
