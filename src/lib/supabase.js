import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = (typeof import.meta !== "undefined" && import.meta?.env?.VITE_SUPABASE_URL) || 
  (typeof process !== "undefined" && process.env?.VITE_SUPABASE_URL) || 
  "https://ftsqfgnarbqeloyjrpzc.supabase.co";

const SUPABASE_ANON_KEY = (typeof import.meta !== "undefined" && import.meta?.env?.VITE_SUPABASE_ANON_KEY) || 
  (typeof process !== "undefined" && process.env?.VITE_SUPABASE_ANON_KEY) || 
  "sb_publishable_kpImllY5fOUwRhXMa6Usqw_rFCT0MYT";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
