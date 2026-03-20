import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

// POST /api/push/subscribe - 사용자 Push 구독 저장
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { subscription, courseId } = body

    if (!subscription?.endpoint || !subscription?.keys) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
    }

    // 구독 정보를 DB에 upsert (같은 endpoint는 덮어씀)
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: user.id,
        course_id: courseId || null,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,endpoint',
        ignoreDuplicates: false,
      })

    if (error) {
      console.error('[push/subscribe] DB error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[push/subscribe] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE /api/push/subscribe - 구독 해제
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { endpoint } = await req.json()

    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', endpoint)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
