import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const maxDuration = 60

// ── LMS 도구 정의 (Gemini Function Calling) ──────────────────────
const LMS_TOOLS = [
  {
    name: 'get_students',
    description: '학생 목록과 기본 통계를 조회합니다. 과목별 필터링 가능.',
    parameters: {
      type: 'OBJECT',
      properties: {
        course_id: { type: 'STRING', description: '과목 ID (없으면 전체 조회)' },
        approved_only: { type: 'BOOLEAN', description: '승인된 학생만 조회할지 여부' },
      },
    },
  },
  {
    name: 'get_pending_approvals',
    description: '수강 승인을 기다리고 있는 학생 목록을 조회합니다.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'get_assignment_stats',
    description: '과제 제출 현황을 조회합니다. 미제출 학생 목록 포함.',
    parameters: {
      type: 'OBJECT',
      properties: {
        course_id: { type: 'STRING', description: '과목 ID' },
      },
    },
  },
  {
    name: 'get_archive_list',
    description: '강의 노트(아카이브) 목록을 조회합니다.',
    parameters: {
      type: 'OBJECT',
      properties: {
        course_id: { type: 'STRING', description: '과목 ID' },
        limit: { type: 'NUMBER', description: '최대 조회 개수 (기본 10)' },
      },
    },
  },
  {
    name: 'get_recent_qna',
    description: '최근 Q&A 게시글을 조회합니다.',
    parameters: {
      type: 'OBJECT',
      properties: {
        course_id: { type: 'STRING', description: '과목 ID' },
        limit: { type: 'NUMBER', description: '최대 조회 개수 (기본 5)' },
      },
    },
  },
  {
    name: 'get_error_reports',
    description: '미처리(open) 버그/에러 리포트를 조회합니다.',
    parameters: {
      type: 'OBJECT',
      properties: {
        course_id: { type: 'STRING', description: '과목 ID (없으면 전체)' },
      },
    },
  },
  {
    name: 'get_courses',
    description: '등록된 모든 과목 목록을 조회합니다.',
    parameters: { type: 'OBJECT', properties: {} },
  },
]

// ── 도구 실행 함수 ────────────────────────────────────────────────
async function executeTool(name: string, args: Record<string, any>, supabase: any, isAdmin: boolean): Promise<string> {
  try {
    switch (name) {
      case 'get_students': {
        if (!isAdmin) return JSON.stringify({ error: '학생 목록은 교수만 조회할 수 있습니다.' })
        let query = supabase.from('users').select('id, name, email, is_approved, course_id, private_lesson_id, major, created_at').eq('role', 'user').order('created_at', { ascending: false })
        if (args.course_id) query = query.eq('course_id', args.course_id)
        if (args.approved_only) query = query.eq('is_approved', true)
        const { data, error } = await query.limit(50)
        if (error) return JSON.stringify({ error: error.message })
        const summary = {
          total: data.length,
          approved: data.filter((s: any) => s.is_approved).length,
          pending: data.filter((s: any) => !s.is_approved).length,
          students: data.map((s: any) => ({ name: s.name || '이름없음', email: s.email, approved: s.is_approved, major: s.major })),
        }
        return JSON.stringify(summary)
      }

      case 'get_pending_approvals': {
        if (!isAdmin) return JSON.stringify({ error: '교수만 조회 가능합니다.' })
        const { data, error } = await supabase.from('users').select('id, name, email, course_id, created_at, approval_request_count').eq('role', 'user').eq('is_approved', false).order('created_at', { ascending: false })
        if (error) return JSON.stringify({ error: error.message })
        return JSON.stringify({ count: data.length, students: data.map((s: any) => ({ name: s.name || '이름없음', email: s.email, requestCount: s.approval_request_count || 1, appliedAt: s.created_at })) })
      }

      case 'get_assignment_stats': {
        if (!isAdmin) return JSON.stringify({ error: '교수만 조회 가능합니다.' })
        const { data: students } = await supabase.from('users').select('id, name, email').eq('role', 'user').eq('is_approved', true)
        const { data: assignments } = await supabase.from('assignments').select('user_id, id')
        const stats = (students || []).map((s: any) => {
          const count = (assignments || []).filter((a: any) => a.user_id === s.id).length
          return { name: s.name || s.email, submittedWeeks: count, progress: Math.min(100, Math.round((count / 15) * 100)) + '%' }
        })
        const noSubmit = stats.filter((s: any) => s.submittedWeeks === 0)
        return JSON.stringify({ totalStudents: stats.length, noSubmission: noSubmit.length, stats: stats.slice(0, 20) })
      }

      case 'get_archive_list': {
        const limit = args.limit || 10
        let query = supabase.from('archive_pages').select('week_number, title, updated_at, course_id').order('week_number', { ascending: false }).limit(limit)
        if (args.course_id) query = query.eq('course_id', args.course_id)
        const { data, error } = await query
        if (error) return JSON.stringify({ error: error.message })
        return JSON.stringify({ count: data.length, pages: data.map((p: any) => ({ week: p.week_number, title: p.title || `${p.week_number}주차`, updatedAt: p.updated_at })) })
      }

      case 'get_recent_qna': {
        const limit = args.limit || 5
        let query = supabase.from('board_questions').select('title, content, created_at, user_id, answer').eq('type', 'qna').order('created_at', { ascending: false }).limit(limit)
        if (args.course_id) query = query.eq('course_id', args.course_id)
        const { data, error } = await query
        if (error) return JSON.stringify({ error: error.message })
        return JSON.stringify({ count: data.length, questions: data.map((q: any) => ({ title: q.title, hasAnswer: !!q.answer, createdAt: q.created_at })) })
      }

      case 'get_error_reports': {
        if (!isAdmin) return JSON.stringify({ error: '교수만 조회 가능합니다.' })
        let query = supabase.from('error_reports').select('description, page_url, user_name, created_at, status').eq('status', 'open').order('created_at', { ascending: false }).limit(10)
        if (args.course_id) query = query.eq('course_id', args.course_id)
        const { data, error } = await query
        if (error) return JSON.stringify({ error: error.message })
        return JSON.stringify({ count: data.length, reports: data.map((r: any) => ({ description: r.description?.slice(0, 100), page: r.page_url, reporter: r.name || '익명', createdAt: r.created_at })) })
      }

      case 'get_courses': {
        const { data, error } = await supabase.from('courses').select('id, name, is_private_lesson, is_ended').order('name')
        if (error) return JSON.stringify({ error: error.message })
        return JSON.stringify({ courses: data.map((c: any) => ({ id: c.id, name: c.name, type: c.is_private_lesson ? '개인레슨' : '클래스', ended: c.is_ended })) })
      }

      default:
        return JSON.stringify({ error: `알 수 없는 도구: ${name}` })
    }
  } catch (e: any) {
    return JSON.stringify({ error: e.message })
  }
}

// ── POST 핸들러 ───────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRow } = await supabase.from('users').select('role, name, course_id').eq('id', user.id).single()
  const isAdmin = userRow?.role === 'admin' || user.email === 'hemanpapa@gmail.com'

  const { messages, courseId } = await req.json()
  if (!messages?.length) return NextResponse.json({ error: 'messages required' }, { status: 400 })

  const geminiKey = process.env.GEMINI_API_KEY!

  // 시스템 컨텍스트
  const systemPrompt = isAdmin
    ? `당신은 교수님의 만능 AI 비서입니다. 친절하고 유능한 조수로서 모든 질문과 업무를 처리합니다.
현재 시각: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
현재 과목 ID: ${courseId || '선택 안 됨'}

## 역할
1. **LMS 업무**: 학생 조회, 과제 현황, Q&A, 버그 리포트 → 제공된 도구(Function Calling)를 사용하여 실시간 데이터 조회
2. **일반 업무**: 번역, 계산, 글쓰기, 코딩, 아이디어 발상, 음악/교육 관련 질문 등 모든 분야
3. **비서 역할**: 일정 정리, 이메일/공지 초안 작성, 강의 자료 아이디어 등
4. **페이지 제어**: 사용자가 특정 버튼을 눌러달라고 요청하면 아래 규칙에 따라 응답

## 페이지 UI 제어 규칙
사용자가 화면의 버튼/기능을 실행하도록 요청하면:
1. 짧은 안내 문장으로 응답
2. 응답 맨 끝에 반드시 \`[ACTION:버튼텍스트]\` 형식으로 클릭할 버튼을 명시

주요 버튼 예시 (현재 페이지에 있을 수 있는 버튼들):
- AI 정리, 편집, 저장, 이대로 저장하기, 학생에게 전송, PDF 출력, 히스토리
- 파일 업로드, 폴더/다중 파일, 강의 음성 저장함, 업로드
- AI로 만들기, 삽입 안 함, 재생성, 제거
- 라이브 대화 시작, 종료

예시:
사용자: "AI 정리 버튼 눌러줘" → "네, AI 정리를 시작할게요! [ACTION:AI 정리]"
사용자: "편집 버튼 클릭해줘" → "편집 모드로 전환합니다! [ACTION:편집]"
사용자: "저장해줘" → "저장하겠습니다! [ACTION:이대로 저장하기]"

## 답변 원칙
- 한국어로 답변 (요청하면 다른 언어 가능)
- 친절하고 간결하게, 필요하면 목록/표 사용
- LMS 관련 질문이면 도구를 먼저 사용하고, 일반 질문이면 바로 답변`
    : `당신은 학생의 만능 AI 학습 비서입니다.
현재 시각: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}

## 역할
1. **학습 지원**: 강의 노트 조회, Q&A 확인 → 도구 사용
2. **일반 질문**: 번역, 계산, 개념 설명, 코딩, 음악 이론 등 모든 분야
3. **대화**: 자유롭게 대화하며 학습 동기부여 제공
4. **페이지 제어**: 버튼 클릭 요청 시 [ACTION:버튼텍스트] 형식으로 응답

## 답변 원칙
- 한국어로 답변 (요청하면 다른 언어)
- 학생 눈높이에 맞게 친절하고 이해하기 쉽게`

  try {
    // Gemini API — Function Calling
    const geminiMessages = messages.map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

    // 도구를 어드민에게만 전체 제공, 학생에게는 제한된 도구 제공
    const availableTools = isAdmin ? LMS_TOOLS : LMS_TOOLS.filter(t => ['get_archive_list', 'get_recent_qna'].includes(t.name))

    const body = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: geminiMessages,
      tools: [{ function_declarations: availableTools }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
    }

    let finalText = ''
    let iterations = 0
    const maxIterations = 5
    let currentMessages = [...geminiMessages]

    while (iterations < maxIterations) {
      iterations++
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${geminiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, contents: currentMessages }) }
      )
      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Gemini error ${res.status}: ${err.slice(0, 200)}`)
      }
      const data = await res.json()
      const candidate = data?.candidates?.[0]
      const parts = candidate?.content?.parts || []

      // 도구 호출이 있는지 확인
      const functionCalls = parts.filter((p: any) => p.functionCall)
      if (functionCalls.length === 0) {
        // 최종 텍스트 응답
        finalText = parts.map((p: any) => p.text || '').join('').trim()
        break
      }

      // 도구 실행 후 결과를 대화에 추가
      currentMessages = [...currentMessages, { role: 'model', parts }]
      const toolResults = await Promise.all(
        functionCalls.map(async (p: any) => {
          const result = await executeTool(p.functionCall.name, p.functionCall.args || {}, supabase, isAdmin)
          return { functionResponse: { name: p.functionCall.name, response: { result } } }
        })
      )
      currentMessages = [...currentMessages, { role: 'user', parts: toolResults }]
    }

    if (!finalText) finalText = '죄송합니다, 답변을 생성하지 못했습니다. 다시 시도해주세요.'

    return NextResponse.json({ reply: finalText })
  } catch (e: any) {
    console.error('[ai-assistant]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
