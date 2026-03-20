import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { sendPushNotification } from '@/lib/webpush'

// Vercel Cron: 매일 오전 9시 (UTC 0시 = KST 9시)
// 역할: 승인 대기 학생 체크, 미제출 과제 알림
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  // Vercel Cron 인증 헤더 확인
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const results: string[] = []

  try {
    // ① 승인 대기 학생 체크
    const { data: pendingStudents } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('role', 'user')
      .eq('is_approved', false)

    if (pendingStudents && pendingStudents.length > 0) {
      // 어드민에게 push 알림 전송
      const { data: adminSubs } = await supabase
        .from('push_subscriptions')
        .select('endpoint, keys')
        .in('user_id', supabase.from('users').select('id').eq('role', 'admin') as any)

      // 어드민 직접 조회
      const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin')
      const adminIds = admins?.map((a: any) => a.id) || []
      const { data: adminPushSubs } = await supabase
        .from('push_subscriptions')
        .select('endpoint, keys')
        .in('user_id', adminIds)

      if (adminPushSubs?.length) {
        for (const sub of adminPushSubs) {
          await sendPushNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            {
              title: `📋 승인 대기 학생 ${pendingStudents.length}명`,
              body: pendingStudents.slice(0, 3).map((s: any) => s.name || s.email).join(', ') + (pendingStudents.length > 3 ? ` 외 ${pendingStudents.length - 3}명` : ''),
              url: '/?view=admin',
              tag: 'pending-approval',
            }
          )
        }
      }
      results.push(`승인대기: ${pendingStudents.length}명 알림 발송`)
    }

    // ② 이번 주 과제 미제출 학생 감지 (수-금 만 발송)
    const dayOfWeek = new Date().getDay() // 0=일, 3=수, 5=금
    if (dayOfWeek === 3 || dayOfWeek === 5) {
      const { data: allStudents } = await supabase
        .from('users')
        .select('id, name, email, course_id')
        .eq('role', 'user')
        .eq('is_approved', true)

      // 이번 주 과제 제출 여부 확인
      const thisMonday = new Date()
      thisMonday.setDate(thisMonday.getDate() - thisMonday.getDay() + 1)
      thisMonday.setHours(0, 0, 0, 0)

      const { data: weekAssignments } = await supabase
        .from('assignments')
        .select('user_id')
        .gte('created_at', thisMonday.toISOString())

      const submittedIds = new Set((weekAssignments || []).map((a: any) => a.user_id))
      const notSubmitted = (allStudents || []).filter((s: any) => !submittedIds.has(s.id))

      // 미제출 학생 본인에게 알림
      for (const student of notSubmitted.slice(0, 30)) {
        const { data: subs } = await supabase
          .from('push_subscriptions')
          .select('endpoint, keys')
          .eq('user_id', student.id)

        for (const sub of subs || []) {
          await sendPushNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            {
              title: '📝 이번 주 과제를 아직 제출하지 않았어요',
              body: '강의 내용을 복습하고 과제를 제출해보세요!',
              url: '/',
              tag: 'assignment-reminder',
            }
          )
        }
      }
      results.push(`미제출 알림: ${notSubmitted.length}명`)
    }

    return NextResponse.json({ ok: true, results, time: new Date().toISOString() })
  } catch (e: any) {
    console.error('[daily-check]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
