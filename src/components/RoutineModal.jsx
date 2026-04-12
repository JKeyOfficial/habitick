import { useState } from 'react';
import { S, ROUTINE_EMOJIS } from '../utils/constants.js';

export function RoutineModal({ routine, habitsList, onSave, onClose, onEject }) {
  const [name, setName] = useState(routine?.name || "");
  const [emoji, setEmoji] = useState(routine?.emoji || "📋");
  const routineHabits = habitsList?.filter(h => h.routine_id === routine?.id) || [];

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div style={{ background: "#111827", border: "1px solid #374151", borderRadius: "16px", padding: "28px", width: "100%", maxWidth: "380px", maxHeight: "90vh", overflowY: "auto" }}>
        <h2 style={{ margin: "0 0 20px", color: "#f9fafb", fontSize: "18px", fontFamily: "'Syne', sans-serif", fontWeight: 800 }}>{routine ? "Edit Routine" : "New Routine"}</h2>
        <label style={S.label}>Routine name</label>
        <input value={name} onChange={e => setName(e.target.value)} style={{ ...S.input, marginBottom: "18px" }} placeholder="e.g. Morning Routine" autoFocus={!routine} onKeyDown={e => e.key === "Enter" && name.trim() && onSave({ name: name.trim(), emoji })} />
        <label style={S.label}>Icon</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "24px", marginTop: "8px" }}>
          {ROUTINE_EMOJIS.map(e => (
            <button key={e} onClick={() => setEmoji(e)} style={{ width: "40px", height: "40px", borderRadius: "10px", border: `2px solid ${emoji === e ? "#2563eb" : "#1f2937"}`, background: emoji === e ? "#1d4ed820" : "#1f2937", fontSize: "20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>{e}</button>
          ))}
        </div>
        {routine && routineHabits.length > 0 && (
          <>
            <label style={{ ...S.label, marginBottom: "10px", display: "block" }}>Habits in this routine</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "20px" }}>
              {routineHabits.map(h => (
                <div key={h.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0d1117", border: "1px solid #1f2937", borderRadius: "8px", padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#2563eb" }} />
                    <span style={{ color: "#e5e7eb", fontSize: "14px", fontWeight: 600 }}>{h.name}</span>
                  </div>
                  <button onClick={() => onEject(h.id)} style={{ background: "none", border: "1px solid #374151", borderRadius: "6px", color: "#6b7280", fontSize: "11px", fontWeight: 600, cursor: "pointer", padding: "3px 8px", fontFamily: "inherit" }}>↗ Remove</button>
                </div>
              ))}
            </div>
          </>
        )}
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={onClose} style={S.btnSecondary}>Cancel</button>
          <button onClick={() => { if (name.trim()) onSave({ name: name.trim(), emoji }); }} style={S.btnPrimary}>{routine ? "Save" : "Create Routine"}</button>
        </div>
      </div>
    </div>
  );
}