import { useState } from 'react';
import { S, ROUTINE_EMOJIS } from '../utils/constants.js';

export function RoutineModal({ routine, habitsList, profile, onSave, onDelete, onClose, onEject }) {
  const [name, setName] = useState(routine?.name || "");
  const [emoji, setEmoji] = useState(routine?.emoji || "📋");
  const routineHabits = habitsList?.filter(h => h.routine_id === routine?.id) || [];

  const recommendedRoutines = [
    { name: "Morning Routine", emoji: "🌅", desc: "Start your day with clarity" },
    { name: "Deep Work Routine", emoji: "💻", desc: "Maintain focus and output" },
    { name: "Wind-down Routine", emoji: "🌙", desc: "Perfect sleep preparation" }
  ];

  const handleSelectRec = (rec) => {
    setName(rec.name);
    setEmoji(rec.emoji);
  };

  return (
    <div style={{ 
      position: "fixed", 
      inset: 0, 
      background: "var(--ht-modal-overlay)", 
      backdropFilter: "blur(12px)",
      zIndex: 20000, 
      display: "flex", 
      alignItems: "center", 
      justifyContent: "center", 
      padding: "16px" 
    }}>
      <div 
        style={{ 
          background: "var(--ht-modal-bg)", 
          border: "1px solid var(--ht-border-card)", 
          borderRadius: "24px", 
          padding: "28px", 
          width: "100%", 
          maxWidth: "420px", 
          maxHeight: "90vh", 
          overflowY: "auto",
          boxShadow: "var(--ht-shadow-card)",
          animation: "scaleUp 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)"
        }}
      >
        <h2 style={{ 
          margin: "0 0 20px", 
          color: "var(--ht-text-primary)", 
          fontSize: "20px", 
          fontFamily: "'Syne', sans-serif", 
          fontWeight: 800,
          letterSpacing: "-0.02em"
        }}>
          {routine ? "Edit Routine" : "New Routine"}
        </h2>

        {/* Recommendations Section */}
        {!routine && (
          <div style={{ marginBottom: "20px" }}>
            <span style={{ 
              color: "#a78bfa", 
              fontSize: "11px", 
              fontWeight: 800, 
              textTransform: "uppercase", 
              letterSpacing: "0.08em", 
              display: "block", 
              marginBottom: "8px" 
            }}>
              Suggested Routines
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {recommendedRoutines.map((rec, i) => (
                <button
                  key={i}
                  onClick={() => handleSelectRec(rec)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: "12px",
                    border: "1px solid var(--ht-border-card)",
                    background: "var(--ht-bg-card-subtle)",
                    color: "var(--ht-text-primary)",
                    fontSize: "12.5px",
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.15s",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    textAlign: "left",
                    width: "100%",
                    fontFamily: "inherit"
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = "translateX(4px)";
                    e.currentTarget.style.background = "var(--ht-bg-card-hover)";
                    e.currentTarget.style.borderColor = "rgba(37, 99, 235, 0.3)";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = "none";
                    e.currentTarget.style.background = "var(--ht-bg-card-subtle)";
                    e.currentTarget.style.borderColor = "var(--ht-border-card)";
                  }}
                >
                  <span style={{ fontSize: "20px" }}>{rec.emoji}</span>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ color: "var(--ht-text-primary)" }}>{rec.name}</span>
                    <span style={{ fontSize: "10.5px", color: "var(--ht-text-muted)", fontWeight: 500 }}>{rec.desc}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <label style={S.label}>Routine name</label>
        <input 
          value={name} 
          onChange={e => setName(e.target.value)} 
          style={{ 
            ...S.input, 
            background: "var(--ht-bg-input)",
            border: "1px solid var(--ht-border-card)",
            marginBottom: "18px",
            fontSize: "15px"
          }} 
          placeholder="e.g. Morning Routine" 
          autoFocus={!routine} 
          onKeyDown={e => e.key === "Enter" && name.trim() && onSave({ name: name.trim(), emoji })} 
        />

        <label style={S.label}>Icon</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "24px", marginTop: "8px" }}>
          {ROUTINE_EMOJIS.map(e => (
            <button 
              key={e} 
              onClick={() => setEmoji(e)} 
              style={{ 
                width: "42px", 
                height: "42px", 
                borderRadius: "10px", 
                border: `2px solid ${emoji === e ? "#2563eb" : "var(--ht-border-card)"}`, 
                background: emoji === e ? "rgba(37, 99, 235, 0.15)" : "var(--ht-bg-card-subtle)", 
                fontSize: "20px", 
                cursor: "pointer", 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center", 
                transition: "all 0.15s" 
              }}
            >
              {e}
            </button>
          ))}
        </div>

        {routine && routineHabits.length > 0 && (
          <div style={{ marginBottom: "20px" }}>
            <label style={{ ...S.label, marginBottom: "8px", display: "block" }}>Habits in this routine</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {routineHabits.map(h => (
                <div 
                  key={h.id} 
                  style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "space-between", 
                    background: "var(--ht-bg-card-subtle)", 
                    border: "1px solid var(--ht-border-card)", 
                    borderRadius: "10px", 
                    padding: "10px 12px" 
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#2563eb" }} />
                    <span style={{ color: "var(--ht-text-primary)", fontSize: "14px", fontWeight: 600 }}>{h.name}</span>
                  </div>
                  <button 
                    onClick={() => onEject(h.id)} 
                    style={{ 
                      background: "none", 
                      border: "1px solid var(--ht-border-card)", 
                      borderRadius: "6px", 
                      color: "var(--ht-text-secondary)", 
                      fontSize: "11px", 
                      fontWeight: 600, 
                      cursor: "pointer", 
                      padding: "3px 8px", 
                      fontFamily: "inherit" 
                    }}
                  >
                    ↗ Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", gap: "10px" }}>
            <button 
              onClick={onClose} 
              style={{ 
                ...S.btnSecondary, 
                flex: 1,
                padding: "12px",
                borderRadius: "12px",
                fontWeight: 700,
                fontSize: "14px",
                border: "1px solid var(--ht-border-card)"
              }}
            >
              Cancel
            </button>
            <button 
              onClick={() => { if (name.trim()) onSave({ name: name.trim(), emoji }); }} 
              style={{ 
                ...S.btnPrimary, 
                flex: 1,
                padding: "12px",
                borderRadius: "12px",
                fontWeight: 700,
                fontSize: "14px",
                background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                border: "none"
              }}
            >
              {routine ? "Save Changes" : "Create Routine"}
            </button>
          </div>
          {routine && onDelete && (
            <button 
              onClick={() => {
                if (confirm("Are you sure you want to delete this routine? (The habits inside it will not be deleted, they will just be removed from this routine)")) {
                  onDelete(routine.id);
                }
              }} 
              style={{ 
                width: "100%", 
                padding: "12px", 
                borderRadius: "12px", 
                border: "1px solid #7f1d1d", 
                background: "transparent", 
                color: "#f87171", 
                fontWeight: 700, 
                fontSize: "13px", 
                cursor: "pointer", 
                fontFamily: "inherit",
                transition: "all 0.15s",
                marginTop: "4px"
              }}
            >
              Delete Routine
            </button>
          )}
        </div>
      </div>
    </div>
  );
}