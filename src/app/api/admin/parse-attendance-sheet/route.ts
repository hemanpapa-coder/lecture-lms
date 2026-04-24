import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData()
        const file = formData.get('file') as File | null
        const courseId = formData.get('courseId') as string

        if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })

        const mimeType = file.type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
        if (!allowedTypes.includes(mimeType)) {
            return NextResponse.json({ error: '지원하지 않는 파일 형식입니다. JPG, PNG, WEBP, PDF만 가능합니다.' }, { status: 400 })
        }

        const arrayBuffer = await file.arrayBuffer()
        const base64 = Buffer.from(arrayBuffer).toString('base64')

        const GEMINI_KEY = process.env.GEMINI_IMAGE_KEY || process.env.GEMINI_API_KEY
        if (!GEMINI_KEY) return NextResponse.json({ error: 'Gemini API 키가 없습니다.' }, { status: 500 })

        // PDF는 vision으로 직접 처리 (Gemini 1.5는 PDF 지원)
        const geminiMime = mimeType === 'application/pdf' ? 'application/pdf' : mimeType

        const prompt = `이 출석부 이미지/문서를 분석하여 다음 정보를 JSON 형식으로 정확히 추출해주세요.

추출할 정보:
1. students: 학생 목록 (순번, 학번, 이름)
2. weekDates: 수업 주차별 날짜 (주차번호, 날짜)
3. courseName: 과목명 (있는 경우)

규칙:
- 학번은 숫자만 포함된 문자열 (예: "2026413020")
- 날짜는 YYYY-MM-DD 형식 (출석부에 날짜가 있으면 추출, 없으면 빈 배열)
- 순번은 출석부에 적힌 번호 그대로
- 이름이 불명확하면 최대한 유추

반드시 아래 JSON 형식만 출력하세요 (다른 텍스트 없이):
{
  "courseName": "과목명 또는 null",
  "students": [
    {"order": 1, "studentId": "2026413020", "name": "고은서"},
    {"order": 2, "studentId": "2026413029", "name": "김어진"}
  ],
  "weekDates": [
    {"week": 1, "date": "2026-03-07"},
    {"week": 2, "date": "2026-03-14"}
  ]
}`

        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: prompt },
                            { inline_data: { mime_type: geminiMime, data: base64 } }
                        ]
                    }],
                    generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
                })
            }
        )

        if (!geminiRes.ok) {
            const errText = await geminiRes.text()
            console.error('[parse-attendance-sheet] Gemini error:', errText)
            return NextResponse.json({ error: 'AI 처리 실패: ' + errText }, { status: 500 })
        }

        const geminiData = await geminiRes.json()
        const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || ''

        // JSON 추출 (마크다운 코드블록 제거)
        const jsonMatch = rawText.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
            return NextResponse.json({ error: 'AI가 올바른 형식을 반환하지 않았습니다.', rawText }, { status: 422 })
        }

        const parsed = JSON.parse(jsonMatch[0])

        return NextResponse.json({
            success: true,
            courseId,
            courseName: parsed.courseName || null,
            students: parsed.students || [],
            weekDates: parsed.weekDates || [],
            rawText,
        })

    } catch (err: any) {
        console.error('[parse-attendance-sheet] Error:', err)
        return NextResponse.json({ error: err.message || '서버 오류' }, { status: 500 })
    }
}
