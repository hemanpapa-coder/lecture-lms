'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, CheckCircle2, Database, Loader2, Search, Send } from 'lucide-react'

type Candidate = {
  area: string
  key: string
  value: unknown
  updatedAt?: string
}

type Props = {
  user: {
    id: string
    name: string
    email: string
    studentId: string
  }
  legacyCourseId: string
  hubCourseId: string
  serverSubmission: unknown
  serverScore: number | null
}

const HUB_BASE_URL = (process.env.NEXT_PUBLIC_HUB_BASE_URL || 'https://neuracoust.tplinkdns.com').replace(/\/$/, '')
const KEYWORDS = ['midterm', 'exam', 'mcq', 'objective', 'quiz', 'answer', 'answers', 'wrongAnswers', 'score', '중간', '고사', '시험', '객관식', '온라인시험', '자동복구', '제출완료']
const SKIP_WORDS = ['supabase.auth', 'sb-', 'access_token', 'refresh_token', 'provider_token', 'password', 'cookie']

function textOf(value: unknown) {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    return String(value || '')
  }
}

function looksRelevant(key: string, value: unknown) {
  const text = `${key}\n${textOf(value)}`.toLowerCase()
  if (SKIP_WORDS.some((word) => text.includes(word.toLowerCase()))) return false
  return KEYWORDS.some((word) => text.includes(word.toLowerCase()))
}

function parseValue(value: string) {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function scanWebStorage(storage: Storage | undefined, area: string) {
  const rows: Candidate[] = []
  if (!storage) return rows
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index) || ''
    const raw = storage.getItem(key) || ''
    if (looksRelevant(key, raw)) rows.push({ area, key, value: parseValue(raw) })
  }
  return rows
}

async function scanIndexedDb() {
  const rows: Candidate[] = []
  const idb = indexedDB as IDBFactory & { databases?: () => Promise<Array<{ name?: string }>> }
  const databaseList = typeof idb.databases === 'function' ? await idb.databases().catch(() => []) : []
  for (const databaseInfo of databaseList || []) {
    if (!databaseInfo.name || SKIP_WORDS.some((word) => databaseInfo.name?.toLowerCase().includes(word.toLowerCase()))) continue
    await new Promise<void>((resolve) => {
      const open = indexedDB.open(databaseInfo.name || '')
      open.onerror = () => resolve()
      open.onsuccess = () => {
        const db = open.result
        const stores = Array.from(db.objectStoreNames)
        if (!stores.length) {
          db.close()
          resolve()
          return
        }
        let pending = stores.length
        const done = () => {
          pending -= 1
          if (pending <= 0) {
            db.close()
            resolve()
          }
        }
        for (const storeName of stores) {
          try {
            const tx = db.transaction(storeName, 'readonly')
            const store = tx.objectStore(storeName)
            const req = store.getAll()
            req.onerror = done
            req.onsuccess = () => {
              const values = Array.isArray(req.result) ? req.result.slice(0, 50) : []
              values.forEach((value, index) => {
                const key = `${databaseInfo.name}.${storeName}.${index}`
                if (looksRelevant(key, value)) rows.push({ area: 'indexedDB', key, value })
              })
              done()
            }
          } catch {
            done()
          }
        }
      }
    })
  }
  return rows
}

export default function MidtermRecoveryClient({ user, legacyCourseId, hubCourseId, serverSubmission, serverScore }: Props) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [scanning, setScanning] = useState(true)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function scan() {
      setScanning(true)
      const found = [
        ...scanWebStorage(typeof localStorage !== 'undefined' ? localStorage : undefined, 'localStorage'),
        ...scanWebStorage(typeof sessionStorage !== 'undefined' ? sessionStorage : undefined, 'sessionStorage'),
        ...(await scanIndexedDb()),
      ]
      if (!cancelled) {
        setCandidates(found)
        setScanning(false)
      }
    }
    void scan()
    return () => {
      cancelled = true
    }
  }, [])

  const hasServerSubmission = Boolean(serverSubmission)
  const canSend = hasServerSubmission || candidates.length > 0
  const summary = useMemo(() => {
    if (scanning) return '이 브라우저에 남은 중간고사 자료를 확인하고 있습니다.'
    if (canSend) return '복구 가능한 후보가 있습니다. 아래 버튼을 누르면 현재 LMS 서버로 전송합니다.'
    return '이 브라우저와 Vercel 서버 기록에서 복구 후보를 찾지 못했습니다.'
  }, [canSend, scanning])

  async function sendRecovery() {
    setSending(true)
    setResult(null)
    try {
      const response = await fetch(`${HUB_BASE_URL}/api/lms/courses/${hubCourseId}/midterm-recovery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'lecture-lms-vercel-midterm-recovery',
          sourceOrigin: window.location.origin,
          legacyUserId: user.id,
          legacyCourseId,
          studentId: user.studentId,
          name: user.name,
          email: user.email,
          serverSubmission,
          browserCandidates: candidates,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || '복구 자료 전송에 실패했습니다.')
      setResult({ ok: true, message: `전송 완료: ${data.scoreSource || '복구'} · ${data.score ?? '-'}점` })
    } catch (error: any) {
      setResult({ ok: false, message: error?.message || '복구 자료 전송에 실패했습니다.' })
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-8">
      <div className="mx-auto grid max-w-2xl gap-5">
        <Link href={`/workspace/${user.id}?course=${legacyCourseId}`} className="text-sm font-bold text-slate-500 hover:text-indigo-600">
          ← 수업 화면으로 돌아가기
        </Link>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-5 flex items-start gap-3">
            <div className="rounded-2xl bg-indigo-100 p-3 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300">
              <Search className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white">중간고사 복구 확인</h1>
              <p className="mt-1 text-sm leading-6 text-slate-500">{summary}</p>
            </div>
          </div>

          <div className="grid gap-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                  <Database className="h-4 w-4" /> Vercel 서버 기록
                </span>
                <strong className={hasServerSubmission ? 'text-emerald-600' : 'text-slate-400'}>
                  {hasServerSubmission ? `${serverScore ?? '-'}점 기록 있음` : '없음'}
                </strong>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">브라우저 저장소 후보</span>
                <strong className={candidates.length ? 'text-emerald-600' : 'text-slate-400'}>
                  {scanning ? '확인 중' : `${candidates.length}건`}
                </strong>
              </div>
              {candidates.length > 0 && (
                <div className="mt-3 grid gap-2">
                  {candidates.slice(0, 6).map((candidate) => (
                    <div key={`${candidate.area}:${candidate.key}`} className="truncate rounded-xl bg-white px-3 py-2 text-xs text-slate-500 dark:bg-slate-900">
                      {candidate.area} · {candidate.key}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {result && (
            <div className={`mt-4 flex items-center gap-2 rounded-2xl p-4 text-sm font-bold ${result.ok ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'}`}>
              {result.ok ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
              {result.message}
            </div>
          )}

          <button
            type="button"
            onClick={sendRecovery}
            disabled={!canSend || scanning || sending}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:shadow-none"
          >
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            {sending ? '현재 서버로 전송 중' : '현재 LMS 서버로 복구 자료 보내기'}
          </button>
        </section>
      </div>
    </main>
  )
}
