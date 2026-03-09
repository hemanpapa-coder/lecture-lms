'use client'

import { useState } from 'react'
import { BookOpen, MessagesSquare } from 'lucide-react'
import ChatRoom from '@/components/ChatRoom'

export default function StudentDashboardTabs({
    children,
    courseId,
    userId,
    isAdmin
}: {
    children: React.ReactNode;
    courseId: string;
    userId: string;
    isAdmin: boolean;
}) {
    const [activeTab, setActiveTab] = useState<'log' | 'chat'>('log')

    return (
        <div className="lg:col-span-2 space-y-6">
            {/* Tab Switcher */}
            <div className="flex bg-white dark:bg-slate-900 p-1 rounded-2xl w-fit shadow-sm border border-slate-200 dark:border-slate-800">
                <button
                    onClick={() => setActiveTab('log')}
                    className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'log' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                >
                    <BookOpen className="w-4 h-4" /> 학습 대시보드
                </button>
                <button
                    onClick={() => setActiveTab('chat')}
                    className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'chat' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                >
                    <MessagesSquare className="w-4 h-4" /> 대화창 {activeTab !== 'chat' && <span className="flex h-2 w-2 rounded-full bg-red-500"></span>}
                </button>
            </div>

            {activeTab === 'log' ? (
                <div className="space-y-8">
                    {children}
                </div>
            ) : (
                <ChatRoom courseId={courseId} userId={userId} isAdmin={isAdmin} />
            )}
        </div>
    )
}
