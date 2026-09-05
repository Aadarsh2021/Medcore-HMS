import { createBrowserClient } from '@supabase/ssr';

let client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  if (client) return client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ihpjezapyznhzbhxfrvu.supabase.co';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_4PWubQVpA5UHZMVJfmHHgA_HP0qBw9S';

  client = createBrowserClient(supabaseUrl, supabaseAnonKey);
  return client;
}
