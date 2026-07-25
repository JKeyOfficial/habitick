// api/create-checkout.js
// Serverless function — handles Stripe Checkout for Monthly & Lifetime plans
//
// Required environment variables in Vercel / .env:
//   STRIPE_SECRET_KEY           — Stripe Secret Key (starts with sk_test_ or sk_live_)
//   STRIPE_PRICE_ID_MONTHLY     — Price ID for 99p/mo recurring subscription (starts with price_)
//   STRIPE_PRICE_ID_LIFETIME    — Price ID for £14.99 one-time lifetime payment (starts with price_)
//   NEXT_PUBLIC_APP_URL         — Your app domain URL (e.g. https://app.habitick.com)

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { userId, userEmail, planType = "monthly" } = req.body;
  if (!userId || !userEmail) return res.status(400).json({ error: "Missing userId or userEmail" });

  const isLifetime = planType === "lifetime";
  
  // Use Lifetime Price ID or Monthly Price ID (falls back to STRIPE_PRICE_ID if not specified)
  const priceId = isLifetime 
    ? (process.env.STRIPE_PRICE_ID_LIFETIME || process.env.STRIPE_PRICE_ID)
    : (process.env.STRIPE_PRICE_ID_MONTHLY || process.env.STRIPE_PRICE_ID);

  if (!priceId) {
    return res.status(500).json({ error: "Stripe Price ID not configured in environment variables." });
  }

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
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:5173"}?upgraded=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:5173"}?upgraded=false`,
      allow_promotion_codes: true,
    });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("Stripe error:", err);
    return res.status(500).json({ error: err.message });
  }
}
