source .env.local
URL="$NEXT_PUBLIC_SUPABASE_URL/rest/v1"
KEY="$SUPABASE_SERVICE_ROLE_KEY"

# 1. Get Course ID
COURSE_RES=$(curl -s -X GET "$URL/courses?name=ilike.*%ED%99%88%EB%A0%88%EC%BD%94%EB%94%A9%EA%B3%BC%20%EC%9D%8C%ED%96%A5%ED%95%99%20B*" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY")
COURSE_ID=$(echo $COURSE_RES | grep -o '\"id\":\"[^\"]*\"' | head -1 | cut -d '"' -f 4)

echo "Course ID: $COURSE_ID"

# 2. Get User ID for '전우영' in that course
USER_RES=$(curl -s -X GET "$URL/users?course_id=eq.$COURSE_ID&name=ilike.*%EC%A0%84%EC%9A%B0%EC%98%81*" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY")
USER_ID=$(echo $USER_RES | grep -o '\"id\":\"[^\"]*\"' | head -1 | cut -d '"' -f 4)

echo "User ID: $USER_ID"

if [ -z "$USER_ID" ]; then
  echo "User not found."
  exit 1
fi

# 3. Update assignments table
curl -s -X PATCH "$URL/assignments?user_id=eq.$USER_ID&week_name=eq.3%EC%A3%BC%EC%B0%A8" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"week_name":"6주차"}' | grep -o '"id"' | wc -l | awk '{print "Updated assignments: " $1}'

# 4. Update board_questions (week_number as string)
curl -s -X PATCH "$URL/board_questions?user_id=eq.$USER_ID&week_number=eq.3%EC%A3%BC%EC%B0%A8" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"week_number":"6주차"}' | grep -o '"id"' | wc -l | awk '{print "Updated board_questions string: " $1}'

# 5. Update board_questions (week_number as number just in case)
curl -s -X PATCH "$URL/board_questions?user_id=eq.$USER_ID&week_number=eq.3" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"week_number":"6주차"}' | grep -o '"id"' | wc -l | awk '{print "Updated board_questions number: " $1}'

