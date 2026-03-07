-- ============================================================
-- 관리자 계정 완전 복구 스크립트 (All-in-one fix)
-- 아래 스크립트를 Supabase SQL Editor에서 전체 선택 후 RUN 하세요.
-- ============================================================

-- Step 1: auth.users에서 hemanpapa@gmail.com 계정을 찾아
--         public.users 테이블에 강제 삽입 또는 role을 admin으로 업데이트합니다.
INSERT INTO public.users (id, email, role)
SELECT id, email, 'admin'
FROM auth.users
WHERE email = 'hemanpapa@gmail.com'
ON CONFLICT (id) DO UPDATE SET role = 'admin';

-- Step 2: 만약 이메일이 다르다면 이 부분을 실행해서 auth.users에서 실제 이메일 목록을 확인하세요!
-- (Step 1이 실패하면 여기서 정확한 이메일을 찾으세요)
SELECT id, email FROM auth.users ORDER BY created_at;

-- Step 3: public.users 현재 상태도 확인합니다 (role 열 포함)
SELECT id, email, role, deleted_at FROM public.users ORDER BY created_at;
