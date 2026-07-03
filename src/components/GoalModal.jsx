import { useState } from 'react';
import { getTodayStr, getDateStr } from '../utils/helpers.js';
import { S } from '../utils/constants.js';

export function GoalModal({ goal, onSave, onClose }) {
  const [title, setTitle] = useState(goal?.title || "");
  const [description, setDescription] = useState(goal?.description || "");
  const [targetDate, setTargetDate] = useState(goal?.target_date || "");

  const today = getTodayStr();

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      description: description.trim() || null,
      target_date: targetDate || null,
    });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", backdropFilter: "blur(4px)" }}>
      <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "24px", width: "100%", maxWidth: "420px", boxShadow: "0 20px 40px rgba(0,0,0,0.5)" }}>
        <h2 style={{ margin: "0 0 20px", color: "#f9fafb", fontSize: "18px", fontFamily: "'Syne', sans-serif", fontWeight: 800 }}>
          {goal ? "Edit Goal" : "New Goal"}
        </h2>

        {/* Title */}
        <label style={{ ...S.label, marginBottom: "8px" }}>Goal Title</label>
        <input 
          value={title} 
          onChange={e => setTitle(e.target.value)} 
          style={{ ...S.input, marginBottom: "18px" }} 
          placeholder="e.g., Run a marathon, Pass Spanish exam" 
          autoFocus 
          onKeyDown={e => e.key === "Enter" && handleSave()} 
        />

        {/* Description */}
        <label style={{ ...S.label, marginBottom: "8px" }}>Description (optional)</label>
        <textarea 
          value={description} 
          onChange={e => setDescription(e.target.value)} 
          style={{ 
            ...S.input, 
            minHeight: "80px", 
            maxHeight: "150px", 
            resize: "vertical", 
            marginBottom: "18px",
            lineHeight: 1.4,
            padding: "10px 12px"
          }} 
          placeholder="e.g., Complete 26.2 miles in under 4 hours, obtain B2 certification" 
        />

        {/* Target Date */}
        <label style={{ ...S.label, marginBottom: "8px" }}>Target Date (optional)</label>
        <input 
          type="date" 
          value={targetDate} 
          onChange={e => setTargetDate(e.target.value)} 
          min={today}
          style={{ ...S.input, marginBottom: "24px", colorScheme: "dark" }} 
        />

        {/* Actions */}
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={onClose} style={S.btnSecondary}>Cancel</button>
          <button onClick={handleSave} disabled={!title.trim()} style={{ ...S.btnPrimary, opacity: !title.trim() ? 0.5 : 1 }}>
            {goal ? "Save Changes" : "Create Goal"}
          </button>
        </div>
      </div>
    </div>
  );
}
