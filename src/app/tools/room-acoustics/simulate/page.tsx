import { Suspense } from 'react';
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import { SimulateClient } from './SimulateClient';

export default async function RoomAcousticsSimulatePage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login');
    }

    // Fetch user details for DB saves
    let userRecord = null;
    let error = null;
    if (user) {
        const res = await supabase
            .from('users')
            .select('course_id, private_lesson_id, name, email')
            .eq('id', user.id)
            .single();
        userRecord = res.data;
        error = res.error;
    }

    if (error) {
        console.error("Error fetching user record:", error);
    }

    const courseId = userRecord?.private_lesson_id || userRecord?.course_id || null;

    return (
        <Suspense fallback={<div>Loading Simulator...</div>}>
            <SimulateClient userId={user?.id} courseId={courseId} userName={userRecord?.name} />
        </Suspense>
    );
}
