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

  // 1. Get all users who have notifications enabled
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, timezone')
    .eq('notifications_enabled', true)

  if (pErr) {
    console.error('Error fetching profiles:', pErr)
    return new Response(JSON.stringify({ error: pErr.message }), { status: 500 })
  }

  let totalNotified = 0

  for (const user of profiles) {
    const tz = user.timezone || 'UTC'
    
    // Get current time in user's timezone
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
    const dateInTz = new Date()
    const parts = formatter.formatToParts(dateInTz)
    const hour = parts.find(p => p.type === 'hour')?.value
    const minute = parts.find(p => p.type === 'minute')?.value
    const userLocalTime = `${hour}:${minute}`
    const userLocalTimeWithSeconds = `${userLocalTime}:00`
    const userDay = new Date(dateInTz.toLocaleString('en-US', { timeZone: tz })).getDay()
    const userDateStr = new Date(dateInTz.toLocaleString('en-US', { timeZone: tz })).toISOString().split('T')[0]

    // 2. Find habits for THIS user at THEIR local time
    const { data: habits } = await supabase
      .from('habits')
      .select('id, name, frequency, days')
      .eq('user_id', user.id)
      .or(`reminder_time.eq.${userLocalTime},reminder_time.eq.${userLocalTimeWithSeconds}`)

    const habitsToNotify = (habits || []).filter((h: any) => 
      h.frequency === 'daily' || (h.days && h.days.includes(userDay))
    )

    // 3. Find tasks for THIS user at THEIR local time
    const { data: todos } = await supabase
      .from('todos')
      .select('id, text')
      .eq('user_id', user.id)
      .eq('due_date', userDateStr)
      .or(`due_time.eq.${userLocalTime},due_time.eq.${userLocalTimeWithSeconds}`)
      .eq('done', false)

    const notifications = [
      ...habitsToNotify.map((h: any) => ({ title: 'Habit Reminder', body: `Time for: ${h.name}` })),
      ...(todos || []).map((t: any) => ({ title: 'Task Due', body: t.text }))
    ]

    if (notifications.length > 0) {
      const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('subscription')
        .eq('user_id', user.id)

      for (const s of (subs || [])) {
        try {
          for (const n of notifications) {
            await webpush.sendNotification(
              s.subscription,
              JSON.stringify({ title: n.title, body: n.body, url: '/' })
            )
            totalNotified++
          }
        } catch (err: any) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await supabase.from('push_subscriptions').delete().match({ user_id: user.id })
          }
        }
      }
    }
  }

  return new Response(JSON.stringify({ success: true, notified: totalNotified }), {
    headers: { "Content-Type": "application/json" },
  })
})

