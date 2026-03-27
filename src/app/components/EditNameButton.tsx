'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'

export default function EditNameButton({ currentName }: { currentName: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [newName, setNewName] = useState(currentName)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return

    setIsLoading(true)
    setError('')

    try {
      const res = await fetch('/api/update-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName: newName.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '이름 변경에 실패했습니다.')
      }

      setIsOpen(false)
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => {
          setNewName(currentName)
          setIsOpen(true)
          setError('')
        }}
        className="p-1.5 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition ml-1 inline-flex items-center justify-center"
        title="이름 변경"
      >
        <Pencil className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-neutral-900 rounded-3xl p-6 w-full max-w-sm shadow-xl border border-neutral-200 dark:border-neutral-800">
            <h2 className="text-xl font-bold mb-4 text-neutral-900 dark:text-white">이름 변경</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="newName" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  새 이름
                </label>
                <input
                  id="newName"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-xl bg-white dark:bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                  placeholder="이름을 입력하세요"
                  required
                />
              </div>
              {error && <p className="text-sm text-red-500 font-medium">{error}</p>}
              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-sm font-bold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition"
                  disabled={isLoading}
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !newName.trim() || newName === currentName}
                  className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition"
                >
                  {isLoading ? '저장 중...' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
