'use client';

import { useState, useCallback, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';
import { getDirectDownloadUrl } from '@/utils/driveUtils';
import { Play, UploadCloud, FileAudio, FileVideo, FileIcon, Loader2, Search, Filter, SortDesc, SortAsc, Send, CornerDownRight, CheckCircle2, AlertCircle, Camera, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import StudentWeeklyNotes from './StudentWeeklyNotes';
import SharedLibraryView from './SharedLibraryView';
import PrivateChatWindow from './PrivateChatWindow';
import MultiTrackPlayer from '@/app/components/MultiTrackPlayer';

function WorkspaceTextPreview({ title, fileUrl }: { title: string, fileUrl: string }) {
    const [content, setContent] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(false)

    useEffect(() => {
        let isP = false
        const load = async () => {
            setLoading(true)
            try {
                let textSrc = fileUrl;
                const driveIdMatch = fileUrl.match(/\/file\/d\/([^/]+)\//) || fileUrl.match(/[?&]id=([^&]+)/)
                if (driveIdMatch) {
                    textSrc = `/api/audio-stream?fileId=${driveIdMatch[1]}`
                }
                const res = await fetch(textSrc)
                if (!res.ok) throw new Error()
                
                const buffer = await res.arrayBuffer()
                const dec = new TextDecoder('utf-8', { fatal: true })
                let text = ''
                try {
                    text = dec.decode(buffer)
                } catch (e) {
                    const decEuc = new TextDecoder('euc-kr')
                    text = decEuc.decode(buffer)
                }

                if (!isP) setContent(text)
            } catch(e) {
                if (!isP) setError(true)
            } finally {
                if (!isP) setLoading(false)
            }
        }
        load()
        return () => { isP = true }
    }, [fileUrl])

    return (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden mt-3 shadow-sm">
            <div className="bg-neutral-50 dark:bg-neutral-800/50 px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex justify-between items-center">
                <span className="text-sm font-bold flex items-center gap-2">
                    <FileIcon className="w-4 h-4 text-slate-500" />
                    {title}
                </span>
                <a href={getDirectDownloadUrl(fileUrl)} target="_blank" className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">
                    원문 다운로드
                </a>
            </div>
            <div className="p-4 max-h-[300px] overflow-y-auto bg-slate-50 dark:bg-slate-950 font-mono text-[13px] leading-relaxed relative">
                {loading && (
                    <div className="flex items-center justify-center p-6 text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin mr-2" /> 텍스트 불러오는 중...
                    </div>
                )}
                {error && (
                    <div className="flex items-center justify-center p-6 text-red-500 font-bold bg-red-50 dark:bg-red-900/20 rounded-xl">
                        <AlertCircle className="w-5 h-5 mr-2" /> 미리보기를 불러올 수 없습니다. 원문 다운로드를 이용해주세요.
                    </div>
                )}
                {content !== null && (
                    <pre className="whitespace-pre-wrap break-words text-slate-800 dark:text-slate-300 font-medium">
                        {content}
                    </pre>
                )}
            </div>
        </div>
    )
}

export default function WorkspaceClientPage({ userId, isAdmin, targetEmail, currentUserId }: { userId: string, isAdmin: boolean, targetEmail: string, currentUserId: string }) {
    const supabase = createClient();
    const router = useRouter();

    const [assignments, setAssignments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [courseId, setCourseId] = useState<string | null>(null);
    const [isPrivateLesson, setIsPrivateLesson] = useState(false);
    const [courseName, setCourseName] = useState<string>('');

    // Upload State
    const [isDragging, setIsDragging] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [weekName, setWeekName] = useState('1주차');
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const [uploadSuccess, setUploadSuccess] = useState(false);
    const [previewFileId, setPreviewFileId] = useState<string | null>(null); // 선택된 단일 파일 미리보기 ID

    // Profile Image State
    const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
    const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

    const fetchProfileAndAssignments = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('assignments')
            .select('*')
            .eq('user_id', userId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        if (!error && data) {
            setAssignments(data);
        }

        // Fetch User Profile
        const { data: userData } = await supabase
            .from('users')
            .select('profile_image_url, course_id')
            .eq('id', userId)
            .single();

        if (userData) {
            if (userData.profile_image_url) setProfileImageUrl(userData.profile_image_url);
            if (userData.course_id) {
                setCourseId(userData.course_id);
                // Fetch course type
                const { data: courseData } = await supabase
                    .from('courses')
                    .select('is_private_lesson, name')
                    .eq('id', userData.course_id)
                    .single();
                if (courseData) {
                    setIsPrivateLesson(!!courseData.is_private_lesson);
                    setCourseName(courseData.name || '');
                }
            }
        }

        setLoading(false);
    }, [supabase, userId]);

    useEffect(() => {
        fetchProfileAndAssignments();
    }, [fetchProfileAndAssignments]);

    // --- Drag and Drop Handlers ---
    const handleGlobalDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleGlobalDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            setSelectedFile(e.dataTransfer.files[0]);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const handleUpload = async (e?: React.FormEvent | React.MouseEvent) => {
        if (e && e.preventDefault) e.preventDefault();
        if (!selectedFile) {
            setUploadError('파일을 첨부해주세요.');
            return;
        }

        setUploading(true);
        setUploadError('');
        setUploadSuccess(false);

        try {
            const ext = selectedFile.name.split('.').pop()?.toLowerCase() || '';
            const mimeMap: Record<string, string> = {
                'pdf': 'application/pdf', 'doc': 'application/msword', 'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'xls': 'application/vnd.ms-excel', 'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'ppt': 'application/vnd.ms-powerpoint', 'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'gif': 'image/gif',
                'mp3': 'audio/mpeg', 'mp4': 'video/mp4', 'zip': 'application/zip', 'txt': 'text/plain',
            };
            const mimeType = selectedFile.type || mimeMap[ext] || 'application/octet-stream';

            // 1. 업로드 세션(URL) 발급 받기
            const initRes = await fetch('/api/upload-workspace-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileName: selectedFile.name,
                    mimeType,
                    fileSize: selectedFile.size,
                    userId,
                    weekName
                }),
            });

            if (!initRes.ok) {
                const errData = await initRes.json().catch(() => ({}));
                throw new Error(errData.error || '업로드 세션 생성 실패');
            }

            const { fileId, uploadUrl, webViewLink, courseId: userCourseId } = await initRes.json();

            // 2. Google Drive로 파일 직접 PUT 전송 (Safari/iOS 호환성을 위해 fetch 활용)
            const response = await fetch(uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': mimeType },
                body: selectedFile,
            });
            if (!response.ok) {
                throw new Error(`파일 전송 실패 (HTTP ${response.status})`);
            }

            // 3. 완료 후 서버 API를 통해 DB(assignments 테이블) 기록
            // RLS 제한 회피 및 명시적인 저장을 위해 서버 API 사용
            const saveRes = await fetch('/api/save-assignment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    weekName,
                    fileName: selectedFile.name,
                    fileId,
                    webViewLink,
                    courseId: userCourseId
                })
            });

            if (!saveRes.ok) {
                const saveErr = await saveRes.json().catch(() => ({}));
                throw new Error(saveErr.error || 'DB 저장에 실패했습니다.');
            }

            setUploadSuccess(true);
            setSelectedFile(null);
            
            // 즉각적인 피드백을 위해 상태 직접 업데이트 및 refetch
            fetchProfileAndAssignments();
        } catch (err: any) {
            setUploadError(err.message);
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (assignmentId: string, fileId: string) => {
        if (!window.confirm('정말 삭제하시겠습니까? (드라이브 및 DB에서 삭제됩니다.)')) return;

        try {
            // Optimistic UI update
            setAssignments(prev => prev.filter(a => a.id !== assignmentId));

            // Optional: You can create a DELETE endpoint, but for now we delete from DB directly
            // Google Drive file deletion would require the API endpoint.
            const res = await fetch('/api/delete-assignment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: assignmentId, fileId })
            });

            if (!res.ok) throw new Error('삭제 실패');

        } catch (err: any) {
            alert(err.message);
            // Revert on failure
            fetchProfileAndAssignments();
        }
    };

    const handleProfileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;

        setIsUpdatingProfile(true);
        const file = e.target.files[0];

        try {
            // 브라우저 단에서 이미지 리사이징 및 압축 (Base64 용량 4MB 이하 유지 목적)
            const compressedBase64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        const MAX_WIDTH = 400;
                        const MAX_HEIGHT = 400;
                        let width = img.width;
                        let height = img.height;

                        if (width > height) {
                            if (width > MAX_WIDTH) {
                                height *= MAX_WIDTH / width;
                                width = MAX_WIDTH;
                            }
                        } else {
                            if (height > MAX_HEIGHT) {
                                width *= MAX_HEIGHT / height;
                                height = MAX_HEIGHT;
                            }
                        }

                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        if (!ctx) return reject('캔버스 생성 실패');
                        ctx.drawImage(img, 0, 0, width, height);
                        
                        // webp 포맷, 0.8 품질로 압축
                        const dataUrl = canvas.toDataURL('image/webp', 0.8);
                        resolve(dataUrl);
                    };
                    img.onerror = () => reject('이미지 로드 실패');
                    img.src = event.target?.result as string;
                };
                reader.onerror = () => reject('파일 읽기 실패');
                reader.readAsDataURL(file);
            });

            const res = await fetch('/api/update-profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profileImageUrl: compressedBase64 }),
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || '프로필 업데이트 실패');
            }

            setProfileImageUrl(compressedBase64);
            alert('프로필 사진이 성공적으로 업데이트되었습니다.');
        } catch (err: any) {
            alert(err.message || '프로필 업데이트 실패');
        } finally {
            setIsUpdatingProfile(false);
            e.target.value = ''; // Input 초기화
        }
    };

    return (
        <div 
            className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-8"
            onDragOver={handleGlobalDragOver}
            onDrop={handleGlobalDrop}
        >
            <div className="mx-auto max-w-5xl space-y-8">

                <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl bg-white p-8 shadow-sm dark:bg-neutral-900 border border-neutral-200/60 dark:border-neutral-800">
                    <div className="flex items-center gap-6">
                        <div className="relative group shrink-0">
                            <div className="w-16 h-16 rounded-2xl overflow-hidden bg-neutral-100 dark:bg-neutral-800 border-2 border-neutral-200 dark:border-neutral-700 flex items-center justify-center">
                                {profileImageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={profileImageUrl} alt="Profile" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-xl font-bold text-neutral-400">
                                        {isAdmin ? targetEmail.charAt(0).toUpperCase() : '나'}
                                    </span>
                                )}
                            </div>

                            {/* Hidden file input for profile pic */}
                            <label className="absolute -bottom-2 -right-2 w-8 h-8 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-full flex items-center justify-center cursor-pointer shadow-sm hover:bg-neutral-50 hover:text-blue-600 transition text-neutral-500 overflow-hidden z-20">
                                {isUpdatingProfile ? <Loader2 className="w-4 h-4 animate-spin relative z-0" /> : <Camera className="w-4 h-4 relative z-0" />}
                                <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" onChange={handleProfileUpload} disabled={isUpdatingProfile} />
                            </label>
                        </div>

                        <div>
                            <h1 className="text-2xl font-extrabold text-neutral-900 dark:text-white flex items-center gap-3">
                                {isAdmin ? `학생 워크스페이스` : '내 학습 공간'}
                                {isAdmin && <span className="text-sm font-semibold bg-neutral-100 text-neutral-600 px-3 py-1 rounded-full dark:bg-neutral-800 dark:text-neutral-400">{targetEmail}</span>}
                            </h1>
                            <p className="text-sm text-neutral-500 mt-2 font-medium">1:1 비밀 워크스페이스입니다. 프로필을 변경하거나 과제를 제출하세요.</p>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                        <Link href="/tools/room-acoustics" className="flex justify-center items-center gap-2 px-4 py-2 text-sm font-extrabold bg-indigo-100 text-indigo-700 hover:bg-indigo-200 rounded-xl transition dark:bg-indigo-900/40 dark:text-indigo-400 dark:hover:bg-indigo-900/60 shadow-sm border border-indigo-200/50 dark:border-indigo-800/50 whitespace-nowrap">
                            🎧 룸 어쿠스틱 분석
                        </Link>
                        {!isPrivateLesson && (
                            <Link href={`/archive${courseId ? `?course=${courseId}` : ''}${!isAdmin ? (courseId ? '&view=student' : '?view=student') : ''}`} className="flex justify-center items-center gap-2 px-4 py-2 text-sm font-extrabold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-xl transition dark:bg-emerald-900/40 dark:text-emerald-400 dark:hover:bg-emerald-900/60 shadow-sm border border-emerald-200/50 dark:border-emerald-800/50 whitespace-nowrap">
                                📚 주차별 강의 자료
                            </Link>
                        )}
                        <Link href="/" className="flex justify-center items-center px-4 py-2 text-sm font-bold bg-neutral-100 text-neutral-700 hover:bg-neutral-200 rounded-xl transition dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 whitespace-nowrap">
                            ← 대시보드
                        </Link>
                    </div>
                </header>

                <div className="grid gap-8 md:grid-cols-2">

                    {/* Standard Elements (Hidden for Private Lessons) */}
                    {!isPrivateLesson && (
                        <>
                            {/* File Upload Section (Drag & Drop) */}
                            <div className="rounded-3xl bg-white p-8 shadow-sm border border-neutral-200/60 dark:border-neutral-800 dark:bg-neutral-900 flex flex-col h-full">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg dark:bg-blue-900/30 dark:text-blue-400">
                                        <UploadCloud className="w-5 h-5" />
                                    </div>
                                    <h2 className="text-xl font-bold">과제 파일 업로드</h2>
                                </div>

                                <div className="space-y-6 flex-1 flex flex-col">
                                    <div>
                                        <label className="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-2">
                                            주차 선택
                                        </label>
                                        <select
                                            value={weekName}
                                            onChange={(e) => setWeekName(e.target.value)}
                                            className="relative z-50 cursor-pointer w-full rounded-xl border border-neutral-200 p-3 bg-neutral-50 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition dark:border-neutral-700 dark:bg-neutral-800"
                                            required
                                        >
                                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(w => (
                                                <option key={w} value={`${w}주차`}>{w}주차 과제</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div
                                        onDragOver={handleDragOver}
                                        onDragLeave={handleDragLeave}
                                        onDrop={handleDrop}
                                        className={`flex-1 relative border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-all duration-200
                                    ${isDragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-inner' : 'border-neutral-200 bg-neutral-50 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-800/80'}
                                    ${selectedFile ? 'border-emerald-500 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20' : ''}
                                `}
                                    >
                                        {!selectedFile && (
                                            <input
                                                type="file"
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-50"
                                                onChange={handleFileChange}
                                                title="여기로 파일을 드래그하거나 클릭하여 업로드"
                                            />
                                        )}

                                        {selectedFile ? (
                                            <div className="flex flex-col items-center gap-3 relative z-10">
                                                <FileAudio className="w-12 h-12 text-emerald-500" />
                                                <div>
                                                    <p className="font-bold text-neutral-900 dark:text-white">{selectedFile.name}</p>
                                                    <p className="text-xs text-neutral-500 mt-1">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedFile(null); }}
                                                    className="mt-2 text-xs font-bold text-red-500 hover:text-red-700 underline cursor-pointer"
                                                >
                                                    파일 취소
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center w-full h-full justify-center pointer-events-none relative z-10">
                                                <UploadCloud className={`w-10 h-10 mb-4 transition-colors ${isDragging ? 'text-blue-500' : 'text-neutral-400'}`} />
                                                <p className={`font-bold transition-colors ${isDragging ? 'text-blue-600 dark:text-blue-400' : 'text-neutral-700 dark:text-neutral-300'}`}>
                                                    {isDragging ? '여기에 놓아서 업로드하세요' : '여기로 파일을 드래그하거나 클릭하여 업로드'}
                                                </p>
                                                {(courseName.includes('홈레코딩') || courseName.includes('음향학')) ? (
                                                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 font-semibold">
                                                        📄 이 수업은 PDF 문서로 업로드해 주세요
                                                    </p>
                                                ) : (
                                                    <p className="text-xs text-neutral-500 mt-2">
                                                        지원 형식: 모든 파일 지원 (최대 1GB)
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {uploadError && (
                                        <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-sm font-bold text-red-600 flex items-center gap-2 dark:bg-red-900/20 dark:border-red-900/50 dark:text-red-400">
                                            <AlertCircle className="w-4 h-4 shrink-0" /> {uploadError}
                                        </div>
                                    )}

                                    {uploadSuccess && (
                                        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-sm font-bold text-emerald-600 flex items-center gap-2 dark:bg-emerald-900/20 dark:border-emerald-900/50 dark:text-emerald-400">
                                            <CheckCircle2 className="w-4 h-4" /> 성공적으로 업로드 되었습니다!
                                        </div>
                                    )}

                                    <button
                                        type="button"
                                        onClick={handleUpload}
                                        disabled={!selectedFile || uploading}
                                        className="relative z-50 w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 p-4 text-sm font-extrabold text-white shadow-md hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                    >
                                        {uploading ? <><Loader2 className="w-5 h-5 animate-spin" /> 업로드 중...</> : '보안 드라이브로 전송'}
                                    </button>
                                </div>
                            </div>

                            {/* 다중 파일 미리보기 패널 */}
                            {(() => {
                                const selectedWeekNum = parseInt(weekName.replace(/[^0-9]/g, ''), 10);
                                const weekFiles = assignments.filter(a => a.week_number === selectedWeekNum);
                                
                                const audios = weekFiles.filter(a => {
                                    const ext = a.file_name?.split('.').pop()?.toLowerCase() || ''
                                    return ['mp3', 'wav', 'm4a', 'aac', 'ogg'].includes(ext)
                                })
                                const texts = weekFiles.filter(a => {
                                    const ext = a.file_name?.split('.').pop()?.toLowerCase() || ''
                                    return ['txt', 'csv', 'md'].includes(ext)
                                })
                                const others = weekFiles.filter(a => {
                                    const ext = a.file_name?.split('.').pop()?.toLowerCase() || ''
                                    return !['mp3', 'wav', 'm4a', 'aac', 'ogg', 'txt', 'csv', 'md'].includes(ext)
                                })
                                
                                const previewFile = others.find(a => a.file_id === previewFileId) || others[0] || null;

                                return (
                                    <div className="rounded-3xl bg-white p-6 shadow-sm border border-neutral-200/60 dark:border-neutral-800 dark:bg-neutral-900 flex flex-col h-full min-h-[500px] overflow-y-auto custom-scrollbar">
                                        <div className="flex justify-between items-center mb-4">
                                            <h2 className="text-lg font-bold flex items-center gap-2">
                                                <Search className="w-5 h-5 text-indigo-500" />
                                                {weekName} 제출 파일 ({weekFiles.length}개)
                                            </h2>
                                        </div>

                                        {audios.length > 0 && (
                                            <div className="mb-6">
                                                <MultiTrackPlayer 
                                                    tracks={audios.map(a => ({ id: a.id, url: a.file_url, fileName: a.file_name }))}
                                                    submissionId={audios[0].id}
                                                    submissionType="assignment"
                                                    initialFeedback={audios[0].ai_feedback || null}
                                                    onAiComplete={(res) => {
                                                        setAssignments(prev => prev.map(a => a.id === audios[0].id ? { ...a, ai_feedback: res } : a))
                                                    }}
                                                />
                                            </div>
                                        )}

                                        {texts.length > 0 && (
                                            <div className="mb-6 space-y-4">
                                                {texts.map(t => (
                                                    <div key={t.id} className="relative">
                                                        <WorkspaceTextPreview title={t.file_name} fileUrl={t.file_url} />
                                                        <div className="absolute top-3 right-3 flex items-center gap-2">
                                                          <button
                                                              onClick={() => handleDelete(t.id, t.file_id)}
                                                              className="text-[10px] font-bold text-red-500 hover:text-red-700 bg-white dark:bg-neutral-900 px-2 py-1 rounded transition flex items-center border border-red-100 dark:border-red-900/50 shadow-sm"
                                                          >
                                                              <Trash2 className="w-3 h-3 mr-1" /> 삭제
                                                          </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {others.length > 0 && (
                                            <div className="flex-1 flex flex-col">
                                                <div className="flex justify-between items-center mb-2">
                                                    <h3 className="text-[11px] font-black tracking-widest text-neutral-500 uppercase flex items-center gap-2">
                                                        기타 문서 미리보기
                                                    </h3>
                                                    {previewFile && (
                                                        <div className="flex items-center gap-2">
                                                            <a
                                                                href={getDirectDownloadUrl(previewFile.file_url)}
                                                                target="_blank"
                                                                className="text-xs font-bold text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 px-3 py-1.5 rounded-lg transition"
                                                            >
                                                                새 창에서 열기
                                                            </a>
                                                            <button
                                                                onClick={() => handleDelete(previewFile.id, previewFile.file_id)}
                                                                className="text-xs font-bold text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition flex items-center gap-1 dark:bg-red-900/30 dark:hover:bg-red-900/50"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" /> 삭제
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* 파일 리스트 탭 - 여러 파일이 있을 때 */}
                                                {others.length > 1 && (
                                                    <div className="flex gap-2 mb-3 flex-wrap">
                                                        {others.map((f, i) => (
                                                            <button
                                                                key={f.file_id}
                                                                onClick={() => setPreviewFileId(f.file_id)}
                                                                className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition truncate max-w-[150px] ${
                                                                    (previewFile?.file_id === f.file_id)
                                                                        ? 'bg-indigo-100 border-indigo-300 text-indigo-700 dark:bg-indigo-900/40 dark:border-indigo-600 dark:text-indigo-300'
                                                                        : 'bg-neutral-100 border-neutral-200 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-400'
                                                                }`}
                                                                title={f.file_name || `문서 ${i+1}`}
                                                            >
                                                                문서 {i+1}: {(f.file_name || `문서 ${i+1}`).split('.')[0].slice(0, 12)}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}

                                                <div className="flex-1 w-full min-h-[400px] relative bg-neutral-100 dark:bg-neutral-950 rounded-2xl overflow-hidden border border-neutral-200 dark:border-neutral-800 mt-2">
                                                    {loading ? (
                                                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-3" />
                                                            <p className="text-sm text-neutral-500 font-medium">정보를 불러오는 중입니다...</p>
                                                        </div>
                                                    ) : previewFile ? (
                                                        <iframe
                                                            src={
                                                                (() => {
                                                                    const ext = previewFile.file_name?.split('.').pop()?.toLowerCase() || '';
                                                                    if (['ppt', 'pptx', 'doc', 'docx', 'xls', 'xlsx'].includes(ext)) {
                                                                        const directUrl = previewFile.file_url.includes('drive.google.com/file/d/')
                                                                            ? `https://drive.google.com/uc?export=download&id=${previewFile.file_id}`
                                                                            : previewFile.file_url;
                                                                        return `https://docs.google.com/viewer?url=${encodeURIComponent(directUrl)}&embedded=true`;
                                                                    }
                                                                    return `https://drive.google.com/file/d/${previewFile.file_id}/preview`;
                                                                })()
                                                            }
                                                            className="absolute inset-0 w-full h-full border-0"
                                                            allow="autoplay"
                                                        />
                                                    ) : null}
                                                </div>
                                            </div>
                                        )}

                                        {weekFiles.length === 0 && (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
                                                <div className="p-4 bg-white text-neutral-300 rounded-full mb-4 dark:bg-neutral-900 shadow-sm border border-neutral-100 dark:border-neutral-800">
                                                    <FileIcon className="w-10 h-10" />
                                                </div>
                                                <p className="font-bold text-neutral-600 dark:text-neutral-400 text-base">{weekName}에 제출된 과제가 없습니다.</p>
                                                <p className="text-xs text-neutral-400 mt-2 dark:text-neutral-500">왼쪽 드래그 앤 드롭 영역을 이용해 파일을 업로드 해주세요.</p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </>
                    )}

                    {isPrivateLesson && courseId && (
                        <div className="flex flex-col lg:flex-row gap-8 mt-2 h-[600px]">
                            {/* Left Side: Shared Library (Scrollable) */}
                            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                                <SharedLibraryView courseId={courseId} />
                            </div>

                            {/* Right Side: Private Chat (Fixed Height matching Library) */}
                            <div className="w-full lg:w-[400px] shrink-0 h-full">
                                <PrivateChatWindow
                                    courseId={courseId}
                                    workspaceUserId={userId}
                                    currentUserId={currentUserId}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* ===== Student Weekly Notes Section ===== */}
                {courseId && (
                    <StudentWeeklyNotes
                        userId={userId}
                        courseId={courseId}
                        targetEmail={targetEmail}
                        isPrivateLesson={isPrivateLesson}
                    />
                )}

            </div>
        </div>
    )
}
