DO $$ 
DECLARE
    target_course_id uuid;
    setting_value jsonb;
BEGIN
    SELECT id INTO target_course_id FROM public.courses WHERE name LIKE '%레코딩실습%' LIMIT 1;
    SELECT value INTO setting_value FROM public.settings WHERE key = 'course_' || target_course_id || '_mcq_questions';
    RAISE NOTICE 'Value: %', setting_value;
END $$;
