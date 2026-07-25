import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import Stripe from 'stripe'

// Custom Vite dev server plugin to handle /api/create-checkout locally during npm run dev
function localApiPlugin() {
  return {
    name: 'local-api-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url.startsWith('/api/create-checkout') && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const env = loadEnv(server.config.mode, process.cwd(), '');
              const secretKey = env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;

              if (!secretKey) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: "STRIPE_SECRET_KEY is missing from .env" }));
              }

              const stripe = new Stripe(secretKey);
              const payload = JSON.parse(body || '{}');
              const { userId, userEmail, planType = "monthly" } = payload;

              const isLifetime = planType === "lifetime";
              const priceId = isLifetime 
                ? (env.STRIPE_PRICE_ID_LIFETIME || process.env.STRIPE_PRICE_ID_LIFETIME)
                : (env.STRIPE_PRICE_ID_MONTHLY || process.env.STRIPE_PRICE_ID_MONTHLY);

              if (!priceId) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: "Stripe Price ID not found in .env" }));
              }

              const session = await stripe.checkout.sessions.create({
                mode: isLifetime ? "payment" : "subscription",
                payment_method_types: ["card"],
                customer_email: userEmail || undefined,
                line_items: [{ price: priceId, quantity: 1 }],
                metadata: { 
                  supabase_user_id: userId || "",
                  plan_type: isLifetime ? "lifetime" : "monthly"
                },
                success_url: `http://localhost:5173?upgraded=true`,
                cancel_url: `http://localhost:5173?upgraded=false`,
                allow_promotion_codes: true,
              });

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ url: session.url }));
            } catch (err) {
              console.error("Local Stripe Checkout Error:", err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        next();
      });
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localApiPlugin()],
})
