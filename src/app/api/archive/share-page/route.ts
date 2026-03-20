import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { sendPushNotification } from '@/lib/webpush'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        // 관리자만 호출 가능
        const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
        if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const body = await req.json()
        const { studentEmail, studentName, pageUrl, weekNumber, studentId } = body

        if (!pageUrl) {
            return NextResponse.json({ error: 'Missing pageUrl' }, { status: 400 })
        }

        // studentId 또는 studentEmail로 사용자 찾기
        let targetUserId: string | null = studentId || null
        if (!targetUserId && studentEmail) {
            const { data: targetUser } = await supabase
                .from('users')
                .select('id')
                .eq('email', studentEmail)
                .single()
            targetUserId = targetUser?.id || null
        }

        if (!targetUserId) {
            console.warn('[share-page] 학생 ID를 찾을 수 없음:', studentEmail)
            return NextResponse.json({ error: '학생 정보를 찾을 수 없습니다.' }, { status: 404 })
        }

        // 해당 학생의 push 구독 조회
        const { data: subs } = await supabase
            .from('push_subscriptions')
            .select('endpoint, keys')
            .eq('user_id', targetUserId)

        if (!subs?.length) {
            // 구독 없으면 — 알림 허용 안 한 상태
            console.warn('[share-page] 학생 푸시 구독 없음:', targetUserId)
            return NextResponse.json({
                ok: false,
                error: '학생이 알림을 허용하지 않았습니다. 학생이 채팅창에서 "알림 허용"을 클릭해야 합니다.'
            }, { status: 200 }) // 200으로 반환 (버튼 UI에서 구분)
        }

        const pushPayload = {
            title: `📖 ${weekNumber ? `${weekNumber}주차 ` : ''}레슨 자료가 등록되었습니다`,
            body: studentName ? `${studentName}님, 새 레슨 자료를 확인하세요!` : '새 레슨 자료를 확인하세요!',
            url: pageUrl,
            tag: `lesson-${weekNumber || 'new'}`,
        }

        const results = await Promise.allSettled(
            subs.map(sub => sendPushNotification(
                { endpoint: sub.endpoint, keys: sub.keys as any },
                pushPayload
            ))
        )

        const anySuccess = results.some(r => r.status === 'fulfilled' && r.value === true)

        if (!anySuccess) {
            return NextResponse.json({ error: 'Push 전송 실패 — 학생의 알림 구독이 만료되었을 수 있습니다.' }, { status: 500 })
        }

        console.log('[share-page push] 전송 성공:', targetUserId)
        return NextResponse.json({ ok: true })
    } catch (e: any) {
        console.error('[share-page] Unexpected error:', e?.message)
        return NextResponse.json({ error: e?.message || '알 수 없는 오류' }, { status: 500 })
    }
}
