import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { resend } from '@/lib/resend'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        // 관리자만 호출 가능
        const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
        if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const body = await req.json()
        const { studentEmail, studentName, pageUrl, pageTitle, weekNumber } = body

        if (!studentEmail || !pageUrl) {
            return NextResponse.json({ error: 'Missing studentEmail or pageUrl' }, { status: 400 })
        }

        const { error } = await resend.emails.send({
            from: 'LMS 레슨 <heinhome@icloud.com>',
            to: [studentEmail],
            subject: `[레슨 자료] ${weekNumber}주차 강의 자료가 등록되었습니다`,
            html: `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#6d28d9,#7c3aed);padding:36px 40px;">
      <p style="margin:0;color:rgba(255,255,255,0.7);font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">LESSON ARCHIVE</p>
      <h1 style="margin:8px 0 0;color:white;font-size:26px;font-weight:800;">${weekNumber}주차 레슨 자료</h1>
    </div>
    <!-- Body -->
    <div style="padding:36px 40px;">
      <p style="margin:0 0 8px;font-size:16px;color:#1e293b;font-weight:700;">${studentName || studentEmail} 님,</p>
      <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.7;">
        ${weekNumber}주차 레슨 자료가 등록되었습니다.<br/>
        아래 버튼을 눌러 내용을 확인하세요.
      </p>

      <!-- CTA Button -->
      <div style="text-align:center;margin:32px 0;">
        <a href="${pageUrl}"
           style="display:inline-block;background:linear-gradient(135deg,#6d28d9,#7c3aed);color:white;font-size:15px;font-weight:800;text-decoration:none;padding:14px 36px;border-radius:12px;letter-spacing:0.5px;">
          📖 레슨 자료 보기
        </a>
      </div>

      <p style="margin:24px 0 0;font-size:13px;color:#94a3b8;text-align:center;">
        링크가 열리지 않으면 아래 URL을 복사해 브라우저에 붙여넣으세요.<br/>
        <a href="${pageUrl}" style="color:#7c3aed;word-break:break-all;">${pageUrl}</a>
      </p>
    </div>
    <!-- Footer -->
    <div style="padding:20px 40px;background:#f8fafc;border-top:1px solid #e2e8f0;">
      <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
        발신: heinhome@icloud.com &nbsp;|&nbsp; LMS 자동 발송 메일입니다.
      </p>
    </div>
  </div>
</body>
</html>`,
        })

        if (error) {
            console.error('[share-page email]', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ ok: true })
    } catch (e: any) {
        console.error('[share-page]', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
