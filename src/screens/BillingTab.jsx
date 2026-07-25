import { FREE_HABIT_LIMIT, FREE_GOALS_LIMIT, FREE_JOURNAL_DAYS } from '../utils/constants.js';
import { supabase } from '../lib/supabase.js';
import { useState } from 'react';

export function BillingTab({ profile, session, showToast, onUpgrade }) {
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

  const tableRow = (feature, freeVal, proVal, isHeader = false, isLast = false) => (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1.2fr 1fr 1fr",
      padding: isHeader ? "14px 16px" : "12px 16px",
      alignItems: "center",
      background: isHeader ? "rgba(17, 24, 39, 0.8)" : "transparent",
      borderBottom: isLast ? "none" : "1px solid rgba(255, 255, 255, 0.05)",
      fontSize: isHeader ? "12px" : "13px"
    }}>
      <div style={{ fontWeight: isHeader ? 700 : 500, color: isHeader ? "#9ca3af" : "#d1d5db", textTransform: isHeader ? "uppercase" : "none", letterSpacing: isHeader ? "0.04em" : "normal" }}>
        {feature}
      </div>
      <div style={{ textAlign: "center", color: isHeader ? "#9ca3af" : "#9ca3af", fontWeight: isHeader ? 700 : 500, textTransform: isHeader ? "uppercase" : "none" }}>
        {freeVal}
      </div>
      <div style={{
        textAlign: "center",
        color: isHeader ? "#60a5fa" : "#3b82f6",
        fontWeight: isHeader ? 800 : 700,
        textTransform: isHeader ? "uppercase" : "none",
        background: isHeader ? "rgba(59, 130, 246, 0.1)" : "rgba(59, 130, 246, 0.06)",
        padding: isHeader ? "4px 8px" : "4px 6px",
        borderRadius: "6px",
        fontFamily: isHeader ? "'Syne', sans-serif" : "inherit"
      }}>
        {proVal}
      </div>
    </div>
  );

  return (
    <div>
      {/* Active Plan Status Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", padding: "12px 16px", background: "#0d1117", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: "12px" }}>
        <span style={{ fontSize: "13px", color: "#9ca3af", fontWeight: 600 }}>Your Current Plan:</span>
        <span style={{
          fontSize: "11px", padding: "3px 10px", borderRadius: "999px", fontWeight: 700,
          background: isLifetime ? "#065f46" : isPremium ? "rgba(37, 99, 235, 0.2)" : "rgba(255, 255, 255, 0.05)",
          border: `1px solid ${isLifetime ? "#10b981" : isPremium ? "#2563eb" : "rgba(255, 255, 255, 0.1)"}`,
          color: isLifetime ? "#10b981" : isPremium ? "#60a5fa" : "#9ca3af"
        }}>
          {isLifetime ? "LIFETIME PREMIUM ✦" : isPremium ? "PRO PLAN ACTIVE" : "FREE PLAN"}
        </span>
      </div>

      {/* Split Comparison Table */}
      <div style={{ background: "#0d1117", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "16px", overflow: "hidden", marginBottom: "20px", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
        {tableRow("Feature", "Free", "Pro ✨", true)}
        {tableRow("Max Habits", `${FREE_HABIT_LIMIT}`, "Unlimited ✦")}
        {tableRow("Max Goals", `${FREE_GOALS_LIMIT}`, "Unlimited ✦")}
        {tableRow("Streak Shields", "3 Max", "5 Max 🛡️")}
        {tableRow("AI Summary", "None", "Full Access ✨")}
        {tableRow("Price", "£0", "99p/mo or £12.99", false, true)}
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
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {/* Monthly Primary CTA */}
          <button
            onClick={() => onUpgrade && onUpgrade("monthly")}
            style={{ width: "100%", padding: "13px", borderRadius: "10px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "14px", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 16px rgba(37,99,235,0.3)" }}
          >
            Subscribe Pro — £0.99 / month →
          </button>

          {/* OR Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "2px 0" }}>
            <div style={{ flex: 1, height: "1px", background: "rgba(255, 255, 255, 0.08)" }} />
            <span style={{ fontSize: "11px", color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>or</span>
            <div style={{ flex: 1, height: "1px", background: "rgba(255, 255, 255, 0.08)" }} />
          </div>

          {/* Lifetime Pass Secondary CTA */}
          <button
            onClick={() => onUpgrade && onUpgrade("lifetime")}
            style={{ width: "100%", padding: "13px", borderRadius: "10px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "14px", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 16px rgba(37,99,235,0.3)" }}
          >
            Get Lifetime Pass — £12.99 (One-Time) ✦
          </button>
        </div>
      )}
    </div>
  );
}