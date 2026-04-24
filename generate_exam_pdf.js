const https = require('https');
const fs = require('fs');
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxdWZzdnpmam5yZWN6a25vb3RjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjE1MzkwMCwiZXhwIjoyMDg3NzI5OTAwfQ.zDWiLAB_AK9P3Lb36iOotZsQP5n_CNVurUa_91telIU';
const BASE = 'https://gqufsvzfjnreczknootc.supabase.co';
const courseId = '975cf5c9-1af1-493a-a770-757aa9d555af';
const courseName = '레코딩실습1';

function get(p) {
  return new Promise((res, rej) => {
    const url = new URL(BASE + p);
    const r = https.request({ hostname: url.hostname, path: url.pathname + url.search, method: 'GET',
      headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY }
    }, resp => { let d = ''; resp.on('data', c => d += c); resp.on('end', () => { try { res(JSON.parse(d)); } catch(e) { res(d); } }); });
    r.on('error', rej); r.end();
  });
}

// 공식 수강생 순번 명단 (roster 순서 - settings에서도 불러오나 fallback으로 하드코딩)
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
function getRosterOrder(studentId) {
  const r = ROSTER.find(r => r.studentId === studentId);
  return r ? r.order : 9999;
}

async function main() {
  const evalsRaw = await get('/rest/v1/evaluations?course_id=eq.' + courseId + '&select=user_id,midterm_score,midterm_bonus,updated_at');
  const userIds = evalsRaw.map(e => e.user_id);
  const users = await get('/rest/v1/users?id=in.(' + userIds.join(',') + ')&select=id,name,student_id,is_auditor,deleted_at');
  const userMap = {};
  (Array.isArray(users) ? users : []).forEach(u => { userMap[u.id] = u; });

  // 청강생 제외 + 삭제된 계정 제외 + roster 순번 정렬
  const evals = evalsRaw
    .filter(ev => {
      const u = userMap[ev.user_id];
      if (!u || u.deleted_at || !u.name) return false; // 삭제/무효 계정 제외
      if (u.is_auditor) return false; // 청강생 제외
      if (!rosterStudentIds.has(u.student_id)) return false; // 명단 외 제외
      return true;
    })
    .sort((a, b) => {
      const ua = userMap[a.user_id] || {};
      const ub = userMap[b.user_id] || {};
      return getRosterOrder(ua.student_id) - getRosterOrder(ub.student_id);
    });

  const settings = await get('/rest/v1/settings?key=eq.course_' + courseId + '_mcq_questions&select=value');
  let questions = [];
  if (settings && settings[0] && settings[0].value) {
    const p = typeof settings[0].value === 'string' ? JSON.parse(settings[0].value) : settings[0].value;
    questions = Array.isArray(p) ? p : (p.questions || []);
  }
  const totalQ = questions.length;
  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const today = new Date().toISOString().slice(0, 10);

  // ============ 1. 정답지 ============
  const css1 = `
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: -apple-system, 'Apple SD Gothic Neo', '맑은 고딕', sans-serif; padding:40px; background:#fff; color:#1e1e2e; }
    h1 { font-size:26px; font-weight:900; margin-bottom:6px; color:#1e1b4b; }
    .meta { font-size:13px; color:#666; margin-bottom:24px; }
    table { width:100%; border-collapse:collapse; }
    th { background:#1e1b4b; color:#fff; padding:10px 14px; font-size:12px; text-align:left; }
    td { padding:10px 14px; border-bottom:1px solid #e5e7eb; font-size:13px; vertical-align:top; }
    tr:nth-child(even) td { background:#f8f9ff; }
    .qnum { text-align:center; font-weight:900; color:#4338ca; }
    .ans { font-weight:800; color:#1d4ed8; }
    .exp { color:#6b7280; font-size:12px; line-height:1.5; }
    @media print { body { padding:20px; } }
  `;

  let ansRows = '';
  questions.forEach((q, i) => {
    const ans = q.answerText || (q.options && q.options[q.answerIndex]) || '-';
    ansRows += `<tr>
      <td class="qnum">${q.id || i+1}</td>
      <td>${q.text || ''}</td>
      <td class="ans">${ans}</td>
      <td class="exp">${q.explanation || '-'}</td>
    </tr>`;
  });

  const answerKeyHtml = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><title>${courseName} 중간고사 정답지</title>
<style>${css1}</style></head><body>
<h1>📋 ${courseName} 중간고사 정답지</h1>
<p class="meta">총 ${totalQ}문항 | 출력일시: ${now}</p>
<table>
  <thead><tr><th style="width:50px">번호</th><th>문제</th><th style="width:200px">정답</th><th>해설</th></tr></thead>
  <tbody>${ansRows}</tbody>
</table>
</body></html>`;

  const ansPath = `${process.env.HOME}/Desktop/레코딩실습1_중간고사_정답지_${today}.html`;
  fs.writeFileSync(ansPath, answerKeyHtml, 'utf-8');
  console.log('✅ 정답지 저장:', ansPath);

  // ============ 2. 전체 학생 시험지 ============
  const css2 = `
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: -apple-system, 'Apple SD Gothic Neo', '맑은 고딕', sans-serif; background:#f0f4ff; }
    .cover { page-break-after:always; background:linear-gradient(135deg,#4338ca,#7c3aed); min-height:100vh;
      display:flex; flex-direction:column; align-items:center; justify-content:center; color:#fff; text-align:center; padding:60px; }
    .cover h1 { font-size:40px; font-weight:900; margin-bottom:10px; }
    .cover h2 { font-size:24px; opacity:.85; margin-bottom:40px; }
    .stats { display:flex; gap:24px; }
    .stat { background:rgba(255,255,255,.15); padding:16px 28px; border-radius:14px; }
    .stat .n { font-size:32px; font-weight:900; }
    .stat .l { font-size:12px; opacity:.8; margin-top:4px; }
    .sheet { page-break-after:always; padding:36px; background:#fff; min-height:100vh; }
    .hdr { background:linear-gradient(90deg,#4338ca,#6d28d9); color:#fff; padding:18px 26px; border-radius:14px;
      display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
    .hdr h2 { font-size:20px; font-weight:900; }
    .hdr .sub { font-size:11px; opacity:.8; margin-top:3px; }
    .badge { font-size:18px; font-weight:900; padding:8px 18px; border-radius:10px; white-space:nowrap; }
    .badge-hi { background:#dcfce7; color:#15803d; }
    .badge-mid { background:#fef9c3; color:#854d0e; }
    .badge-lo { background:#fee2e2; color:#991b1b; }
    .info-row { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 18px;
      display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; font-size:13px; }
    .score-bar { display:flex; gap:10px; margin-bottom:16px; }
    .sc { flex:1; border-radius:10px; padding:12px; text-align:center; border:1px solid #e2e8f0; }
    .sc .n { font-size:24px; font-weight:900; }
    .sc .l { font-size:10px; color:#94a3b8; margin-top:2px; }
    table.qt { width:100%; border-collapse:collapse; }
    table.qt th { background:#4338ca; color:#fff; padding:9px 12px; font-size:11px; text-align:left; }
    table.qt td { padding:9px 12px; border-bottom:1px solid #f1f5f9; font-size:12px; vertical-align:top; }
    .final { background:linear-gradient(90deg,#eef2ff,#f5f3ff); border:2px solid #c7d2fe; border-radius:12px;
      padding:18px 24px; margin-top:16px; display:flex; justify-content:space-between; align-items:center; }
    .final .big { font-size:28px; font-weight:900; color:#4338ca; }
    .final .lbl { font-size:12px; color:#6366f1; font-weight:600; }
    @media print { body { background:#fff; } .sheet { padding:20px; } }
  `;

  const valid = evals.filter(e => e.midterm_score !== null);
  const scored = valid.filter(e => e.midterm_score >= 0);
  const avg = scored.length > 0 ? (scored.reduce((s,e) => s + e.midterm_score, 0) / scored.length).toFixed(1) : 0;

  let sheets = '';
  evals.forEach((ev) => {
    const u = userMap[ev.user_id] || {};
    const name = u.name || '이름없음';
    const sid = u.student_id || '-';
    const sc = ev.midterm_score ?? 0;
    const bonus = ev.midterm_bonus || 0;
    const rosterNum = getRosterOrder(sid);
    const sub = ev.updated_at ? new Date(ev.updated_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '-';
    const pct = totalQ > 0 ? Math.round((sc / totalQ) * 100) : 0;
    const badgeCls = pct >= 80 ? 'badge-hi' : pct >= 50 ? 'badge-mid' : 'badge-lo';

    let qRows = '';
    if (questions.length > 0) {
      questions.forEach((q, qi) => {
        const ans = q.answerText || (q.options && q.options[q.answerIndex]) || '-';
        qRows += `<tr>
          <td style="text-align:center;font-weight:900;color:#4338ca">${q.id || qi+1}</td>
          <td>${q.text || ''}</td>
          <td style="font-weight:700;color:#1d4ed8">${ans}</td>
        </tr>`;
      });
    }

    sheets += `
    <div class="sheet">
      <div class="hdr">
        <div>
          <div class="sub">${courseName} 중간고사 · 순번 ${rosterNum}번</div>
          <h2>${name}</h2>
          <div class="sub">학번: ${sid} · 제출: ${sub}</div>
        </div>
        <div class="badge ${badgeCls}">${sc} / ${totalQ}점</div>
      </div>
      <div class="info-row">
        <span><b>No.${rosterNum}</b>&nbsp;&nbsp;<b>${name}</b>&nbsp;&nbsp;(학번: ${sid})</span>
        <span style="color:#94a3b8;font-size:12px">${sub}</span>
      </div>
      <div class="score-bar">
        <div class="sc" style="background:#f0fdf4;border-color:#86efac">
          <div class="n" style="color:#16a34a">${sc}</div><div class="l">점수 (/${totalQ})</div>
        </div>
        <div class="sc" style="background:#eef2ff;border-color:#c7d2fe">
          <div class="n" style="color:#4338ca">${pct}%</div><div class="l">정답률</div>
        </div>
        ${bonus > 0 ? `<div class="sc" style="background:#fffbeb;border-color:#fcd34d">
          <div class="n" style="color:#d97706">+${bonus}👑</div><div class="l">반장 가점</div>
        </div>` : ''}
      </div>
      ${questions.length > 0 ? `
      <table class="qt">
        <thead><tr><th style="width:36px">No.</th><th>문제</th><th style="width:160px">정답</th></tr></thead>
        <tbody>${qRows}</tbody>
      </table>` : '<p style="text-align:center;color:#94a3b8;padding:40px">문제 데이터 없음</p>'}
      <div class="final">
        <div class="lbl">최종 중간고사 점수</div>
        <div class="big">${sc} / ${totalQ}점 (${pct}%)</div>
      </div>
    </div>`;
  });

  const sheetsHtml = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><title>${courseName} 중간고사 전체 시험지</title>
<style>${css2}</style></head><body>
<div class="cover">
  <h1>📋 ${courseName}</h1>
  <h2>중간고사 전체 시험지</h2>
  <div class="stats">
    <div class="stat"><div class="n">${evals.length}</div><div class="l">응시 인원</div></div>
    <div class="stat"><div class="n">${totalQ}</div><div class="l">총 문항</div></div>
    <div class="stat"><div class="n">${avg}</div><div class="l">평균 점수</div></div>
  </div>
  <p style="margin-top:28px;font-size:13px;opacity:.7">출력일시: ${now}</p>
</div>
${sheets}
</body></html>`;

  const sheetsPath = `${process.env.HOME}/Desktop/레코딩실습1_중간고사_전체시험지_${today}.html`;
  fs.writeFileSync(sheetsPath, sheetsHtml, 'utf-8');
  console.log('✅ 전체시험지 저장:', sheetsPath);

  console.log('\n📊 학생별 점수 현황 (순번 순서, 청강생 제외, ' + evals.length + '명):');
  evals.forEach(ev => {
    const u = userMap[ev.user_id] || {};
    const rNum = getRosterOrder(u.student_id);
    console.log(`  ${String(rNum).padStart(2,' ')}. ${(u.name||'이름없음').padEnd(6,' ')} (${u.student_id||'-'}): ${ev.midterm_score}점`);
  });
  console.log('\n🖨️ PDF 변환 방법: Chrome으로 파일 열기 → Cmd+P → PDF로 저장');
}
main().catch(console.error);
