import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://kglzsruwwapvppkpcpaz.supabase.co";

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_y7CNJG2X4H0HfShkjJeqFQ_p2aGWVUJ";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
