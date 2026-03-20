import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { sendPushNotification } from '@/lib/webpush'

// Vercel Cron: 매주 월요일 오전 8시 (KST)
// 역할: Gemini AI로 지난 주 학습 패턴 분석 → 리포트 저장 → 어드민 push 알림
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const geminiKey = process.env.GEMINI_API_KEY!

  // 지난 주 날짜 범위
  const now = new Date()
  const lastMonday = new Date(now)
  lastMonday.setDate(now.getDate() - 7)
  lastMonday.setHours(0, 0, 0, 0)
  const lastSunday = new Date(now)
  lastSunday.setDate(now.getDate() - 1)
  lastSunday.setHours(23, 59, 59, 999)

  const weekLabel = `${lastMonday.getFullYear()}-W${String(getISOWeek(lastMonday)).padStart(2, '0')}`

  try {
    // ── 데이터 수집 ──
    const { data: courses } = await supabase.from('courses').select('id, name, is_private_lesson').eq('is_ended', false)
    const reports = []

    for (const course of courses || []) {
      // 학생 현황
      const { data: students } = await supabase.from('users').select('id, name, email, major, created_at').eq('role', 'user').eq('is_approved', true).eq('course_id', course.id)
      if (!students?.length) continue

      // 지난주 과제 제출
      const { data: weekAssignments } = await supabase.from('assignments').select('user_id, created_at').in('user_id', students.map((s: any) => s.id)).gte('created_at', lastMonday.toISOString()).lte('created_at', lastSunday.toISOString())

      // 지난주 Q&A
      const { data: weekQna } = await supabase.from('board_questions').select('id, title, user_id, created_at').eq('course_id', course.id).gte('created_at', lastMonday.toISOString())

      // 전체 통계
      const submittedIds = new Set((weekAssignments || []).map((a: any) => a.user_id))
      const notSubmitted = students.filter((s: any) => !submittedIds.has(s.id))
      const submissionRate = Math.round((submittedIds.size / students.length) * 100)

      const stats = {
        course: course.name,
        courseId: course.id,
        weekLabel,
        totalStudents: students.length,
        submitted: submittedIds.size,
        notSubmitted: notSubmitted.length,
        submissionRate,
        qnaCount: weekQna?.length || 0,
        notSubmittedNames: notSubmitted.slice(0, 10).map((s: any) => s.name || s.email),
      }

      // ── Gemini AI 리포트 생성 ──
      const promptText = `당신은 LMS 학습 분석 AI입니다.
아래 지난 1주일간의 수업 데이터를 분석하여 교수님을 위한 학습 현황 리포트를 생성해주세요.

[수업 정보]
- 과목명: ${course.name}
- 분석 기간: ${lastMonday.toLocaleDateString('ko-KR')} ~ ${lastSunday.toLocaleDateString('ko-KR')}
- 총 학생: ${students.length}명
- 과제 제출: ${submittedIds.size}명 (${submissionRate}%)
- 미제출: ${notSubmitted.length}명 (${stats.notSubmittedNames.join(', ')})
- Q&A 질문: ${weekQna?.length || 0}건

[분석 요청]
1. 이번 주 학습 참여도 평가 (⭐점수와 코멘트)
2. 과제 제출률 해석 (높으면 긍정적, 낮으면 개선 방안)
3. 미제출 학생 관리 방안 제안
4. Q&A 활동 분석
5. 다음 주 수업을 위한 권장 행동 (3가지)

출력: 순수 HTML. <h2>, <p>, <ul><li>, <strong> 사용. 500단어 이내로 간결하게.`

      const aiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
          }),
        }
      )

      let reportHtml = ''
      if (aiRes.ok) {
        const aiData = await aiRes.json()
        reportHtml = aiData?.candidates?.[0]?.content?.parts?.[0]?.text || ''
        reportHtml = reportHtml.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
      }

      if (!reportHtml) {
        reportHtml = `<h2>📊 ${course.name} 주간 현황</h2>
<p>과제 제출률: <strong>${submissionRate}%</strong> (${submittedIds.size}/${students.length}명)</p>
<p>미제출 학생: ${notSubmitted.length}명</p>
<p>Q&A 질문: ${weekQna?.length || 0}건</p>`
      }

      // DB 저장
      const { data: savedReport } = await supabase.from('ai_reports').insert({
        course_id: course.id,
        report_type: 'weekly',
        period_label: weekLabel,
        content: reportHtml,
        stats,
      }).select('id').single()

      reports.push({ courseId: course.id, courseName: course.name, reportId: savedReport?.id, submissionRate })
    }

    // ── 어드민에게 push 알림 ──
    const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin')
    const adminIds = admins?.map((a: any) => a.id) || []
    const { data: adminSubs } = await supabase.from('push_subscriptions').select('endpoint, keys').in('user_id', adminIds)

    for (const sub of adminSubs || []) {
      await sendPushNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        {
          title: `📊 주간 학습 리포트 준비됨`,
          body: `${reports.length}개 과목의 AI 분석 리포트를 확인하세요`,
          url: '/admin/reports',
          tag: 'weekly-report',
        }
      )
    }

    return NextResponse.json({ ok: true, weekLabel, reports })
  } catch (e: any) {
    console.error('[weekly-report]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}
