import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse .env manually
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
    env[key] = value;
  }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function main() {
  const { data, error } = await supabase.from("habit_completions").insert({
    habit_id: "00000000-0000-0000-0000-000000000000",
    user_id: "00000000-0000-0000-0000-000000000000",
    completed_date: "2026-07-01",
    created_at: "2026-07-01T12:00:00Z"
  }).select();
  
  console.log("Error response for created_at:", error);
}

main();
