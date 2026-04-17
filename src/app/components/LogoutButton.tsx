'use client'
import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';

export default function LogoutButton({ className }: { className?: string }) {
    const [loading, setLoading] = useState(false)
    const supabase = createClient()

    const handleLogout = async () => {
        setLoading(true)
        try {
            await supabase.auth.signOut();
            await fetch('/api/auth/logout', { method: 'POST' });
        } catch (error) {
            console.error(error);
        }
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
