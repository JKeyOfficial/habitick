/// <reference no-default-lib="true" />
/// <reference lib="deno.ns" />
/// <reference lib="esnext" />

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "https://esm.sh/web-push@3.6.6"

// --- SETUP INSTRUCTIONS ---
// 1. Run 'supabase secrets set VAPID_PUBLIC_KEY=...' and 'VAPID_PRIVATE_KEY=...'
// 2. Run 'supabase secrets set VAPID_SUBJECT=mailto:your@email.com'
// 3. Deploy: 'supabase functions deploy notify'
// --------------------------

serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
  const subject = Deno.env.get('VAPID_SUBJECT') ?? ''

  webpush.setVapidDetails(subject, publicKey, privateKey)

  // 1. Get current time in HH:mm format
  const now = new Date()
  const currentTime = now.toTimeString().substring(0, 5) // "HH:mm"
  const currentDay = now.getDay() // 0-6 (Sun-Sat)

  console.log(`Checking notifications for ${currentTime}, day ${currentDay}`)

  // 2. Find habits with reminders for this time & day
  const { data: habits } = await supabase
    .from('habits')
    .select('id, user_id, name, frequency, days')
    .eq('reminder_time', currentTime)

  const habitsToNotify = (habits || []).filter((h: any) =>
    h.frequency === 'daily' || (h.days && h.days.includes(currentDay))
  )

  // 3. Find tasks due at this time
  const todayStr = now.toISOString().split('T')[0]
  const { data: todos } = await supabase
    .from('todos')
    .select('id, user_id, text')
    .eq('due_date', todayStr)
    .eq('due_time', currentTime)
    .eq('done', false)

  // 4. Combine and send notifications
  const notifications = [
    ...habitsToNotify.map((h: any) => ({ userId: h.user_id, title: 'Habit Reminder', body: `Time for: ${h.name}` })),
    ...(todos || []).map((t: any) => ({ userId: t.user_id, title: 'Task Due', body: t.text }))
  ]

  for (const n of notifications) {
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('subscription')
      .eq('user_id', n.userId)

    for (const s of (subs || [])) {
      try {
        await webpush.sendNotification(
          s.subscription,
          JSON.stringify({
            title: n.title,
            body: n.body,
            url: '/'
          })
        )
      } catch (err: any) {
        console.error(`Failed to send push to ${n.userId}:`, err)
        // If subscription is expired, delete it
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from('push_subscriptions').delete().match({ user_id: n.userId })
        }
      }
    }
  }


  return new Response(JSON.stringify({ success: true, notified: notifications.length }), {
    headers: { "Content-Type": "application/json" },
  })
})
