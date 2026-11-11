// api/ai-summary.js
// Serverless proxy for Gemini AI analytics summaries.
// Keeps the Gemini API key server-side only (non-VITE_ prefix, never bundled into the client).
//
// Required environment variables:
//   GEMINI_API_KEY            — Gemini API key (server-only, NO VITE_ prefix)
//   SUPABASE_URL              — Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY — Supabase service role key

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Require a valid Bearer token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Missing authentication token" });
  }

  const token = authHeader.replace("Bearer ", "").trim();

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: "Server configuration error" });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: "Unauthorized: Invalid or expired session" });
  }

  // Verify the user is premium (or admin) — server-side check only
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_premium, is_lifetime, is_admin")
    .eq("id", user.id)
    .single();

  const isPremium = profile?.is_premium === true || profile?.is_lifetime === true;
  if (!isPremium && !profile?.is_admin) {
    return res.status(403).json({ error: "Premium subscription required" });
  }

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: "AI service not configured" });
  }

  // Validate and forward the request body
  const { contents } = req.body;
  if (!Array.isArray(contents) || contents.length === 0) {
    return res.status(400).json({ error: "Invalid request: contents array required" });
  }

  // Rough size guard — prevents enormous prompt abuse
  const bodyStr = JSON.stringify(contents);
  if (bodyStr.length > 100_000) {
    return res.status(400).json({ error: "Request payload too large" });
  }

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents }),
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.json().catch(() => ({}));
      return res.status(geminiRes.status).json({ error: err?.error?.message || "Gemini API error" });
    }

    const data = await geminiRes.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error("[ai-summary] Gemini request failed:", err);
    return res.status(500).json({ error: "AI request failed" });
  }
}

