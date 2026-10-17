import { useState } from 'react';
import { S, ROUTINE_EMOJIS, DAYS_SHORT } from '../utils/constants.js';

export function RoutineModal({ routine, habitsList, profile, onSave, onDelete, onClose, onEject, onEditHabit, onDeleteHabit }) {
  const [name, setName] = useState(routine?.name || "");
  const [emoji, setEmoji] = useState(routine?.emoji || "📋");
  const routineHabits = habitsList?.filter(h => h.routine_id === routine?.id) || [];

  // Inline editing state — only one habit expands at a time (accordion)
  const [expandedHabitId, setExpandedHabitId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editFrequency, setEditFrequency] = useState("daily");
  const [editDays, setEditDays] = useState([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const openHabitEdit = (h) => {
    if (expandedHabitId === h.id) {
      setExpandedHabitId(null);
      setConfirmDeleteId(null);
      return;
    }
    setExpandedHabitId(h.id);
    setEditName(h.name || "");
    setEditFrequency(h.frequency || "daily");
    setEditDays(h.days || []);
    setConfirmDeleteId(null);
  };

  const toggleEditDay = (i) => setEditDays(prev => prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i]);

  const handleSaveHabitEdit = (habitId) => {
    if (!editName.trim()) return;
    onEditHabit(habitId, {
      name: editName.trim(),
      frequency: editFrequency,
      days: editFrequency === "weekly" ? editDays : []
    });
    setExpandedHabitId(null);
  };

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
              {routineHabits.map(h => {
                const isExpanded = expandedHabitId === h.id;
                const isConfirmingDelete = confirmDeleteId === h.id;
                return (
                  <div 
                    key={h.id} 
                    style={{ 
                      background: "var(--ht-bg-card-subtle)", 
                      border: `1px solid ${isExpanded ? "rgba(37, 99, 235, 0.4)" : "var(--ht-border-card)"}`, 
                      borderRadius: "12px", 
                      overflow: "hidden",
                      transition: "border-color 0.2s ease"
                    }}
                  >
                    {/* Habit row header */}
                    <div 
                      style={{ 
                        display: "flex", 
                        alignItems: "center", 
                        justifyContent: "space-between", 
                        padding: "10px 12px",
                        cursor: "pointer",
                        minHeight: "44px"
                      }}
                      onClick={() => openHabitEdit(h)}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
                        <div style={{ 
                          width: "6px", 
                          height: "6px", 
                          borderRadius: "50%", 
                          background: isExpanded ? "#60a5fa" : "#2563eb",
                          flexShrink: 0,
                          transition: "background 0.2s"
                        }} />
                        <span style={{ 
                          color: "var(--ht-text-primary)", 
                          fontSize: "14px", 
                          fontWeight: 600,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}>{h.name}</span>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); openHabitEdit(h); }}
                        style={{ 
                          background: isExpanded ? "rgba(37, 99, 235, 0.15)" : "none", 
                          border: `1px solid ${isExpanded ? "rgba(37, 99, 235, 0.3)" : "var(--ht-border-card)"}`, 
                          borderRadius: "8px", 
                          color: isExpanded ? "#60a5fa" : "var(--ht-text-secondary)", 
                          fontSize: "12px", 
                          fontWeight: 600, 
                          cursor: "pointer", 
                          padding: "6px 10px", 
                          fontFamily: "inherit",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                          transition: "all 0.2s ease",
                          minHeight: "32px",
                          flexShrink: 0
                        }}
                      >
                        <span style={{ fontSize: "12px" }}>✏️</span>
                        <span>{isExpanded ? "Close" : "Edit"}</span>
                      </button>
                    </div>

                    {/* Expanded inline editor */}
                    {isExpanded && (
                      <div style={{ 
                        padding: "0 12px 14px",
                        borderTop: "1px solid var(--ht-border-card)",
                        animation: "fadeSlideDown 0.2s ease-out"
                      }}>
                        {/* Habit Name */}
                        <div style={{ marginTop: "12px" }}>
                          <label style={{ 
                            ...S.label, 
                            fontSize: "11px", 
                            marginBottom: "4px", 
                            display: "block" 
                          }}>Habit name</label>
                          <input
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            style={{
                              ...S.input,
                              background: "var(--ht-bg-input)",
                              border: "1px solid var(--ht-border-card)",
                              fontSize: "13.5px",
                              padding: "8px 10px",
                              width: "100%",
                              boxSizing: "border-box"
                            }}
                            placeholder="Habit name"
                            onKeyDown={e => e.key === "Enter" && handleSaveHabitEdit(h.id)}
                            onClick={e => e.stopPropagation()}
                          />
                        </div>

                        {/* Frequency */}
                        <div style={{ marginTop: "10px" }}>
                          <label style={{ 
                            ...S.label, 
                            fontSize: "11px", 
                            marginBottom: "4px", 
                            display: "block" 
                          }}>Frequency</label>
                          <div style={{ display: "flex", gap: "6px" }}>
                            {["daily", "weekly"].map(f => (
                              <button
                                key={f}
                                onClick={(e) => { e.stopPropagation(); setEditFrequency(f); }}
                                style={{
                                  flex: 1,
                                  padding: "7px",
                                  borderRadius: "8px",
                                  border: "1px solid",
                                  borderColor: editFrequency === f ? "#2563eb" : "var(--ht-border-card)",
                                  background: editFrequency === f ? "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)" : "var(--ht-bg-card-subtle)",
                                  color: editFrequency === f ? "#fff" : "var(--ht-text-secondary)",
                                  cursor: "pointer",
                                  fontWeight: 700,
                                  fontSize: "12px",
                                  textTransform: "capitalize",
                                  fontFamily: "inherit",
                                  transition: "all 0.15s",
                                  minHeight: "34px"
                                }}
                              >
                                {f}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Day selector (weekly only) */}
                        {editFrequency === "weekly" && (
                          <div style={{ marginTop: "10px" }}>
                            <label style={{ 
                              ...S.label, 
                              fontSize: "11px", 
                              marginBottom: "4px", 
                              display: "block" 
                            }}>Select days</label>
                            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                              {DAYS_SHORT.map((d, i) => (
                                <button
                                  key={i}
                                  onClick={(e) => { e.stopPropagation(); toggleEditDay(i); }}
                                  style={{
                                    width: "34px",
                                    height: "34px",
                                    borderRadius: "50%",
                                    border: "1px solid",
                                    borderColor: editDays.includes(i) ? "#2563eb" : "var(--ht-border-card)",
                                    background: editDays.includes(i) ? "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)" : "var(--ht-bg-card-subtle)",
                                    color: editDays.includes(i) ? "#fff" : "var(--ht-text-secondary)",
                                    cursor: "pointer",
                                    fontSize: "11px",
                                    fontWeight: 700,
                                    fontFamily: "inherit",
                                    transition: "all 0.15s",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center"
                                  }}
                                >
                                  {d[0]}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Action buttons */}
                        <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                          {/* Save edit */}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleSaveHabitEdit(h.id); }}
                            style={{
                              width: "100%",
                              padding: "9px",
                              borderRadius: "8px",
                              border: "none",
                              background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                              color: "#fff",
                              fontWeight: 700,
                              fontSize: "12.5px",
                              cursor: "pointer",
                              fontFamily: "inherit",
                              transition: "all 0.15s",
                              minHeight: "36px"
                            }}
                          >
                            Save Changes
                          </button>

                          {/* Secondary actions row */}
                          <div style={{ display: "flex", gap: "6px" }}>
                            {/* Remove from routine */}
                            <button
                              onClick={(e) => { e.stopPropagation(); onEject(h.id); setExpandedHabitId(null); }}
                              style={{
                                flex: 1,
                                padding: "8px 6px",
                                borderRadius: "8px",
                                border: "1px solid var(--ht-border-card)",
                                background: "transparent",
                                color: "var(--ht-text-secondary)",
                                fontWeight: 600,
                                fontSize: "11px",
                                cursor: "pointer",
                                fontFamily: "inherit",
                                transition: "all 0.15s",
                                minHeight: "36px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "4px"
                              }}
                            >
                              <span style={{ fontSize: "11px" }}>↗</span>
                              Remove from routine
                            </button>

                            {/* Delete habit */}
                            {!isConfirmingDelete ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(h.id); }}
                                style={{
                                  flex: 1,
                                  padding: "8px 6px",
                                  borderRadius: "8px",
                                  border: "1px solid rgba(127, 29, 29, 0.4)",
                                  background: "transparent",
                                  color: "#f87171",
                                  fontWeight: 600,
                                  fontSize: "11px",
                                  cursor: "pointer",
                                  fontFamily: "inherit",
                                  transition: "all 0.15s",
                                  minHeight: "36px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: "4px"
                                }}
                              >
                                <span style={{ fontSize: "12px" }}>🗑</span>
                                Delete habit
                              </button>
                            ) : (
                              <button
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  onDeleteHabit(h.id); 
                                  setExpandedHabitId(null); 
                                  setConfirmDeleteId(null); 
                                }}
                                style={{
                                  flex: 1,
                                  padding: "8px 6px",
                                  borderRadius: "8px",
                                  border: "1px solid #dc2626",
                                  background: "rgba(220, 38, 38, 0.12)",
                                  color: "#f87171",
                                  fontWeight: 700,
                                  fontSize: "11px",
                                  cursor: "pointer",
                                  fontFamily: "inherit",
                                  transition: "all 0.15s",
                                  minHeight: "36px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: "4px",
                                  animation: "fadeSlideDown 0.15s ease-out"
                                }}
                              >
                                ⚠️ Tap to confirm
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
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