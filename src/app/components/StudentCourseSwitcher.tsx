'use client';
import { useRouter } from 'next/navigation';
import { BookOpen, Headphones } from 'lucide-react';

interface CourseNode {
    id: string;
    name: string;
}

interface Props {
    classCourse: CourseNode | null;
    lessonCourse: CourseNode | null;
    activeCourseId: string | null;
}

export default function StudentCourseSwitcher({ classCourse, lessonCourse, activeCourseId }: Props) {
    const router = useRouter();

    if (!classCourse || !lessonCourse) {
        return null; // Only show if they actually have BOTH
    }

    const handleSwitch = (id: string) => {
        document.cookie = `active_course_id=${id}; path=/; max-age=604800; SameSite=Lax`;
        router.refresh();
    };

    return (
        <div className="flex bg-neutral-200/50 dark:bg-neutral-800/50 p-1.5 rounded-2xl w-full max-w-md mx-auto mt-6">
            <button
                onClick={() => handleSwitch(classCourse.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold transition-all ${activeCourseId === classCourse.id
                        ? 'bg-white text-indigo-700 shadow-sm dark:bg-neutral-900 dark:text-indigo-400'
                        : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
                    }`}
            >
                <BookOpen className="w-4 h-4" />
                {classCourse.name}
            </button>

            <button
                onClick={() => handleSwitch(lessonCourse.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold transition-all ${activeCourseId === lessonCourse.id
                        ? 'bg-white text-pink-600 shadow-sm dark:bg-neutral-900 dark:text-pink-400'
                        : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
                    }`}
            >
                <Headphones className="w-4 h-4" />
                {lessonCourse.name}
            </button>
        </div>
    );
}
