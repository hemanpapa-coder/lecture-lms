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
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
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

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
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

            // 2. Google Drive로 파일 직접 PUT 전송
            await new Promise<void>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('PUT', uploadUrl, true);
                xhr.setRequestHeader('Content-Type', mimeType);
                xhr.upload.onprogress = (e) => {
                    // 추후 UI 진행률 표시 가능
                };
                xhr.onload = () => {
                    if (xhr.status < 300) resolve();
                    else reject(new Error(`파일 전송 실패 (HTTP ${xhr.status})`));
                };
                xhr.onerror = () => reject(new Error('네트워크 오류로 파일 전송에 실패했습니다.'));
                xhr.send(selectedFile);
            });

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
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-8">
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
                            <label className="absolute -bottom-2 -right-2 w-8 h-8 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-full flex items-center justify-center cursor-pointer shadow-sm hover:bg-neutral-50 hover:text-blue-600 transition text-neutral-500">
                                {isUpdatingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                                <input type="file" accept="image/*" className="hidden" onChange={handleProfileUpload} disabled={isUpdatingProfile} />
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
                    <Link href="/" className="px-4 py-2 text-sm font-bold bg-neutral-100 text-neutral-700 hover:bg-neutral-200 rounded-xl transition dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 shrink-0">
                        ← 대시보드로 돌아가기
                    </Link>
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

                                <form onSubmit={handleUpload} className="space-y-6 flex-1 flex flex-col">
                                    <div>
                                        <label className="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-2">
                                            주차 선택
                                        </label>
                                        <select
                                            value={weekName}
                                            onChange={(e) => setWeekName(e.target.value)}
                                            className="w-full rounded-xl border border-neutral-200 p-3 bg-neutral-50 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition dark:border-neutral-700 dark:bg-neutral-800"
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
                                        className={`flex-1 relative border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-colors
                                    ${isDragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-neutral-200 bg-neutral-50 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-800/80'}
                                    ${selectedFile ? 'border-emerald-500 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20' : ''}
                                `}
                                    >
                                        <input
                                            type="file"
                                            id="file-upload"
                                            className="hidden"
                                            onChange={handleFileChange}
                                        />

                                        {selectedFile ? (
                                            <div className="flex flex-col items-center gap-3">
                                                <FileAudio className="w-12 h-12 text-emerald-500" />
                                                <div>
                                                    <p className="font-bold text-neutral-900 dark:text-white">{selectedFile.name}</p>
                                                    <p className="text-xs text-neutral-500 mt-1">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedFile(null)}
                                                    className="mt-2 text-xs font-bold text-red-500 hover:text-red-700 underline"
                                                >
                                                    파일 취소
                                                </button>
                                            </div>
                                        ) : (
                                            <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center w-full h-full justify-center">
                                                <UploadCloud className="w-10 h-10 text-neutral-400 mb-4" />
                                                <p className="font-bold text-neutral-700 dark:text-neutral-300">
                                                    여기로 파일을 드래그하거나 클릭하여 업로드
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
                                            </label>
                                        )}
                                    </div>

                                    {uploadError && (
                                        <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-sm font-bold text-red-600 flex items-center gap-2 dark:bg-red-900/20 dark:border-red-900/50 dark:text-red-400">
                                            <AlertCircle className="w-4 h-4" /> {uploadError}
                                        </div>
                                    )}

                                    {uploadSuccess && (
                                        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-sm font-bold text-emerald-600 flex items-center gap-2 dark:bg-emerald-900/20 dark:border-emerald-900/50 dark:text-emerald-400">
                                            <CheckCircle2 className="w-4 h-4" /> 성공적으로 업로드 되었습니다!
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={!selectedFile || uploading}
                                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 p-4 text-sm font-extrabold text-white shadow-md hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {uploading ? <><Loader2 className="w-5 h-5 animate-spin" /> 업로드 중...</> : '보안 드라이브로 전송'}
                                    </button>
                                </form>
                            </div>

                            {/* Dynamic Preview Window */}
                            {(() => {
                                const selectedWeekNum = parseInt(weekName.replace(/[^0-9]/g, ''), 10);
                                const activeAssignment = assignments.find(a => a.week_number === selectedWeekNum);

                                return (
                                    <div className="rounded-3xl bg-white p-6 shadow-sm border border-neutral-200/60 dark:border-neutral-800 dark:bg-neutral-900 flex flex-col h-full min-h-[500px]">
                                        <div className="flex justify-between items-center mb-4">
                                            <h2 className="text-lg font-bold flex items-center gap-2">
                                                <Search className="w-5 h-5 text-indigo-500" />
                                                {weekName} 미리보기
                                            </h2>
                                            {activeAssignment && (
                                                <div className="flex items-center gap-2">
                                                    <a
                                                        href={getDirectDownloadUrl(activeAssignment.file_url)}
                                                        target="_blank"
                                                        className="text-xs font-bold text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 px-3 py-1.5 rounded-lg transition flex items-center gap-1"
                                                    >
                                                        새 창에서 열기
                                                    </a>
                                                    <button
                                                        onClick={() => handleDelete(activeAssignment.id, activeAssignment.file_id)}
                                                        className="text-xs font-bold text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition flex items-center gap-1 dark:bg-red-900/30 dark:hover:bg-red-900/50"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" /> 삭제 후 재업로드
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex-1 w-full relative bg-neutral-100 dark:bg-neutral-950 rounded-2xl overflow-hidden border border-neutral-200 dark:border-neutral-800">
                                            {loading ? (
                                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                    <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-3" />
                                                    <p className="text-sm text-neutral-500 font-medium">정보를 불러오는 중입니다...</p>
                                                </div>
                                            ) : activeAssignment ? (
                                                <iframe
                                                    src={`https://drive.google.com/file/d/${activeAssignment.file_id}/preview`}
                                                    className="absolute inset-0 w-full h-full border-0"
                                                    allow="autoplay"
                                                />
                                            ) : (
                                                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
                                                    <div className="p-4 bg-white text-neutral-300 rounded-full mb-4 dark:bg-neutral-900 shadow-sm border border-neutral-100 dark:border-neutral-800">
                                                        <FileIcon className="w-10 h-10" />
                                                    </div>
                                                    <p className="font-bold text-neutral-600 dark:text-neutral-400 text-base">{weekName}에 제출된 과제가 없습니다.</p>
                                                    <p className="text-xs text-neutral-400 mt-2 dark:text-neutral-500">왼쪽 드래그 앤 드롭 영역을 이용해 파일을 업로드 해주세요.</p>
                                                </div>
                                            )}
                                        </div>
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
