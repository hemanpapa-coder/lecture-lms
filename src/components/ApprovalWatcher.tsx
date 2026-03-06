'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

export default function ApprovalWatcher({ userId }: { userId: string }) {
    const router = useRouter()
    const supabase = createClient()

    useEffect(() => {
        if (!userId) return

        // Subscribe to changes in the users table for this specific user
        const channel = supabase
            .channel(`user-approval-${userId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'users',
                    filter: `id=eq.${userId}`
                },
                (payload) => {
                    // Check if is_approved just became true
                    if (payload.new.is_approved === true) {
                        router.refresh()
                    }
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [userId, router, supabase])

    return null // This component doesn't render anything
}
