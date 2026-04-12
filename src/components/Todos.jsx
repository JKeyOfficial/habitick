import { useState } from 'react';
import { getTodayStr, getDateStr, parseDateLocal } from '../utils/helpers.js';
import { S } from '../utils/constants.js';

function formatDueDate(dueDate, dueTime) {
  if (!dueDate) return null;
  const today = getTodayStr();
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return getDateStr(d); })();
  const dayLabel = dueDate === today ? "Today" : dueDate === tomorrow ? "Tomorrow" : parseDateLocal(dueDate).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  return dueTime ? `${dayLabel} at ${dueTime}` : dayLabel;
}

export function TodoItem({ todo, onToggle, onDelete, onEdit }) {
  const today = getTodayStr();
  const isOverdue = !todo.done && todo.due_date && todo.due_date < today;
  const isDueToday = !todo.done && todo.due_date === today;
  const dueLabel = formatDueDate(todo.due_date, todo.due_time);

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "14px 16px", background: "#111827", border: `1px solid ${isOverdue ? "#7f1d1d60" : "#1f2937"}`, borderRadius: "12px", marginBottom: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "border-color 0.15s" }}>
      <button onClick={() => onToggle(todo.id)} style={{ width: "20px", height: "20px", borderRadius: "6px", border: "1.5px solid", borderColor: todo.done ? "#10b981" : "#374151", background: todo.done ? "#10b981" : "transparent", cursor: "pointer", flexShrink: 0, marginTop: "1px", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "11px", fontWeight: 900, transition: "all 0.15s" }}>{todo.done ? "✓" : ""}</button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", color: todo.done ? "#4b5563" : "#e5e7eb", fontSize: "14px", textDecoration: todo.done ? "line-through" : "none" }}>{todo.text}</span>
        {dueLabel && !todo.done && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", marginTop: "5px", fontSize: "11px", fontWeight: 600, color: isOverdue ? "#f87171" : isDueToday ? "#fcd34d" : "#6b7280" }}>
            {isOverdue ? "⚠️" : "🕐"} {dueLabel}
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
        {todo.priority && <span style={{ fontSize: "10px", padding: "3px 10px", borderRadius: "999px", fontWeight: 700, border: "1px solid", background: todo.priority === "high" ? "#7f1d1d30" : todo.priority === "med" ? "#78350f30" : "#1c3a2a30", borderColor: todo.priority === "high" ? "#fca5a540" : todo.priority === "med" ? "#fcd34d40" : "#86efac40", color: todo.priority === "high" ? "#fca5a5" : todo.priority === "med" ? "#fcd34d" : "#86efac" }}>{todo.priority}</span>}
        <button onClick={() => onEdit(todo)} style={{ background: "none", border: "none", cursor: "pointer", color: "#4b5563", fontSize: "13px", padding: "4px", borderRadius: "6px" }}>✏️</button>
        <button onClick={() => onDelete(todo.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#374151", fontSize: "13px", padding: "4px", borderRadius: "6px" }}>✕</button>
      </div>
    </div>
  );
}

export function TodoModal({ todo, onSave, onClose }) {
  const [text, setText] = useState(todo?.text || "");
  const [priority, setPriority] = useState(todo?.priority || "");
  const [dueDate, setDueDate] = useState(todo?.due_date || "");
  const [dueTime, setDueTime] = useState(todo?.due_time || "");

  const today = getTodayStr();
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return getDateStr(d); })();

  const inferDayMode = () => {
    if (!todo?.due_date) return "none";
    if (todo.due_date === today) return "today";
    if (todo.due_date === tomorrow) return "tomorrow";
    return "custom";
  };
  const [dayMode, setDayMode] = useState(inferDayMode);

  const handleDaySelect = (mode) => {
    if (dayMode === mode) { setDayMode("none"); setDueDate(""); setDueTime(""); return; }
    setDayMode(mode);
    if (mode === "today") setDueDate(today);
    else if (mode === "tomorrow") setDueDate(tomorrow);
    else if (mode === "custom") setDueDate("");
  };

  const dayOptions = [
    { label: "Today", mode: "today" },
    { label: "Tomorrow", mode: "tomorrow" },
    { label: "Custom", mode: "custom" },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div style={{ background: "#111827", border: "1px solid #374151", borderRadius: "16px", padding: "24px", width: "100%", maxWidth: "380px" }}>
        <h2 style={{ margin: "0 0 18px", color: "#f9fafb", fontSize: "18px", fontFamily: "'Syne', sans-serif", fontWeight: 800 }}>{todo ? "Edit To-Do" : "New To-Do"}</h2>

        <input value={text} onChange={e => setText(e.target.value)} style={{ ...S.input, marginBottom: "18px" }} placeholder="What needs to be done?" autoFocus onKeyDown={e => e.key === "Enter" && text.trim() && onSave({ text: text.trim(), priority, due_date: dueDate || null, due_time: dueTime || null })} />

        <label style={{ ...S.label, marginBottom: "8px" }}>Due day (optional)</label>
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
          {dayOptions.map(({ label, mode }) => (
            <button key={mode} onClick={() => handleDaySelect(mode)}
              style={{ flex: 1, padding: "8px 4px", borderRadius: "8px", border: "1px solid", borderColor: dayMode === mode ? "#2563eb" : "#374151", background: dayMode === mode ? "#1d4ed8" : "#1f2937", color: dayMode === mode ? "#fff" : "#9ca3af", cursor: "pointer", fontSize: "12px", fontWeight: 600, fontFamily: "inherit" }}>{label}</button>
          ))}
        </div>

        {dayMode === "custom" && (
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} min={today}
            style={{ ...S.input, marginBottom: "12px", colorScheme: "dark" }} />
        )}

        {dayMode !== "none" && (
          <>
            <label style={{ ...S.label, marginBottom: "8px" }}>Time (optional)</label>
            <input type="time" value={dueTime} onChange={e => setDueTime(e.target.value)}
              style={{ ...S.input, marginBottom: "18px", colorScheme: "dark" }} />
          </>
        )}

        <label style={{ ...S.label, marginBottom: "8px" }}>Priority (optional)</label>
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          {["", "high", "med", "low"].map(p => <button key={p} onClick={() => setPriority(p)} style={{ flex: 1, padding: "7px", borderRadius: "8px", border: "1px solid", borderColor: priority === p ? "#2563eb" : "#374151", background: priority === p ? "#1d4ed8" : "#1f2937", color: priority === p ? "#fff" : "#9ca3af", cursor: "pointer", fontSize: "12px", fontWeight: 600, fontFamily: "inherit" }}>{p === "" ? "None" : p[0].toUpperCase() + p.slice(1)}</button>)}
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={onClose} style={S.btnSecondary}>Cancel</button>
          <button onClick={() => { if (text.trim()) onSave({ text: text.trim(), priority, due_date: dueDate || null, due_time: dueTime || null }); }} style={S.btnPrimary}>{todo ? "Save" : "Add"}</button>
        </div>
      </div>
    </div>
  );
}