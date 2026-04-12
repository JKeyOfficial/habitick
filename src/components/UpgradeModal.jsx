import { FREE_HABIT_LIMIT, FREE_TODO_LIMIT, FREE_JOURNAL_DAYS } from '../utils/constants.js';

export function UpgradeModal({ onClose, onUpgrade, reason }) {
  const reasons = {
    habits: { icon: "📋", title: "You've reached the free habit limit", desc: `Free accounts can track up to ${FREE_HABIT_LIMIT} habits. Upgrade to add unlimited habits.` },
    todos: { icon: "✅", title: "You've reached the free to-do limit", desc: `Free accounts can have up to ${FREE_TODO_LIMIT} active to-dos. Upgrade for unlimited.` },
    journal: { icon: "📓", title: "Journal history locked", desc: `Free accounts can access the last ${FREE_JOURNAL_DAYS} days of journal entries. Upgrade for your full history.` },
  };
  const r = reasons[reason] || reasons.habits;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000c", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: "#111827", border: "1px solid #374151", borderRadius: "20px", padding: "32px", width: "100%", maxWidth: "380px", textAlign: "center" }}>
        <div style={{ fontSize: "40px", marginBottom: "16px" }}>{r.icon}</div>
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "20px", color: "#f9fafb", marginBottom: "10px", letterSpacing: "-0.02em" }}>{r.title}</h2>
        <p style={{ color: "#6b7280", fontSize: "14px", lineHeight: 1.6, marginBottom: "24px" }}>{r.desc}</p>
        <div style={{ background: "#0d1117", border: "1px solid #2563eb30", borderRadius: "12px", padding: "16px", marginBottom: "24px" }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "32px", color: "#f9fafb" }}>99p<span style={{ fontSize: "14px", color: "#6b7280", fontWeight: 500 }}> / month</span></div>
          <div style={{ color: "#10b981", fontSize: "12px", fontWeight: 600, marginTop: "4px" }}>🔥 Founder pricing — lock it in forever</div>
        </div>
        <button onClick={onUpgrade} style={{ width: "100%", padding: "13px", borderRadius: "10px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "15px", cursor: "pointer", fontFamily: "inherit", marginBottom: "10px" }}>Upgrade to Pro →</button>
        <button onClick={onClose} style={{ width: "100%", padding: "11px", borderRadius: "10px", border: "1px solid #374151", background: "transparent", color: "#6b7280", fontWeight: 600, fontSize: "14px", cursor: "pointer", fontFamily: "inherit" }}>Maybe later</button>
      </div>
    </div>
  );
}