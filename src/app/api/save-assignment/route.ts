import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { userId, weekName, fileName, fileId, webViewLink, courseId } = await req.json()

        if (!userId || !weekName || !fileId) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        // 보안 검사: 본인의 과제만 저장할 수 있도록 (관리자 예외)
        const { data: userRecord } = await supabase.from('users').select('role').eq('id', user.id).single()
        const isAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com'
        if (!isAdmin && user.id !== userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        const weekNum = parseInt(weekName.replace(/[^0-9]/g, ''), 10) || 0

        // DB에 과제 기록 삽입 (서버 사이드이므로 RLS를 안전하게 통과하거나 서비스 롤 수준의 처리 가능)
        // 현재는 서버의 Authenticated 권한으로 실행됨.
        const { error: dbError } = await supabase.from('assignments').insert({
            user_id: userId,
            week_number: weekNum,
            file_url: webViewLink || `https://drive.google.com/file/d/${fileId}/view`,
            file_id: fileId,
            file_name: fileName,
            course_id: courseId || null,
            status: 'submitted',
            content: '(파일만 제출됨)',
        })

        if (dbError) throw new Error(`DB 저장 실패: ${dbError.message}`)

        return NextResponse.json({ ok: true })
    } catch (error: any) {
        console.error('Save Assignment Error:', error)
        return NextResponse.json({ error: error?.message || 'Failed to save assignment' }, { status: 500 })
    }
}
