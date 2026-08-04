import { FREE_HABIT_LIMIT, FREE_TODO_LIMIT, FREE_GOALS_LIMIT } from '../utils/constants.js';

export function UpgradeModal({ onClose, onUpgrade, reason }) {
  const reasons = {
    habits: { icon: "📋", title: "You've reached the free habit limit", desc: `Free accounts can track up to ${FREE_HABIT_LIMIT} habits.` },
    todos: { icon: "✅", title: "You've reached the free to-do limit", desc: `Free accounts can have up to ${FREE_TODO_LIMIT} active to-dos.` },
    goals: { icon: "🎯", title: "You've reached the free goal limit", desc: `Free accounts can track up to ${FREE_GOALS_LIMIT} goals.` },
  };
  const r = reasons[reason] || reasons.habits;

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(4, 7, 13, 0.85)",
      backdropFilter: "blur(12px)",
      zIndex: 20000,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      animation: "htFadeIn 0.2s ease-out"
    }}>
      <div style={{
        background: "#0d1117",
        border: "1px solid rgba(59, 130, 246, 0.2)",
        borderRadius: "24px",
        padding: "32px 28px",
        width: "100%",
        maxWidth: "390px",
        textAlign: "center",
        boxShadow: "0 24px 60px rgba(0, 0, 0, 0.7), 0 0 40px rgba(37, 99, 235, 0.1)",
        position: "relative",
        overflow: "hidden"
      }}>
        {/* Subtle Top Glow Line */}
        <div style={{ position: "absolute", top: 0, left: "10%", right: "10%", height: "2px", background: "linear-gradient(90deg, transparent, #2563eb, #60a5fa, transparent)" }} />

        {/* Icon & Badge */}
        <div style={{
          width: "64px",
          height: "64px",
          borderRadius: "20px",
          background: "rgba(59, 130, 246, 0.12)",
          border: "1px solid rgba(59, 130, 246, 0.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "28px",
          margin: "0 auto 16px",
          boxShadow: "0 8px 24px rgba(37, 99, 235, 0.15)"
        }}>
          {r.icon}
        </div>

        <div style={{ display: "inline-block", fontSize: "10.5px", fontWeight: 800, color: "#60a5fa", background: "rgba(59, 130, 246, 0.1)", padding: "3px 10px", borderRadius: "999px", border: "1px solid rgba(59, 130, 246, 0.2)", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          HabiTick Premium
        </div>

        <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "20px", color: "#f9fafb", margin: "0 0 8px", letterSpacing: "-0.02em", lineHeight: 1.3 }}>
          {r.title}
        </h2>
        <p style={{ color: "#9ca3af", fontSize: "13.5px", lineHeight: 1.5, margin: "0 0 20px" }}>
          {r.desc} Upgrade to unlock unlimited access and premium features.
        </p>

        {/* Value Features Checklist */}
        <div style={{
          background: "rgba(22, 31, 48, 0.4)",
          border: "1px solid rgba(255, 255, 255, 0.05)",
          borderRadius: "16px",
          padding: "16px",
          marginBottom: "24px",
          textAlign: "left"
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "12.5px", color: "#d1d5db" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ color: "#3b82f6", fontWeight: 800 }}>✓</span>
              <span><strong>Unlimited</strong> Habits, Goals & Tasks</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ color: "#3b82f6", fontWeight: 800 }}>✓</span>
              <span><strong>5 Streak Shields</strong> capacity (3 max on Free)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ color: "#3b82f6", fontWeight: 800 }}>✓</span>
              <span><strong>Full AI Performance Coach</strong> & Insights</span>
            </div>
          </div>

          <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.05)", marginTop: "12px", paddingTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: "12px", color: "#6b7280", fontWeight: 600 }}>Plan Price:</span>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "22px", color: "#f9fafb" }}>99p</span>
              <span style={{ fontSize: "12px", color: "#9ca3af" }}> / month</span>
              <div style={{ fontSize: "10.5px", color: "#10b981", fontWeight: 600, marginTop: "2px" }}>or £12.99 lifetime pass</div>
            </div>
          </div>
        </div>

        {/* CTA Buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
          <button
            onClick={() => onUpgrade("monthly")}
            style={{
              width: "100%",
              padding: "13px",
              borderRadius: "12px",
              border: "none",
              background: "#2563eb",
              color: "#fff",
              fontWeight: 800,
              fontSize: "14px",
              cursor: "pointer",
              fontFamily: "inherit",
              boxShadow: "0 6px 20px rgba(37, 99, 235, 0.35)",
              transition: "all 0.2s"
            }}
          >
            Subscribe Monthly — 99p/mo →
          </button>

          <button
            onClick={() => onUpgrade("lifetime")}
            style={{
              width: "100%",
              padding: "13px",
              borderRadius: "12px",
              border: "none",
              background: "#2563eb",
              color: "#fff",
              fontWeight: 800,
              fontSize: "14px",
              cursor: "pointer",
              fontFamily: "inherit",
              boxShadow: "0 6px 20px rgba(37, 99, 235, 0.35)",
              transition: "all 0.2s"
            }}
          >
            Get Lifetime Pass — £12.99 (One-Time) ✦
          </button>
        </div>

        <button
          onClick={onClose}
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: "10px",
            border: "none",
            background: "transparent",
            color: "#6b7280",
            fontWeight: 600,
            fontSize: "13px",
            cursor: "pointer",
            fontFamily: "inherit"
          }}
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}