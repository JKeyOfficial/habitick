import { LIFETIME_USER_LIMIT } from '../utils/constants.js';

export function LifetimeBanner({ userNumber, onDismiss }) {
  return (
    <div style={{ background: "linear-gradient(90deg, #1d4ed820 0%, #065f4620 100%)", borderBottom: "1px solid #2563eb30", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ fontSize: "18px" }}>🎉</span>
        <div>
          <span style={{ color: "#f9fafb", fontWeight: 700, fontSize: "13px" }}>
            You're user #{userNumber} of {LIFETIME_USER_LIMIT} — you have <span style={{ color: "#10b981" }}>free premium for life</span>.
          </span>
          <span style={{ color: "#6b7280", fontSize: "12px", marginLeft: "8px" }}>No card needed. Ever.</span>
        </div>
      </div>
      <button onClick={onDismiss} style={{ background: "none", border: "none", color: "#4b5563", cursor: "pointer", fontSize: "16px", padding: "2px 6px", borderRadius: "4px", lineHeight: 1 }}>✕</button>
    </div>
  );
}