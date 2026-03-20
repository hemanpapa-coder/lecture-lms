-- poll_votes 테이블에 (message_id, user_id) UNIQUE 제약 조건 추가
-- 이미 중복된 행이 있을 경우 최신 행만 남기고 나머지 삭제

-- 1. 중복 행 정리 (같은 message_id + user_id에서 가장 최근 것만 남김)
DELETE FROM poll_votes
WHERE id NOT IN (
  SELECT DISTINCT ON (message_id, user_id) id
  FROM poll_votes
  ORDER BY message_id, user_id, created_at DESC NULLS LAST, id DESC
);

-- 2. UNIQUE 제약 조건 추가 (이미 있으면 무시)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'poll_votes_message_id_user_id_key'
  ) THEN
    ALTER TABLE poll_votes
    ADD CONSTRAINT poll_votes_message_id_user_id_key
    UNIQUE (message_id, user_id);
  END IF;
END
$$;
