'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { getDirectDownloadUrl } from '@/utils/driveUtils';
import {
    ChevronLeft, ChevronRight, Save, Printer, UploadCloud,
    Download, Trash2, Loader2, FileIcon, AlertCircle, CheckCircle2,
    FolderOpen, FileStack, Zap, History, Clock
} from 'lucide-react';
import JSZip from 'jszip';
import HistoryModal from '@/components/HistoryModal';

interface ArchivePage { id: string; week_number: number; title: string; content: string; updated_at: string | null; }
interface ArchiveFile { id: string; title: string; file_url: string; file_id: string; file_size: number; created_at: string; display_name?: string; file_name?: string; }

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
    const [historyOpen, setHistoryOpen] = useState(false);

    // File upload state
    const [isDragging, setIsDragging] = useState(false);
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadFiles, setUploadFiles] = useState<FileList | File[] | null>(null);
    const [isFolderMode, setIsFolderMode] = useState(false);
    const [uploadTitle, setUploadTitle] = useState('');
    const [uploading, setUploading] = useState(false);
    const [zipping, setZipping] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0); // 0~100
    const [uploadError, setUploadError] = useState('');


    const editAreaRef = useRef<HTMLDivElement>(null);
    const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

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

    // Auto-save logic: Debounce save 2 seconds after last change
    const triggerAutoSave = useCallback(() => {
        if (!isAdmin) return;
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = setTimeout(() => {
            handleSave();
        }, 2000); // 2 seconds delay
    }, [isAdmin, page.title, courseId]); // eslint-disable-line react-hooks/exhaustive-deps

    const handlePrint = () => {
        window.print();
    };


    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault(); setIsDragging(false);
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            if (files.length > 1) {
                setUploadFiles(files);
                setUploadFile(null);
                if (!uploadTitle) setUploadTitle(`${files[0].name} 외 ${files.length - 1}개`);
            } else {
                setUploadFile(files[0]);
                setUploadFiles(null);
                if (!uploadTitle) setUploadTitle(files[0].name);
            }
        }
    };

    const handleFileUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        const targetFile = uploadFile;
        const targetFiles = uploadFiles;
        if (!targetFile && !targetFiles) return;

        setUploading(true); setUploadError(''); setUploadProgress(0);
        try {
            let finalFile: File | Blob = targetFile as File;
            let finalFileName = uploadTitle || (targetFile ? targetFile.name : 'archive.zip');
            let finalMimeType = targetFile ? (targetFile.type || 'application/octet-stream') : 'application/zip';

            // Zipping logic for Folders or Multiple Files (v9.3 Fix)
            if (targetFiles && targetFiles.length > 0) {
                setZipping(true);
                const zip = new JSZip();
                const filesArray = Array.from(targetFiles);

                filesArray.forEach((file: any) => {
                    const path = file.webkitRelativePath || file.name;
                    const fileName = file.name.toLowerCase();

                    // Filter out system/junk files that cause "File could not be found" errors
                    const isSystemFile =
                        fileName === '.ds_store' ||
                        fileName === 'thumbs.db' ||
                        fileName.startsWith('._') ||
                        fileName.includes('__macosx');

                    if (!isSystemFile) {
                        zip.file(path, file);
                    }
                });

                const content = await zip.generateAsync({ type: 'blob' });
                finalFile = content;
                if (!finalFileName.endsWith('.zip')) finalFileName += '.zip';
                finalMimeType = 'application/zip';
                setZipping(false);
            } else if (isFolderMode && targetFile) {
                // Single file but in folder mode? (Shouldn't happen with webkitdirectory but just in case)
                setZipping(true);
                const zip = new JSZip();
                zip.file(targetFile.name, targetFile);
                finalFile = await zip.generateAsync({ type: 'blob' });
                if (!finalFileName.endsWith('.zip')) finalFileName += '.zip';
                finalMimeType = 'application/zip';
                setZipping(false);
            }

            // STEP 1: Get resumable upload URL
            const urlRes = await fetch('/api/archive-upload-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileName: finalFileName,
                    mimeType: finalMimeType,
                    fileSize: finalFile.size,
                }),
            });
            if (!urlRes.ok) {
                const d = await urlRes.json();
                throw new Error(d.error || 'URL 생성 실패');
            }
            const { uploadUrl, fileId: preGeneratedId } = await urlRes.json();

            // STEP 2: Upload file DIRECTLY to Google Drive (Bypasses Vercel!)
            // v8 strategy: We already have fileId, so we just need the upload to complete.
            await new Promise<void>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('PUT', uploadUrl);
                // Omit Content-Type here; Step 1 already defined it in the session init.
                // Browsers sometimes add their own boundary/type which can conflict.

                xhr.upload.onprogress = (event) => {
                    if (event.lengthComputable) {
                        setUploadProgress(Math.round((event.loaded / event.total) * 100));
                    }
                };
                xhr.onload = () => {
                    // Status 200/201 is perfect. Status 0 at 100% progress is usually a CORS block on the final response.
                    if (xhr.status === 200 || xhr.status === 201 || xhr.status === 0) {
                        setUploadProgress(100);
                        resolve();
                    } else {
                        reject(new Error(`구글 드라이브 업로드 전송 실패 (v8: status ${xhr.status})`));
                    }
                };
                xhr.onerror = () => {
                    // CORS issues often trigger onerror with status 0 after data is sent.
                    // If we reached 100%, we treat it as potentially successful and let Step 3 verify.
                    if (xhr.status === 0) {
                        setUploadProgress(100);
                        resolve();
                    } else {
                        reject(new Error(`네트워크 오류 또는 전송 중단 (status ${xhr.status})`));
                    }
                };
                xhr.send(finalFile);
            });

            // STEP 3: Save metadata & set permissions (Uses the ID from Step 1)
            const metaRes = await fetch('/api/archive-save-metadata', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileId: preGeneratedId,
                    title: finalFileName,
                    fileSize: finalFile.size,
                    weekNumber: String(weekNumber),
                    courseId: courseId, // Added for visibility across devices
                }),
            });
            if (!metaRes.ok) {
                const d = await metaRes.json();
                throw new Error(d.error || '메타데이터 저장 실패 (v8.1)');
            }
            const data = await metaRes.json();

            setFiles(prev => [{
                id: preGeneratedId,
                title: finalFileName,
                file_url: data.url,
                file_id: preGeneratedId,
                file_size: finalFile.size,
                created_at: new Date().toISOString(),
            }, ...prev]);
            setUploadFile(null); setUploadFiles(null); setUploadTitle(''); setUploadProgress(0);
        } catch (err: any) {
            setUploadError(err.message);
        } finally {
            setUploading(false);
        }
    };

    const handleDeleteFile = async (dbId: string, driveFileId: string) => {
        if (!confirm('정말 이 파일을 삭제하시겠습니까? 구글 드라이브에서도 영구 삭제됩니다.')) return;

        setFiles(prev => prev.filter(f => f.id !== dbId));
        await fetch('/api/archive-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: dbId, fileId: driveFileId }),
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

                /* ===== DARK MODE OVERRIDES ===== */
                @media (prefers-color-scheme: dark) {
                    .notion-editor { color: #e2e8f0; }
                    .notion-editor h1, .notion-editor h2, .notion-editor h3,
                    .notion-editor h4, .notion-editor h5, .notion-editor h6 { color: #f1f5f9; }
                    .notion-editor h2 { border-bottom-color: #334155; }
                    .notion-editor p, .notion-editor li { color: #cbd5e1; }
                    .notion-editor blockquote { border-left-color: #475569; color: #94a3b8; }
                    .notion-editor code { background: #1e293b; color: #a5b4fc; }
                    .notion-editor hr { border-top-color: #334155; }
                    /* 표 전체를 흰 배경으로 통일 — 셀마다 배경색이 달라도 항상 읽기 쉽게 */
                    .notion-editor table {
                        background: #ffffff;
                        border-radius: 6px;
                        overflow: hidden;
                    }
                    .notion-editor th, .notion-editor td {
                        border-color: #94a3b8;
                        background: #ffffff !important;
                        color: #1e293b !important;
                    }
                    .notion-editor th {
                        background: #f1f5f9 !important;
                        color: #0f172a !important;
                    }
                    /* 표 안의 모든 텍스트 요소를 어두운 색으로 — 흰 배경에 밝은 글씨 방지 */
                    .notion-editor td p, .notion-editor th p,
                    .notion-editor td li, .notion-editor th li,
                    .notion-editor td span, .notion-editor th span,
                    .notion-editor td div, .notion-editor th div,
                    .notion-editor td strong, .notion-editor th strong,
                    .notion-editor td em, .notion-editor th em,
                    .notion-editor td b, .notion-editor th b,
                    .notion-editor td a, .notion-editor th a,
                    .notion-editor td * { color: #1e293b !important; }
                    .notion-editor a { color: #818cf8; }
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
                        {saving && (
                            <span className="flex items-center gap-1 text-xs font-bold text-indigo-500 animate-pulse bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1.5 rounded-lg">
                                <Loader2 className="w-4 h-4 animate-spin" /> 저장 중...
                            </span>
                        )}
                        {saveStatus === 'saved' && !saving && (
                            <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-3 py-1.5 rounded-lg">
                                <CheckCircle2 className="w-4 h-4" /> 자동 저장됨
                            </span>
                        )}
                        <button
                            onClick={handlePrint}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl transition dark:bg-neutral-800 dark:text-neutral-300"
                        >
                            <Printer className="w-4 h-4" /> PDF 출력
                        </button>
                        {isAdmin && (
                            <button
                                onClick={() => setHistoryOpen(true)}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-white border border-neutral-200 hover:border-indigo-500 text-neutral-700 rounded-xl transition dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-300"
                            >
                                <History className="w-4 h-4" /> 히스토리
                            </button>
                        )}
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
                            onChange={(e) => {
                                setPage(p => ({ ...p, title: e.target.value }));
                                triggerAutoSave();
                            }}
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
                        onInput={triggerAutoSave}
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
                        <div className="no-print p-6 border-b border-neutral-100 dark:border-neutral-800 space-y-6">
                            {/* Mode Toggle */}
                            <div className="flex bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl w-fit">
                                <button
                                    onClick={() => { setIsFolderMode(false); setUploadFile(null); setUploadFiles(null); }}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition ${!isFolderMode ? 'bg-white dark:bg-neutral-700 shadow-sm text-indigo-600' : 'text-neutral-500 hover:text-neutral-700'}`}
                                >
                                    <FileStack className="w-4 h-4" /> 단일 파일
                                </button>
                                <button
                                    onClick={() => { setIsFolderMode(true); setUploadFile(null); setUploadFiles(null); }}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition ${isFolderMode ? 'bg-white dark:bg-neutral-700 shadow-sm text-indigo-600' : 'text-neutral-500 hover:text-neutral-700'}`}
                                >
                                    <FolderOpen className="w-4 h-4" /> 폴더/다중 파일
                                </button>
                            </div>

                            <form onSubmit={handleFileUpload} className="space-y-4">
                                <input
                                    value={uploadTitle}
                                    onChange={(e) => setUploadTitle(e.target.value)}
                                    placeholder={isFolderMode ? "압축 파일 제목 (예: 소스코드_최종.zip)" : "파일 제목 (선택)"}
                                    className="w-full rounded-xl border border-neutral-200 p-3 bg-neutral-50 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white transition"
                                />
                                <div
                                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                    onDragLeave={() => setIsDragging(false)}
                                    onDrop={handleDrop}
                                    className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${isDragging || uploadFile || uploadFiles ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 shadow-inner' : 'border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800'}`}
                                >
                                    <label className="cursor-pointer flex flex-col items-center gap-3">
                                        {isFolderMode ? <FolderOpen className="w-10 h-10 text-neutral-400 animate-bounce" /> : <UploadCloud className="w-10 h-10 text-neutral-400" />}
                                        <div className="space-y-1">
                                            <p className="text-sm font-bold text-neutral-700 dark:text-neutral-300">
                                                {uploadFile ? uploadFile.name : (uploadFiles ? `${uploadFiles.length}개의 항목 선택됨` : (isFolderMode ? '폴더를 드래그하거나 클릭하여 선택' : '파일을 드래그하거나 클릭하여 업로드'))}
                                            </p>
                                            <p className="text-xs text-neutral-400 font-medium">
                                                {isFolderMode ? '하위 폴더 구조를 포함하여 자동으로 ZIP 압축됩니다.' : '개별 파일 업로드'}
                                            </p>
                                        </div>
                                        <input
                                            type="file"
                                            className="hidden"
                                            multiple={isFolderMode}
                                            {...(isFolderMode ? { webkitdirectory: "", directory: "" } as any : {})}
                                            onChange={(e) => {
                                                const files = e.target.files;
                                                if (files && files.length > 0) {
                                                    if (files.length > 1 || isFolderMode) {
                                                        setUploadFiles(files);
                                                        setUploadFile(null);
                                                        if (!uploadTitle) setUploadTitle(isFolderMode ? `${files[0].webkitRelativePath.split('/')[0] || 'folder'}.zip` : `${files[0].name} 외 ${files.length - 1}개`);
                                                    } else {
                                                        setUploadFile(files[0]);
                                                        setUploadFiles(null);
                                                        if (!uploadTitle) setUploadTitle(files[0].name);
                                                    }
                                                }
                                            }}
                                        />
                                    </label>
                                </div>

                                {uploadError && (
                                    <div className="flex items-center gap-2 p-3 rounded-lg bg-red-100 dark:bg-red-900/30 text-xs font-bold text-red-600 dark:text-red-400">
                                        <AlertCircle className="w-4 h-4" /> {uploadError}
                                    </div>
                                )}

                                {/* Progress bars */}
                                {(zipping || uploading) && (
                                    <div className="space-y-3 bg-neutral-50 dark:bg-neutral-800/50 p-4 rounded-2xl border border-neutral-100 dark:border-neutral-800">
                                        {zipping && (
                                            <div className="flex items-center gap-2 text-xs font-bold text-indigo-500">
                                                <Zap className="w-4 h-4 animate-pulse" /> 보안 압축 패키징 중... (잠시만 기다려주세요)
                                            </div>
                                        )}
                                        {uploading && uploadProgress > 0 && (
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-xs font-bold text-emerald-600">
                                                    <span>구글 드라이브 직행 업로드 중</span>
                                                    <span>{uploadProgress}%</span>
                                                </div>
                                                <div className="w-full h-2.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                                                        style={{ width: `${uploadProgress}%` }}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={(!uploadFile && !uploadFiles) || uploading || zipping}
                                    className="w-full py-4 rounded-2xl bg-emerald-600 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 hover:bg-emerald-700 hover:shadow-emerald-500/30 disabled:opacity-50 transition-all active:scale-95"
                                >
                                    {zipping ? (
                                        <><Zap className="w-4 h-4 animate-spin text-yellow-300" /> 압축 패키징 중...</>
                                    ) : uploading ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" /> {uploadProgress > 0 ? `${uploadProgress}% 보안 전송 중...` : '인증 요청 중...'}</>
                                    ) : (
                                        <><UploadCloud className="w-4 h-4" /> {isFolderMode ? '폴더 압축 후 공유하기' : '이 주차에 파일 공유하기'}</>
                                    )}
                                </button>
                            </form>
                        </div>
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
                                <li key={f.id} className="flex flex-col px-6 py-6 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition border-b border-neutral-100 last:border-0 dark:border-neutral-800">
                                    <div className="flex items-center justify-between w-full mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2.5 rounded-2xl transition-all ${f.title.toLowerCase().endsWith('.zip') ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600' :
                                                'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'
                                                }`}>
                                                {f.title.toLowerCase().endsWith('.zip') ? (
                                                    <FolderOpen className="w-6 h-6" />
                                                ) : (
                                                    <FileIcon className="w-6 h-6" />
                                                )}
                                            </div>
                                            <div>
                                                <p className="text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                                                    {f.title}
                                                    {f.title.toLowerCase().endsWith('.zip') && (
                                                        <span className="text-[10px] bg-indigo-500 text-white px-1.5 py-0.5 rounded font-black uppercase tracking-tighter">Folder</span>
                                                    )}
                                                </p>
                                                <p className="text-xs text-neutral-400 font-medium">
                                                    {formatSize(f.file_size)} · {new Date(f.created_at).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <a
                                                href={getDirectDownloadUrl(f.file_url)}
                                                download={f.title}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-white border border-neutral-200 hover:border-emerald-500 hover:text-emerald-600 text-neutral-700 rounded-xl transition-all dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-300"
                                            >
                                                <Download className="w-3.5 h-3.5" /> 다운로드
                                            </a>
                                            {isAdmin && (
                                                <button
                                                    onClick={() => handleDeleteFile(f.id, f.file_id)}
                                                    className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
            {/* History Modal */}
            <HistoryModal
                isOpen={historyOpen}
                onClose={() => setHistoryOpen(false)}
                entityId={page.id}
                entityType="archive_page"
                onRestore={(newContent) => {
                    setPage(p => ({ ...p, content: newContent }));
                    if (editAreaRef.current) {
                        editAreaRef.current.innerHTML = newContent;
                    }
                }}
            />
        </div>
    );
}
