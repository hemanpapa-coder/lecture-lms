import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        
        if (!supabaseKey) {
            return NextResponse.json({ error: "No service role key" }, { status: 500 });
        }
        
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { data: reports, error } = await supabase.from('error_reports').select('*');
        if (error) throw error;
        
        let updated = 0;
        for (const report of reports) {
            if (report.status !== 'resolved') {
                await supabase.from('error_reports').update({ status: 'resolved' }).eq('id', report.id);
                updated++;
            }
        }
        
        return NextResponse.json({ success: true, updated });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
