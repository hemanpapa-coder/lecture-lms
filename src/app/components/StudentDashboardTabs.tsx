'use client'

import { useState } from 'react'
import { BookOpen, MessagesSquare, Mic2, Music } from 'lucide-react'
import ChatRoom from '@/components/ChatRoom'

export default function StudentDashboardTabs({
    children,
    courseId,
    userId,
    isAdmin,
    userMajor = '',
    isPrivateLesson = false,
}: {
    children: React.ReactNode;
    courseId: string;
    userId: string;
    isAdmin: boolean;
    userMajor?: string;
    isPrivateLesson?: boolean;
}) {
    const [activeTab, setActiveTab] = useState<'log' | 'chat_communal' | 'chat_engineer' | 'chat_musician'>('log')

    // 엔지니어/뮤지션 전공 구분 (RecordingDashboardClient 기준과 동일)
    const isEngineer = userMajor?.includes('엔지니어') || userMajor?.includes('engineer') || userMajor?.includes('Engineer')
    const isMusician = !isEngineer && !isAdmin

    // 학생에게 보이는 채팅 탭: 공동 + 본인 전공 (또는 어드민은 전체)
    const showEngineerTab = isAdmin || isEngineer
    const showMusicianTab = isAdmin || isMusician

    // ── 개인레슨: 탭 없이 1:1 채팅만 바로 표시 ──
    if (isPrivateLesson) {
        return (
            <div className="lg:col-span-2 space-y-6">
                {/* 학습 대시보드 내용 */}
                <div className="space-y-8">
                    {children}
                </div>

                {/* 교수와 1:1 대화창 */}
                <ChatRoom
                    courseId={courseId}
                    userId={userId}
                    isAdmin={isAdmin}
                    isPrivateMode={true}
                    title="교수와 1:1 대화창"
                    subtitle="담당 교수와 나누는 개인 대화창입니다."
                />
            </div>
        )
    }

    return (
        <div className="lg:col-span-2 space-y-6">
            {/* Tab Switcher */}
            <div className="flex flex-wrap gap-1 bg-white dark:bg-slate-900 p-1 rounded-2xl w-fit shadow-sm border border-slate-200 dark:border-slate-800">
                <button
                    onClick={() => setActiveTab('log')}
                    className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'log' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                >
                    <BookOpen className="w-4 h-4" /> 학습 대시보드
                </button>
                <button
                    onClick={() => setActiveTab('chat_communal')}
                    className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'chat_communal' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                >
                    <MessagesSquare className="w-4 h-4" /> 공동 대화창
                    {activeTab !== 'chat_communal' && <span className="flex h-2 w-2 rounded-full bg-red-500" />}
                </button>
                {showEngineerTab && (
                    <button
                        onClick={() => setActiveTab('chat_engineer')}
                        className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'chat_engineer' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                        <Mic2 className="w-4 h-4" /> 엔지니어
                        {activeTab !== 'chat_engineer' && <span className="flex h-2 w-2 rounded-full bg-emerald-500" />}
                    </button>
                )}
                {showMusicianTab && (
                    <button
                        onClick={() => setActiveTab('chat_musician')}
                        className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'chat_musician' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                        <Music className="w-4 h-4" /> 뮤지션
                        {activeTab !== 'chat_musician' && <span className="flex h-2 w-2 rounded-full bg-violet-500" />}
                    </button>
                )}
            </div>

            {/* Content */}
            {activeTab === 'log' && (
                <div className="space-y-8">
                    {children}
                </div>
            )}
            {activeTab === 'chat_communal' && (
                <ChatRoom
                    courseId={courseId}
                    userId={userId}
                    isAdmin={isAdmin}
                    title="공동 대화창"
                    subtitle="모든 학생과 강사가 참여하는 대화창입니다."
                />
            )}
            {activeTab === 'chat_engineer' && (
                <ChatRoom
                    courseId={`${courseId}_engineer`}
                    userId={userId}
                    isAdmin={isAdmin}
                    isPrivateMode={true}
                    title="엔지니어 대화창"
                    subtitle="엔지니어 파트 학생들과 강사 전용 대화창입니다."
                />
            )}
            {activeTab === 'chat_musician' && (
                <ChatRoom
                    courseId={`${courseId}_musician`}
                    userId={userId}
                    isAdmin={isAdmin}
                    isPrivateMode={true}
                    title="뮤지션 대화창"
                    subtitle="뮤지션 전공 학생들과 강사 전용 대화창입니다."
                />
            )}
        </div>
    )
}
