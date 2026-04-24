DO $$ 
DECLARE
    target_course_id uuid;
BEGIN
    -- 레코딩실습1 과목 찾기
    SELECT id INTO target_course_id FROM public.courses WHERE name LIKE '%레코딩실습%' LIMIT 1;
    
    -- settings 테이블에 upsert
    INSERT INTO public.settings (key, value, updated_at)
    VALUES (
        'course_' || target_course_id || '_mcq_questions', 
        '{"isMidtermOpen": true, "questions": []}'::jsonb,
        NOW()
    )
    ON CONFLICT (key) DO UPDATE 
    SET value = jsonb_set(
            COALESCE(public.settings.value, '{}'::jsonb), 
            '{isMidtermOpen}', 
            'true'::jsonb
        ),
        updated_at = NOW();
END $$;
