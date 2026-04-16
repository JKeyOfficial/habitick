import { useState } from 'react';
import { S, DAYS_SHORT } from '../utils/constants.js';

export function HabitModal({ habit, onSave, onClose }) {
  const [name, setName] = useState(habit?.name || "");
  const [frequency, setFrequency] = useState(habit?.frequency || "daily");
  const [days, setDays] = useState(habit?.days || []);
  const [reminderTime, setReminderTime] = useState(habit?.reminder_time || "");
  const toggleDay = i => setDays(prev => prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#111827", border: "1px solid #374151", borderRadius: "16px", padding: "28px", width: "360px", maxWidth: "90vw" }}>
        <h2 style={{ margin: "0 0 20px", color: "#f9fafb", fontSize: "18px" }}>{habit ? "Edit Habit" : "New Habit"}</h2>
        <label style={S.label}>Habit name</label>
        <input value={name} onChange={e => setName(e.target.value)} style={{ ...S.input, marginBottom: "14px" }} placeholder="e.g. Morning Run" autoFocus={!habit} />
        
        <label style={S.label}>Frequency</label>
        <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
          {["daily", "weekly"].map(f => <button key={f} onClick={() => setFrequency(f)} style={{ flex: 1, padding: "8px", borderRadius: "8px", border: "1px solid", borderColor: frequency === f ? "#2563eb" : "#374151", background: frequency === f ? "#1d4ed8" : "#1f2937", color: frequency === f ? "#fff" : "#9ca3af", cursor: "pointer", fontWeight: 600, fontSize: "13px", textTransform: "capitalize" }}>{f}</button>)}
        </div>
        
        {frequency === "weekly" && (
          <div style={{ marginBottom: "16px" }}>
            <label style={S.label}>Select days</label>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {DAYS_SHORT.map((d, i) => <button key={i} onClick={() => toggleDay(i)} style={{ padding: "6px 10px", borderRadius: "999px", border: "1px solid", borderColor: days.includes(i) ? "#2563eb" : "#374151", background: days.includes(i) ? "#2563eb" : "#1f2937", color: days.includes(i) ? "#fff" : "#9ca3af", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}>{d}</button>)}
            </div>
          </div>
        )}

        <div style={{ marginBottom: "16px" }}>
          <label style={S.label}>Daily Reminder Time (Optional)</label>
          <input 
            type="time" 
            value={reminderTime} 
            onChange={e => setReminderTime(e.target.value)} 
            style={{ ...S.input, colorScheme: "dark" }} 
          />
          <div style={{ fontSize: "11px", color: "#4b5563", marginTop: "4px" }}>We'll notify you at this time on scheduled days.</div>
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
          <button onClick={onClose} style={S.btnSecondary}>Cancel</button>
          <button onClick={() => { if (name.trim()) onSave({ name: name.trim(), frequency, days: frequency === "weekly" ? days : [], reminder_time: reminderTime || null }); }} style={S.btnPrimary}>{habit ? "Save" : "Add Habit"}</button>
        </div>
      </div>
    </div>

  );
}