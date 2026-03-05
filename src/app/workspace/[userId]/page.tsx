import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import WorkspaceClientPage from './WorkspaceClientPage'

// Make params an async promise to match Next.js 15+ patterns
type Params = Promise<{ userId: string }>;

export default async function WorkspaceServerPage(props: { params: Params }) {
    const params = await props.params;
    const { userId } = params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect('/auth/login');
    }

    // Check role and permissions
    const { data: userRecord } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

    const isRealAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com';

    if (user.id !== userId && !isRealAdmin) {
        // Unauthorized access to another user's workspace
        redirect('/');
    }

    // Fetch target user's email for display (if admin)
    let targetEmail = '';
    if (isRealAdmin && user.id !== userId) {
        const { data: targetUser } = await supabase
            .from('users')
            .select('email')
            .eq('id', userId)
            .single();
        if (targetUser) targetEmail = targetUser.email;
    }

    return (
        <WorkspaceClientPage
            userId={userId}
            isAdmin={isRealAdmin}
            targetEmail={targetEmail}
        />
    );
}
