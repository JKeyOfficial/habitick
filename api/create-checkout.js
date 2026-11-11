// api/create-checkout.js
// Serverless function — handles Stripe Checkout for Monthly & Lifetime plans
//
// Required environment variables in Vercel / .env:
//   STRIPE_SECRET_KEY           — Stripe Secret Key (starts with sk_test_ or sk_live_)
//   STRIPE_PRICE_ID_MONTHLY     — Price ID for 99p/mo recurring subscription (starts with price_)
//   STRIPE_PRICE_ID_LIFETIME    — Price ID for £14.99 one-time lifetime payment (starts with price_)
//   NEXT_PUBLIC_APP_URL         — Your app domain URL (e.g. https://app.habitick.app)

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Require Bearer token — derive userId/userEmail solely from the verified session
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

  const userId = user.id;
  const userEmail = user.email;
  const { planType = "monthly" } = req.body;

  const isLifetime = planType === "lifetime";
  
  // Use Lifetime Price ID or Monthly Price ID (falls back to STRIPE_PRICE_ID if not specified)
  const priceId = isLifetime 
    ? (process.env.STRIPE_PRICE_ID_LIFETIME || process.env.STRIPE_PRICE_ID)
    : (process.env.STRIPE_PRICE_ID_MONTHLY || process.env.STRIPE_PRICE_ID);

  if (!priceId) {
    return res.status(500).json({ error: "Stripe Price ID not configured in environment variables." });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://app.habitick.app");

  try {
    const session = await stripe.checkout.sessions.create({
      mode: isLifetime ? "payment" : "subscription",
      payment_method_types: ["card"],
      customer_email: userEmail,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { 
        supabase_user_id: userId,
        plan_type: isLifetime ? "lifetime" : "monthly"
      },
      success_url: `${appUrl}?upgraded=true`,
      cancel_url: `${appUrl}?upgraded=false`,
      allow_promotion_codes: true,
    });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("Stripe error:", err);
    return res.status(500).json({ error: err.message });
  }
}
