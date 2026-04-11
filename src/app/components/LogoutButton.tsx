'use client'
import { auth } from '@/lib/firebase/client';
import { signOut } from 'firebase/auth';
import { useState } from 'react';

export default function LogoutButton({ className }: { className?: string }) {
    const [loading, setLoading] = useState(false)

    const handleLogout = async () => {
        setLoading(true)
        try {
            await signOut(auth);
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
