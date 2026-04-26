'use client'

import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/utils/supabase/client'

export default function LoginPage() {
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleGoogleLogin = async () => {
        setIsLoading(true)
        setError(null)
        try {
            const supabase = createClient()
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${window.location.origin}/auth/callback`,
                },
            })
            if (error) {
                console.error('OAuth 오류:', error.message)
                setError('로그인에 실패했습니다. 다시 시도해 주세요.')
                setIsLoading(false)
            }
            // 성공 시 자동으로 Google 로그인 페이지로 리다이렉트됩니다.
        } catch (err: any) {
            console.error('로그인 오류:', err.message)
            setError('로그인 중 오류가 발생했습니다.')
            setIsLoading(false)
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-blue-50 p-4 dark:from-slate-950 dark:to-indigo-950">
            <div className="w-full max-w-md rounded-3xl border border-gray-100 bg-white p-10 shadow-2xl dark:border-gray-800 dark:bg-gray-900">

                {/* Professor Photo */}
                <div className="flex flex-col items-center mb-8">
                    <div className="relative w-28 h-28 mb-5">
                        <Image
                            src="/professor.jpg"
                            alt="김한상 교수"
                            fill
                            className="rounded-full object-cover object-top shadow-lg ring-4 ring-indigo-100 dark:ring-indigo-900"
                            priority
                        />
                    </div>
                    <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white text-center leading-tight">
                        김한상 교수
                    </h1>
                    <p className="mt-1 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                        강의 관리 시스템 (LMS)
                    </p>
                </div>

                <div className="border-t border-gray-100 dark:border-gray-800 mb-7" />

                <p className="mb-6 text-center text-sm text-gray-500 dark:text-gray-400">
                    학교/개인 구글 계정으로 로그인하여 접근 권한을 확인하세요.
                </p>

                {error && (
                    <div className="mb-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 text-center">
                        {error}
                    </div>
                )}

                <button
                    onClick={handleGoogleLogin}
                    disabled={isLoading}
                    className="flex w-full items-center justify-center gap-3 rounded-xl bg-gray-900 px-4 py-3.5 text-sm font-semibold text-white transition-all hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 dark:focus:ring-white"
                >
                    {isLoading ? (
                        '로그인 처리 중...'
                    ) : (
                        <>
                            <svg className="h-5 w-5" viewBox="0 0 24 24">
                                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                            Google 계정으로 로그인
                        </>
                    )}
                </button>


                </div>
            </div>
        </div>
    )
}
