'use client';

import { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { getDirectDownloadUrl } from '@/utils/driveUtils';
import {
    ChevronLeft, ChevronRight, Printer, UploadCloud,
    Download, Trash2, Loader2, FileIcon, AlertCircle, CheckCircle2,
    FolderOpen, FileStack, Zap, History, MessageCircle, Mic,
    ClipboardCheck, Copy, Check, Mail, LayoutGrid, Save, MonitorPlay,
    Play, Pause, Square, StopCircle, Radio
} from 'lucide-react';
import AssignmentPresenter, { type PresentFile } from '@/app/components/AssignmentPresenter';
import AssignmentLiveViewer from '@/app/components/AssignmentLiveViewer';
import FilePreview, { guessCategory as fpGuessCategory, AttachmentIcon } from '@/app/components/FilePreview';
import JSZip from 'jszip';
import HistoryModal from '@/components/HistoryModal';
import RichTextEditor from '@/components/Editor';
import AiAssistant from '@/app/components/AiAssistant';

interface ArchivePage { id: string; week_number: number; title: string; content: string; updated_at: string | null; tts_audio_file_id?: string | null; }
interface ArchiveFile { id: string; title: string; file_url: string; file_id: string; file_size: number; created_at: string; display_name?: string; file_name?: string; }

export default function WeekPageClient({
    isAdmin,
    userId,
    initialPage,
    initialFiles,
    weekNumber,
    courseId,
    qnaThreads,
    lessonStudentEmail,
    lessonStudentName,
    weekAssignments = [],
    myAssignment = null,
}: {
    isAdmin: boolean;
    userId: string;
    initialPage: ArchivePage;
    initialFiles: ArchiveFile[];
    weekNumber: number;
    courseId: string | null;
    qnaThreads?: any[];
    lessonStudentEmail?: string | null;
    lessonStudentName?: string | null;
    weekAssignments?: any[];
    myAssignment?: { id: string; file_url: string; file_id: string; file_name: string } | null;
}) {
    const [page, setPage] = useState(initialPage);
    const pageRef = useRef(initialPage);
    useEffect(() => { pageRef.current = page; }, [page]);
    const [files, setFiles] = useState(initialFiles);
    const [editing, setEditing] = useState(false); // 기본: 렌더 뷰 / 편집 버튼 클릭 시 Quill 전환
    const [mounted, setMounted] = useState(false); // SSR 하이드레이션 안전 처리

    // ── 라이브 발표 상태 ──────────────────────────────────────────
    const [presentingFile, setPresentingFile] = useState<PresentFile | null>(null);
    const [presenterName, setPresenterName] = useState<string>('');

    // ── 파일 프리뷰 상태 ──────────────────────────────────────
    const [previewFileId, setPreviewFileId] = useState<string | null>(null);
    const [assignPreviewId, setAssignPreviewId] = useState<string | null>(null);

    // 관리자 패널에서 접근한 경우 (adminCourse 파라미터) → 목록 버튼이 관리자 패널로 이동
    const searchParams = useSearchParams();
    const adminCourse = searchParams.get('adminCourse');
    const adminStudent = searchParams.get('student'); // 개인레슨 학생 자동 선택용
    const backUrl = (isAdmin && adminCourse)
        ? `/?view=admin&course=${adminCourse}${adminStudent ? `&student=${adminStudent}` : ''}`
        : (courseId ? `/archive?course=${courseId}` : '/archive');
    const [sharing, setSharing] = useState(false);
    const [shareStatus, setShareStatus] = useState<'idle'|'sent'|'error'>('idle');
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
    const [historyOpen, setHistoryOpen] = useState(false);
    // 배포 결과 토스트
    const [deployToast, setDeployToast] = useState<{ ok: boolean; msg: string } | null>(null)
    // 마지막 성공 배포 시간 (툴띠에 상시 표시)
    const [lastDeployedAt, setLastDeployedAt] = useState<Date | null>(null)
    // 일괄 이미지 생성
    const [batchImgRunning, setBatchImgRunning] = useState(false)
    const [batchImgProgress, setBatchImgProgress] = useState<{ done: number; total: number } | null>(null)

    // 클라이언트 마운트 후 복잡한 AI HTML 렌더링 활성화
    useEffect(() => { setMounted(true); }, []);

    // ── 텍스트 선택 → 이미지 스타일 선택 팝업 ──────────────────
    const selectionPopupRef = useRef<HTMLDivElement | null>(null)
    useEffect(() => {
        if (!mounted) return

        const STYLES = [
            { key: 'search',          label: '🌐 웹 검색 (실제 제품)' },
            { key: 'photo',           label: '📸 사진 (AI 생성)' },
            { key: 'infographic',     label: '📊 인포그래픽' },
            { key: 'diagram',         label: '🔷 다이어그램' },
            { key: 'illustration',    label: '🎨 일러스트(귀여운)' },
            { key: 'illustration_pro',label: '🖼️ 일러스트(전문)' },
            { key: 'illustration_biz',label: '✏️ 일러스트(비즈)' },
            { key: 'simple',          label: '⚡ 심플' },
        ]
        const BTN_STYLE = 'background:rgba(255,255,255,0.15);color:#fff;border:1.5px solid rgba(255,255,255,0.35);border-radius:8px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;'

        // 팝업 엘리먼트 생성
        const popup = document.createElement('div')
        popup.id = 'selection-img-popup'
        popup.style.cssText = `
            position:fixed;z-index:9999;display:none;
            background:linear-gradient(135deg,#6d28d9,#4f46e5);
            color:#fff;border-radius:14px;
            padding:10px 14px;font-size:12px;
            box-shadow:0 4px 24px rgba(109,40,217,0.5);
            user-select:none;min-width:200px;
        `
        document.body.appendChild(popup)
        selectionPopupRef.current = popup

        // 하이라이트 오버레이 (생성 중)
        let highlight: HTMLElement | null = null

        // @keyframes 추가 (한 번만)
        if (!document.getElementById('ai-pulse-style')) {
            const s = document.createElement('style')
            s.id = 'ai-pulse-style'
            s.textContent = '@keyframes aiPulse{0%,100%{border-color:rgba(109,40,217,0.5)}50%{border-color:rgba(109,40,217,1);}}'
            document.head.appendChild(s)
        }

        let generatingFor = ''
        let activeContainer: HTMLElement | null = null
        let activeText = ''

        const findContainerForSelection = (sel: Selection): HTMLElement | null => {
            if (!sel.rangeCount) return null
            const range = sel.getRangeAt(0)
            const all = document.querySelectorAll('.notion-editor')
            for (const el of all) {
                if (el.contains(range.commonAncestorContainer)) return el as HTMLElement
            }
            return null
        }

        const showPopup = () => {
            const sel = window.getSelection()
            const text = sel?.toString().trim() || ''
            if (text.length < 10 || generatingFor) { popup.style.display = 'none'; return }
            const found = findContainerForSelection(sel!)
            if (!found) { popup.style.display = 'none'; return }
            activeContainer = found
            activeText = text

            const range = sel!.getRangeAt(0)
            const rect = range.getBoundingClientRect()
            const excerpt = text.slice(0, 22) + (text.length > 22 ? '…' : '')

            popup.innerHTML = `
                <div style="font-size:10px;color:rgba(255,255,255,0.7);margin-bottom:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:240px;">"${excerpt}"</div>
                <div style="display:flex;gap:4px;flex-wrap:wrap;">
                    ${STYLES.map(s => `<button data-style="${s.key}" style="${BTN_STYLE}">${s.label}</button>`).join('')}
                </div>
            `
            popup.style.display = 'block'
            popup.style.top = `${rect.top - 96}px`
            popup.style.left = `${rect.left + rect.width / 2}px`
            popup.style.transform = 'translateX(-50%)'
        }

        const handleMouseUp = () => setTimeout(showPopup, 50)
        const handleKeyUp = () => setTimeout(showPopup, 50)

        popup.onclick = async (e) => {
            const btn = (e.target as Element).closest('[data-style]') as HTMLElement | null
            if (!btn) return
            const style = btn.dataset.style || 'infographic'
            const text = activeText
            if (!text || text === generatingFor) return
            generatingFor = text

            const styleLabel = STYLES.find(s => s.key === style)?.label || style

            // ── fetch 전에 anchor 저장 ──
            let anchorOuterHtml: string | null = null
            const sel = window.getSelection()
            if (sel?.rangeCount && activeContainer) {
                const range = sel.getRangeAt(0)

                // 하이라이트 오버레이 표시
                const selRect = range.getBoundingClientRect()
                highlight = document.createElement('div')
                highlight.style.cssText = `position:absolute;z-index:9998;top:${selRect.top + window.scrollY}px;left:${selRect.left + window.scrollX}px;width:${selRect.width}px;height:${selRect.height}px;background:rgba(109,40,217,0.12);border:2px dashed rgba(109,40,217,0.5);border-radius:3px;pointer-events:none;animation:aiPulse 1.2s ease-in-out infinite;`
                document.body.appendChild(highlight)

                let node: Node | null = range.endContainer
                while (node && node.nodeType !== Node.ELEMENT_NODE) node = node.parentNode
                if (node) {
                    const BLOCK_TAGS = new Set(['P','H1','H2','H3','H4','H5','H6','LI','BLOCKQUOTE'])
                    let el = node as Element
                    while (el && el !== activeContainer && !BLOCK_TAGS.has(el.tagName.toUpperCase())) {
                        el = el.parentElement!
                    }
                    if (el && el !== activeContainer) anchorOuterHtml = el.outerHTML
                }
            }
            window.getSelection()?.removeAllRanges()

            // 팝업 → 로딩 상태
            popup.innerHTML = `<div style="display:flex;align-items:center;gap:8px;white-space:nowrap;font-weight:700;">⏳ ${styleLabel} 생성 중...</div>`
            popup.style.pointerEvents = 'none'

            try {
                const res = await fetch('/api/generate-visual', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'image', description: text, style }),
                })
                const textRes = await res.text()
                let data
                try {
                    data = JSON.parse(textRes)
                } catch (e) {
                    throw new Error(`서버 응답 지연(시간초과) 또는 연결 오류입니다.\n내용: ${textRes.slice(0, 60)}...`)
                }
                if (data.ok && data.html) {
                    const freshHtml = activeContainer?.innerHTML || ''
                    let updatedHtml: string
                    if (anchorOuterHtml && freshHtml.includes(anchorOuterHtml)) {
                        updatedHtml = freshHtml.replace(anchorOuterHtml, anchorOuterHtml + data.html)
                    } else {
                        updatedHtml = freshHtml + data.html
                    }
                    if (activeContainer) activeContainer.innerHTML = updatedHtml
                    setPage(p => ({ ...p, content: updatedHtml }))
                    if (isAdmin) {
                        await fetch('/api/archive-page', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ week_number: weekNumber, title: page.title, content: updatedHtml, course_id: courseId }),
                        })
                    }
                } else {
                    alert(`이미지 생성 실패:\n${data.error || '알 수 없는 오류가 발생했습니다.'}`)
                }
            } catch (err: any) {
                alert(`이미지 생성 중 네트워크 오류가 발생했습니다.\n${err.message || err}`)
            }

            highlight?.remove(); highlight = null
            popup.style.pointerEvents = ''
            popup.style.display = 'none'
            generatingFor = ''
            activeContainer = null
            activeText = ''
        }

        document.addEventListener('mouseup', handleMouseUp)
        document.addEventListener('keyup', handleKeyUp)
        document.addEventListener('mousedown', (e) => {
            // 팝업 내부 클릭(스타일 버튼)이면 닫지 않음
            if (!popup.contains(e.target as Node)) popup.style.display = 'none'
        })

        return () => {
            document.removeEventListener('mouseup', handleMouseUp)
            document.removeEventListener('keyup', handleKeyUp)
            popup.remove()
            highlight?.remove()
        }
    }, [mounted, isAdmin, weekNumber, courseId, page.title])

    const [isDragging, setIsDragging] = useState(false);
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadFiles, setUploadFiles] = useState<FileList | File[] | null>(null);
    const [isFolderMode, setIsFolderMode] = useState(false);
    const [uploadTitle, setUploadTitle] = useState('');
    const [uploading, setUploading] = useState(false);
    const [zipping, setZipping] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0); // 0~100
    const [uploadError, setUploadError] = useState('');

    // ── 녹음 기능(Smart Audio Recorder) 상태 ──
    const [uploadTab, setUploadTab] = useState<'file'|'folder'|'record'>('file');
    const [isRecording, setIsRecording] = useState(false);
    const [isRecordingPaused, setIsRecordingPaused] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0); // 현재 세션 기록 시간(초)
    const [recordedSessions, setRecordedSessions] = useState<{ id: string; blob: Blob; duration: number; startedAt: Date }[]>([]);
    
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordingChunksRef = useRef<BlobPart[]>([]);
    const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const latestRecordingDurationRef = useRef<number>(0);

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
    // 전사 전용 AI 제공자 (기본: groq Whisper — Gemini는 자동 폴백)
    const [transcriptionProvider, setTranscriptionProvider] = useState<'groq' | 'gemini'>('groq')
    // 압축률 (100 = 그대로, 30 = 30%로 압축)
    const [compressionRatio, setCompressionRatio] = useState<number>(100)
    // ── AI 파이프라인 옵션 ──
    const [optAutoImage, setOptAutoImage] = useState(true)    // 이미지 자동 생성
    const [optAutoImageStyle, setOptAutoImageStyle] = useState('infographic') // 이미지 자동 생성 스타일
    const [optAutoTts, setOptAutoTts] = useState(true)        // 음원 자동 생성
    const [optAutoDeploy, setOptAutoDeploy] = useState(true)  // AI 완료 후 자동 배포
    // 옵션 ref — useEffect stale closure 방지 (의존성 배열 없이 항상 최신값 참조)
    const optAutoImageRef = useRef(true)
    const optAutoImageStyleRef = useRef('infographic')
    const optAutoDeployRef = useRef(true)
    const optAutoTtsRef = useRef(true)
    // state 변경 시 ref 동기화
    const setOptAutoImageSync = (v: boolean) => { optAutoImageRef.current = v; setOptAutoImage(v) }
    const setOptAutoImageStyleSync = (v: string) => { optAutoImageStyleRef.current = v; setOptAutoImageStyle(v) }
    const setOptAutoDeploySync = (v: boolean) => { optAutoDeployRef.current = v; setOptAutoDeploy(v) }
    const setOptAutoTtsSync = (v: boolean) => { optAutoTtsRef.current = v; setOptAutoTts(v) }

    // TTS (OpenAI) 상태
    const [ttsLoading, setTtsLoading] = useState(false)
    const [ttsError, setTtsError] = useState('')
    const [ttsLocalUrl, setTtsLocalUrl] = useState<string | null>(null)  // blob:// MP3 URL (임시)
    const ttsAudioRef = useRef<HTMLAudioElement>(null)
    const [ttsPlaying, setTtsPlaying] = useState(false)
    const [ttsCurrent, setTtsCurrent] = useState(0)
    const [ttsDuration, setTtsDuration] = useState(0)
    const [ttsRate, setTtsRate] = useState(1.0)
    // 구글드라이브 저장 상태
    const [ttsSaving, setTtsSaving] = useState(false)
    const [ttsFileId, setTtsFileId] = useState<string | null>(initialPage.tts_audio_file_id || null)
    const ttsDriveAudioRef = useRef<HTMLAudioElement>(null)
    const [ttsdrPlaying, setTtsdrPlaying] = useState(false)
    const [ttsdrCurrent, setTtsdrCurrent] = useState(0)
    const [ttsdrDuration, setTtsdrDuration] = useState(0)
    const [ttsdrRate, setTtsdrRate] = useState(1.0)

    // blob URL 설정 시 자동 재생
    useEffect(() => {
        if (!ttsLocalUrl || !ttsAudioRef.current) return
        ttsAudioRef.current.load()
        ttsAudioRef.current.play().then(() => setTtsPlaying(true)).catch(() => {})
    }, [ttsLocalUrl])

    // 재생 속도 변경 시 audio element에 적용
    useEffect(() => {
        if (ttsAudioRef.current) ttsAudioRef.current.playbackRate = ttsRate
    }, [ttsRate])


    // Mermaid 렌더링 + window._visClick 전역 등록: aiSumHtml이 업데이트되면 초기화
    const aiResultRef = useRef<HTMLDivElement>(null)

    // 이미지 생성 옵션 OFF 시 gen-visual-btn 블록을 화면에서도 제거
    const aiDisplayHtml = (() => {
        if (!aiSumHtml || optAutoImage) return aiSumHtml
        const tmp = document.createElement('div')
        tmp.innerHTML = aiSumHtml
        tmp.querySelectorAll('.gen-visual-btn').forEach(el => el.remove())
        return tmp.innerHTML
    })()

    // ── Smart Audio Recorder Logic ──
    const finishCurrentSession = useCallback((isInterrupt: boolean = false) => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            try { mediaRecorderRef.current.stop(); } catch (e) { console.warn('Recorder stop error:', e); }
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (recordingTimerRef.current) {
            clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = null;
        }

        setIsRecording(false);
        setIsRecordingPaused(false);
    }, []);

    useEffect(() => {
        const handleVisibilityChange = () => {
            // Safari iOS might pause JS execution or cut mic on sleep
            // We observe stream track events to detect mute/ended state.
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            finishCurrentSession(); 
        };
    }, [finishCurrentSession]);

    const startRecording = async () => {
        try {
            // 브라우저 벤더(Google WebRTC 오픈소스 엔진)에 내장된 최고급 하드웨어/로우레벨 AGC(자동 게인 컨트롤) 활성화.
            // Web Audio API(DynamicsCompressorNode) 사용 시, 아이폰(iOS)에서 화면이 꺼지거나 백그라운드로 
            // 전환될 때 절전 모드로 인해 오디오 스레드가 멈추어 녹음이 잘리는 치명적인 문제가 있습니다.
            // 네이티브 AGC를 사용하면 이런 피크 트러블 없이 모바일 백그라운드에서도 볼륨 밸런스가 영구적으로 유지됩니다.
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    autoGainControl: true,       // 입력 볼륨 자동 제어 (작은 소리 증폭, 큰 소리 압축 및 피크 방지)
                    noiseSuppression: true,      // 주변 백색 소음 및 노이즈 최고급 억제
                    echoCancellation: true,      // 에코 캔슬링
                    channelCount: 1,             // 강의자 목소리에 집중하는 모노 채널 구성
                } 
            });
            streamRef.current = stream;
            
            stream.getAudioTracks().forEach(track => {
                track.onended = () => {
                    if (mediaRecorderRef.current?.state === 'recording' || mediaRecorderRef.current?.state === 'paused') finishCurrentSession(true);
                };
                track.onmute = () => {
                    if (mediaRecorderRef.current?.state === 'recording' || mediaRecorderRef.current?.state === 'paused') finishCurrentSession(true);
                };
            });

            let mimeType = 'audio/webm;codecs=opus';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'audio/mp4'; 
                if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = ''; 
            }

            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
            mediaRecorderRef.current = recorder;
            recordingChunksRef.current = [];
            latestRecordingDurationRef.current = 0;
            setRecordingTime(0);
            const startedAt = new Date();

            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) recordingChunksRef.current.push(e.data);
            };

            recorder.onstop = () => {
                if (recordingChunksRef.current.length > 0) {
                    const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
                    setRecordedSessions(prev => [
                        ...prev, 
                        { id: Date.now().toString(), blob, duration: latestRecordingDurationRef.current, startedAt }
                    ]);
                }
                recordingChunksRef.current = [];
            };

            recorder.start(1000); 
            setIsRecording(true);
            setIsRecordingPaused(false);

            recordingTimerRef.current = setInterval(() => {
                setRecordingTime(prev => {
                    const next = prev + 1;
                    latestRecordingDurationRef.current = next;
                    return next;
                });
            }, 1000);
            
        } catch (err: any) {
            alert(`마이크 접근 실패: ${err.message}`);
        }
    };

    const pauseRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.pause();
            setIsRecordingPaused(true);
            if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        }
    };

    const resumeRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
            mediaRecorderRef.current.resume();
            setIsRecordingPaused(false);
            recordingTimerRef.current = setInterval(() => {
                setRecordingTime(prev => {
                    const next = prev + 1;
                    latestRecordingDurationRef.current = next;
                    return next;
                });
            }, 1000);
        }
    };

    const stopRecording = () => {
        finishCurrentSession();
    };

    const removeRecordedSession = (id: string) => {
        setRecordedSessions(prev => prev.filter(s => s.id !== id));
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    useEffect(() => {
        if (!aiSumHtml) return

        // ── window._visClick 전역 등록 (dangerouslySetInnerHTML은 script를 실행하지 않음) ──
        ;(window as any)._visClick = function (btn: HTMLElement, type: string, desc: string) {
            const el = btn.closest('.gen-visual-btn') as HTMLElement | null
            if (!el) return
            const orig = el.innerHTML
            ;(btn as HTMLButtonElement).disabled = true
            btn.textContent = '⏳ 생성 중...'
            
            // 자동 생성 스타일 오버라이드 (type이 'image' 또는 'mermaid'가 아닌 일반 비주얼 타입일 경우, 혹은 optAutoImageStyleRef가 설정된 경우)
            // 단, 사용자가 직접 수동으로 mermaid를 눌렀을 때는 제외
            let finalType = type
            if (type === 'image' || type === 'photo' || type === 'diagram' || type === 'infographic' || type.startsWith('illustration') || type === 'simple') {
                finalType = optAutoImageStyleRef.current // 사용자가 팝업에서 선택한 스타일 강제 적용
            }

            fetch('/api/generate-visual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: finalType, description: desc }),
            })
                .then(r => r.text())
                .then(textRes => {
                    try {
                        return JSON.parse(textRes)
                    } catch (e) {
                        return { ok: false, error: '서버 응답 지연(시간초과) 또는 연결 오류: ' + textRes.slice(0, 40) }
                    }
                })
                .then(d => {
                    if (d.ok && d.html) {
                        // 생성 성공 → 자동으로 삽입 (콴퍼마 리스트 없이 바로 삽입)
                        const tmp = document.createElement('div')
                        tmp.innerHTML = d.html
                        el.parentNode?.replaceChild(tmp.firstChild || tmp, el)
                        if (d.type === 'mermaid' && (window as any).mermaid) setTimeout(() => (window as any).mermaid.run(), 150)
                    } else {
                        el.innerHTML = orig
                        const em = document.createElement('p')
                        em.style.cssText = 'margin:6px 0 0;font-size:10px;color:#dc2626;'
                        em.textContent = '⚠️ ' + (d.error || '이미지 생성 실패') + ' — 삽입 안 함 버튼으로 제거할 수 있습니다.'
                        el.appendChild(em)
                    }
                })
                .catch(() => { el.innerHTML = orig })
        }

    }, [aiSumHtml])

    // ── AI 요약 완료 시 이미지 자동 순차 생성 (재시도 포함, 관리자 오버레이 추가) ──
    useEffect(() => {
        if (aiSumStatus !== 'done' || !aiSumHtml) return
        // 이미지 자동 생성 옵션이 꺼지면 자동 배포만 따로 실행 (ref 사용 → effect 재실행 없음)
        if (!optAutoImageRef.current) {
            if (isAdmin && optAutoDeployRef.current) setTimeout(() => saveAiSummaryRef.current(), 1500)
            return
        }
        const timer = setTimeout(() => {
            const root = aiResultRef.current
            if (!root) return
            const blocks = Array.from(root.querySelectorAll('.gen-visual-btn'))
            if (!blocks.length) return

            ;(async () => {
                for (const block of blocks) {
                    if (block.querySelector('.ai-visual-block, img, svg')) continue
                    const MAX_ATTEMPTS = 3
                    let succeeded = false

                    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
                        // 이전 에러 메시지 제거
                        block.querySelectorAll('p[style*="dc2626"]').forEach(e => e.remove())

                        const btn = block.querySelector('button') as HTMLButtonElement | null
                        if (!btn) break
                        // disabled 상태면 초기화
                        if (btn.disabled) {
                            btn.disabled = false
                            btn.textContent = attempt === 0 ? '🍌 AI 이미지 생성' : `🔄 재시도 중... (${attempt + 1}/${MAX_ATTEMPTS})`
                        }
                        if (attempt > 0) btn.textContent = `🔄 재시도 (${attempt + 1}/${MAX_ATTEMPTS})...`
                        btn.click()

                        const result = await new Promise<'done' | 'error'>((resolve) => {
                            const started = Date.now()
                            const iv = setInterval(() => {
                                const isReplaced = !document.body.contains(block)
                                const done = isReplaced || block.querySelector('.ai-visual-block, img, svg')
                                const errEl = block.querySelector('p[style*="dc2626"]')
                                if (done) { clearInterval(iv); resolve('done') }
                                else if (errEl || Date.now() - started > 60_000) { clearInterval(iv); resolve('error') }
                            }, 500)
                        })

                        if (result === 'done') { succeeded = true; break }
                        // 재시도 전 2초 대기 (마지막 시도 제외)
                        if (attempt < MAX_ATTEMPTS - 1) await new Promise(r => setTimeout(r, 2000))
                    }

                    // 최종 실패 → 수동 재시도 버튼 표시
                    if (!succeeded) {
                        block.querySelectorAll('p[style*="dc2626"]').forEach(e => e.remove())
                        const errP = document.createElement('p')
                        errP.style.cssText = 'margin:8px 0 0;font-size:11px;color:#dc2626;display:flex;align-items:center;gap:8px;'
                        errP.textContent = `⚠️ ${MAX_ATTEMPTS}회 시도 실패 —`
                        const retryBtn = document.createElement('button')
                        retryBtn.textContent = '🔄 다시 시도'
                        retryBtn.style.cssText = 'background:#ef4444;color:#fff;border:none;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:bold;cursor:pointer;'
                        retryBtn.onclick = async () => {
                            errP.remove()
                            const innerBtn = block.querySelector('button') as HTMLButtonElement | null
                            if (innerBtn) { innerBtn.disabled = false; innerBtn.textContent = '🍌 AI 이미지 생성'; innerBtn.click() }
                        }
                        errP.appendChild(retryBtn)
                        block.appendChild(errP)
                    }

                    await new Promise(r => setTimeout(r, 300))
                }

                // ── 관리자 전용: 생성된 이미지에 재생성/삭제 오버레이 버튼 추가 ──
                if (isAdmin) {
                    root.querySelectorAll('.ai-visual-block').forEach((el) => {
                        if (el.querySelector('.ai-prev-overlay')) return
                        const wrap = el as HTMLElement
                        wrap.style.position = 'relative'
                        const ov = document.createElement('div')
                        ov.className = 'ai-prev-overlay'
                        ov.style.cssText = 'position:absolute;top:6px;right:6px;display:flex;gap:4px;z-index:10;opacity:0;transition:opacity 0.2s;'
                        wrap.addEventListener('mouseenter', () => { ov.style.opacity = '1' })
                        wrap.addEventListener('mouseleave', () => { ov.style.opacity = '0' })

                        // 🔄 재생성 버튼
                        const regenBtn = document.createElement('button')
                        regenBtn.textContent = '🔄 재생성'
                        regenBtn.style.cssText = 'background:#6d28d9;color:#fff;border:none;border-radius:8px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.2);'
                        regenBtn.onclick = async (e) => {
                            e.stopPropagation()
                            const img = wrap.querySelector('img')
                            const desc = img?.alt || wrap.querySelector('p')?.textContent?.replace(/🍌.*·\s*/, '').trim().slice(0, 100) || '교육 자료'
                            regenBtn.textContent = '⏳...'
                            regenBtn.disabled = true
                            const res = await fetch('/api/generate-visual', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'image', description: desc }) })
                            const textRes = await res.text()
                            let d
                            try {
                                d = JSON.parse(textRes)
                            } catch (e) {
                                throw new Error(`서버 응답 지연(시간초과) 또는 연결 오류입니다.\n내용: ${textRes.slice(0, 60)}...`)
                            }
                            regenBtn.textContent = '🔄 재생성'; regenBtn.disabled = false
                            if (d.ok && d.html) { const tmp = document.createElement('div'); tmp.innerHTML = d.html; wrap.replaceWith(tmp.firstChild as Node) }
                        }
                        // 🗑️ 삭제 버튼
                        const delBtn = document.createElement('button')
                        delBtn.textContent = '🗑️ 삭제'
                        delBtn.style.cssText = 'background:#dc2626;color:#fff;border:none;border-radius:8px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.2);'
                        delBtn.onclick = (e) => { e.stopPropagation(); wrap.remove() }
                        ov.appendChild(regenBtn); ov.appendChild(delBtn); wrap.appendChild(ov)
                    })
                }

                // -- 이미지 생성 완료 → 자동 배포 (옵션 ON일 때만)
                if (isAdmin && optAutoDeploy) {
                    await new Promise(r => setTimeout(r, 1000))  // 마지막 DOM 업데이트 완료 대기
                    saveAiSummaryRef.current()
                }
            })()
        }, 1500)
        return () => clearTimeout(timer)
    }, [aiSumStatus, aiSumHtml, isAdmin, optAutoImage, optAutoDeploy])

    // saveAiSummaryDirectly를 ref로 감싸 — auto-trigger useEffect에서 stale closure 없이 호출
    const saveAiSummaryRef = useRef<() => void>(() => {})

    // 시각화 블록 순차 자동 생성 헬퍼 — 하나 완료 후 다음 블록 처리
    const autoTriggerVisuals = (root: Element | Document, delay = 1200) => {
        return setTimeout(async () => {
            const blocks = Array.from(root.querySelectorAll('.gen-visual-btn'))

            for (const block of blocks) {
                // 이미 이미지/SVG가 있으면 건너뜀
                if (block.querySelector('.ai-visual-block, img, svg')) continue
                const firstBtn = block.querySelector('button') as HTMLButtonElement | null
                if (!firstBtn || firstBtn.disabled) continue

                // 버튼 클릭
                firstBtn.click()

                // 이 블록이 완료될 때까지 대기 (버튼이 enabled 상태로 돌아오거나 이미지가 생길 때까지)
                await new Promise<void>((resolve) => {
                    const maxWait = 30_000 // 최대 30초 대기
                    const started = Date.now()
                    const check = setInterval(() => {
                        const done = block.querySelector('.ai-visual-block, img, svg')
                        const btnBack = block.querySelector('button') as HTMLButtonElement | null
                        const failed = block.querySelector('p[style*="dc2626"]') // 오류 메시지
                        const timedOut = Date.now() - started > maxWait
                        if (done || failed || timedOut || (btnBack && !btnBack.disabled)) {
                            clearInterval(check)
                            resolve()
                        }
                    }, 500)
                })

                // 다음 블록 시작 전 0.2초 대기 (API 부하 분산)
                await new Promise<void>((r) => setTimeout(r, 200))
            }
        }, delay)
    }

    // 저장용 클린 HTML — overlay DOM / 런타임 id 제거
    const getCleanHtml = (container: HTMLElement): string => {
        const clone = container.cloneNode(true) as HTMLElement
        clone.querySelectorAll('.admin-img-overlay').forEach(o => o.remove())
        clone.querySelectorAll('[data-ai-id]').forEach(el => (el as HTMLElement).removeAttribute('data-ai-id'))
        return clone.innerHTML
    }

    // ── 관리자 전용: 저장된 문서 이미지에 재생성/제거 오버레이 버튼 추가 ──
    const attachAdminOverlays = useCallback(() => {
        if (!document.getElementById('ai-overlay-css')) {
            const style = document.createElement('style')
            style.id = 'ai-overlay-css'
            style.innerHTML = `
                .ai-visual-block { position: relative !important; }
                .admin-img-overlay { position:absolute !important; top:10px !important; right:12px !important; display:flex !important; gap:6px !important; z-index:999 !important; opacity:0.85 !important; transition:opacity 0.2s !important; pointer-events:none !important; }
                .admin-img-overlay button { pointer-events:auto !important; }
                .ai-visual-block:hover .admin-img-overlay, .admin-img-overlay:active, .admin-img-overlay:focus-within { opacity: 1 !important; }
            `
            document.head.appendChild(style)
        }

        document.querySelectorAll('.notion-editor').forEach(container => {
            container.querySelectorAll('.ai-visual-block').forEach(block => {
                const existing = block.querySelector('.admin-img-overlay')
                if (existing) {
                    if (existing.hasAttribute('data-live')) return // 이미 살아있는 오버레이면 패스
                    existing.remove() // DB에 저장된 과거의 죽은(event 없는) 오버레이 청소
                }

                const el = block as HTMLElement
                if (!el.dataset.aiId) el.dataset.aiId = `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`

                const overlay = document.createElement('div')
                overlay.className = 'admin-img-overlay'
                overlay.setAttribute('data-live', 'true') // MutationObserver 무한루프 방지용 식별자

                // 재생성 버튼
                const regenBtn = document.createElement('button')
                regenBtn.textContent = '🔄 재생성'
                regenBtn.style.cssText = 'background:#6d28d9;color:#fff;border:none;border-radius:8px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.2);'
                regenBtn.onclick = (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const existingPicker = document.getElementById('ai-regen-picker')
                    if (existingPicker) { existingPicker.remove(); return }

                    const freshEl = document.querySelector(`[data-ai-id="${el.dataset.aiId}"]`) as HTMLElement | null
                    const desc: string = (freshEl || el).dataset.aiDesc
                        || (freshEl || el).querySelector('img')?.alt
                        || (freshEl || el).querySelector('p')?.textContent?.replace(/🍌.*·\s*/g, '').replace(/📊.*?·|🔷.*?·|🎨.*?·|⚡.*?·|📸.*?·|\d+·/g, '').trim().slice(0, 150)
                        || '교육 자료'
                    const currentStyle = (freshEl || el).dataset.aiStyle || ''

                    const picker = document.createElement('div')
                    picker.id = 'ai-regen-picker'
                    const rect = regenBtn.getBoundingClientRect()
                    picker.style.cssText = `position:fixed;top:${rect.bottom + 6}px;right:${window.innerWidth - rect.right}px;background:linear-gradient(135deg,#6d28d9,#4f46e5);border-radius:10px;padding:8px;display:flex;flex-direction:column;gap:4px;z-index:99999;min-width:155px;box-shadow:0 4px 24px rgba(0,0,0,0.4);`
                    const REGEN_STYLES = [
                        { key: 'search',          label: '🌐 웹 검색 (실제 제품)' },
                        { key: 'photo',           label: '📸 사진 (AI 생성)' },
                        { key: 'infographic',     label: '📊 인포그래픽' },
                        { key: 'diagram',         label: '🔷 다이어그램' },
                        { key: 'illustration',    label: '🎨 일러스트(귀여운)' },
                        { key: 'illustration_pro',label: '🖼️ 일러스트(전문)' },
                        { key: 'illustration_biz',label: '✏️ 일러스트(비즈)' },
                        { key: 'simple',          label: '⚡ 심플' },
                    ]
                    REGEN_STYLES.forEach(({ key, label }) => {
                        const sBtn = document.createElement('button')
                        sBtn.textContent = label + (currentStyle === key ? ' ✓' : '')
                        sBtn.style.cssText = 'background:rgba(255,255,255,0.15);color:#fff;border:1.5px solid rgba(255,255,255,0.3);border-radius:7px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer;text-align:left;width:100%;'
                        sBtn.onmouseenter = () => { sBtn.style.background = 'rgba(255,255,255,0.25)' }
                        sBtn.onmouseleave = () => { sBtn.style.background = 'rgba(255,255,255,0.15)' }
                        sBtn.onclick = async (ev) => {
                            ev.stopPropagation()
                            picker.remove()

                            const targetEl = document.querySelector(`[data-ai-id="${el.dataset.aiId}"]`) as HTMLElement | null
                            if (!targetEl) return
                            const targetRect = targetEl.getBoundingClientRect()
                            const loadingOv = document.createElement('div')
                            loadingOv.id = 'ai-loading-overlay'
                            loadingOv.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(20,0,50,0.78);display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:12px;z-index:99998;backdrop-filter:blur(3px);pointer-events:none;`
                            loadingOv.innerHTML = `<div style="font-size:2.5rem;animation:aiPulse 1s ease-in-out infinite">✨</div><div style="color:#e9d5ff;font-size:14px;font-weight:700;margin-top:12px">이미지 생성 중...</div><div style="color:rgba(255,255,255,0.6);font-size:11px;margin-top:4px">${label}</div>`
                            targetEl.appendChild(loadingOv)

                            try {
                                const res = await fetch('/api/generate-visual', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ type: 'image', description: desc, style: key }),
                                })
                                const data = await res.json()
                                if (data.ok && data.html) {
                                    const containerEl = document.querySelector('.notion-editor') as HTMLElement | null
                                    if (containerEl) {
                                        const currentTarget = containerEl.querySelector(`[data-ai-id="${el.dataset.aiId}"]`) as HTMLElement | null
                                        if (currentTarget) {
                                            const targetOuter = currentTarget.outerHTML
                                            let updatedHtml = containerEl.innerHTML.replace(targetOuter, data.html)
                                            
                                            const tmp = document.createElement('div')
                                            tmp.innerHTML = updatedHtml
                                            const cleanHtml = getCleanHtml(tmp)

                                            setPage(p => ({ ...p, content: cleanHtml }))
                                            // auto-save is omitted here, rely on explicit saves or auto API below
                                            await fetch('/api/archive-page', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ week_number: weekNumber, title: page.title, content: cleanHtml, course_id: courseId }),
                                            })
                                        }
                                    }
                                } else {
                                    alert(`이미지 재생성 실패:\n${data.error || '알 수 없는 오류'}`)
                                }
                            } catch (err: any) {
                                alert(`이미지 재생성 네트워크 오류:\n${err.message || err}`)
                            }
                            document.getElementById('ai-loading-overlay')?.remove()
                        }
                        picker.appendChild(sBtn)
                    })
                    document.body.appendChild(picker)
                    setTimeout(() => {
                        const close = (ev: MouseEvent) => {
                            if (!picker.contains(ev.target as Node) && ev.target !== regenBtn) {
                                picker.remove()
                                document.removeEventListener('mousedown', close)
                            }
                        }
                        document.addEventListener('mousedown', close)
                    }, 0)
                }

                // 제거 버튼
                const removeBtn = document.createElement('button')
                removeBtn.textContent = '🗑️ 제거'
                removeBtn.style.cssText = 'background:#dc2626;color:#fff;border:none;border-radius:8px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.2);'
                removeBtn.onclick = async (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (confirm('이미지를 제거할까요?')) {
                        const freshEl2 = document.querySelector(`[data-ai-id="${el.dataset.aiId}"]`) as HTMLElement | null
                        if (!freshEl2) return
                        freshEl2.remove()
                        
                        const containerEl = document.querySelector('.notion-editor') as HTMLElement | null
                        if (containerEl) {
                            const cleanHtml = getCleanHtml(containerEl)
                            setPage(p => ({ ...p, content: cleanHtml }))
                            await fetch('/api/archive-page', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ week_number: weekNumber, title: page.title, content: cleanHtml, course_id: courseId }),
                            })
                        }
                    }
                }

                overlay.appendChild(regenBtn)
                overlay.appendChild(removeBtn)
                el.appendChild(overlay)
            })
        })
    }, [page.title, courseId, weekNumber])

    useEffect(() => {
        if (!isAdmin || editing || !mounted) return
        
        // 초기 로드 시 한 번 실행
        attachAdminOverlays()

        // MutationObserver 등록 (React가 DOM을 덮어쓰거나 이미지가 동적으로 삽입될 때 오버레이 복구)
        const observer = new MutationObserver((mutations) => {
            let shouldAttach = false
            for (const m of mutations) {
                if (m.type === 'childList') {
                    shouldAttach = true
                    break
                }
            }
            if (shouldAttach) attachAdminOverlays()
        })

        // 전체 document body 관찰 (notion-editor 렌더링 지연 대응)
        observer.observe(document.body, { childList: true, subtree: true })

        return () => observer.disconnect()
    }, [isAdmin, editing, mounted, attachAdminOverlays])


    // TTS 변환 실행 (관리자만) - OpenAI TTS API 사용
    async function handleBrowserTts() {
        const html = aiSumHtml || page.content || ''
        if (!html.trim()) {
            setTtsError('AI 정리 또는 페이지 콘텐츠가 없습니다.')
            return
        }
        // 이전 blob URL 해제
        if (ttsLocalUrl) { URL.revokeObjectURL(ttsLocalUrl); setTtsLocalUrl(null) }
        setTtsLoading(true)
        setTtsError('')
        setTtsPlaying(false)
        setTtsCurrent(0)
        setTtsDuration(0)
        try {
            const res = await fetch('/api/openai-tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ html, maxChars: 4000 }),
            })
            if (!res.ok) {
                const errData = await res.json().catch(() => ({ error: `HTTP 오류 ${res.status}` }))
                throw new Error(errData.error || `변환 실패 (${res.status})`)
            }
            const blob = await res.blob()  // audio/mpeg
            setTtsLocalUrl(URL.createObjectURL(blob))
        } catch (e: any) {
            setTtsError(e.message)
        } finally {
            setTtsLoading(false)
        }
    }

    // Drive에 저장 (관리자만) — TTS 생성 + Google Drive 업로드 + DB 저장
    async function handleSaveToDrive() {
        const html = aiSumHtml || page.content || ''
        if (!html.trim()) { setTtsError('저장할 콘텐츠가 없습니다.'); return }
        setTtsSaving(true)
        setTtsError('')
        try {
            const res = await fetch('/api/tts-to-drive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ html, weekNumber, courseId }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || `오류 (${res.status})`)
            setTtsFileId(data.fileId)
        } catch (e: any) {
            setTtsError(`Drive 저장 실패: ${e.message}`)
        } finally {
            setTtsSaving(false)
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

        // ── AI 정리 시작 전: 기존 콘텐츠를 히스토리에 저장 후 클리어 ──
        if (page.content && page.content.trim().length > 50) {
            try {
                await fetch('/api/archive-page', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        week_number: weekNumber,
                        title: page.title || `${weekNumber}주차 강의`,
                        content: page.content,
                        course_id: courseId,
                    }),
                })
            } catch (e) { console.warn('[history] 히스토리 저장 실패', e) }
            // 기존 콘텐츠·음원 언마운트 (히스토리는 DB에 저장됨)
            setPage(p => ({ ...p, content: '' }))
            setTtsFileId(null)
        }

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
        // DOM 파싱으로 안전하게 gen-visual-btn과 관리자 오버레이 제거
        const tmpDom = document.createElement('div')
        tmpDom.innerHTML = domHtml
        tmpDom.querySelectorAll('.gen-visual-btn').forEach(el => el.remove())
        tmpDom.querySelectorAll('.ai-prev-overlay').forEach(el => el.remove())
        const cleanHtml = tmpDom.innerHTML

        // ── 1) TTS 옵션이 ON이면 배포 전에 TTS 먼저 생성 ──────────────────
        if (isAdmin && optAutoTtsRef.current) {
            try {
                setTtsSaving(true)
                const ttsRes = await fetch('/api/tts-to-drive', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ html: cleanHtml, weekNumber, courseId }),
                })
                const ttsData = await ttsRes.json()
                if (ttsData.fileId) setTtsFileId(ttsData.fileId)
            } catch (e) {
                console.warn('[auto TTS]', e)
            } finally {
                setTtsSaving(false)
            }
        }

        // ── 2) 모든 옵션 완료 후 DB 저장 및 배포 ──────────────────────────
        setPage(p => ({ ...p, content: cleanHtml }))
        setEditing(false)
        setSaving(true)
        try {
            await fetch('/api/archive-page', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ week_number: weekNumber, title: page.title, content: cleanHtml, course_id: courseId }),
            })
            setSaveStatus('saved')
            setTimeout(() => setSaveStatus('idle'), 3000)

            // ── 3) 배포 검증: DB에서 재조회 –────────────────────────────
            setTimeout(async () => {
                try {
                    const verifyRes = await fetch(`/api/archive-page?week_number=${weekNumber}&course_id=${courseId}`)
                    const verifyData = await verifyRes.json()
                    if (verifyData.page?.content && verifyData.page.content.length > 100) {
                        setDeployToast({ ok: true, msg: '✅ 학생 페이지 배포 완료! DB 저장 확인됨' })
                        setLastDeployedAt(new Date())  // 배포 성공 시간 기록
                    } else {
                        setDeployToast({ ok: false, msg: '⚠️ 배포는 완료되었지만 DB 콘텐츠가 비어있습니다. 다시 확인해 주세요.' })
                    }
                } catch {
                    setDeployToast({ ok: false, msg: '⚠️ 배포 검증 실패 — 학생 페이지를 직접 확인해 주세요.' })
                }
                setTimeout(() => setDeployToast(null), 8000)
            }, 2000)

        } catch { setSaveStatus('error'); setDeployToast({ ok: false, msg: '❌ DB 저장 실패 — 다시 시도해 주세요.' }) }
        finally { setSaving(false) }
    }
    // saveAiSummaryRef를 항상 최신 함수로 업데이트
    saveAiSummaryRef.current = saveAiSummaryDirectly

    // ── 본문 분석 → AI 이미지 자동 생성 (관리자용) ──
    const [autoVisualsLoading, setAutoVisualsLoading] = useState(false)
    const [autoVisualsMsg, setAutoVisualsMsg] = useState('')
    const handleAutoVisuals = async (targetContent?: string) => {
        const html = targetContent || page.content || ''
        if (!html.trim()) return
        setAutoVisualsLoading(true)
        setAutoVisualsMsg('본문 분석 중...')
        try {
            const TEXT_MARKER_RE = /\[(이미지|VISUALIZATION|IMAGE|DIAGRAM|CHART):\s*([^\]]+)\]/gi

            // ── HTML 문자열에서 직접 마커 탐색 ──
            const rawMatches = [...html.matchAll(TEXT_MARKER_RE)]

            if (rawMatches.length > 0) {
                // ── 텍스트 마커 → 이미지 HTML 문자열 치환 방식 ──
                setAutoVisualsMsg(`${rawMatches.length}개 마커 발견 — 이미지 생성 중...`)
                let updatedHtml = html

                for (let i = 0; i < rawMatches.length; i++) {
                    const fullMatch = rawMatches[i][0]
                    const desc = rawMatches[i][2].trim()
                    setAutoVisualsMsg(`이미지 생성 중 (${i + 1}/${rawMatches.length})...`)
                    try {
                        const res = await fetch('/api/generate-visual', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ type: 'image', description: desc }),
                        })
                        const d = await res.json()
                        if (d.ok && d.html) {
                            // 마커 텍스트를 이미지 HTML로 교체 (마커를 </p>이미지<p>로 감싸서 단락 분리)
                            updatedHtml = updatedHtml.replace(
                                fullMatch,
                                `</p>${d.html}<p>`
                            )
                        }
                    } catch (e) { console.warn('[auto-visuals] marker img failed:', e) }
                    if (i < rawMatches.length - 1) await new Promise(r => setTimeout(r, 500))
                }
                // 빈 단락 정리
                updatedHtml = updatedHtml.replace(/<p>\s*<\/p>/gi, '')

                // React state 업데이트 → 화면 즉시 반영
                setPage(p => ({ ...p, content: updatedHtml }))
                await fetch('/api/archive-page', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ week_number: weekNumber, title: page.title, content: updatedHtml, course_id: courseId }),
                })
                setAutoVisualsMsg(`✅ ${rawMatches.length}개 이미지가 삽입되었습니다!`)
                setTimeout(() => setAutoVisualsMsg(''), 4000)
            } else {
                // ── 마커 없음 → AI 개념 추출 후 이미지 생성 ──
                const analysisRes = await fetch('/api/auto-visuals', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: html }),
                })
                const analysisData = await analysisRes.json()
                if (!analysisRes.ok) throw new Error(analysisData.error || '분석 실패')
                const concepts: Array<{ description: string; anchor: string }> = analysisData.concepts || []
                if (!concepts.length) throw new Error('이미지를 삽입할 내용을 찾지 못했습니다.')

                setAutoVisualsMsg(`${concepts.length}개 주제 발견 — 이미지 생성 중...`)
                let updatedHtml = html

                for (let i = 0; i < concepts.length; i++) {
                    const { description, anchor } = concepts[i]
                    setAutoVisualsMsg(`이미지 생성 중 (${i + 1}/${concepts.length})...`)
                    try {
                        const imgRes = await fetch('/api/generate-visual', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ type: 'image', description }),
                        })
                        const imgData = await imgRes.json()
                        if (imgData.ok && imgData.html) {
                            // anchor 키워드가 있는 </p> 태그 다음에 이미지 삽입
                            const anchorRegex = new RegExp(`(${anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^<]*<\\/(?:p|h[1-6]|li)>)`, 'i')
                            if (anchorRegex.test(updatedHtml)) {
                                updatedHtml = updatedHtml.replace(anchorRegex, `$1${imgData.html}`)
                            } else {
                                // 못 찾으면 전체 1/3, 2/3 지점 </p> 뒤에 삽입
                                const paragraphs = [...updatedHtml.matchAll(/<\/p>/gi)]
                                const targetIdx = Math.floor(paragraphs.length * (i + 1) / (concepts.length + 1))
                                if (paragraphs[targetIdx]) {
                                    const pos = (paragraphs[targetIdx].index || 0) + 4
                                    updatedHtml = updatedHtml.slice(0, pos) + imgData.html + updatedHtml.slice(pos)
                                } else {
                                    updatedHtml += imgData.html
                                }
                            }
                        }
                    } catch (e) { console.warn('[auto-visuals] image gen failed:', e) }
                    if (i < concepts.length - 1) await new Promise(r => setTimeout(r, 500))
                }

                setPage(p => ({ ...p, content: updatedHtml }))
                await fetch('/api/archive-page', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ week_number: weekNumber, title: page.title, content: updatedHtml, course_id: courseId }),
                })
                setAutoVisualsMsg(`✅ ${concepts.length}개 이미지가 삽입되었습니다!`)
                setTimeout(() => setAutoVisualsMsg(''), 4000)
            }
        } catch (e: any) {
            setAutoVisualsMsg(`❌ ${e.message}`)
            setTimeout(() => setAutoVisualsMsg(''), 5000)
        } finally {
            setAutoVisualsLoading(false)
        }
    }

    const editAreaRef = useRef<HTMLDivElement>(null);
    const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

    // ── 일괄 이미지 생성: page.content 내 gen-visual-btn을 순서대로 처리 ──
    const handleBatchGenerateImages = async () => {
        const container = document.getElementById(`archive-content-week-${weekNumber}`)
        if (!container) return
        const blocks = Array.from(container.querySelectorAll('.gen-visual-btn'))
        if (!blocks.length) return
        setBatchImgRunning(true)
        setBatchImgProgress({ done: 0, total: blocks.length })

        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i] as HTMLElement
            // 이미 이미지가 삽입된 블록은 건너뜀
            if (block.querySelector('.ai-visual-block, img, svg')) {
                setBatchImgProgress(p => p ? { ...p, done: p.done + 1 } : null)
                continue
            }
            const desc = block.getAttribute('data-vdesc') || ''
            if (!desc) continue

            const MAX_ATTEMPTS = 3
            for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
                block.querySelectorAll('p[style*="dc2626"]').forEach(e => e.remove())
                const btn = block.querySelector('button') as HTMLButtonElement | null
                if (!btn) break
                if (btn.disabled) { btn.disabled = false }
                btn.textContent = attempt === 0 ? '⏳ 생성 중...' : `🔄 재시도 (${attempt + 1}/${MAX_ATTEMPTS})...`
                btn.click()

                const result = await new Promise<'done' | 'error'>((resolve) => {
                    const started = Date.now()
                    const iv = setInterval(() => {
                        const isReplaced = !document.body.contains(block)
                        const done = isReplaced || block.querySelector('.ai-visual-block, img, svg')
                        const err = block.querySelector('p[style*="dc2626"]')
                        if (done) { clearInterval(iv); resolve('done') }
                        else if (err) { clearInterval(iv); resolve('error') }
                        else if (Date.now() - started > 60_000) { clearInterval(iv); resolve('error') }
                    }, 500)
                })
                if (result === 'done') break
                if (attempt < MAX_ATTEMPTS - 1) await new Promise(r => setTimeout(r, 2000))
            }
            setBatchImgProgress(p => p ? { ...p, done: i + 1 } : null)
        }

        // 이미지 삽입 후 DOM에서 content 추출 → 자동 저장
        const newContent = container.innerHTML
        setPage(prev => ({ ...prev, content: newContent }))
        triggerAutoSave()
        setBatchImgRunning(false)
        setBatchImgProgress(null)
    }

    const handleSave = async () => {
        setSaving(true);
        const content = pageRef.current.content || '';
        try {
            const res = await fetch('/api/archive-page', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ week_number: weekNumber, title: pageRef.current.title, content, course_id: courseId }),
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
    }, [isAdmin, courseId]); // eslint-disable-line react-hooks/exhaustive-deps

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

    const transferRecordingToUpload = () => {
        if (recordedSessions.length === 0) return;
        
        if (isRecording || isRecordingPaused) {
            finishCurrentSession(false);
        }

        if (recordedSessions.length === 1) {
            const session = recordedSessions[0];
            const ext = session.blob.type.includes('mp4') ? 'm4a' : 'weba';
            const dateStr = session.startedAt.toLocaleTimeString('ko-KR', { hour12: false }).replace(/:/g, '-');
            const file = new File([session.blob], `강의현장녹음_${dateStr}.${ext}`, { type: session.blob.type });
            setUploadFile(file);
            setUploadFiles(null);
            setIsFolderMode(false);
        } else {
            const filesArray = recordedSessions.map((session, i) => {
                const dateStr = session.startedAt.toLocaleTimeString('ko-KR', { hour12: false }).replace(/:/g, '-');
                const ext = session.blob.type.includes('mp4') ? 'm4a' : 'weba';
                return new File([session.blob], `녹음조각_${i + 1}_${dateStr}.${ext}`, { type: session.blob.type });
            });
            setUploadFiles(filesArray);
            setUploadFile(null);
            setIsFolderMode(true);
        }
        
        setRecordedSessions([]);
        setUploadTitle(recordedSessions.length > 1 ? `${weekNumber}주차_통합강의녹음본.zip` : '');
        setUploadTab(recordedSessions.length > 1 ? 'folder' : 'file');
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

    const memoizedAiDisplay = useMemo(() => {
        if (!aiDisplayHtml) return null;
        return (
            <div
                ref={aiResultRef}
                className="notion-editor max-h-96 overflow-y-auto p-5 bg-white dark:bg-neutral-900 border border-violet-100 dark:border-violet-900/40 rounded-2xl text-sm"
                dangerouslySetInnerHTML={{ __html: aiDisplayHtml }}
            />
        );
    }, [aiDisplayHtml]);

    const memoizedPageContent = useMemo(() => {
        return (
            <div
                className="notion-editor min-h-[400px] p-8 outline-none text-neutral-800 dark:text-neutral-200 text-[16px] leading-relaxed"
                dangerouslySetInnerHTML={{ __html: page.content || '<p style="color:#9ca3af;font-style:italic">아직 작성된 내용이 없습니다. (관리자만 편집 가능)</p>' }}
            />
        );
    }, [page.content]);

    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 archive-page">
            {/* 배포 결과 토스트 */}
            {deployToast && (
                <div className={`fixed bottom-24 right-6 z-[9999] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl text-white text-sm font-bold transition-all animate-fade-in ${deployToast.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
                    <span className="text-xl">{deployToast.ok ? '✅' : '⚠️'}</span>
                    <span>{deployToast.msg}</span>
                    <button onClick={() => setDeployToast(null)} className="ml-2 opacity-70 hover:opacity-100 text-lg leading-none">×</button>
                </div>
            )}
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
                        {/* 목록으로 / 관리자 패널로 버튼 */}
                        {adminCourse ? (
                            <button
                                onClick={() => window.history.back()}
                                className="p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition text-neutral-500"
                                title="관리자 패널로 (이전 화면)"
                            >
                                <LayoutGrid className="w-5 h-5" />
                            </button>
                        ) : (
                            <Link
                                href={backUrl}
                                className="p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition text-neutral-500"
                                title="목록으로"
                            >
                                <LayoutGrid className="w-5 h-5" />
                            </Link>
                        )}
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

                        {/* 🚀 학생 배포 완료 배지 — 관리자만, lastDeployedAt 있을 때 */}
                        {isAdmin && lastDeployedAt && (
                            <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-400 whitespace-nowrap"
                                title={`학생 페이지 배포 완료: ${lastDeployedAt.toLocaleString('ko-KR')}`}>
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                                </span>
                                배포됨 · {lastDeployedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        )}

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
                        {/* 🎤 강의 음성 버튼 (Drive 저장 통합) — 관리자만 */}
                        {isAdmin && page.content && (
                            <button
                                onClick={handleSaveToDrive}
                                disabled={ttsSaving}
                                title={ttsFileId ? '강의 음성 재생성 후 Drive에 저장' : '강의 내용을 AI 음성으로 변환하여 Google Drive에 저장 (학생에게 공개)'}
                                className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition ${
                                    ttsSaving
                                        ? 'bg-emerald-100 text-emerald-500 cursor-wait dark:bg-emerald-900/20'
                                        : ttsFileId
                                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                        : 'bg-neutral-100 hover:bg-emerald-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                                }`}
                            >
                                {ttsSaving ? (
                                    <><div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" /> 음성 생성 중...</>
                                ) : ttsFileId ? (
                                    <><span>🎤</span> 강의 음성 저장됨</>
                                ) : (
                                    <><span>🎤</span> 강의 음성 만들기</>
                                )}
                            </button>
                        )}

                        {/* 🍌 일괄 이미지 생성 버튼 — gen-visual-btn이 있는 경우만 표시 */}
                        {isAdmin && !editing && page.content && page.content.includes('gen-visual-btn') && (
                            <button
                                onClick={handleBatchGenerateImages}
                                disabled={batchImgRunning}
                                title="문서 내 시각화 자리에 이미지를 순서대로 생성합니다"
                                className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition ${
                                    batchImgRunning
                                        ? 'bg-yellow-100 text-yellow-700 cursor-wait dark:bg-yellow-900/30 dark:text-yellow-300'
                                        : 'bg-amber-500 hover:bg-amber-600 text-white'
                                }`}
                            >
                                {batchImgRunning ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" />
                                    {batchImgProgress ? `이미지 생성 중 ${batchImgProgress.done}/${batchImgProgress.total}` : '준비 중...'}</>
                                ) : (
                                    <><span>🍌</span> {(() => {
                                        const cnt = (page.content.match(/class="gen-visual-btn"/g) || []).length
                                        return `이미지 ${cnt}개 생성`
                                    })()}</>
                                )}
                            </button>
                        )}

                        {/* 📸 AI 이미지 자동 삽입 — 본문 분석 → 필요한 위치에 자동 생성 */}
                        {isAdmin && !editing && !!page.content && (
                            <button
                                onClick={() => handleAutoVisuals(page.content)}
                                disabled={autoVisualsLoading}
                                title="본문을 AI로 분석하여 이미지가 필요한 위치에 자동으로 이미지를 생성·삽입합니다"
                                className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition ${
                                    autoVisualsLoading
                                        ? 'bg-purple-100 text-purple-700 cursor-wait dark:bg-purple-900/30 dark:text-purple-300'
                                        : 'bg-purple-600 hover:bg-purple-700 text-white'
                                }`}
                            >
                                {autoVisualsLoading
                                    ? <><Loader2 className="w-4 h-4 animate-spin" /> {autoVisualsMsg || '분석 중...'}</>
                                    : <><span>📸</span> AI 이미지 자동 삽입</>
                                }
                            </button>
                        )}
                        {autoVisualsMsg && !autoVisualsLoading && (
                            <span className="text-xs font-medium text-purple-600 dark:text-purple-400">{autoVisualsMsg}</span>
                        )}

                        {isAdmin && (
                            <>
                                {/* 편집 모드일 때 저장 버튼 표시 */}
                                {editing && (
                                    <button
                                        onClick={handleSave}
                                        disabled={saving}
                                        className="flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
                                    >
                                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                        {saving ? '저장 중...' : saveStatus === 'saved' ? '✅ 저장됨' : '저장하기'}
                                    </button>
                                )}
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
                                    {memoizedAiDisplay}
                                    {/* 본문 삽입 버튼 */}
                                    <button
                                        onClick={saveAiSummaryDirectly}
                                        className="w-full flex items-center justify-center gap-2 py-3 bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm rounded-2xl transition shadow-md shadow-violet-500/20 active:scale-95"
                                    >
                                        <ClipboardCheck className="w-5 h-5" />
                                        💾 이대로 저장하기 (스타일 보존)
                                        {ttsSaving && <span className="text-xs opacity-70 ml-1">· 🎙️ 강의 음성 자동 생성 중...</span>}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}


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
                        memoizedPageContent
                    ) : (
                        // SSR/초기 로딩 시: 빈 플레이스홀더 (하이드레이션 안전)
                        <div className="min-h-[400px] p-8 animate-pulse">
                            <div className="h-6 bg-neutral-100 dark:bg-neutral-800 rounded-xl w-2/3 mb-4" />
                            <div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded-xl w-full mb-2" />
                            <div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded-xl w-5/6 mb-2" />
                        </div>
                    )}
                </div>

                {/* 키키키 OpenAI TTS 플레이어 */}
                {(ttsLocalUrl || ttsError || ttsLoading) && (
                    <div className="no-print rounded-3xl overflow-hidden border border-violet-200 dark:border-violet-800/40" style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)' }}>
                        {/* hidden audio element */}
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
                            <div className="flex items-center gap-3 mb-5">
                                <div className="p-2.5 bg-white/10 rounded-2xl">
                                    <span className="text-2xl">{ttsPlaying ? '🔊' : '🎧'}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-white">
                                        {ttsLoading ? '⏳ OpenAI TTS 생성 중... (5~10초)' : ttsPlaying ? '▶️ 재생 중' : '키키키 강의 음성 파일'}
                                    </p>
                                    <p className="text-[11px] text-violet-300">OpenAI TTS (nova 음성) • 속도 {ttsRate.toFixed(2)}x</p>
                                </div>
                            </div>

                            {ttsError && <p className="text-xs text-red-400 mb-4">⚠️ {ttsError}</p>}

                            {ttsLocalUrl && (
                                <div className="space-y-4">
                                    {/* 시크바 */}
                                    <div>
                                        <input
                                            type="range" min={0} max={ttsDuration || 100} step={0.1} value={ttsCurrent}
                                            onChange={e => { const t = Number(e.target.value); setTtsCurrent(t); if (ttsAudioRef.current) ttsAudioRef.current.currentTime = t }}
                                            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                                            style={{ background: `linear-gradient(to right, #a78bfa ${ttsDuration ? (ttsCurrent/ttsDuration)*100 : 0}%, rgba(255,255,255,0.2) ${ttsDuration ? (ttsCurrent/ttsDuration)*100 : 0}%)` }}
                                        />
                                        <div className="flex justify-between text-[11px] text-violet-300 mt-1">
                                            <span>{[Math.floor(ttsCurrent/60), Math.floor(ttsCurrent%60).toString().padStart(2,'0')].join(':')}</span>
                                            <span>{ttsDuration ? [Math.floor(ttsDuration/60), Math.floor(ttsDuration%60).toString().padStart(2,'0')].join(':') : '--:--'}</span>
                                        </div>
                                    </div>
                                    {/* 콘트롤 */}
                                    <div className="flex items-center justify-center gap-4">
                                        <button onClick={() => { if (ttsAudioRef.current) ttsAudioRef.current.currentTime = Math.max(0, ttsCurrent - 10) }}
                                            className="p-2 rounded-full text-violet-300 hover:text-white hover:bg-white/10 transition" title="10초 뒤">
                                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
                                        </button>
                                        <button onClick={() => { if (!ttsAudioRef.current) return; ttsPlaying ? ttsAudioRef.current.pause() : ttsAudioRef.current.play().catch(() => {}) }}
                                            className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-2xl transition active:scale-90"
                                            style={{ background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.4)' }}>
                                            {ttsPlaying
                                                ? <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                                                : <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>}
                                        </button>
                                        <button onClick={() => { if (ttsAudioRef.current) ttsAudioRef.current.currentTime = Math.min(ttsDuration, ttsCurrent + 10) }}
                                            className="p-2 rounded-full text-violet-300 hover:text-white hover:bg-white/10 transition" title="10초 앞">
                                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/></svg>
                                        </button>
                                    </div>
                                    {/* 속도 프리셋 */}
                                    <div className="flex justify-center gap-2 flex-wrap">
                                        {[0.75, 1.0, 1.25, 1.5, 2.0].map(r => (
                                            <button key={r} onClick={() => setTtsRate(r)}
                                                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${ ttsRate === r ? 'bg-white text-violet-900' : 'bg-white/10 text-violet-300 hover:bg-white/20' }`}
                                            >{r}x</button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* 🎙️ 강의 음성 파일 (Drive 저장) — 관리자 + 학생 모두 표시 */}
                {ttsFileId && (
                    <div className="rounded-3xl overflow-hidden border border-teal-200 dark:border-teal-800/40" style={{ background: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)' }}>
                        <audio
                            ref={ttsDriveAudioRef}
                            src={`/api/audio-stream?fileId=${ttsFileId}`}
                            onTimeUpdate={() => setTtsdrCurrent(ttsDriveAudioRef.current?.currentTime || 0)}
                            onLoadedMetadata={() => setTtsdrDuration(ttsDriveAudioRef.current?.duration || 0)}
                            onPlay={() => setTtsdrPlaying(true)}
                            onPause={() => setTtsdrPlaying(false)}
                            onEnded={() => { setTtsdrPlaying(false); setTtsdrCurrent(0) }}
                            preload="metadata"
                        />
                        <div className="p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2.5 bg-white/10 rounded-2xl">
                                    <span className="text-2xl">{ttsdrPlaying ? '🔊' : '🎙️'}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-white">
                                        {ttsdrPlaying ? '▶️ 강의 음성 재생 중' : '🎙️ AI 강의 읽어주기'}
                                    </p>
                                    <p className="text-[11px] text-teal-300">OpenAI TTS • 속도 {ttsdrRate.toFixed(2)}x{isAdmin ? ' • 관리자가 저장한 음성' : ''}</p>
                                </div>
                                {isAdmin && (
                                    <button onClick={() => { setTtsFileId(null) }}
                                        className="text-[11px] text-teal-400 hover:text-red-400 transition px-2 py-1 rounded-lg hover:bg-white/10"
                                        title="Drive 음성 삭제">✕ 삭제</button>
                                )}
                            </div>
                            {/* 시크바 */}
                            <div className="mb-4">
                                <input
                                    type="range" min={0} max={ttsdrDuration || 100} step={0.1} value={ttsdrCurrent}
                                    onChange={e => { const t = Number(e.target.value); setTtsdrCurrent(t); if (ttsDriveAudioRef.current) ttsDriveAudioRef.current.currentTime = t }}
                                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                                    style={{ background: `linear-gradient(to right, #2dd4bf ${ttsdrDuration ? (ttsdrCurrent / ttsdrDuration) * 100 : 0}%, rgba(255,255,255,0.2) ${ttsdrDuration ? (ttsdrCurrent / ttsdrDuration) * 100 : 0}%)` }}
                                />
                                <div className="flex justify-between text-[11px] text-teal-300 mt-1">
                                    <span>{[Math.floor(ttsdrCurrent / 60), Math.floor(ttsdrCurrent % 60).toString().padStart(2, '0')].join(':')}</span>
                                    <span>{ttsdrDuration ? [Math.floor(ttsdrDuration / 60), Math.floor(ttsdrDuration % 60).toString().padStart(2, '0')].join(':') : '--:--'}</span>
                                </div>
                            </div>
                            {/* 컨트롤 */}
                            <div className="flex items-center justify-center gap-4 mb-3">
                                <button onClick={() => { if (ttsDriveAudioRef.current) ttsDriveAudioRef.current.currentTime = Math.max(0, ttsdrCurrent - 10) }}
                                    className="p-2 rounded-full text-teal-300 hover:text-white hover:bg-white/10 transition" title="10초 뒤">
                                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" /></svg>
                                </button>
                                <button onClick={() => { if (!ttsDriveAudioRef.current) return; ttsdrPlaying ? ttsDriveAudioRef.current.pause() : ttsDriveAudioRef.current.play().catch(() => {}) }}
                                    className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-2xl transition active:scale-90"
                                    style={{ background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.4)' }}>
                                    {ttsdrPlaying
                                        ? <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                                        : <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>}
                                </button>
                                <button onClick={() => { if (ttsDriveAudioRef.current) ttsDriveAudioRef.current.currentTime = Math.min(ttsdrDuration, ttsdrCurrent + 10) }}
                                    className="p-2 rounded-full text-teal-300 hover:text-white hover:bg-white/10 transition" title="10초 앞">
                                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" /></svg>
                                </button>
                            </div>
                            {/* 속도 프리셋 */}
                            <div className="flex justify-center gap-2 flex-wrap">
                                {[0.75, 1.0, 1.25, 1.5, 2.0].map(r => (
                                    <button key={r} onClick={() => { setTtsdrRate(r); if (ttsDriveAudioRef.current) ttsDriveAudioRef.current.playbackRate = r }}
                                        className={`px-3 py-1 rounded-lg text-xs font-bold transition ${ttsdrRate === r ? 'bg-white text-slate-900' : 'bg-white/10 text-teal-300 hover:bg-white/20'}`}
                                    >{r}x</button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}


                {/* ── 관리자 전용: 이번 주 학생 과제 모아보기 ── */}
                {isAdmin && weekAssignments && weekAssignments.length > 0 && (
                    <div className="no-print bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 rounded-3xl border border-amber-200 dark:border-amber-800/40 overflow-hidden">
                        <div className="p-5 border-b border-amber-200 dark:border-amber-800/40 flex items-center justify-between">
                            <div>
                                <h2 className="text-base font-extrabold text-amber-900 dark:text-amber-300 flex items-center gap-2">
                                    <ClipboardCheck className="w-5 h-5" /> {weekNumber}주차 학생 제출 과제
                                </h2>
                                <p className="text-xs text-amber-700 dark:text-amber-500 mt-0.5">총 {weekAssignments.length}명 제출</p>
                            </div>
                        </div>
                        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {weekAssignments.map((a: any) => {
                                const student = a.users as any
                                const name = student?.name || '이름 없음'
                                const email = student?.email || ''
                                const initials = name.charAt(0)
                                const fileUrl = a.file_url || ''
                                const fileName = a.file_name || a.title || '파일'
                                const submittedAt = a.created_at
                                    ? new Date(a.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                                    : ''
                                const isPresenting = presentingFile?.id === a.id
                                return (
                                    <div key={a.id} className="group flex flex-col gap-2">
                                        <a
                                            href={fileUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-start gap-3 p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-amber-100 dark:border-amber-900/40 hover:border-amber-400 dark:hover:border-amber-600 hover:shadow-md transition-all"
                                        >
                                            <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center text-white font-extrabold text-base shrink-0">
                                                {initials}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="font-bold text-sm text-neutral-900 dark:text-white">{name}</p>
                                                <p className="text-[11px] text-neutral-400 truncate">{email}</p>
                                                <p className="text-xs text-amber-700 dark:text-amber-400 truncate mt-1 flex items-center gap-1">
                                                    <FileIcon className="w-3 h-3 shrink-0" /> {fileName}
                                                </p>
                                                <p className="text-[10px] text-neutral-400 mt-0.5">{submittedAt}</p>
                                            </div>
                                            {a.score != null && (
                                                <span className="shrink-0 text-xs font-extrabold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-lg">
                                                    {a.score}점
                                                </span>
                                            )}
                                        </a>
                                        {/* 관리자: 이 학생 과제 라이브 발표 버튼 */}
                                        <button
                                            onClick={() => {
                                                if (isPresenting) { setPresentingFile(null); return }
                                                setPresentingFile({ id: a.id, file_url: fileUrl, file_name: fileName, file_type: null })
                                                setPresenterName(name)
                                            }}
                                            className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all ${
                                                isPresenting
                                                    ? 'bg-rose-600 hover:bg-rose-700 text-white ring-2 ring-rose-400'
                                                    : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                                            }`}
                                        >
                                            <MonitorPlay className={`w-3.5 h-3.5 ${isPresenting ? 'animate-pulse' : ''}`} />
                                            {isPresenting ? '발표 종료' : '이 과제 발표하기'}
                                        </button>
                                        {/* 미리보기 버튼 */}
                                        {fpGuessCategory(null, fileName) !== 'other' && (
                                            <button
                                                onClick={() => setAssignPreviewId(assignPreviewId === a.id ? null : a.id)}
                                                className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all border ${
                                                    assignPreviewId === a.id
                                                        ? 'bg-indigo-600 text-white border-indigo-600'
                                                        : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-indigo-400 hover:text-indigo-600'
                                                }`}
                                            >
                                                <AttachmentIcon att={{ id: a.id, file_name: fileName, file_url: fileUrl, file_type: null, file_size: null }} />
                                                {assignPreviewId === a.id ? '닫기' : '미리보기'}
                                            </button>
                                        )}
                                        {/* 인라인 과제 파일 프리뷰 */}
                                        {assignPreviewId === a.id && (
                                            <div className="col-span-full mt-2 rounded-2xl overflow-hidden border border-indigo-200 dark:border-indigo-800/50 bg-neutral-950">
                                                <FilePreview att={{ id: a.id, file_name: fileName, file_url: fileUrl, file_type: null, file_size: null }} />
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* 과제 없음 안내 (관리자만) */}
                {isAdmin && weekAssignments && weekAssignments.length === 0 && (
                    <div className="no-print bg-neutral-50 dark:bg-neutral-800/30 rounded-3xl border border-neutral-200 dark:border-neutral-800 p-5 text-center">
                        <ClipboardCheck className="w-8 h-8 text-neutral-300 dark:text-neutral-600 mx-auto mb-2" />
                        <p className="text-sm font-bold text-neutral-400">{weekNumber}주차 제출된 과제가 없습니다.</p>
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
                            <div className="flex flex-wrap gap-2 bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl w-fit mb-4">
                                <button
                                    onClick={() => { setUploadTab('file'); setIsFolderMode(false); setUploadFile(null); setUploadFiles(null); }}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition ${uploadTab === 'file' ? 'bg-white dark:bg-neutral-700 shadow-sm text-indigo-600' : 'text-neutral-500 hover:text-neutral-300'}`}
                                >
                                    <FileStack className="w-4 h-4" /> 단일 파일
                                </button>
                                <button
                                    onClick={() => { setUploadTab('folder'); setIsFolderMode(true); setUploadFile(null); setUploadFiles(null); }}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition ${uploadTab === 'folder' ? 'bg-white dark:bg-neutral-700 shadow-sm text-indigo-600' : 'text-neutral-500 hover:text-neutral-300'}`}
                                >
                                    <FolderOpen className="w-4 h-4" /> 폴더/다중 파일
                                </button>
                                <button
                                    onClick={() => { setUploadTab('record'); setIsFolderMode(false); setUploadFile(null); setUploadFiles(null); }}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition ${uploadTab === 'record' ? 'bg-white dark:bg-neutral-700 shadow-sm text-red-500' : 'text-neutral-500 hover:text-neutral-300'}`}
                                >
                                    <Radio className="w-4 h-4" /> 라이브 스마트 녹음
                                </button>
                            </div>

                            {uploadTab === 'record' ? (
                                <div className="space-y-4">
                                    <input
                                        value={uploadTitle}
                                        onChange={(e) => setUploadTitle(e.target.value)}
                                        placeholder="녹음본 제목 (선택)"
                                        className="w-full rounded-xl border border-neutral-200 p-3 bg-neutral-50 text-sm font-medium outline-none focus:ring-2 focus:ring-red-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white transition"
                                    />
                                    
                                    <div className="border-2 border-dashed rounded-2xl p-8 text-center transition-all border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800">
                                        <div className="flex flex-col items-center gap-6">
                                            {/* Timer UI */}
                                            <div className={`text-6xl font-mono font-bold tracking-[0.1em] ${isRecording ? 'text-red-500' : (isRecordingPaused ? 'text-orange-500' : 'text-neutral-400 dark:text-neutral-600')}`}>
                                                {formatTime(recordingTime)}
                                            </div>
                                            
                                            {/* Status Badge */}
                                            {isRecording && (
                                                <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-100 text-red-600 font-bold text-xs animate-pulse">
                                                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                                    녹음 중... (전화가 와도 끊기지 않습니다)
                                                </div>
                                            )}
                                            {isRecordingPaused && (
                                                <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange-100 text-orange-600 font-bold text-xs">
                                                    <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></div>
                                                    일시 정지됨
                                                </div>
                                            )}

                                            {/* Controls */}
                                            <div className="flex flex-wrap justify-center gap-4">
                                                {!isRecording && !isRecordingPaused && (
                                                    <button onClick={startRecording} className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-8 py-4 rounded-full font-extrabold text-lg transition shadow-lg shadow-red-500/30 hover:scale-105 active:scale-95">
                                                        <Mic className="w-6 h-6" /> 새 녹음 시작
                                                    </button>
                                                )}
                                                
                                                {isRecording && (
                                                    <button onClick={pauseRecording} className="flex flex-col items-center gap-1 bg-orange-500 hover:bg-orange-600 text-white w-24 h-24 rounded-full justify-center font-bold transition shadow-lg shadow-orange-500/30 hover:scale-105 active:scale-95">
                                                        <Pause className="w-8 h-8 fill-current" /> 정지
                                                    </button>
                                                )}

                                                {isRecordingPaused && (
                                                    <button onClick={resumeRecording} className="flex flex-col items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white w-24 h-24 rounded-full justify-center font-bold transition shadow-lg shadow-emerald-500/30 hover:scale-105 active:scale-95">
                                                        <Play className="w-8 h-8 fill-current ml-1" /> 계속
                                                    </button>
                                                )}

                                                {(isRecording || isRecordingPaused) && (
                                                    <button onClick={stopRecording} className="flex flex-col items-center gap-1 bg-neutral-800 hover:bg-neutral-900 text-white w-24 h-24 rounded-full justify-center font-bold transition shadow-lg hover:scale-105 active:scale-95">
                                                        <Square className="w-6 h-6 fill-current mb-1" /> 조각 저장
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* List of recorded chunks */}
                                    {recordedSessions.length > 0 && (
                                        <div className="space-y-3 mt-8 p-6 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800 shadow-sm">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-sm font-extrabold text-neutral-800 dark:text-white flex items-center gap-2">
                                                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                                    보안 저장된 녹음 조각 (총 {recordedSessions.length}개)
                                                </h4>
                                                <span className="text-xs font-bold text-neutral-400">병합 대기중</span>
                                            </div>
                                            <div className="space-y-3">
                                                {recordedSessions.map((session, i) => (
                                                    <div key={session.id} className="flex items-center justify-between p-4 bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/30 rounded-xl">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-800 text-emerald-600 dark:text-emerald-300 flex items-center justify-center">
                                                                <Mic className="w-5 h-5" />
                                                            </div>
                                                            <div>
                                                                <p className="text-sm font-bold text-neutral-800 dark:text-neutral-200">
                                                                    녹음 조각 {i + 1}
                                                                </p>
                                                                <p className="text-xs font-medium text-emerald-600/70 dark:text-emerald-400">
                                                                    녹음 길이: {formatTime(session.duration)} / 생성: {session.startedAt.toLocaleTimeString('ko-KR')}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <button onClick={() => removeRecordedSession(session.id)} className="p-3 text-neutral-400 hover:text-red-500 transition hover:bg-red-50 dark:hover:bg-red-900/40 rounded-xl">
                                                            <Trash2 className="w-5 h-5" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    
                                    {/* Upload Trigger */}
                                    {(recordedSessions.length > 0) && (
                                        <button 
                                            onClick={transferRecordingToUpload}
                                            className="w-full mt-6 flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-700 text-white p-5 rounded-2xl font-extrabold text-lg transition disabled:opacity-50 shadow-xl shadow-indigo-600/20 hover:-translate-y-1"
                                        >
                                            <CheckCircle2 className="w-6 h-6" />
                                            업로드 대기열에 추가하기 (여기서 체크 후 파일 업로드 탭으로 이동)
                                        </button>
                                    )}
                                </div>
                            ) : (
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
                                        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-100 dark:bg-red-900/30 text-xs font-bold text-red-600 dark:text-red-400 mt-4">
                                            <AlertCircle className="w-4 h-4" /> {uploadError}
                                        </div>
                                    )}

                                    {/* Progress bars */}
                                    {(zipping || uploading) && (
                                        <div className="space-y-3 bg-neutral-50 dark:bg-neutral-800/50 p-4 rounded-2xl border border-neutral-100 dark:border-neutral-800 mt-4">
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
                                        className="w-full mt-4 py-4 rounded-2xl bg-emerald-600 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 hover:bg-emerald-700 hover:shadow-emerald-500/30 disabled:opacity-50 transition-all active:scale-95"
                                    >
                                        {zipping ? (
                                            <><Zap className="w-4 h-4 animate-spin text-yellow-300" /> 압축 패키징 중...</>
                                        ) : uploading ? (
                                            <><Loader2 className="w-4 h-4 animate-spin" /> {uploadProgress > 0 ? `${uploadProgress}% 보안 전송 중...` : '업로드 대기 중...'}</>
                                        ) : (
                                            <><UploadCloud className="w-4 h-4" /> {isFolderMode ? '폴더 압축 후 공유하기' : '파일 공유하기'}</>
                                        )}
                                    </button>
                                </form>
                            )}
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
                                            {/* 미리보기 버튼 */}
                                            {fpGuessCategory(null, f.title) !== 'other' && (
                                                <button
                                                    onClick={() => setPreviewFileId(previewFileId === f.id ? null : f.id)}
                                                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border transition ${
                                                        previewFileId === f.id
                                                            ? 'bg-indigo-600 text-white border-indigo-600'
                                                            : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-indigo-400 hover:text-indigo-600'
                                                    }`}
                                                >
                                                    <AttachmentIcon att={{ id: f.id, file_name: f.title, file_url: f.file_url, file_type: null, file_size: f.file_size }} />
                                                    {previewFileId === f.id ? '닫기' : '미리보기'}
                                                </button>
                                            )}
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

                                                            {/* ── AI 파이프라인 옵션 ── */}
                                                            <div className="mt-4 rounded-2xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 p-3 space-y-2">
                                                                <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider px-1">⚙️ AI 완료 후 자동 실행</p>
                                                                
                                                                <div className="space-y-2">
                                                                    <button onClick={() => setOptAutoImageSync(!optAutoImage)}
                                                                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border transition-all text-left ${
                                                                            optAutoImage ? 'bg-violet-50 border-violet-300 dark:bg-violet-900/20 dark:border-violet-600' : 'bg-white border-neutral-200 dark:bg-neutral-800 dark:border-neutral-700'
                                                                        }`}>
                                                                        <div>
                                                                            <p className={`text-xs font-bold ${optAutoImage ? 'text-violet-700 dark:text-violet-300' : 'text-neutral-600 dark:text-neutral-400'}`}>🖼️ 이미지 자동 생성</p>
                                                                            <p className="text-[10px] text-neutral-400">AI 요약 내 시각 자료 자동 생성</p>
                                                                        </div>
                                                                        <div className={`w-9 h-5 rounded-full transition-all flex items-center px-0.5 ${
                                                                            optAutoImage ? 'bg-violet-500 justify-end' : 'bg-neutral-300 dark:bg-neutral-600 justify-start'
                                                                        }`}>
                                                                            <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                                                                        </div>
                                                                    </button>

                                                                    {/* 자동 생성 스타일 선택 (토글 ON일 때만 표시) */}
                                                                    {optAutoImage && (
                                                                        <div className="px-1 py-1 grid grid-cols-2 gap-1 mt-1 animate-fade-in">
                                                                            {/* 스타일별 버튼들 */}
                                                                            {[
                                                                                { key: 'search', label: '🌐 검색(실제품)' },
                                                                                { key: 'photo', label: '📸 사진(생성)' },
                                                                                { key: 'infographic', label: '📊 인포그래픽' },
                                                                                { key: 'diagram', label: '🔷 다이어그램' },
                                                                                { key: 'illustration_pro', label: '🖼️ 전문적 그림' },
                                                                                { key: 'illustration_biz', label: '✏️ 비즈니스 그림' },
                                                                                { key: 'illustration', label: '🎨 귀여운 그림' },
                                                                                { key: 'simple', label: '⚡ 심플 스타일' }
                                                                            ].map(s => (
                                                                                <button
                                                                                    key={s.key}
                                                                                    onClick={() => setOptAutoImageStyleSync(s.key)}
                                                                                    className={`text-[10px] font-bold px-2 py-1.5 rounded-lg border transition-all text-left ${
                                                                                        optAutoImageStyle === s.key 
                                                                                        ? 'bg-violet-100 border-violet-400 text-violet-800 dark:bg-violet-900/40 dark:border-violet-600 dark:text-violet-300' 
                                                                                        : 'bg-white border-neutral-200 text-neutral-500 hover:bg-neutral-100 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-700'
                                                                                    }`}
                                                                                >
                                                                                    {s.label}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {([
                                                                    { key: 'tts', label: '🔊 음원 자동 생성', desc: '강의 내용 TTS 음원 Drive 저장', val: optAutoTts, set: setOptAutoTtsSync },
                                                                    { key: 'deploy', label: '🚀 학생 자동 배포', desc: '완료 즉시 학생 페이지에 배포', val: optAutoDeploy, set: setOptAutoDeploySync },
                                                                ] as const).map(({ key, label, desc, val, set }) => (
                                                                    <button key={key} onClick={() => set(!val)}
                                                                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border transition-all text-left ${
                                                                            val ? 'bg-violet-50 border-violet-300 dark:bg-violet-900/20 dark:border-violet-600' : 'bg-white border-neutral-200 dark:bg-neutral-800 dark:border-neutral-700'
                                                                        }`}>
                                                                        <div>
                                                                            <p className={`text-xs font-bold ${val ? 'text-violet-700 dark:text-violet-300' : 'text-neutral-600 dark:text-neutral-400'}`}>{label}</p>
                                                                            <p className="text-[10px] text-neutral-400">{desc}</p>
                                                                        </div>
                                                                        <div className={`w-9 h-5 rounded-full transition-all flex items-center px-0.5 ${
                                                                            val ? 'bg-violet-500 justify-end' : 'bg-neutral-300 dark:bg-neutral-600 justify-start'
                                                                        }`}>
                                                                            <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                                                                        </div>
                                                                    </button>
                                                                ))}
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

                                    {/* 인라인 파일 프리뷰 */}
                                    {previewFileId === f.id && (
                                        <div className="mt-4 rounded-2xl overflow-hidden border border-indigo-200 dark:border-indigo-800/50 bg-neutral-950">
                                            <FilePreview att={{
                                                id: f.id,
                                                file_name: f.title,
                                                file_url: f.file_url,
                                                file_type: null,
                                                file_size: f.file_size,
                                            }} />
                                        </div>
                                    )}

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
            {/* AI 비서 — 관리자만 */}
            {isAdmin && <AiAssistant userId={userId} isAdmin={true} courseId={courseId || undefined} />}

            {/* ── 학생 본인 과제 발표하기 버튼 (비관리자) ───────────────── */}
            {!isAdmin && myAssignment && courseId && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
                    <button
                        onClick={() => {
                            if (presentingFile?.id === myAssignment.id) {
                                setPresentingFile(null)
                            } else {
                                setPresentingFile({
                                    id: myAssignment.id,
                                    file_url: myAssignment.file_url,
                                    file_name: myAssignment.file_name,
                                    file_type: null,
                                })
                                setPresenterName('나')
                            }
                        }}
                        className={`flex items-center gap-2.5 px-6 py-3 rounded-full text-sm font-bold shadow-2xl transition-all ${
                            presentingFile?.id === myAssignment.id
                                ? 'bg-rose-600 hover:bg-rose-700 text-white ring-2 ring-rose-400 ring-offset-2 ring-offset-transparent'
                                : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-violet-500/30'
                        }`}
                    >
                        <MonitorPlay className={`w-4 h-4 ${presentingFile?.id === myAssignment.id ? 'animate-pulse' : ''}`} />
                        {presentingFile?.id === myAssignment.id ? '📍 발표 중 · 클릭하여 종료' : '🎤 내 과제 발표하기'}
                    </button>
                </div>
            )}

            {/* ── 라이브 시청자 뷰어 (발표 중이 아닌 사람에게 표시) ─── */}
            {courseId && !presentingFile && (
                <AssignmentLiveViewer courseId={courseId} />
            )}

            {/* ── 발표자 풀스크린 모달 ──────────────────────────── */}
            {presentingFile && courseId && (
                <AssignmentPresenter
                    courseId={courseId}
                    studentName={presenterName}
                    file={presentingFile}
                    onClose={() => setPresentingFile(null)}
                />
            )}
        </div>
    );
}
