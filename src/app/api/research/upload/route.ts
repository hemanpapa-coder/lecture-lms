import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const body = await req.json()
        const { title, description, tags, fileUrl, fileName, fileSize, courseId } = body

        if (!title || !courseId) {
            return NextResponse.json({ error: '제목과 과목은 필수입니다.' }, { status: 400 })
        }

        const { data, error } = await supabase
            .from('research_uploads')
            .insert({
                user_id: user.id,
                course_id: courseId,
                title,
                description: description || '',
                tags: tags || [],
                file_url: fileUrl || null,
                file_name: fileName || null,
                file_size: fileSize || 0,
                is_published: false,
            })
            .select()
            .single()

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ success: true, data })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
