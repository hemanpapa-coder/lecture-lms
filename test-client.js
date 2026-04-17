const { createBrowserClient } = require('@supabase/ssr');
try {
  const client = createBrowserClient('https://gqufsvzfjnreczknootc.supabase.co', 'eyJhb...fake...KEY');
  console.log("Success client create");
} catch (e) {
  console.log("Error:", e);
}
