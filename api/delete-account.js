import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // service role key — can delete auth users
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "Missing userId" });

  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ success: true });
}
