'use client'
import { createClient } from '@/utils/supabase/client'
import { useState } from 'react'

export default function LogoutButton({ className }: { className?: string }) {
    const [loading, setLoading] = useState(false)

    const handleLogout = async () => {
        setLoading(true)
        const supabase = createClient()
        await supabase.auth.signOut()
        window.location.href = '/auth/login'
    }

    return (
        <button
            onClick={handleLogout}
            disabled={loading}
            className={className}
        >
            {loading ? '로그아웃 중...' : '로그아웃'}
        </button>
    )
}
