'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Plus, Trash2, Loader2, Book, Video, ExternalLink, FolderUp } from 'lucide-react'

interface LibraryMaterial {
    id: string
    course_id: string
    title: string
    type: 'book' | 'video'
    url: string
    description?: string
    created_at: string
}

export default function AdminLibraryManager({ courseId }: { courseId: string }) {
    const supabase = createClient()
    const [materials, setMaterials] = useState<LibraryMaterial[]>([])
    const [loading, setLoading] = useState(true)

    // Form state (URL Add)
    const [isAdding, setIsAdding] = useState(false)
    const [newType, setNewType] = useState<'book' | 'video'>('book')
    const [newTitle, setNewTitle] = useState('')
    const [newUrl, setNewUrl] = useState('')
    const [newDesc, setNewDesc] = useState('')
    const [saving, setSaving] = useState(false)

    // Folder Upload State
    const [isUploadingFolder, setIsUploadingFolder] = useState(false)
    const [uploadProgress, setUploadProgress] = useState<{ current: number, total: number, percentage: number } | null>(null)
    const folderInputRef = useRef<HTMLInputElement>(null)

    const fetchMaterials = useCallback(async () => {
        setLoading(true)
        const { data } = await supabase
            .from('library_materials')
            .select('*')
            .eq('course_id', courseId)
            .order('created_at', { ascending: false })
        if (data) setMaterials(data)
        setLoading(false)
    }, [courseId, supabase])

    useEffect(() => {
        fetchMaterials()
    }, [fetchMaterials])

    const handleAddUrl = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newTitle || !newUrl) return

        setSaving(true)
        const { error } = await supabase
            .from('library_materials')
            .insert({
                course_id: courseId,
                title: newTitle,
                type: newType,
                url: newUrl,
                description: newDesc
            })

        setSaving(false)
        if (!error) {
            setIsAdding(false)
            setNewTitle('')
            setNewUrl('')
            setNewDesc('')
            fetchMaterials()
        } else {
            alert('자료 추가 실패: ' + error.message)
        }
    }

    const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;

        const files = Array.from(e.target.files).filter(file => !file.name.startsWith('.')); // Ignore hidden files like .DS_Store
        if (files.length === 0) return;

        setIsUploadingFolder(true);
        let currentIdx = 0;
        setUploadProgress({ current: 0, total: files.length, percentage: 0 });

        for (const file of files) {
            try {
                // 1. Get resumable upload URL
                const urlRes = await fetch('/api/archive-upload-url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        fileName: file.name,
                        mimeType: file.type || 'application/octet-stream',
                        fileSize: file.size,
                    }),
                });

                if (!urlRes.ok) throw new Error('업로드 URL 발급 실패');
                const { uploadUrl, fileId } = await urlRes.json();

                // 2. Upload file directly to Drive
                await new Promise<void>((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.open('PUT', uploadUrl);

                    xhr.upload.onprogress = (event) => {
                        if (event.lengthComputable) {
                            setUploadProgress({
                                current: currentIdx,
                                total: files.length,
                                percentage: Math.round((event.loaded / event.total) * 100)
                            });
                        }
                    };

                    xhr.onload = () => {
                        if (xhr.status === 200 || xhr.status === 201 || xhr.status === 0 /* CORS partial block */) {
                            resolve();
                        } else {
                            reject(new Error(`전송 실패: ${xhr.status}`));
                        }
                    };

                    xhr.onerror = () => {
                        if (xhr.status === 0) resolve(); // Treat CORS preflight success as OK for Drive
                        else reject(new Error('네트워크 오류'));
                    };

                    xhr.send(file);
                });

                // 3. Save library metadata
                const metaRes = await fetch('/api/library-save-metadata', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        fileId: fileId,
                        title: file.name,
                        courseId: courseId,
                        type: file.type.includes('video') ? 'video' : 'book',
                        description: '폴더 일괄 업로드',
                    }),
                });

                if (!metaRes.ok) throw new Error('메타데이터 저장 실패');

            } catch (err) {
                console.error(`Error uploading ${file.name}:`, err);
                // Continue with next file even if one fails
            }
            currentIdx++;
            setUploadProgress({ current: currentIdx, total: files.length, percentage: 0 });
        }

        setIsUploadingFolder(false);
        setUploadProgress(null);
        if (folderInputRef.current) folderInputRef.current.value = '';
        fetchMaterials();
    }

    const handleDelete = async (id: string) => {
        if (!confirm('정말 삭제하시겠습니까?')) return
        const { error } = await supabase
            .from('library_materials')
            .delete()
            .eq('id', id)
        if (!error) {
            setMaterials(prev => prev.filter(m => m.id !== id))
        }
    }

    return (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-6 shadow-sm mb-6 flex flex-col space-y-4">
            <div className="flex justify-between items-center mb-2">
                <div>
                    <h3 className="text-lg font-bold text-neutral-900 dark:text-white">공용 도서관 자료 관리</h3>
                    <p className="text-xs text-neutral-500 mt-1">이 과정의 학생들에게 제공할 책(링크)과 대용량 영상 폴더를 관리합니다.</p>
                </div>
                <div className="flex gap-2">
                    <input
                        type="file"
                        ref={folderInputRef}
                        onChange={handleFolderSelect}
                        {...{ webkitdirectory: "true", directory: "true" } as any}
                        multiple
                        className="hidden"
                    />
                    <button
                        onClick={() => folderInputRef.current?.click()}
                        disabled={isUploadingFolder}
                        className="flex items-center gap-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50 px-4 py-2 rounded-xl text-sm font-bold transition disabled:opacity-50"
                    >
                        {isUploadingFolder ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderUp className="w-4 h-4" />}
                        {isUploadingFolder ? '업로드 중...' : '폴더 영상 업로드'}
                    </button>
                    <button
                        onClick={() => setIsAdding(!isAdding)}
                        className="flex items-center gap-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50 px-4 py-2 rounded-xl text-sm font-bold transition"
                    >
                        <Plus className="w-4 h-4" /> 링크 자료 추가
                    </button>
                </div>
            </div>

            {/* Folder Upload Progress UI */}
            {isUploadingFolder && uploadProgress && (
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-4 border border-emerald-200 dark:border-emerald-800/30">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                            동영상 폴더 업로드 진행 중... ({uploadProgress.current} / {uploadProgress.total} 완료)
                        </span>
                        <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">{uploadProgress.percentage}%</span>
                    </div>
                    <div className="w-full bg-emerald-200/50 dark:bg-emerald-900/50 rounded-full h-2">
                        <div
                            className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${uploadProgress.percentage}%` }}
                        />
                    </div>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2">
                        브라우저 창을 닫지 마세요. 대용량 파일은 시간이 걸릴 수 있습니다.
                    </p>
                </div>
            )}

            {isAdding && (
                <form onSubmit={handleAddUrl} className="bg-neutral-50 dark:bg-neutral-800 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-700 space-y-4 mb-4">
                    <div className="flex gap-4">
                        <div className="w-1/3 space-y-1">
                            <label className="text-xs font-bold text-neutral-700 dark:text-neutral-300">자료 유형</label>
                            <select
                                value={newType}
                                onChange={e => setNewType(e.target.value as 'book' | 'video')}
                                className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                <option value="book">책 (PDF/문서 링크)</option>
                                <option value="video">영상 (유튜브/드라이브 링크)</option>
                            </select>
                        </div>
                        <div className="w-2/3 space-y-1">
                            <label className="text-xs font-bold text-neutral-700 dark:text-neutral-300">자료 제목</label>
                            <input
                                required
                                value={newTitle}
                                onChange={e => setNewTitle(e.target.value)}
                                placeholder="예: 레코딩 실습 교재 1권"
                                className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-neutral-700 dark:text-neutral-300">접속 URL</label>
                        <input
                            required
                            type="url"
                            value={newUrl}
                            onChange={e => setNewUrl(e.target.value)}
                            placeholder="https://..."
                            className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-neutral-700 dark:text-neutral-300">설명 (선택)</label>
                        <input
                            value={newDesc}
                            onChange={e => setNewDesc(e.target.value)}
                            placeholder="자료에 대한 간단한 설명..."
                            className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={() => setIsAdding(false)}
                            className="px-4 py-2 text-sm font-bold text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                        >
                            취소
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl text-sm font-bold transition disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '추가하기'}
                        </button>
                    </div>
                </form>
            )}

            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {loading ? (
                    <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-neutral-400" /></div>
                ) : materials.length === 0 ? (
                    <div className="py-8 text-center text-sm font-bold text-neutral-400">등록된 자료가 없습니다.</div>
                ) : (
                    materials.map(m => (
                        <div key={m.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl border border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 hover:border-neutral-200 dark:hover:border-neutral-700 transition">
                            <div className="flex items-center gap-4">
                                <div className={`p-3 rounded-xl shrink-0 ${m.type === 'video' ? 'bg-red-50 text-red-500 dark:bg-red-900/30' : 'bg-blue-50 text-blue-500 dark:bg-blue-900/30'}`}>
                                    {m.type === 'video' ? <Video className="w-5 h-5" /> : <Book className="w-5 h-5" />}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-bold text-sm text-neutral-900 dark:text-white">{m.title}</h4>
                                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${m.type === 'video' ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'}`}>
                                            {m.type === 'video' ? '영상' : '책'}
                                        </span>
                                    </div>
                                    {m.description && <p className="text-xs text-neutral-500 mt-1">{m.description}</p>}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 mt-4 sm:mt-0 shrink-0">
                                <a
                                    href={m.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="p-2 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                                    title="열기"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                </a>
                                <button
                                    onClick={() => handleDelete(m.id)}
                                    className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                    title="삭제"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
