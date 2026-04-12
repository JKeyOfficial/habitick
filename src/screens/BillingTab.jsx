import { FREE_HABIT_LIMIT, FREE_JOURNAL_DAYS } from '../utils/constants.js';
import { supabase } from '../lib/supabase.js';
import { useState } from 'react';

export function BillingTab({ profile, session, showToast }) {
  const [loading, setLoading] = useState(false);

  const isPremium = profile?.is_premium === true;
  const isLifetime = profile?.is_lifetime === true;
  const hasStripe = !!profile?.stripe_customer_id;

  const openPortal = async () => {
    if (!profile?.stripe_customer_id) return;
    setLoading(true);
    try {
      const res = await fetch("/api/billing-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: profile.stripe_customer_id }),
      });
      const { url, error } = await res.json();
      if (error) throw new Error(error);
      window.location.href = url;
    } catch (err) {
      showToast("Could not open billing portal. Try again.", "error");
    }
    setLoading(false);
  };

  const row = (label, value, highlight) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #1f2937" }}>
      <span style={{ color: "#6b7280", fontSize: "13px" }}>{label}</span>
      <span style={{ color: highlight ? "#10b981" : "#f9fafb", fontWeight: 600, fontSize: "13px" }}>{value}</span>
    </div>
  );

  return (
    <div>
      <div style={{ background: "#0d1117", border: `1px solid ${isPremium ? "#2563eb40" : "#1f2937"}`, borderRadius: "12px", padding: "16px", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "16px", color: "#f9fafb" }}>
            {isLifetime ? "Founder Plan" : isPremium ? "Pro Plan" : "Free Plan"}
          </span>
          <span style={{
            fontSize: "11px", padding: "3px 10px", borderRadius: "999px", fontWeight: 700,
            background: isLifetime ? "#065f46" : isPremium ? "#2563eb20" : "#1f2937",
            border: `1px solid ${isLifetime ? "#10b981" : isPremium ? "#2563eb" : "#374151"}`,
            color: isLifetime ? "#10b981" : isPremium ? "#60a5fa" : "#6b7280"
          }}>
            {isLifetime ? "LIFETIME FREE ✦" : isPremium ? "ACTIVE" : "FREE"}
          </span>
        </div>

        {isLifetime && row("Price", "Free, forever", true)}
        {!isLifetime && isPremium && row("Price", "£0.99 / month", false)}
        {!isPremium && row("Price", "£0", false)}

        {isLifetime && row("Billing", "Never — you're a founding member", true)}
        {!isLifetime && isPremium && row("Billing", "Managed via Stripe", false)}
        {!isPremium && row("Upgrade", "£0.99/month for unlimited everything", false)}

        {row("Habits", isPremium ? "Unlimited" : `${FREE_HABIT_LIMIT} max`, isPremium)}
        {row("Journal history", isPremium ? "All time" : "Last 7 days", isPremium)}
        {row("Backdating", isPremium ? "7 days" : "Yesterday only", isPremium)}
      </div>

      {isLifetime && (
        <div style={{ background: "#065f4620", border: "1px solid #10b98130", borderRadius: "10px", padding: "14px", textAlign: "center" }}>
          <div style={{ fontSize: "20px", marginBottom: "6px" }}>🎉</div>
          <div style={{ color: "#10b981", fontWeight: 700, fontSize: "13px" }}>You're a founding member</div>
          <div style={{ color: "#4b5563", fontSize: "12px", marginTop: "4px" }}>Premium is yours free, forever. No card, no billing, ever.</div>
        </div>
      )}

      {!isLifetime && isPremium && hasStripe && (
        <button onClick={openPortal} disabled={loading} style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #374151", background: "transparent", color: "#9ca3af", fontWeight: 600, fontSize: "14px", cursor: loading ? "default" : "pointer", fontFamily: "inherit", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Opening..." : "Manage subscription →"}
        </button>
      )}

      {!isLifetime && isPremium && !hasStripe && (
        <div style={{ color: "#4b5563", fontSize: "12px", textAlign: "center" }}>No billing information found.</div>
      )}

      {!isPremium && (
        <button onClick={() => showToast("Use the Upgrade button from the app", "error")} style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "14px", cursor: "pointer", fontFamily: "inherit" }}>
          Upgrade to Pro — £0.99/month →
        </button>
      )}
    </div>
  );
}