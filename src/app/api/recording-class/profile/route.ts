import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await req.json()
        const { full_name, major, phone, profile_image_url, class_goal, introduction } = body

        // 1. Update auth.user metadata (for name)
        if (full_name) {
            await supabase.auth.updateUser({
                data: { full_name: full_name }
            })
        }

        // 2. Update public.users for the rest
        // Note: student_id and email are read-only
        const updateData: any = {
            major: major,
            phone: phone,
            class_goal: class_goal,
            introduction: introduction
        }
        if (profile_image_url !== undefined) {
            updateData.profile_image_url = profile_image_url
        }

        const { error: updateError } = await supabase
            .from('users')
            .update(updateData)
            .eq('id', user.id)

        if (updateError) {
            console.error('Error updating profile in public.users:', updateError)
            // Even if full_name is added to public.users we can try updating it, 
            // but since it might not exist yet, we only update major and phone.
            const fallbackData: any = {
                major: major,
                phone: phone,
                full_name: full_name // if column exists
            }
            if (profile_image_url !== undefined) {
                fallbackData.profile_image_url = profile_image_url
            }

            const { error: fallbackError } = await supabase
                .from('users')
                .update(fallbackData)
                .eq('id', user.id)
                .select()
        }

        return NextResponse.json({ success: true })

    } catch (e: any) {
        console.error('Profile update error:', e)
        return NextResponse.json({ error: e.message || '저장 실패' }, { status: 500 })
    }
}
