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
            const formData = new FormData();
            formData.append('file', selectedFile);
            formData.append('userId', userId);
            formData.append('weekName', weekName);

            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || '업로드 실패');
            }

            setUploadSuccess(true);
            setSelectedFile(null);
            fetchProfileAndAssignments(); // Refresh list
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
        const reader = new FileReader();

        reader.onloadend = async () => {
            const base64Image = reader.result as string;
            try {
                const res = await fetch('/api/update-profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ profileImageUrl: base64Image }),
                });

                if (!res.ok) {
                    const errData = await res.json();
                    throw new Error(errData.error || '프로필 업데이트 실패');
                }

                setProfileImageUrl(base64Image);
                alert('프로필 사진이 성공적으로 업데이트되었습니다.');
            } catch (err: any) {
                alert(err.message);
            } finally {
                setIsUpdatingProfile(false);
            }
        };
        reader.readAsDataURL(file);
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
                                                        지원 형식: WAV, MP3, ZIP (최대 1GB)
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

                            {/* Submission List */}
                            <div className="rounded-3xl bg-white p-8 shadow-sm border border-neutral-200/60 dark:border-neutral-800 dark:bg-neutral-900 flex flex-col h-full">
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="text-xl font-bold">내 과제 제출 내역</h2>
                                </div>

                                <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                                    {loading ? (
                                        <div className="flex justify-center items-center h-40">
                                            <Loader2 className="w-6 h-6 text-neutral-400 animate-spin" />
                                        </div>
                                    ) : assignments.length > 0 ? (
                                        assignments.map(a => (
                                            <div key={a.id} className="p-4 rounded-2xl bg-neutral-50 border border-neutral-100 flex items-center justify-between group hover:border-neutral-200 transition dark:bg-neutral-800/50 dark:border-neutral-800 dark:hover:border-neutral-700">
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <div className="p-2 bg-white rounded-lg shadow-sm border border-neutral-100 dark:bg-neutral-900 dark:border-neutral-800 shrink-0">
                                                        <FileAudio className="w-5 h-5 text-blue-500" />
                                                    </div>
                                                    <div className="truncate">
                                                        <p className="font-bold text-sm text-neutral-900 dark:text-white truncate">
                                                            {a.week_number}주차 과제
                                                        </p>
                                                        <div className="flex flex-col">
                                                            <div className="text-sm font-bold text-neutral-900 flex items-center gap-1.5 dark:text-white">
                                                                <FileAudio className="w-4 h-4 text-neutral-400" />
                                                                {a.title || '과제 제출'}
                                                            </div>
                                                            <div className="text-[10px] text-neutral-400 font-medium uppercase tracking-tight mt-0.5">
                                                                제출일: {new Date(a.created_at).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <a
                                                        href={getDirectDownloadUrl(a.file_url)}
                                                        target="_blank"
                                                        className="text-xs font-bold px-3 py-1.5 bg-white border border-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-50 transition dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                                                    >
                                                        열기
                                                    </a>
                                                    <button
                                                        onClick={() => handleDelete(a.id, a.file_id)}
                                                        className="p-1.5 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition dark:hover:bg-red-900/30"
                                                        title="삭제 후 재업로드"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="h-40 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-neutral-100 rounded-2xl dark:border-neutral-800">
                                            <div className="p-3 bg-neutral-100 text-neutral-400 rounded-full mb-3 dark:bg-neutral-800">
                                                <FileAudio className="w-6 h-6" />
                                            </div>
                                            <p className="text-sm font-bold text-neutral-600 dark:text-neutral-400">제출된 파일이 없습니다</p>
                                            <p className="text-xs text-neutral-400 mt-1 dark:text-neutral-500">위 화면에서 파일을 드래그하여 업로드하세요</p>
                                        </div>
                                    )}
                                </div>
                            </div>
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
