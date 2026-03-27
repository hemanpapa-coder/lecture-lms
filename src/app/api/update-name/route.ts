import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const body = await req.json()
        const { newName } = body

        if (!newName || typeof newName !== 'string' || !newName.trim()) {
            return NextResponse.json({ error: '유효한 이름을 입력해 주세요.' }, { status: 400 })
        }

        const { error } = await supabase
            .from('users')
            .update({ name: newName.trim() })
            .eq('id', user.id)

        if (error) {
            console.error('[update-name] error:', error.message)
            return NextResponse.json({ error: '이름 업데이트에 실패했습니다.' }, { status: 500 })
        }

        return NextResponse.json({ success: true, newName: newName.trim() })
    } catch (err: any) {
        console.error('[update-name] catch:', err.message)
        return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
    }
}
