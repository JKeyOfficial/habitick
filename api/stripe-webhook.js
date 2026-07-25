// api/stripe-webhook.js — place at /api/stripe-webhook.js in project root
//
// Env vars needed in Vercel / .env:
//   STRIPE_SECRET_KEY        Stripe secret key (sk_live_... or sk_test_...)
//   STRIPE_WEBHOOK_SECRET    Stripe → Developers → Webhooks → signing secret (whsec_...)
//   SUPABASE_URL             Your Supabase project URL
//   SUPABASE_SERVICE_KEY     Supabase service_role key (NOT anon key) — bypasses RLS
//
// In Stripe → Webhooks, add endpoint: https://<your-app-domain>/api/stripe-webhook
// Events to listen for: checkout.session.completed, customer.subscription.deleted

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const sig = req.headers["stripe-signature"];
  const rawBody = await getRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const userId = session.metadata?.supabase_user_id;
    const isLifetime = session.metadata?.plan_type === "lifetime" || session.mode === "payment";

    if (userId) {
      await supabase.from("profiles").update({
        is_premium: true,
        is_lifetime: isLifetime,
        stripe_customer_id: session.customer || null,
        stripe_subscription_id: session.subscription || null,
        updated_at: new Date().toISOString(),
      }).eq("id", userId);
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const customerId = event.data.object.customer;
    const { data: profiles } = await supabase
      .from("profiles").select("id, is_lifetime").eq("stripe_customer_id", customerId);
    if (profiles?.[0] && !profiles[0].is_lifetime) {
      await supabase.from("profiles")
        .update({ is_premium: false, updated_at: new Date().toISOString() })
        .eq("id", profiles[0].id);
    }
  }

  return res.status(200).json({ received: true });
}
