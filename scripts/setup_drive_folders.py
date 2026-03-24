#!/usr/bin/env python3
"""
Google Drive 폴더 구조 자동 생성 스크립트
사운드엔지니어 LMS용
"""
import os
import re
import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

# .env.local 파일 읽기
env_path = os.path.join(os.path.dirname(__file__), '..', '.env.local')
env_vars = {}
with open(env_path, 'r') as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#'):
            m = re.match(r'^([A-Z_][A-Z0-9_]*)=["\'"]?(.+?)["\'"]?$', line)
            if m:
                env_vars[m.group(1)] = m.group(2).strip('"\'')

client_id = env_vars.get('GOOGLE_CLIENT_ID', os.environ.get('GOOGLE_CLIENT_ID', ''))
client_secret = env_vars.get('GOOGLE_CLIENT_SECRET', os.environ.get('GOOGLE_CLIENT_SECRET', ''))
refresh_token = env_vars.get('GOOGLE_REFRESH_TOKEN', os.environ.get('GOOGLE_REFRESH_TOKEN', ''))
root_folder_id = env_vars.get('GOOGLE_DRIVE_FOLDER_ID', os.environ.get('GOOGLE_DRIVE_FOLDER_ID', ''))

if not all([client_id, client_secret, refresh_token, root_folder_id]):
    print("❌ 환경 변수가 누락되었습니다.")
    print(f"  GOOGLE_CLIENT_ID: {'✅' if client_id else '❌'}")
    print(f"  GOOGLE_CLIENT_SECRET: {'✅' if client_secret else '❌'}")
    print(f"  GOOGLE_REFRESH_TOKEN: {'✅' if refresh_token else '❌'}")
    print(f"  GOOGLE_DRIVE_FOLDER_ID: {'✅' if root_folder_id else '❌'}")
    exit(1)

# OAuth2 인증
creds = Credentials(
    token=None,
    refresh_token=refresh_token,
    client_id=client_id,
    client_secret=client_secret,
    token_uri='https://oauth2.googleapis.com/token'
)

service = build('drive', 'v3', credentials=creds)

def find_or_create_folder(name, parent_id):
    """폴더가 있으면 ID 반환, 없으면 생성"""
    query = f"name='{name}' and '{parent_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false"
    results = service.files().list(q=query, fields='files(id, name)').execute()
    files = results.get('files', [])
    if files:
        return files[0]['id']
    
    file_metadata = {
        'name': name,
        'mimeType': 'application/vnd.google-apps.folder',
        'parents': [parent_id]
    }
    folder = service.files().create(body=file_metadata, fields='id').execute()
    return folder.get('id')

print(f"\n🚀 Google Drive 폴더 구조 생성 중...")
print(f"📂 루트 폴더 ID: {root_folder_id}\n")

# LMS 루트 폴더 생성
lms_root = find_or_create_folder('Lecture-LMS', root_folder_id)
print(f"📁 Lecture-LMS: {lms_root}")

# 카테고리별 폴더 생성
folders = {
    '학생과제': None,
    '워크스페이스': None,
    'TTS음원': None,
    'AI이미지': None,
    '아카이브자료': None,
    '게시판첨부': None,
    '에디터업로드': None,
    '에러리포트': None,
    '시험제출파일': None,
    '시스템설정': None,
}

for name in folders:
    folder_id = find_or_create_folder(name, lms_root)
    folders[name] = folder_id
    print(f"  ├── 📁 {name}: {folder_id}")

env_map = {
    'GOOGLE_DRIVE_LMS_ROOT_ID': lms_root,
    'GOOGLE_DRIVE_ASSIGNMENTS_ID': folders['학생과제'],
    'GOOGLE_DRIVE_WORKSPACE_ID': folders['워크스페이스'],
    'GOOGLE_DRIVE_TTS_ID': folders['TTS음원'],
    'GOOGLE_DRIVE_AI_IMAGES_ID': folders['AI이미지'],
    'GOOGLE_DRIVE_ARCHIVE_ID': folders['아카이브자료'],
    'GOOGLE_DRIVE_BOARD_ID': folders['게시판첨부'],
    'GOOGLE_DRIVE_EDITOR_ID': folders['에디터업로드'],
    'GOOGLE_DRIVE_ERRORS_ID': folders['에러리포트'],
    'GOOGLE_DRIVE_EXAMS_ID': folders['시험제출파일'],
    'GOOGLE_DRIVE_SYSTEM_ID': folders['시스템설정'],
}

# .env.local 업데이트
print(f"\n✅ 폴더 생성 완료! .env.local 업데이트 중...")
with open(env_path, 'r') as f:
    content = f.read()

# 주석 처리된 플레이스홀더를 실제 값으로 교체
for key, value in env_map.items():
    # 주석 처리된 형태도 교체
    content = re.sub(
        rf'#?\s*{key}="[^"]*".*',
        f'{key}="{value}"',
        content
    )

with open(env_path, 'w') as f:
    f.write(content)

print("✅ .env.local 업데이트 완료!\n")
print("📋 설정된 환경변수:")
for key, value in env_map.items():
    print(f"  {key}=\"{value}\"")
print("\n⚠️  Vercel 대시보드에도 동일한 환경변수를 추가 후 재배포하세요!")
