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
    ? `당신은 LMS(학습 관리 시스템)의 AI 비서입니다. 교수님을 도와드립니다.
현재 시각: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
현재 과목 ID: ${courseId || '선택 안 됨'}

학생 조회, 과제 현황, Q&A, 버그 리포트 등 LMS 데이터를 도구로 조회하여 정확히 답변하세요.
답변은 한국어로, 친절하고 간결하게 해주세요. 숫자/목록은 명확히 정리해주세요.`
    : `당신은 LMS의 AI 학습 비서입니다. 학생을 도와드립니다.
현재 시각: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
강의 노트, Q&A 등을 조회해 답변할 수 있습니다. 한국어로 친절하게 답변하세요.`

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
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
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
