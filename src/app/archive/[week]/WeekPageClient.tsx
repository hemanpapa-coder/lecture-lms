'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { getDirectDownloadUrl } from '@/utils/driveUtils';
import {
    ChevronLeft, ChevronRight, Printer, UploadCloud,
    Download, Trash2, Loader2, FileIcon, AlertCircle, CheckCircle2,
    FolderOpen, FileStack, Zap, History, MessageCircle, Mic,
    ClipboardCheck, Copy, Check, Mail, LayoutGrid
} from 'lucide-react';
import JSZip from 'jszip';
import HistoryModal from '@/components/HistoryModal';
import RichTextEditor from '@/components/Editor';

interface ArchivePage { id: string; week_number: number; title: string; content: string; updated_at: string | null; }
interface ArchiveFile { id: string; title: string; file_url: string; file_id: string; file_size: number; created_at: string; display_name?: string; file_name?: string; }

export default function WeekPageClient({
    isAdmin,
    initialPage,
    initialFiles,
    weekNumber,
    courseId,
    qnaThreads,
    lessonStudentEmail,
    lessonStudentName,
}: {
    isAdmin: boolean;
    initialPage: ArchivePage;
    initialFiles: ArchiveFile[];
    weekNumber: number;
    courseId: string | null;
    qnaThreads?: any[];
    lessonStudentEmail?: string | null;
    lessonStudentName?: string | null;
}) {
    const [page, setPage] = useState(initialPage);
    const [files, setFiles] = useState(initialFiles);
    const [editing, setEditing] = useState(false); // 기본: 렌더 뷰 / 편집 버튼 클릭 시 Quill 전환
    const [mounted, setMounted] = useState(false); // SSR 하이드레이션 안전 처리
    const [sharing, setSharing] = useState(false);
    const [shareStatus, setShareStatus] = useState<'idle'|'sent'|'error'>('idle');
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
    const [historyOpen, setHistoryOpen] = useState(false);

    // 클라이언트 마운트 후 복잡한 AI HTML 렌더링 활성화
    useEffect(() => { setMounted(true); }, []);

    const [isDragging, setIsDragging] = useState(false);
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadFiles, setUploadFiles] = useState<FileList | File[] | null>(null);
    const [isFolderMode, setIsFolderMode] = useState(false);
    const [uploadTitle, setUploadTitle] = useState('');
    const [uploading, setUploading] = useState(false);
    const [zipping, setZipping] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0); // 0~100
    const [uploadError, setUploadError] = useState('');

    // ── AI 강의 정리 상태 ──────────────────────────────
    type AiSumStatus = 'idle' | 'uploading' | 'processing' | 'done' | 'error'
    type AiMode = 'detailed' | 'summary' | 'transcript'
    const [aiSumStatus, setAiSumStatus] = useState<AiSumStatus>('idle')
    const [aiSumHtml, setAiSumHtml] = useState('')
    const [aiSumProvider, setAiSumProvider] = useState<'groq' | 'gemini' | ''>('')
    const [aiSumError, setAiSumError] = useState('')
    const [aiSumCopied, setAiSumCopied] = useState(false)
    const [aiSumFileName, setAiSumFileName] = useState('')
    const [aiSumProgress, setAiSumProgress] = useState(0)
    const [aiSumProgressMsg, setAiSumProgressMsg] = useState('')
    const [aiSumDragging, setAiSumDragging] = useState(false)
    const audioSumInputRef = useRef<HTMLInputElement>(null)
    const aiAbortRef = useRef<AbortController | null>(null)
    // 모드 선택 패널
    const [aiModeTarget, setAiModeTarget] = useState<{ fileId: string; fileName: string } | null>(null)
    // AI 제공자 선택 (groq = Groq LLaMA, gemini = Gemini Pro)
    const [aiProvider, setAiProvider] = useState<'groq' | 'gemini'>('gemini')
    // AI 모델 선택 ('' = 기본값)
    const [aiModel, setAiModel] = useState<string>('gemini-3.1-pro-preview')
    // 전사 전용 AI 제공자 (기본: groq Whisper / 대안: gemini)
    const [transcriptionProvider, setTranscriptionProvider] = useState<'groq' | 'gemini'>('groq')
    // 압축률 (100 = 그대로, 30 = 30%로 압축)
    const [compressionRatio, setCompressionRatio] = useState<number>(85)

    // TTS (강의 음성) 상태
    const [ttsLoading, setTtsLoading] = useState(false)
    const [ttsUrl, setTtsUrl] = useState<string | null>(null)           // /api/tts/play?fileId=... (Drive 스트림 URL)
    const [ttsLocalUrl, setTtsLocalUrl] = useState<string | null>(null) // blob:// URL (다운로드 후)
    const [ttsDownloading, setTtsDownloading] = useState(false)
    const [ttsError, setTtsError] = useState('')
    const [ttsInfo, setTtsInfo] = useState<{ fileName: string; createdAt: string } | null>(null)
    const ttsAudioRef = useRef<HTMLAudioElement>(null)
    // 커스텀 플레이어 상태
    const [ttsPlaying, setTtsPlaying] = useState(false)
    const [ttsCurrent, setTtsCurrent] = useState(0)
    const [ttsDuration, setTtsDuration] = useState(0)

    // TTS 정보 로드 (페이지 진입 시)
    useEffect(() => {
        if (!courseId) return
        fetch(`/api/tts?courseId=${courseId}&week=${weekNumber}`)
            .then(r => r.json())
            .then(d => {
                if (d.tts) {
                    setTtsUrl(d.tts.streamUrl)
                    setTtsInfo({ fileName: d.tts.fileName, createdAt: d.tts.createdAt })
                    setTtsLocalUrl(null)
                    setTtsPlaying(false)
                    setTtsCurrent(0)
                    setTtsDuration(0)
                }
            })
            .catch(() => {})
    }, [courseId, weekNumber])

    // blob URL 설정 시: React이 src 속성을 업데이트한 뒤 .load() 호출
    useEffect(() => {
        if (!ttsLocalUrl || !ttsAudioRef.current) return
        ttsAudioRef.current.load()
        // 자동 재생 시도 (브라우저 정책으로 실패해도 광찮음 — 사용자가 플레이 버튼 클릭)
        ttsAudioRef.current.play().then(() => setTtsPlaying(true)).catch(() => {})
    }, [ttsLocalUrl])

    // Mermaid 렌더링 + window._visClick 전역 등록: aiSumHtml이 업데이트되면 초기화
    const aiResultRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (!aiSumHtml) return

        // ── window._visClick 전역 등록 (dangerouslySetInnerHTML은 script를 실행하지 않음) ──
        ;(window as any)._visClick = function (btn: HTMLElement, type: string, desc: string) {
            const el = btn.closest('.gen-visual-btn') as HTMLElement | null
            if (!el) return
            const orig = el.innerHTML
            ;(btn as HTMLButtonElement).disabled = true
            btn.textContent = '⏳ 생성 중...'
            fetch('/api/generate-visual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, description: desc }),
            })
                .then(r => r.json())
                .then(d => {
                    if (d.ok && d.html) {
                        const isMerm = d.type === 'mermaid'
                        const wrap = document.createElement('div')
                        wrap.style.cssText = 'background:#f0fdf4;border:2px solid #22c55e;border-radius:12px;padding:14px;'
                        const pvDiv = document.createElement('div')
                        if (isMerm) {
                            pvDiv.className = 'mermaid'
                            pvDiv.style.cssText = 'padding:12px;background:#f8fafc;border-radius:8px;'
                            pvDiv.textContent = d.mermaidCode || ''
                        } else {
                            pvDiv.innerHTML = d.html
                        }
                        const hdr = document.createElement('p')
                        hdr.style.cssText = 'margin:0 0 10px;font-size:12px;font-weight:800;color:#16a34a;'
                        hdr.textContent = '✨ 생성 완료 — 마음에 드시나요?'
                        const row = document.createElement('div')
                        row.style.cssText = 'display:flex;gap:6px;margin-top:12px;flex-wrap:wrap;'
                        const bOk = document.createElement('button')
                        bOk.textContent = '✅ 삽입'
                        bOk.style.cssText = 'flex:1;padding:8px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:800;cursor:pointer;min-width:70px;'
                        const bRe = document.createElement('button')
                        bRe.textContent = '🔄 다시 만들기'
                        bRe.style.cssText = 'flex:1;padding:8px;background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;border-radius:8px;font-size:11px;cursor:pointer;min-width:70px;'
                        row.appendChild(bOk); row.appendChild(bRe)
                        wrap.appendChild(hdr); wrap.appendChild(pvDiv); wrap.appendChild(row)
                        el.innerHTML = ''; el.appendChild(wrap)
                        if (isMerm && (window as any).mermaid) setTimeout(() => (window as any).mermaid.run({ nodes: [pvDiv] }), 150)
                        bOk.onclick = () => {
                            const tmp = document.createElement('div')
                            tmp.innerHTML = d.html
                            el.parentNode?.replaceChild(tmp.firstChild || tmp, el)
                            if (isMerm && (window as any).mermaid) setTimeout(() => (window as any).mermaid.run(), 150)
                        }
                        bRe.onclick = () => { el.innerHTML = orig; const nb = el.querySelector('button'); if (nb) nb.click() }
                    } else {
                        // Mermaid/흐름도 실패 → AI 이미지로 자동 폴백
                        const isMermaidFail = type !== 'image' && type !== 'search'
                        if (isMermaidFail) {
                            el.innerHTML = orig
                            const fallbackMsg = document.createElement('p')
                            fallbackMsg.style.cssText = 'margin:6px 0 0;font-size:10px;color:#7c3aed;font-weight:700;'
                            fallbackMsg.textContent = '⚡ Mermaid 실패 → AI 이미지로 자동 전환 중...'
                            el.appendChild(fallbackMsg)
                            // 0.5초 후 AI 이미지로 재시도
                            setTimeout(() => {
                                ;(window as any)._visClick(
                                    el.querySelector('button') || btn,
                                    'image',
                                    desc,
                                    'image'
                                )
                            }, 500)
                        } else {
                            el.innerHTML = orig
                            const em = document.createElement('p')
                            em.style.cssText = 'margin:6px 0 0;font-size:10px;color:#dc2626;'
                            em.textContent = '⚠️ ' + (d.error || '생성 실패') + ' — 삽입 안 함 버튼으로 제거할 수 있습니다.'
                            el.appendChild(em)
                        }
                    }
                })
                .catch(() => { el.innerHTML = orig })
        }

        const initMermaid = async () => {
            try {
                const mermaid = (await import(/* webpackIgnore: true */ 'mermaid' as any)).default
                mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose' })
                await mermaid.run({ nodes: aiResultRef.current?.querySelectorAll('.mermaid') as any })
            } catch (e) {
                console.warn('[Mermaid]', e)
            }
        }
        // 렌더링 후 실행
        const t = setTimeout(initMermaid, 100)
        return () => clearTimeout(t)
    }, [aiSumHtml])

    // AI 요약 완료 후 모든 시각화 블록 자동 생성 (1.2초 네 후 트리거)
    useEffect(() => {
        if (aiSumStatus !== 'done' || !aiSumHtml) return
        const timer = setTimeout(() => {
            const blocks = aiResultRef.current?.querySelectorAll('.gen-visual-btn') || []
            blocks.forEach(block => {
                // 이미 생성된 블록은 건너뜠기
                if (block.querySelector('.ai-visual-block, img, svg')) return
                const firstBtn = block.querySelector('button') as HTMLButtonElement | null
                if (firstBtn && !firstBtn.disabled) firstBtn.click()
            })
        }, 1200)
        return () => clearTimeout(timer)
    }, [aiSumStatus, aiSumHtml])


    // TTS 변환 실행 (관리자만)
    const handleTts = async () => {
        if (!page.content || !courseId) return
        setTtsLoading(true)
        setTtsError('')
        try {
            const res = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    html: page.content,
                    title: page.title || `Week${weekNumber} 강의`,
                    courseId,
                    weekNumber,
                    ttsModel: 'gemini-2.5-flash-preview-tts',
                    voiceName: 'Kore',
                }),
            })
            // 응답이 JSON이 아닐 수 있음 (Vercel 타임아웃, 오류 HTML 등)
            const contentType = res.headers.get('content-type') || ''
            if (!contentType.includes('application/json')) {
                throw new Error(`서버 오류 (HTTP ${res.status}) — 응답이 JSON이 아닙니다. 잠시 후 다시 시도해주세요.`)
            }
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || '변환 실패')
            setTtsUrl(data.streamUrl)
            setTtsInfo({ fileName: data.fileName, createdAt: new Date().toISOString() })
        } catch (e: any) {
            setTtsError(e.message)
        } finally {
            setTtsLoading(false)
        }
    }

    const isAiSupported = (filename: string) => {
        const ext = filename.split('.').pop()?.toLowerCase() || '';
        return ['mp3', 'm4a', 'mp4', 'wav', 'ogg', 'webm', 'flac', 'aac'].includes(ext);
    };

    // 전사 중지
    const handleStopTranscription = () => {
        if (aiAbortRef.current) {
            aiAbortRef.current.abort()
            aiAbortRef.current = null
        }
        setAiSumStatus('idle')
        setAiSumProgress(0)
        setAiSumError('')
        setAiSumProgressMsg('⛔ 관리자가 전사를 중지했습니다.')
        // 3초 후 안내 메시지 제거
        setTimeout(() => setAiSumProgressMsg(''), 3000)
    }

    // 기존 드라이브 파일로 AI 본문 추출 진행 (SSE 스트리밍)
    const handleAiSummarizeExisting = async (driveFileId: string, fileName: string, mode: AiMode = 'detailed') => {
        if (!driveFileId) return;
        setAiModeTarget(null);
        setAiSumStatus('processing');
        setAiSumError('');
        setAiSumHtml('');
        setAiSumProvider('');
        setAiSumFileName(fileName);
        setAiSumProgress(2);
        setAiSumProgressMsg('시작 중...');
        window.scrollTo({ top: 0, behavior: 'smooth' });

        const abortCtrl = new AbortController()
        aiAbortRef.current = abortCtrl

        try {
            const res = await fetch('/api/recording-class/transcribe-drive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileId: driveFileId, mode, aiProvider, aiModel, transcriptionProvider, courseId, compressionRatio }),
                signal: abortCtrl.signal,
            });
            if (!res.ok || !res.body) throw new Error('서버 연결 실패');

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const event = JSON.parse(line.slice(6));
                        if (event.progress !== undefined) setAiSumProgress(event.progress);
                        if (event.message) setAiSumProgressMsg(event.message);
                        if (event.stage === 'done') {
                            setAiSumHtml(event.html || '');
                            setAiSumProvider('groq');
                            setAiSumStatus('done');
                        } else if (event.stage === 'error') {
                            throw new Error(event.message || 'AI 정리 실패');
                        }
                    } catch (parseErr: any) {
                        if (parseErr.message && parseErr.message !== 'AI 정리 실패') continue;
                        throw parseErr;
                    }
                }
            }
        } catch (e: any) {
            // AbortController로 의도적으로 중지한 경우 — 에러가 아님
            const isAborted = e?.name === 'AbortError'
                || (e?.message || '').includes('aborted')
                || (e?.message || '').includes('abort')
            if (isAborted) {
                setAiSumStatus('idle')
                setAiSumProgress(0)
                setAiSumProgressMsg('')
                setAiSumError('')
                // 잠시 안내 토스트를 위한 별도 state (없으면 그냥 조용히 종료)
                return
            }
            setAiSumStatus('error')
            setAiSumError(e.message || 'AI 정리 실패')
        }
    }

    // AI 정리 결과를 DB에 바로 저장 (Quill 거치지 않아 스타일 보존)
    const saveAiSummaryDirectly = async () => {
        // DOM에서 직접 읽기: "✅ 삽입" 버튼으로 삽입된 이미지/다이어그램이 DOM에만 반영됨
        const domHtml = aiResultRef.current?.innerHTML || aiSumHtml
        // 미클릭(아직 삽입 안 한) 시각화 버튼만 제거
        const cleanHtml = domHtml
            .replace(/<div class="gen-visual-btn"[\s\S]*?<\/div>/g, '')
        // page state 업데이트 후 즉시 DB 저장
        setPage(p => ({ ...p, content: cleanHtml }))
        setEditing(false) // 렌더 뷰로 돌아가서 AI 스타일 그대로 표시
        // 직접 저장 (triggerAutoSave 대신 즉시)
        setSaving(true)
        try {
            await fetch('/api/archive-page', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ week_number: weekNumber, title: page.title, content: cleanHtml, course_id: courseId }),
            })
            setSaveStatus('saved')
            setTimeout(() => setSaveStatus('idle'), 3000)
        } catch { setSaveStatus('error') }
        finally { setSaving(false) }
    }

    const editAreaRef = useRef<HTMLDivElement>(null);
    const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

    const handleSave = async () => {
        setSaving(true);
        const content = page.content || '';
        try {
            const res = await fetch('/api/archive-page', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ week_number: weekNumber, title: page.title, content, course_id: courseId }),
            });
            if (!res.ok) throw new Error('저장 실패');
            setPage(prev => ({ ...prev, updated_at: new Date().toISOString() }));
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
        // 브라우저 기본 인쇄 다이얼로그 사용 → "PDF로 저장" 선택 가능
        // html2pdf.js는 base64 이미지가 포함된 AI 생성 콘텐츠에서 실패하므로 대체
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
            await new Promise<void>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('PUT', uploadUrl);

                xhr.upload.onprogress = (event) => {
                    if (event.lengthComputable) {
                        setUploadProgress(Math.round((event.loaded / event.total) * 100));
                    }
                };
                xhr.onload = () => {
                    if (xhr.status === 200 || xhr.status === 201 || xhr.status === 0) {
                        setUploadProgress(100);
                        resolve();
                    } else {
                        reject(new Error(`구글 드라이브 업로드 전송 실패 (status ${xhr.status})`));
                    }
                };
                xhr.onerror = () => {
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
                    <div className="flex items-center gap-2">
                        {/* 필목록으로 보 버튼 */}
                        <Link
                            href={courseId ? `/archive?course=${courseId}` : '/archive'}
                            className="p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition text-neutral-500"
                            title="목록으로"
                        >
                            <LayoutGrid className="w-5 h-5" />
                        </Link>
                        {/* 이전 주차 */}
                        {weekNumber > 1 ? (
                            <Link href={courseId ? `/archive/${weekNumber - 1}?course=${courseId}` : `/archive/${weekNumber - 1}`} className="p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition text-neutral-500">
                                <ChevronLeft className="w-5 h-5" />
                            </Link>
                        ) : (
                            <span className="p-2 text-neutral-300 dark:text-neutral-700 cursor-not-allowed">
                                <ChevronLeft className="w-5 h-5" />
                            </span>
                        )}
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

                        {/* 📧 학생 이메일 공유 버튼 — 개인레슨 관리자만 */}
                        {isAdmin && lessonStudentEmail && (
                            <button
                                onClick={async () => {
                                    if (sharing) return;
                                    setSharing(true);
                                    const pageUrl = `${window.location.origin}/archive/${weekNumber}${courseId ? `?course=${courseId}` : ''}`;
                                    try {
                                        const res = await fetch('/api/archive/share-page', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                                studentEmail: lessonStudentEmail,
                                                studentName: lessonStudentName,
                                                pageUrl,
                                                pageTitle: page.title,
                                                weekNumber,
                                            }),
                                        });
                                        setShareStatus(res.ok ? 'sent' : 'error');
                                    } catch { setShareStatus('error'); }
                                    finally {
                                        setSharing(false);
                                        setTimeout(() => setShareStatus('idle'), 3000);
                                    }
                                }}
                                disabled={sharing}
                                title={`${lessonStudentEmail}에게 이 페이지 링크 전송`}
                                className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition ${
                                    shareStatus === 'sent' ? 'bg-emerald-600 text-white' :
                                    shareStatus === 'error' ? 'bg-red-500 text-white' :
                                    'bg-neutral-100 hover:bg-blue-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-blue-900/30'
                                }`}
                            >
                                {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                                {shareStatus === 'sent' ? '전송 완료!' : shareStatus === 'error' ? '전송 실패' : '학생에게 전송'}
                            </button>
                        )}
                        {/* 🔊 TTS 변환 버튼 - 관리자만 */}
                        {isAdmin && page.content && (
                            <button
                                onClick={handleTts}
                                disabled={ttsLoading}
                                title={ttsInfo ? `마지막 변환: ${new Date(ttsInfo.createdAt).toLocaleDateString('ko-KR')}` : '강의 내용을 음성으로 변환'}
                                className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition ${
                                    ttsLoading
                                        ? 'bg-violet-100 text-violet-400 cursor-wait dark:bg-violet-900/30'
                                        : ttsUrl
                                        ? 'bg-violet-600 text-white hover:bg-violet-700'
                                        : 'bg-neutral-100 hover:bg-violet-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                                }`}
                            >
                                {ttsLoading ? (
                                    <><div className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" /> 변환 중...</>
                                ) : ttsUrl ? (
                                    <><span>🔊</span> 음성 업데이트</>
                                ) : (
                                    <><span>🔊</span> 음성 변환</>  
                                )}
                            </button>
                        )}
                        {isAdmin && (
                            <>
                                <button
                                    onClick={() => setEditing(e => !e)}
                                    className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition ${
                                        editing
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-white border border-neutral-200 hover:border-indigo-500 text-neutral-700 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-300'
                                    }`}
                                >
                                    ✏️ {editing ? '미리보기' : '편집'}
                                </button>
                                <button
                                    onClick={() => setHistoryOpen(true)}
                                    className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-white border border-neutral-200 hover:border-indigo-500 text-neutral-700 rounded-xl transition dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-300"
                                >
                                    <History className="w-4 h-4" /> 히스토리
                                </button>
                            </>
                        )}
                        {weekNumber < 15 && (
                            <Link href={courseId ? `/archive/${weekNumber + 1}?course=${courseId}` : `/archive/${weekNumber + 1}`} className="p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition text-neutral-500">
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

                {/* ── AI 강의 정리 섹션결과 (Admin 전용) ── */}
                {isAdmin && aiSumStatus !== 'idle' && (
                    <div className="no-print bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-950/20 dark:to-indigo-950/20 rounded-3xl border border-violet-200/60 dark:border-violet-800/40 overflow-hidden">
                        <div className="px-6 py-4 border-b border-violet-100 dark:border-violet-900/40 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-violet-100 dark:bg-violet-900/40 rounded-lg">
                                    <Mic className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                                </div>
                                <h3 className="font-bold text-violet-900 dark:text-violet-300 text-sm">🎙️ AI 강의 정리 진행 <span className="text-xs font-normal text-violet-500">(관리자 전용)</span></h3>
                            </div>
                            {aiSumProvider && aiSumStatus === 'done' && (
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                    aiSumProvider === 'groq'
                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
                                }`}>
                                    {aiSumProvider === 'groq' ? '🟢 Groq Whisper' : '🔵 Gemini'}
                                </span>
                            )}
                        </div>

                        <div className="p-6 space-y-4">
                            {/* 업로드 / AI 처리 로딩 */}
                            {(aiSumStatus === 'uploading' || aiSumStatus === 'processing') && (
                                <div className="space-y-3 bg-violet-50 dark:bg-violet-900/10 rounded-2xl border border-violet-100 dark:border-violet-900/30 p-5">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 text-sm font-bold text-violet-700 dark:text-violet-400">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            {aiSumProgressMsg || 'AI가 처리 중입니다...'}
                                        </div>
                                        {isAdmin && (
                                            <button
                                                onClick={handleStopTranscription}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500 hover:bg-red-600 text-white transition-all shadow-sm shrink-0"
                                                title="전사 중지"
                                            >
                                                ⛔ 전사 중지
                                            </button>
                                        )}
                                    </div>
                                    {/* 진행률 바 */}
                                    <div className="w-full bg-violet-100 dark:bg-violet-900/30 rounded-full h-2.5 overflow-hidden">
                                        <div
                                            className="h-2.5 rounded-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all duration-500"
                                            style={{ width: `${aiSumProgress}%` }}
                                        />
                                    </div>
                                    <div className="flex justify-between text-[11px] text-violet-400">
                                        <span>{aiSumFileName}</span>
                                        <span className="font-bold">{aiSumProgress}%</span>
                                    </div>
                                </div>
                            )}



                            {/* 에러 */}
                            {aiSumStatus === 'error' && (
                                <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-2xl">
                                    <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                                    <div>
                                        <p className="text-sm font-bold text-red-700 dark:text-red-400">정리 실패</p>
                                        <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">{aiSumError}</p>
                                    </div>
                                </div>
                            )}

                            {/* 결과 미리보기 + 삽입 */}
                            {aiSumStatus === 'done' && aiSumHtml && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs font-bold text-violet-600 dark:text-violet-400">
                                            AI 정리 결과 {aiSumFileName && <span className="font-normal text-slate-400">({aiSumFileName})</span>}
                                        </p>
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(aiSumHtml)
                                                setAiSumCopied(true)
                                                setTimeout(() => setAiSumCopied(false), 2000)
                                            }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 transition"
                                        >
                                            {aiSumCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                            {aiSumCopied ? '복사됨' : 'HTML 복사'}
                                        </button>
                                    </div>
                                    {/* 미리보기 */}
                                    <div
                                        ref={aiResultRef}
                                        className="notion-editor max-h-96 overflow-y-auto p-5 bg-white dark:bg-neutral-900 border border-violet-100 dark:border-violet-900/40 rounded-2xl text-sm"
                                        dangerouslySetInnerHTML={{ __html: aiSumHtml }}
                                    />
                                    {/* 본문 삽입 버튼 */}
                                    <button
                                        onClick={saveAiSummaryDirectly}
                                        className="w-full flex items-center justify-center gap-2 py-3 bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm rounded-2xl transition shadow-md shadow-violet-500/20 active:scale-95"
                                    >
                                        <ClipboardCheck className="w-5 h-5" />
                                        💾 이대로 저장하기 (스타일 보존)
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Rich Text Editor / Viewer */}
                <div id={`archive-content-week-${weekNumber}`} className="print-content bg-white dark:bg-neutral-900 rounded-3xl shadow-sm border border-neutral-200/60 dark:border-neutral-800 overflow-hidden">
                    {editing && isAdmin ? (
                        <RichTextEditor
                            placeholder="내용을 입력하세요..."
                            value={page.content || ''}
                            onChange={(val) => {
                                setPage(p => ({ ...p, content: val }));
                                triggerAutoSave();
                            }}
                        />
                    ) : mounted ? (
                        // 클라이언트에서만 AI HTML 렌더링 — SSR에서 렌더하면 복잡한 HTML이 하이드레이션 불일치를 유발
                        <div
                            className="notion-editor min-h-[400px] p-8 outline-none text-neutral-800 dark:text-neutral-200 text-[16px] leading-relaxed"
                            dangerouslySetInnerHTML={
                                { __html: page.content || '<p style="color:#9ca3af;font-style:italic">아직 작성된 내용이 없습니다. (관리자만 편집 가능)</p>' }
                            }
                        />
                    ) : (
                        // SSR/초기 로딩 시: 빈 플레이스홀더 (하이드레이션 안전)
                        <div className="min-h-[400px] p-8 animate-pulse">
                            <div className="h-6 bg-neutral-100 dark:bg-neutral-800 rounded-xl w-2/3 mb-4" />
                            <div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded-xl w-full mb-2" />
                            <div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded-xl w-5/6 mb-2" />
                        </div>
                    )}
                </div>

                {/* 🔊 TTS 커스텀 플레이어 */}
                {(ttsUrl || ttsError) && (
                    <div className="no-print rounded-3xl overflow-hidden border border-violet-200 dark:border-violet-800/40" style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)' }}>
                        {/* src는 React JSX로 관리 — 이렇게 해야 .load()/.play()가 정상 작동 */}
                        <audio
                            ref={ttsAudioRef}
                            src={ttsLocalUrl || undefined}
                            onTimeUpdate={() => setTtsCurrent(ttsAudioRef.current?.currentTime || 0)}
                            onLoadedMetadata={() => setTtsDuration(ttsAudioRef.current?.duration || 0)}
                            onPlay={() => setTtsPlaying(true)}
                            onPause={() => setTtsPlaying(false)}
                            onEnded={() => { setTtsPlaying(false); setTtsCurrent(0) }}
                        />
                        <div className="p-6">
                            {/* 상단: 파일명 + 상태 */}
                            <div className="flex items-center gap-3 mb-5">
                                <div className="p-2.5 bg-white/10 rounded-2xl">
                                    <span className="text-2xl">🎧</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-white truncate">
                                        {ttsInfo?.fileName || '강의 음성 파일'}
                                    </p>
                                    <p className="text-[11px] text-violet-300">
                                        {ttsInfo ? new Date(ttsInfo.createdAt).toLocaleDateString('ko-KR') + ' 생성' : ''}
                                        {ttsLocalUrl && <span className="ml-1.5 text-emerald-400 font-bold">• 재생 준비완료</span>}
                                    </p>
                                </div>
                            </div>

                            {ttsError && (
                                <p className="text-xs text-red-400 mb-4">⚠️ {ttsError}</p>
                            )}

                            {ttsUrl && !ttsLocalUrl && (
                                // 다운로드 전: 크고 선명한 재생 버튼
                                <button
                                    onClick={async () => {
                                        if (ttsDownloading || !ttsUrl) return
                                        setTtsDownloading(true)
                                        setTtsError('')
                                        try {
                                            const res = await fetch(ttsUrl)
                                            if (!res.ok) throw new Error(`다운로드 실패 (${res.status})`)
                                            const blob = await res.blob()
                                            setTtsLocalUrl(URL.createObjectURL(blob))
                                        } catch (e: any) {
                                            setTtsError(e.message)
                                        } finally {
                                            setTtsDownloading(false)
                                        }
                                    }}
                                    disabled={ttsDownloading}
                                    className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-bold text-base transition active:scale-95 disabled:opacity-60"
                                    style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: '1.5px solid rgba(255,255,255,0.25)' }}
                                >
                                    {ttsDownloading ? (
                                        <><Loader2 className="w-5 h-5 animate-spin" /> 다운로드 중... 잠시만 기다려주세요</>
                                    ) : (
                                        <><span className="text-xl">▶️</span> 재생 하기</>
                                    )}
                                </button>
                            )}

                            {ttsLocalUrl && (
                                // 커스텀 플레이어 UI
                                <div className="space-y-4">
                                    {/* 시크 바 */}
                                    <div>
                                        <input
                                            type="range"
                                            min={0}
                                            max={ttsDuration || 100}
                                            step={0.1}
                                            value={ttsCurrent}
                                            onChange={e => {
                                                const t = Number(e.target.value)
                                                setTtsCurrent(t)
                                                if (ttsAudioRef.current) ttsAudioRef.current.currentTime = t
                                            }}
                                            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                                            style={{
                                                background: `linear-gradient(to right, #a78bfa ${ttsDuration ? (ttsCurrent/ttsDuration)*100 : 0}%, rgba(255,255,255,0.2) ${ttsDuration ? (ttsCurrent/ttsDuration)*100 : 0}%)`
                                            }}
                                        />
                                        <div className="flex justify-between text-[11px] text-violet-300 mt-1 font-medium">
                                            <span>{[Math.floor(ttsCurrent/60), Math.floor(ttsCurrent%60).toString().padStart(2,'0')].join(':')}</span>
                                            <span>{ttsDuration ? [Math.floor(ttsDuration/60), Math.floor(ttsDuration%60).toString().padStart(2,'0')].join(':') : '--:--'}</span>
                                        </div>
                                    </div>
                                    {/* 컨트롤 버튼들 */}
                                    <div className="flex items-center justify-center gap-4">
                                        {/* 10종 뒤로 */}
                                        <button
                                            onClick={() => { if (ttsAudioRef.current) ttsAudioRef.current.currentTime = Math.max(0, ttsCurrent - 10) }}
                                            className="p-2 rounded-full text-violet-300 hover:text-white hover:bg-white/10 transition"
                                            title="10삁10초 뒤로"
                                        >
                                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/><text x="8" y="16" fontSize="5" fill="currentColor">10</text></svg>
                                        </button>
                                        {/* 플레이/일시정지 */}
                                        <button
                                            onClick={() => {
                                                if (!ttsAudioRef.current) return
                                                if (ttsPlaying) { ttsAudioRef.current.pause() }
                                                else { ttsAudioRef.current.play().catch(() => {}) }
                                            }}
                                            className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-2xl transition active:scale-90"
                                            style={{ background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.4)' }}
                                        >
                                            {ttsPlaying ? (
                                                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                                            ) : (
                                                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                                            )}
                                        </button>
                                        {/* 10을 앞으로 */}
                                        <button
                                            onClick={() => { if (ttsAudioRef.current) ttsAudioRef.current.currentTime = Math.min(ttsDuration, ttsCurrent + 10) }}
                                            className="p-2 rounded-full text-violet-300 hover:text-white hover:bg-white/10 transition"
                                            title="10초 앞으로"
                                        >
                                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/><text x="8" y="16" fontSize="5" fill="currentColor">10</text></svg>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* File Attachments */}
                <div className="no-print bg-white dark:bg-neutral-900 rounded-3xl shadow-sm border border-neutral-200/60 dark:border-neutral-800">
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
                                            {isAdmin && isAiSupported(f.title) && (
                                                <div className="relative">
                                                    <button
                                                        onClick={() => setAiModeTarget(aiModeTarget?.fileId === f.file_id ? null : { fileId: f.file_id, fileName: f.title })}
                                                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800/50 text-violet-700 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/40 rounded-xl transition"
                                                    >
                                                        <Mic className="w-3.5 h-3.5" /> AI 정리
                                                    </button>
                                                    {/* 모드 선택 드롭다운 패널 */}
                                                    {aiModeTarget?.fileId === f.file_id && (
                                                        <div className="absolute right-0 bottom-full mb-2 z-[9999] bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-2xl shadow-xl p-3 w-72 max-h-[80vh] overflow-y-auto">
                                                            <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-2 px-1">정리 방식 선택</p>
                                                            {([
                                                                { mode: 'detailed' as AiMode, emoji: '📖', label: '전체 상세 노트', desc: '내용을 최대한 보존하며 책처럼 체계적으로 정리' },
                                                                { mode: 'summary' as AiMode, emoji: '📋', label: '핵심 요약 정리', desc: '중요 개념과 핵심 포인트만 간결하게 정리' },
                                                                { mode: 'transcript' as AiMode, emoji: '📄', label: '전사 원문 정리', desc: '내용을 거의 그대로 유지하며 문단·문체만 다듬기' },
                                                            ] as const).map(({ mode, emoji, label, desc }) => (
                                                                <button
                                                                    key={mode}
                                                                    onClick={() => handleAiSummarizeExisting(f.file_id, f.title, mode)}
                                                                    className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-violet-50 dark:hover:bg-violet-900/20 transition group mb-1"
                                                                >
                                                                    <p className="text-sm font-bold text-neutral-800 dark:text-white group-hover:text-violet-700 dark:group-hover:text-violet-400">{emoji} {label}</p>
                                                                    <p className="text-[11px] text-neutral-400 mt-0.5">{desc}</p>
                                                                </button>
                                                            ))}
                                                            {/* AI 엔진 + 모델 선택 */}
                                                            <div className="border-t border-neutral-100 dark:border-neutral-800 mt-2 pt-2.5 space-y-2">
                                                                {/* 🎤 전사 AI 선택 */}
                                                                <div className="space-y-1">
                                                                    <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider px-1">🎤 전사 AI</p>
                                                                    <div className="flex gap-1.5">
                                                                        <button
                                                                            onClick={() => setTranscriptionProvider('groq')}
                                                                            className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold transition ${transcriptionProvider === 'groq' ? 'bg-emerald-600 text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:bg-neutral-200'}`}
                                                                        >
                                                                            🟢 Groq Whisper
                                                                        </button>
                                                                        <button
                                                                            onClick={() => setTranscriptionProvider('gemini')}
                                                                            className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold transition ${transcriptionProvider === 'gemini' ? 'bg-blue-600 text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:bg-neutral-200'}`}
                                                                        >
                                                                            🔵 Gemini
                                                                        </button>
                                                                    </div>
                                                                    <p className="text-[10px] text-neutral-400 px-1">{transcriptionProvider === 'groq' ? '무료 · Groq 서버 이슈 시 Gemini로 전환' : '유료 · Groq 대안 · 한국어 인식 우수'}</p>
                                                                </div>

                                                                {/* ✍️ 정리 AI 선택 */}
                                                                <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider px-1">✍️ 정리 AI 엔진</p>
                                                                <div className="flex gap-1.5">
                                                                    <button
                                                                        onClick={() => { setAiProvider('groq'); setAiModel('llama-3.1-8b-instant') }}
                                                                        className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold transition ${
                                                                            aiProvider === 'groq'
                                                                                ? 'bg-violet-600 text-white'
                                                                                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:bg-neutral-200'
                                                                        }`}
                                                                    >
                                                                        🟢 Groq
                                                                    </button>
                                                                    <button
                                                                        onClick={() => { setAiProvider('gemini'); setAiModel('gemini-2.0-flash') }}
                                                                        className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold transition ${
                                                                            aiProvider === 'gemini'
                                                                                ? 'bg-blue-600 text-white'
                                                                                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:bg-neutral-200'
                                                                        }`}
                                                                    >
                                                                        🔵 Gemini
                                                                    </button>
                                                                </div>

                                                                {/* 모델 선택 (제공자에 따라 다른 옵션) */}
                                                                {aiProvider === 'groq' && (
                                                                    <div className="space-y-1">
                                                                        <p className="text-[10px] text-neutral-400 px-1">모델</p>
                                                                        <div className="flex gap-1">
                                                                            {[
                                                                                { id: 'llama-3.1-8b-instant', label: '8B 빠름', desc: '무료·요약 추천' },
                                                                                { id: 'llama-3.3-70b-versatile', label: '70B 고품질', desc: '무료·상세 추천' },
                                                                            ].map(m => (
                                                                                <button
                                                                                    key={m.id}
                                                                                    onClick={() => setAiModel(m.id)}
                                                                                    title={m.desc}
                                                                                    className={`flex-1 px-2 py-1 rounded-lg text-[10px] font-bold transition ${
                                                                                        aiModel === m.id
                                                                                            ? 'bg-violet-500 text-white'
                                                                                            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:bg-violet-100'
                                                                                    }`}
                                                                                >{m.label}</button>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {aiProvider === 'gemini' && (
                                                                    <div className="space-y-1">
                                                                        <p className="text-[10px] text-neutral-400 px-1">모델</p>
                                                                        <div className="flex gap-1 flex-wrap">
                                                                            {[
                                                                                { id: 'gemini-2.0-flash', label: 'Flash', desc: '빠름·저렴 (추천)' },
                                                                                { id: 'gemini-1.5-flash', label: '1.5 Flash', desc: '안정·빠름' },
                                                                                { id: 'gemini-2.5-pro', label: '2.5 Pro ✨', desc: '최고품질·느림' },
                                                                                { id: 'gemini-3.1-pro-preview', label: '3.1 Pro 🆕', desc: '최신 SOTA·추론·멀티모달' },
                                                                                { id: 'gemini-1.5-pro', label: '1.5 Pro', desc: '고품질·안정' },
                                                                            ].map(m => (
                                                                                <button
                                                                                    key={m.id}
                                                                                    onClick={() => setAiModel(m.id)}
                                                                                    title={m.desc}
                                                                                    className={`px-2 py-1 rounded-lg text-[10px] font-bold transition ${
                                                                                        aiModel === m.id
                                                                                            ? 'bg-blue-500 text-white'
                                                                                            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:bg-blue-100'
                                                                                    }`}
                                                                                >{m.label}</button>
                                                                            ))}
                                                                        </div>
                                                                        <p className="text-[10px] text-blue-400 px-1">Lecture-lm Tier 1 ✅</p>
                                                                    </div>
                                                                )}

                                                                {/* 현재 선택된 엔진 표시 */}
                                                                <p className="text-[10px] text-neutral-400 px-1 pt-0.5">
                                                                    선택: <span className="font-bold text-violet-500">
                                                                        {aiProvider === 'groq'
                                                                            ? (aiModel === 'llama-3.3-70b-versatile' ? 'Groq 70B' : 'Groq 8B')
                                                                            : `Gemini ${aiModel.replace('gemini-', '').replace('-flash', ' Flash').replace('-pro', ' Pro').replace('2.5 Pro', '2.5 Pro ✨')}`
                                                                        }
                                                                    </span>
                                                                </p>

                                                                {/* 압축률 슬라이더 */}
                                                                <div className={`border-t border-neutral-100 dark:border-neutral-800 mt-2 pt-2.5 space-y-1.5 transition-opacity ${aiProvider === 'groq' ? 'opacity-40 pointer-events-none select-none' : ''}`}>
                                                                    <div className="flex items-center justify-between px-1">
                                                                        <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                                                                            📊 정리 분량 조절
                                                                            {aiProvider === 'groq' && (
                                                                                <span className="text-[9px] font-bold bg-neutral-200 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400 px-1.5 py-0.5 rounded-full">Gemini 전용</span>
                                                                            )}
                                                                        </p>
                                                                        <span className={`text-[11px] font-black px-1.5 py-0.5 rounded ${
                                                                            compressionRatio >= 90 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                                                            compressionRatio >= 60 ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' :
                                                                            'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                                                                        }`}>
                                                                            {compressionRatio}%
                                                                        </span>
                                                                    </div>
                                                                    <input
                                                                        type="range"
                                                                        min={20}
                                                                        max={100}
                                                                        step={5}
                                                                        value={compressionRatio}
                                                                        onChange={e => setCompressionRatio(Number(e.target.value))}
                                                                        disabled={aiProvider === 'groq'}
                                                                        className="w-full h-2 rounded-full appearance-none cursor-pointer accent-violet-500 disabled:cursor-not-allowed"
                                                                        style={{ background: `linear-gradient(to right, #7c3aed ${compressionRatio}%, #e5e7eb ${compressionRatio}%)` }}
                                                                    />
                                                                    <div className="flex justify-between text-[10px] text-neutral-400 px-0.5">
                                                                        <span>20% 압축</span>
                                                                        <span className="text-neutral-500 font-medium">
                                                                            {compressionRatio >= 90 ? '거의 전체' : compressionRatio >= 60 ? '적당히 줄이기' : '많이 줄이기'}
                                                                        </span>
                                                                        <span>100% 전체</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                    )}
                                                </div>
                                            )}
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

                {/* Q&A Section */}
                {qnaThreads && qnaThreads.length > 0 && (
                    <div className="no-print bg-white dark:bg-neutral-900 rounded-3xl shadow-sm border border-neutral-200/60 dark:border-neutral-800 overflow-hidden">
                        <div className="p-6 border-b border-neutral-100 dark:border-neutral-800 flex items-center gap-3">
                            <h2 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2">이번 주차 Q&A</h2>
                            <span className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 text-xs px-2.5 py-0.5 rounded-full font-bold">{qnaThreads.length}</span>
                        </div>
                        <div className="p-6 space-y-4 bg-neutral-50/50 dark:bg-neutral-900/20">
                            {qnaThreads.map((q: any) => (
                                <div key={q.id} className="bg-white dark:bg-neutral-800 p-5 rounded-2xl border border-neutral-200 dark:border-neutral-700 shadow-sm space-y-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 space-y-1">
                                            <h3 className="font-bold text-neutral-900 dark:text-neutral-100">{q.title}</h3>
                                            <div className="text-xs text-neutral-500 font-medium flex items-center gap-2">
                                                <span>익명 학생</span>
                                                <span>·</span>
                                                <span>{new Date(q.created_at).toLocaleDateString('ko-KR')}</span>
                                            </div>
                                        </div>
                                    </div>
                                    {q.content && <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap bg-neutral-50 dark:bg-neutral-900/50 p-3 rounded-xl">{q.content}</p>}

                                    {q.replies && q.replies.length > 0 && (
                                        <div className="space-y-3 pt-4 border-t border-neutral-100 dark:border-neutral-700">
                                            <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                                                <MessageCircle className="w-3.5 h-3.5" /> 교수님 답변
                                            </h4>
                                            {q.replies.map((r: any) => (
                                                <div key={r.id} className="bg-indigo-50/50 dark:bg-indigo-900/20 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800/50">
                                                    <p className="text-sm text-neutral-800 dark:text-neutral-200 leading-relaxed whitespace-pre-wrap">{r.content}</p>
                                                    <p className="text-[10px] text-neutral-400 mt-2 font-medium">{new Date(r.created_at).toLocaleDateString('ko-KR')}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            {/* History Modal */}
            <HistoryModal
                isOpen={historyOpen}
                onClose={() => setHistoryOpen(false)}
                entityId={page.id}
                entityType="archive_page"
                onRestore={(newContent) => {
                    setPage(p => ({ ...p, content: newContent }));
                    triggerAutoSave();
                }}
            />
        </div>
    );
}
