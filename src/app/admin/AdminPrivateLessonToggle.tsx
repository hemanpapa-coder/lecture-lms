'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Save, Loader2, CheckCircle2, AlertCircle, UserCheck } from 'lucide-react'

export default function AdminPrivateLessonToggle({
    courseId,
    initialIsPrivate
}: {
    courseId: string
    initialIsPrivate: boolean
}) {
    const supabase = createClient()
    const [isPrivate, setIsPrivate] = useState(initialIsPrivate)
    const [saving, setSaving] = useState(false)
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')

    const handleSave = async () => {
        setSaving(true)
        setSaveStatus('idle')

        try {
            const { error } = await supabase
                .from('courses')
                .update({ is_private_lesson: isPrivate })
                .eq('id', courseId)

            if (error) throw error
            setSaveStatus('success')
            setTimeout(() => setSaveStatus('idle'), 3000)
        } catch (err) {
            console.error(err)
            setSaveStatus('error')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-6 shadow-sm mb-6 flex flex-col space-y-4">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg dark:bg-indigo-900/30 dark:text-indigo-400">
                        <UserCheck className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-neutral-900 dark:text-white">개인 레슨 (1:1) 모드 설정</h3>
                        <p className="text-xs text-neutral-500 mt-1">이 과정을 개인 레슨 모드로 전환하면, 학생마다 독립된 1:1 대화방과 장소/시간 노트가 활성화됩니다.</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={isPrivate}
                            onChange={(e) => setIsPrivate(e.target.checked)}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-neutral-600 peer-checked:bg-indigo-600"></div>
                        <span className="ml-3 text-sm font-bold text-neutral-900 dark:text-neutral-300">
                            {isPrivate ? '활성화됨' : '비활성화됨'}
                        </span>
                    </label>

                    <button
                        onClick={handleSave}
                        disabled={saving || isPrivate === initialIsPrivate}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        저장하기
                    </button>
                </div>
            </div>

            {saveStatus === 'success' && (
                <div className="bg-emerald-50 text-emerald-700 p-3 rounded-xl text-sm font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> 성공적으로 저장되었습니다. 새로고침 시 적용됩니다.
                </div>
            )}
            {saveStatus === 'error' && (
                <div className="bg-red-50 text-red-700 p-3 rounded-xl text-sm font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> 저장에 실패했습니다.
                </div>
            )}
        </div>
    )
}
