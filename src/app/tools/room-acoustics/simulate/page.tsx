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
    const { data: userRecord } = await supabase
        .from('users')
        .select('course_id, private_lesson_id, full_name, email')
        .eq('id', user.id)
        .single();

    const courseId = userRecord?.private_lesson_id || userRecord?.course_id || null;

    return (
        <Suspense fallback={<div>Loading Simulator...</div>}>
            <SimulateClient userId={user.id} courseId={courseId} userName={userRecord?.full_name} />
        </Suspense>
    );
}
