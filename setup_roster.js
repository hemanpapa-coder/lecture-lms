const https = require('https');
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxdWZzdnpmam5yZWN6a25vb3RjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjE1MzkwMCwiZXhwIjoyMDg3NzI5OTAwfQ.zDWiLAB_AK9P3Lb36iOotZsQP5n_CNVurUa_91telIU';
const BASE = 'https://gqufsvzfjnreczknootc.supabase.co';
const courseId = '975cf5c9-1af1-493a-a770-757aa9d555af';

// 교수님이 제공한 공식 수강생 명단 (순번 순서)
const ROSTER = [
  { order: 1,  studentId: '2026413020', name: '고은서' },
  { order: 2,  studentId: '2026413029', name: '김어진' },
  { order: 3,  studentId: '2026413026', name: '김유민' },
  { order: 4,  studentId: '2026413017', name: '김윤아' },
  { order: 5,  studentId: '2026413016', name: '김은하수' },
  { order: 6,  studentId: '2026413007', name: '박선영' },
  { order: 7,  studentId: '2026413001', name: '박성건' },
  { order: 8,  studentId: '2026410001', name: '박연수' },
  { order: 9,  studentId: '2026413011', name: '박의인' },
  { order: 10, studentId: '2026413009', name: '박제민' },
  { order: 11, studentId: '2026413004', name: '박준현' },
  { order: 12, studentId: '2026413019', name: '육상현' },
  { order: 13, studentId: '2026413014', name: '윤가희' },
  { order: 14, studentId: '2026413002', name: '윤바울' },
  { order: 15, studentId: '2026413025', name: '윤은혜' },
  { order: 16, studentId: '2026413035', name: '이규진' },
  { order: 17, studentId: '2024113020', name: '이시은' },
  { order: 18, studentId: '2026413023', name: '이윤후' },
  { order: 19, studentId: '2026412001', name: '정은영' },
  { order: 20, studentId: '2026413012', name: '주형선' },
  { order: 21, studentId: '2026413021', name: '최지민' },
];
const rosterStudentIds = new Set(ROSTER.map(r => r.studentId));

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const data = body ? JSON.stringify(body) : null;
    const r = https.request({ hostname: url.hostname, path: url.pathname + url.search, method,
      headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY,
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) }
    }, res => { let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch(e) { resolve({ status: res.statusCode, body: d }); } }); });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}

async function main() {
  // 1. 전체 수강생 조회
  const usersRes = await req('GET', '/rest/v1/users?course_id=eq.' + courseId + '&deleted_at=is.null&select=id,name,student_id,is_auditor');
  const allUsers = usersRes.body;
  console.log('전체 수강생:', allUsers.length + '명\n');

  let registered = 0, auditorSet = 0, orderSet = 0;

  for (const user of allUsers) {
    const inRoster = rosterStudentIds.has(user.student_id);
    const rosterEntry = ROSTER.find(r => r.studentId === user.student_id);

    if (inRoster) {
      // 정규 수강생: is_auditor = false, student_id 확인, roster_order 업데이트
      const updates = { is_auditor: false };
      // student_id가 없거나 다를 경우 업데이트 (이미 맞으면 그냥 false만)
      const r = await req('PATCH', '/rest/v1/users?id=eq.' + user.id, updates);
      console.log(`✅ [${String(rosterEntry.order).padStart(2,'0')}] ${user.student_id} ${user.name} → 정규 수강생`);
      registered++;
    } else {
      // 명단에 없는 학생 → 청강생
      const r = await req('PATCH', '/rest/v1/users?id=eq.' + user.id, { is_auditor: true });
      console.log(`🔵 청강생 처리: ${user.student_id || '(학번없음)'} ${user.name} → is_auditor=true`);
      auditorSet++;
    }
  }

  // 2. settings에 roster 순번 저장
  const rosterData = {
    course_id: courseId,
    roster: ROSTER,
    updated_at: new Date().toISOString()
  };
  // upsert
  const settingsKey = 'course_' + courseId + '_roster';
  const existing = await req('GET', '/rest/v1/settings?key=eq.' + settingsKey + '&select=key');
  if (existing.body && existing.body.length > 0) {
    await req('PATCH', '/rest/v1/settings?key=eq.' + settingsKey, { value: JSON.stringify(rosterData), updated_at: new Date().toISOString() });
  } else {
    await req('POST', '/rest/v1/settings', { key: settingsKey, value: JSON.stringify(rosterData) });
  }
  console.log('\n✅ 순번 명단을 settings에 저장 완료 (key: ' + settingsKey + ')');

  console.log(`\n📊 처리 완료:`);
  console.log(`  - 정규 수강생: ${registered}명`);
  console.log(`  - 청강생 처리: ${auditorSet}명`);
  console.log(`\n공식 순번 명단 (${ROSTER.length}명):`);
  ROSTER.forEach(r => console.log(`  ${String(r.order).padStart(2,' ')}. ${r.studentId}  ${r.name}`));
}
main().catch(console.error);
