// api/create-checkout.js
// Vercel serverless function — place this at /api/create-checkout.js in your project root
//
// Required env vars in Vercel dashboard:
//   STRIPE_SECRET_KEY     — Stripe Dashboard → Developers → API keys (secret key)
//   STRIPE_PRICE_ID       — Stripe Dashboard → Products → your 99p product → Price ID (starts price_)
//   NEXT_PUBLIC_APP_URL   — e.g. https://app.habitick.pro

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { userId, userEmail } = req.body;
  if (!userId || !userEmail) return res.status(400).json({ error: "Missing userId or userEmail" });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: userEmail,
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      metadata: { supabase_user_id: userId },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}?upgraded=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}?upgraded=false`,
      allow_promotion_codes: true,
    });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("Stripe error:", err);
    return res.status(500).json({ error: err.message });
  }
}
