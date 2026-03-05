'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import {
    ChevronLeft, ChevronRight, Save, Printer, UploadCloud,
    Download, Trash2, Loader2, FileIcon, AlertCircle, CheckCircle2
} from 'lucide-react';

interface ArchivePage { week_number: number; title: string; content: string; updated_at: string | null; }
interface ArchiveFile { id: string; title: string; file_url: string; file_id: string; file_size: number; created_at: string; }

export default function WeekPageClient({
    isAdmin,
    initialPage,
    initialFiles,
    weekNumber,
    courseId,
}: {
    isAdmin: boolean;
    initialPage: ArchivePage;
    initialFiles: ArchiveFile[];
    weekNumber: number;
    courseId: string | null;
}) {
    const [page, setPage] = useState(initialPage);
    const [files, setFiles] = useState(initialFiles);
    const [editing] = useState(isAdmin); // Admin은 항상 편집 가능 (Notion 스타일)
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

    // File upload state
    const [isDragging, setIsDragging] = useState(false);
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadTitle, setUploadTitle] = useState('');
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');

    const editAreaRef = useRef<HTMLDivElement>(null);

    // Sync initial content to contentEditable div on first mount
    useEffect(() => {
        if (editAreaRef.current) {
            editAreaRef.current.innerHTML = page.content || '';
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSave = async () => {
        setSaving(true);
        const content = editAreaRef.current?.innerHTML || '';
        try {
            const res = await fetch('/api/archive-page', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ week_number: weekNumber, title: page.title, content, course_id: courseId }),
            });
            if (!res.ok) throw new Error('저장 실패');
            setPage(prev => ({ ...prev, content, updated_at: new Date().toISOString() }));
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 3000);
        } catch {
            setSaveStatus('error');
        } finally {
            setSaving(false);
        }
    };

    const handlePrint = () => window.print();

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault(); setIsDragging(false);
        if (e.dataTransfer.files?.[0]) {
            setUploadFile(e.dataTransfer.files[0]);
            if (!uploadTitle) setUploadTitle(e.dataTransfer.files[0].name);
        }
    };

    const handleFileUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!uploadFile) return;
        setUploading(true); setUploadError('');
        try {
            const formData = new FormData();
            formData.append('file', uploadFile);
            formData.append('title', uploadTitle || uploadFile.name);
            formData.append('week_number', String(weekNumber));

            const res = await fetch('/api/archive-upload', { method: 'POST', body: formData });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error || '업로드 실패'); }

            const data = await res.json();
            setFiles(prev => [{
                id: data.file_id,
                title: uploadTitle || uploadFile.name,
                file_url: data.url,
                file_id: data.file_id,
                file_size: uploadFile.size,
                created_at: new Date().toISOString(),
            }, ...prev]);
            setUploadFile(null); setUploadTitle('');
        } catch (err: any) {
            setUploadError(err.message);
        } finally {
            setUploading(false);
        }
    };

    const handleDeleteFile = async (id: string, fileId: string) => {
        if (!window.confirm('이 파일을 삭제하시겠습니까?')) return;
        setFiles(prev => prev.filter(f => f.id !== id));
        await fetch('/api/archive-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, fileId }),
        });
    };

    const formatSize = (bytes: number) => bytes ? (bytes / 1024 / 1024).toFixed(2) + ' MB' : '–';

    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 archive-page">
            {/* Print + Editor CSS */}
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    .archive-page { background: white !important; }
                    .print-content { box-shadow: none !important; border: none !important; }
                }
                .notion-editor h1, .notion-editor h2, .notion-editor h3,
                .notion-editor h4, .notion-editor h5, .notion-editor h6 {
                    font-weight: 700;
                    line-height: 1.3;
                    margin-top: 1.5em;
                    margin-bottom: 0.5em;
                }
                .notion-editor h1 { font-size: 2em; }
                .notion-editor h2 { font-size: 1.5em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.3em; }
                .notion-editor h3 { font-size: 1.25em; }
                .notion-editor p { margin: 0.6em 0; line-height: 1.7; }
                .notion-editor ul { list-style-type: disc; padding-left: 1.8em; margin: 0.5em 0; }
                .notion-editor ol { list-style-type: decimal; padding-left: 1.8em; margin: 0.5em 0; }
                .notion-editor li { margin: 0.3em 0; line-height: 1.7; }
                .notion-editor li > ul, .notion-editor li > ol { margin: 0.2em 0; }
                .notion-editor strong, .notion-editor b { font-weight: 700; }
                .notion-editor em, .notion-editor i { font-style: italic; }
                .notion-editor u { text-decoration: underline; }
                .notion-editor s { text-decoration: line-through; }
                .notion-editor a { color: #3b82f6; text-decoration: underline; }
                .notion-editor blockquote {
                    border-left: 4px solid #d1d5db;
                    padding-left: 1em;
                    margin: 0.75em 0;
                    color: #6b7280;
                    font-style: italic;
                }
                .notion-editor code {
                    background: #f3f4f6;
                    border-radius: 4px;
                    padding: 0.1em 0.4em;
                    font-family: monospace;
                    font-size: 0.9em;
                }
                .notion-editor pre {
                    background: #1e293b;
                    color: #e2e8f0;
                    border-radius: 8px;
                    padding: 1em;
                    overflow-x: auto;
                    margin: 0.75em 0;
                }
                .notion-editor hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.5em 0; }
                .notion-editor table { border-collapse: collapse; width: 100%; margin: 0.75em 0; }
                .notion-editor th, .notion-editor td { border: 1px solid #e5e7eb; padding: 0.5em 0.75em; }
                .notion-editor th { background: #f9fafb; font-weight: 700; }
                .notion-editor [data-block-id], .notion-editor [class*="notion"] {
                    /* strip Notion-specific wrappers */
                }
            `}</style>

            {/* Top Bar */}
            <div className="no-print bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 px-6 py-4 sticky top-0 z-10">
                <div className="mx-auto max-w-4xl flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Link href="/archive" className="p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition text-neutral-500">
                            <ChevronLeft className="w-5 h-5" />
                        </Link>
                        <span className="text-sm font-bold text-neutral-400 uppercase tracking-widest">Week {weekNumber}</span>
                    </div>

                    <div className="flex items-center gap-2">
                        {saveStatus === 'saved' && (
                            <span className="flex items-center gap-1 text-xs font-bold text-emerald-600">
                                <CheckCircle2 className="w-4 h-4" /> 저장됨
                            </span>
                        )}
                        {isAdmin && (
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition disabled:opacity-50"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                저장
                            </button>
                        )}
                        <button
                            onClick={handlePrint}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl transition dark:bg-neutral-800 dark:text-neutral-300"
                        >
                            <Printer className="w-4 h-4" /> PDF 출력
                        </button>
                        {weekNumber < 15 && (
                            <Link href={`/archive/${weekNumber + 1}`} className="p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition text-neutral-500">
                                <ChevronRight className="w-5 h-5" />
                            </Link>
                        )}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="mx-auto max-w-4xl px-6 py-10 space-y-8">

                {/* Title */}
                <div>
                    {editing ? (
                        <input
                            value={page.title}
                            onChange={(e) => setPage(p => ({ ...p, title: e.target.value }))}
                            className="text-4xl font-extrabold w-full bg-transparent border-b-2 border-indigo-400 outline-none pb-2 text-neutral-900 dark:text-white"
                        />
                    ) : (
                        <h1 className="text-4xl font-extrabold text-neutral-900 dark:text-white">{page.title}</h1>
                    )}
                    {page.updated_at && (
                        <p className="text-sm text-neutral-400 mt-2 font-medium">
                            마지막 수정: {new Date(page.updated_at).toLocaleString('ko-KR')}
                        </p>
                    )}
                </div>

                {/* Rich Text Editor / Viewer */}
                <div className="print-content bg-white dark:bg-neutral-900 rounded-3xl shadow-sm border border-neutral-200/60 dark:border-neutral-800 overflow-hidden">
                    {editing ? (
                        <div className="p-2 border-b border-neutral-100 dark:border-neutral-800 flex flex-wrap gap-1 no-print">
                            {[
                                ['bold', 'B', 'font-bold'],
                                ['italic', 'I', 'italic'],
                                ['underline', 'U', 'underline'],
                            ].map(([cmd, label, cls]) => (
                                <button
                                    key={cmd}
                                    onMouseDown={(e) => { e.preventDefault(); document.execCommand(cmd); }}
                                    className={`px-3 py-1.5 text-sm ${cls} hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg text-neutral-700 dark:text-neutral-300 transition`}
                                >
                                    {label}
                                </button>
                            ))}
                            {[
                                ['insertUnorderedList', '• 목록'],
                                ['insertOrderedList', '1. 번호'],
                                ['formatBlock', 'H2'],
                            ].map(([cmd, label]) => (
                                <button
                                    key={cmd}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        if (cmd === 'formatBlock') document.execCommand(cmd, false, 'h2');
                                        else document.execCommand(cmd);
                                    }}
                                    className="px-3 py-1.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg text-neutral-700 dark:text-neutral-300 transition"
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    ) : null}

                    <div
                        ref={editAreaRef}
                        contentEditable={editing}
                        suppressContentEditableWarning
                        className={`notion-editor min-h-[400px] p-8 outline-none text-neutral-800 dark:text-neutral-200 text-[16px] leading-relaxed
                            ${editing ? 'bg-indigo-50/20 dark:bg-indigo-900/10 ring-2 ring-inset ring-indigo-200 dark:ring-indigo-800 cursor-text' : ''}
                        `}
                        dangerouslySetInnerHTML={
                            !editing
                                ? { __html: page.content || '<p style="color:#9ca3af;font-style:italic">아직 작성된 내용이 없습니다. (관리자만 편집 가능)</p>' }
                                : undefined
                        }
                    />
                </div>

                {/* File Attachments */}
                <div className="no-print bg-white dark:bg-neutral-900 rounded-3xl shadow-sm border border-neutral-200/60 dark:border-neutral-800 overflow-hidden">
                    <div className="p-6 border-b border-neutral-100 dark:border-neutral-800">
                        <h2 className="text-lg font-bold text-neutral-900 dark:text-white">첨부 파일</h2>
                        <p className="text-sm text-neutral-500 mt-1">이 주차의 강의 자료 및 참고 파일</p>
                    </div>

                    {/* Admin Upload */}
                    {isAdmin && (
                        <form onSubmit={handleFileUpload} className="no-print p-6 border-b border-neutral-100 dark:border-neutral-800 space-y-4">
                            <input
                                value={uploadTitle}
                                onChange={(e) => setUploadTitle(e.target.value)}
                                placeholder="파일 제목 (선택)"
                                className="w-full rounded-xl border border-neutral-200 p-3 bg-neutral-50 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                            />
                            <div
                                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                onDragLeave={() => setIsDragging(false)}
                                onDrop={handleDrop}
                                className={`border-2 border-dashed rounded-2xl p-6 text-center transition-colors ${isDragging || uploadFile ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800'}`}
                            >
                                <label className="cursor-pointer flex flex-col items-center gap-2">
                                    <UploadCloud className="w-8 h-8 text-neutral-400" />
                                    <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                                        {uploadFile ? uploadFile.name : '파일을 드래그하거나 클릭하여 업로드'}
                                    </span>
                                    <input type="file" className="hidden" onChange={(e) => {
                                        if (e.target.files?.[0]) {
                                            setUploadFile(e.target.files[0]);
                                            if (!uploadTitle) setUploadTitle(e.target.files[0].name);
                                        }
                                    }} />
                                </label>
                            </div>
                            {uploadError && (
                                <div className="flex items-center gap-2 text-sm font-bold text-red-500">
                                    <AlertCircle className="w-4 h-4" /> {uploadError}
                                </div>
                            )}
                            <button
                                type="submit"
                                disabled={!uploadFile || uploading}
                                className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-emerald-700 disabled:opacity-50 transition"
                            >
                                {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> 업로드 중...</> : '이 주차에 파일 공유하기'}
                            </button>
                        </form>
                    )}

                    {/* File List */}
                    {files.length === 0 ? (
                        <div className="p-12 text-center text-neutral-400 font-medium">
                            <FileIcon className="w-10 h-10 mx-auto mb-3 text-neutral-300" />
                            등록된 파일이 없습니다.
                        </div>
                    ) : (
                        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                            {files.map((f) => (
                                <li key={f.id} className="flex items-center justify-between px-6 py-4 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-neutral-100 dark:bg-neutral-800 rounded-xl">
                                            <FileIcon className="w-5 h-5 text-neutral-500" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-neutral-900 dark:text-white">{f.title}</p>
                                            <p className="text-xs text-neutral-400 font-mono">{formatSize(f.file_size)} · {new Date(f.created_at).toLocaleDateString('ko-KR')}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <a
                                            href={f.file_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl transition dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                                        >
                                            <Download className="w-3.5 h-3.5" /> 다운로드
                                        </a>
                                        {isAdmin && (
                                            <button
                                                onClick={() => handleDeleteFile(f.id, f.file_id)}
                                                className="no-print p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition dark:hover:bg-red-900/30"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
