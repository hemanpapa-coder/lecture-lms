#!/usr/bin/env python3
import os
import re
import urllib.request
import urllib.parse
import json

# Read .env.local
env_path = os.path.join(os.path.dirname(__file__), '..', '.env.local')
env_vars = {}
try:
    with open(env_path, 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#'):
                m = re.match(r'^([A-Z_][A-Z0-9_]*)=["\']?(.+?)["\']?$', line)
                if m:
                    env_vars[m.group(1)] = m.group(2).strip('"\'')
except Exception as e:
    print(f"Error reading .env.local: {e}")
    exit(1)

supabase_url = env_vars.get('NEXT_PUBLIC_SUPABASE_URL')
supabase_key = env_vars.get('SUPABASE_SERVICE_ROLE_KEY')

if not supabase_url or not supabase_key:
    print("Missing Supabase credentials in .env.local")
    exit(1)

headers = {
    'apikey': supabase_key,
    'Authorization': f'Bearer {supabase_key}',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
}

updates = [
    # Match exactly '오디오테크놀러지'
    {
        'query': '?name=eq.%EC%98%A4%EB%94%94%EC%98%A4%ED%85%8C%ED%81%AC%EB%86%80%EB%9F%AC%EC%A7%80', # URL encoded 오디오테크놀러지
        'data': {'university_name': '상명문화기술대학원'}
    },
    # Match exactly '오디오테크롤러지' (typo version)
    {
        'query': '?name=eq.%EC%98%A4%EB%94%94%EC%98%A4%ED%85%8C%ED%81%AC%EB%A1%A4%EB%9F%AC%EC%A7%80', # URL encoded 오디오테크롤러지
        'data': {'university_name': '상명문화기술대학원'}
    },
    # Match starting with '홈레코딩과 음향학' -> 홈레코딩과 음향학A, 홈레코딩과 음향학B
    {
        'query': f"?name=like.{urllib.parse.quote('홈레코딩과 음향학*')}",
        'data': {'university_name': '백석예술대학교'}
    }
]

base_url = f"{supabase_url}/rest/v1/courses"

import ssl

context = ssl.create_default_context()
context.check_hostname = False
context.verify_mode = ssl.CERT_NONE

for update in updates:
    req_url = base_url + update['query']
    data = json.dumps(update['data']).encode('utf-8')
    req = urllib.request.Request(req_url, data=data, headers=headers, method='PATCH')
    
    try:
        with urllib.request.urlopen(req, context=context) as response:
            result = json.loads(response.read().decode('utf-8'))
            print(f"Updated {len(result)} rows for query {urllib.parse.unquote(update['query'])}:")
            for row in result:
                print(f"  - {row.get('name')} -> {row.get('university_name')}")
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        print(f"HTTP Error {e.code}: {body}")
    except Exception as e:
        print(f"Error: {e}")

print("Done.")
