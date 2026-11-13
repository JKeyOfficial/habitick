/// <reference no-default-lib="true" />
/// <reference lib="deno.ns" />
/// <reference lib="esnext" />

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "https://esm.sh/web-push@3.6.6"

// --- SETUP INSTRUCTIONS ---
// 1. Run 'supabase secrets set VAPID_PUBLIC_KEY=...' and 'VAPID_PRIVATE_KEY=...'
// 2. Run 'supabase secrets set VAPID_SUBJECT=mailto:your@email.com'
// 3. Optional: Set 'NOTIFY_SECRET=...' or 'CRON_SECRET=...' for triggering cron jobs
// 4. Deploy: 'supabase functions deploy notify'
// --------------------------

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

serve(async (req: Request) => {
  // 1. Require POST method
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: JSON_HEADERS,
    });
  }

  // 2. Authentication guard: Require valid secret or service role key
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  const notifySecret = Deno.env.get("NOTIFY_SECRET");
  const cronSecret = Deno.env.get("CRON_SECRET");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const isAuthorized = Boolean(
    token &&
    (
      (notifySecret && token === notifySecret) ||
      (cronSecret && token === cronSecret) ||
      (serviceRoleKey && token === serviceRoleKey)
    )
  );

  if (!isAuthorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Server configuration missing" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const subject = Deno.env.get("VAPID_SUBJECT") ?? "";

  if (!publicKey || !privateKey || !subject) {
    return new Response(JSON.stringify({ error: "VAPID keys not configured" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);

  // 3. Get all users who have notifications enabled
  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id, timezone")
    .eq("notifications_enabled", true);

  if (pErr) {
    console.error("Error fetching profiles:", pErr);
    return new Response(JSON.stringify({ error: pErr.message }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  let totalNotified = 0;

  for (const user of (profiles || [])) {
    const tz = user.timezone || "UTC";

    // Get current time in user's timezone safely
    let userLocalTime = "00:00";
    let userLocalTimeWithSeconds = "00:00:00";
    let userDay = 0;
    let userDateStr = new Date().toISOString().split("T")[0];

    try {
      const formatter = new Intl.DateTimeFormat("en-GB", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const dateInTz = new Date();
      const parts = formatter.formatToParts(dateInTz);
      const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
      const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
      userLocalTime = `${hour}:${minute}`;
      userLocalTimeWithSeconds = `${userLocalTime}:00`;
      userDay = new Date(dateInTz.toLocaleString("en-US", { timeZone: tz })).getDay();
      userDateStr = new Date(dateInTz.toLocaleString("en-US", { timeZone: tz }))
        .toISOString()
        .split("T")[0];
    } catch (tzErr) {
      console.warn(`Invalid timezone "${tz}" for user ${user.id}, fallback to UTC:`, tzErr);
    }

    // 4. Find habits for THIS user at THEIR local time
    const { data: habits } = await supabase
      .from("habits")
      .select("id, name, frequency, days")
      .eq("user_id", user.id)
      .or(`reminder_time.eq.${userLocalTime},reminder_time.eq.${userLocalTimeWithSeconds}`);

    const habitsToNotify = (habits || []).filter((h: any) =>
      h.frequency === "daily" || (h.days && h.days.includes(userDay))
    );

    // 5. Find tasks for THIS user at THEIR local time
    const { data: todos } = await supabase
      .from("todos")
      .select("id, text")
      .eq("user_id", user.id)
      .eq("due_date", userDateStr)
      .or(`due_time.eq.${userLocalTime},due_time.eq.${userLocalTimeWithSeconds}`)
      .eq("done", false);

    const notifications = [
      ...habitsToNotify.map((h: any) => ({
        title: "Habit Reminder",
        body: `Time for: ${h.name}`,
      })),
      ...(todos || []).map((t: any) => ({
        title: "Task Due",
        body: t.text,
      })),
    ];

    if (notifications.length > 0) {
      // Query subscription ID as well so we only delete the exact expired subscription if it fails
      const { data: subs } = await supabase
        .from("push_subscriptions")
        .select("id, subscription")
        .eq("user_id", user.id);

      for (const s of (subs || [])) {
        try {
          for (const n of notifications) {
            const payload = {
              title: n.title,
              body: n.body,
              url: "https://app.habitick.app",
            };
            await webpush.sendNotification(
              s.subscription,
              JSON.stringify(payload)
            );
            totalNotified++;
          }
        } catch (err: any) {
          // If subscription has expired / gone (410 or 404), delete ONLY this subscription record
          if (err.statusCode === 410 || err.statusCode === 404) {
            console.log(`Pruning expired push subscription ${s.id} for user ${user.id}`);
            await supabase
              .from("push_subscriptions")
              .delete()
              .eq("id", s.id);
          }
        }
      }
    }
  }

  return new Response(JSON.stringify({ success: true, notified: totalNotified }), {
    headers: JSON_HEADERS,
  });
});
