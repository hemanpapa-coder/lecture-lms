import { Resend } from 'resend';

export const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_fallback_for_build');

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'hemanpapa@gmail.com'

export async function sendAdminEmail(subject: string, html: string): Promise<boolean> {
  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 're_dummy_fallback_for_build') {
    console.warn('[resend] RESEND_API_KEY 미설정 — 이메일 생략')
    return false
  }
  try {
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'LMS 알림 <onboarding@resend.dev>',
      to: [ADMIN_EMAIL],
      subject,
      html,
    })
    if (error) { console.error('[resend]', error); return false }
    return true
  } catch (e: any) {
    console.error('[resend] 오류:', e.message)
    return false
  }
}
