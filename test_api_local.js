import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    const courseId = "f0fe1f14-e5be-4da0-96cc-1b250529d33b";
    const weekNumber = 2;

    const { data: assignments } = await supabase
        .from('assignments')
        .select('id, user_id, file_id, file_name, file_url, users(name)')
        .eq('course_id', courseId)
        .eq('week_number', weekNumber)
        .is('deleted_at', null);

    const { data: bqData } = await supabase
        .from('board_questions')
        .select('id, user_id, content, metadata, users(name), board_attachments(file_id, file_name, file_url)')
        .eq('course_id', courseId)
        .eq('type', 'homework');

    const bqAssignments = (bqData || [])
        .filter((r: any) => r.metadata?.week_number === weekNumber)
        .flatMap((r: any) => (r.board_attachments || []).map((att: any) => ({
            id: att.id || r.id,
            user_id: r.user_id,
            file_id: att.file_id,
            file_name: att.file_name,
            file_url: att.file_url,
            users: r.users
        })));

    const allAssignments = [...(assignments || []), ...bqAssignments];
    console.log(`Total assignments found: ${allAssignments.length}`);
    
    // Check sizes of files
    if (allAssignments.length > 0) {
        console.log("Sample assignment:", allAssignments[0]);
    }
    
    const { data: archives } = await supabase
        .from('archive_pages')
        .select('content, week_number')
        .eq('course_id', courseId)
        .in('week_number', [weekNumber - 1, weekNumber, weekNumber + 1]);

    const lectureContent = archives?.map(a => `[${a.week_number}주차 강의내용]\n${a.content}`).join('\n\n') || '강의 노트가 없습니다.';
    
    console.log(`Lecture content length: ${lectureContent.length} characters`);
    
    let studentContents = [];
    allAssignments.forEach(assign => {
        studentContents.push(`[${assign.users?.name || '학생'} 제출: ${assign.file_name}]`);
    });
    
    const prompt = `당신은 최고 수준의 음향학/오디오 마스터 교수입니다. 
다음은 이번 주(${weekNumber}주차) 학생들의 과제 제출물(문서, 이미지)과 지난/이번 주 강의 노트 내용입니다.

[강의 노트]
${lectureContent}

[학생 제출물 요약 목록]
${studentContents.join('\n')}
(실제 파일 내용들은 첨부된 파일 데이터로 확인하세요)`;

    console.log(`Total textual prompt length: ${prompt.length} characters`);
}

test().catch(console.error);
