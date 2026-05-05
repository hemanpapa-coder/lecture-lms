const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const { data, error } = await supabase.from('poll_votes').select('*');
  if (error) {
    console.error(error);
    return;
  }
  
  const counts = {};
  data.forEach(v => {
    const key = `${v.message_id}_${v.user_id}`;
    counts[key] = (counts[key] || 0) + 1;
  });
  
  const dupes = Object.entries(counts).filter(([k, v]) => v > 1);
  console.log('Duplicates found:', dupes.length);
  if (dupes.length > 0) {
    console.log(dupes);
  }
}

check();
