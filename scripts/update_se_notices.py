#!/usr/bin/env python3
import os
import re
import urllib.request
import urllib.parse
import json
import ssl

context = ssl.create_default_context()
context.check_hostname = False
context.verify_mode = ssl.CERT_NONE

# 1. Read .env.local
env_path = os.path.join(os.path.dirname(__file__), '..', '.env.local')
env_vars = {}
with open(env_path, 'r') as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#'):
            m = re.match(r'^([A-Z_][A-Z0-9_]*)=["\']?(.+?)["\']?$', line)
            if m:
                env_vars[m.group(1)] = m.group(2).strip('"\'')

supabase_url = env_vars.get('NEXT_PUBLIC_SUPABASE_URL')
supabase_key = env_vars.get('SUPABASE_SERVICE_ROLE_KEY')
app_url = "http://localhost:3000" # We can just read the JSON from the deployed app too. Let's use the raw JSON default or fetch from Live.

if not supabase_url or not supabase_key:
    print("Missing Supabase credentials")
    exit(1)

headers = {
    'apikey': supabase_key,
    'Authorization': f'Bearer {supabase_key}',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
}

# The default initial rows for the Exam Table
INITIAL_ROWS = [
    { "grade_semester": '1학년 1학기', "lesson_topic": '프로툴즈 기반 레코딩 퀄리티 / Studio 운용', "schedule": '중간고사', "content": '레코딩실습실과 B1 Studio의 DM2000 기반 프로툴즈 시스템 시그널 플로우 이해와 녹음을 위한 프로툴즈 기본 운용', "method": 'Google 설문지', "exam_date": '일시 공지 예정' },
    { "grade_semester": '1학년 1학기', "lesson_topic": '프로툴즈 기반 레코딩 퀄리티 / Studio 운용', "schedule": '기말고사', "content": '무대음향 교재의 음향이론 (2과), 마이크 (5과), 공연장 마이크 설치 (13과) 과정', "method": '시험지', "exam_date": '토요일' },
    { "grade_semester": '1학년 2학기', "lesson_topic": '전기, 음향효과기, 케이블, 플러그인 기본 운용', "schedule": '중간고사', "content": '프로툴즈 101 6주차 자료', "method": 'Google 설문지', "exam_date": '일시 공지 예정' },
    { "grade_semester": '1학년 2학기', "lesson_topic": '전기, 음향효과기, 케이블, 플러그인 기본 운용', "schedule": '기말고사', "content": '라이브 또는 스튜디오나 홈레코딩으로 녹음 한 후 음로다인을 이용하여 마치와 타임을 에디팅 한 프로툴즈 세션 Zip 압축파일과 mp3', "method": 'USB 메모리로 발표', "exam_date": '토요일' },
    { "grade_semester": '2학년 1학기', "lesson_topic": '프로툴즈 기반 믹싱 퀄리티', "schedule": '중간고사', "content": '없음', "method": '없음', "exam_date": '없음' },
    { "grade_semester": '2학년 1학기', "lesson_topic": '프로툴즈 기반 믹싱 퀄리티', "schedule": '기말고사', "content": '라이브 또는 스튜디오나 홈레코딩으로 녹음 후 믹스하여 프로툴즈 세션 Zip 압축파일과 44.1Khz, 16bit 이상의 mp3 파일', "method": 'USB 메모리로 가져와서 컴퓨터에 복사 후 평가 순서에 맞춰 발표.', "exam_date": '토요일' },
    { "grade_semester": '2학년 2학기', "lesson_topic": '졸업작품', "schedule": '중간과제', "content": '음악 장르별 분석 자기주도 학습', "method": '체크', "exam_date": '일시 공지 예정' },
    { "grade_semester": '2학년 2학기', "lesson_topic": '졸업작품', "schedule": '기말고사', "content": '졸업작품을 녹음, 편집, 믹스, 마스터링 한 mp3 파일', "method": '발표', "exam_date": '토요일' },
]

def make_request(url, method='GET', body=None):
    data = json.dumps(body).encode('utf-8') if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, context=context) as res:
        return json.loads(res.read().decode('utf-8'))

# 1. Fetch live Exam Table Data from Vercel API
try:
    live_table_req = urllib.request.Request('https://lecture-lms.vercel.app/api/se-exam-table')
    with urllib.request.urlopen(live_table_req, context=context) as res:
        live_data = json.loads(res.read().decode('utf-8'))
        rows = live_data.get('rows', INITIAL_ROWS)
except Exception as e:
    print(f"Using default exam table data (failed to fetch live: {e})")
    rows = INITIAL_ROWS

# 2. Fetch all students from "백석예술대학교" who have a private_lesson_id
users_url = f"{supabase_url}/rest/v1/users?department=eq.%EB%B0%B1%EC%84%9D%EC%98%88%EC%88%A0%EB%8C%80%ED%95%99%EA%B5%90&select=id,name,grade,private_lesson_id&private_lesson_id=not.is.null"
students = make_request(users_url)
print(f"Found {len(students)} students from 백석예술대학교 with private lessons.")

def format_notice(row):
    return f"📌 [사운드엔지니어 전공 실기 {row.get('schedule','')}]\n• 목적: {row.get('lesson_topic', '')}\n• 내용: {row.get('content', '')}\n• 방법: {row.get('method', '')}\n• 일정: {row.get('exam_date', '')}"

for student in students:
    grade = student.get('grade')
    if not grade:
        continue
    
    # Current semester is 1 (Spring)
    target_grade_semester = f"{grade}학년 1학기"
    
    midterm_row = next((r for r in rows if r['grade_semester'] == target_grade_semester and r['schedule'] in ('중간고사', '중간과제')), None)
    final_row = next((r for r in rows if r['grade_semester'] == target_grade_semester and r['schedule'] == '기말고사'), None)
    
    updates = {}
    if midterm_row:
        updates['notice_midterm'] = format_notice(midterm_row)
    if final_row:
        updates['notice_final'] = format_notice(final_row)
        
    if updates:
        course_id = student['private_lesson_id']
        update_url = f"{supabase_url}/rest/v1/courses?id=eq.{course_id}"
        make_request(update_url, method='PATCH', body=updates)
        print(f"✅ Updated notices for student: {student['name']} ({grade}학년)")

print("All done!")
