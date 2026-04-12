import { useState } from 'react';
import { DAYS_SHORT, S } from '../utils/constants.js';
import { MiniCalendar } from './MiniCalendar.jsx';

export function HabitCard({ habit, today, onToggle, onDelete, onEdit, isPaused, pausePeriods, isPremium, shieldedDates, draggable: isDraggable, onDragStart, onDragEnd, onDragEnter, isDropTarget, onEjectFromRoutine, inRoutine }) {
  const [isDragging, setIsDragging] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const todayDow = new Date().getDay();
  const isScheduledToday = habit.frequency === "daily" || (habit.days && habit.days.includes(todayDow));
  const doneToday = habit.completedDates?.includes(today);

  const handleDragStart = e => {
    const ghost = new Image();
    ghost.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=";
    e.dataTransfer.setDragImage(ghost, 0, 0);
    e.dataTransfer.setData("text/plain", habit.id);
    e.dataTransfer.setData("habitId", habit.id);
    setIsDragging(true);
    if (onDragStart) onDragStart(habit.id, habit);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    if (onDragEnd) onDragEnd();
  };

  return (
    <div
      draggable={isDraggable}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragEnter={e => { e.preventDefault(); if (onDragEnter) onDragEnter(habit.id); }}
      onDragLeave={e => {
        e.preventDefault();
        if (e.currentTarget.contains(e.relatedTarget)) return;
        if (onDragEnter) onDragEnter(null);
      }}
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); }}
      style={{ background: "#111827", border: `1px solid ${isDropTarget ? "#2563eb" : "#1f2937"}`, borderRadius: "14px", padding: "18px", minWidth: "240px", flex: "1 1 260px", maxWidth: "340px", boxShadow: isDropTarget ? "0 0 0 2px #2563eb40" : "0 1px 3px rgba(0,0,0,0.3)", transition: "border-color 0.15s, box-shadow 0.15s, opacity 0.2s", display: "flex", flexDirection: "column", opacity: isDragging ? 0.35 : 1, cursor: isDraggable ? "grab" : "default" }}>

      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: calOpen ? "10px" : "0", minHeight: "72px" }}>
        <div onClick={() => setCalOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, cursor: "pointer", userSelect: "none" }}>
          {isDraggable && <span style={{ color: "#374151", fontSize: "14px", cursor: "grab", userSelect: "none" }} onClick={e => e.stopPropagation()}>⠿</span>}
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: doneToday ? "#10b981" : "#2563eb", flexShrink: 0, marginTop: "1px" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "15px", color: "#f9fafb", letterSpacing: "-0.01em" }}>{habit.name}</div>
            {habit.frequency === "weekly" && habit.days && (
              <div style={{ display: "flex", gap: "4px", marginTop: "6px", flexWrap: "wrap" }}>
                {DAYS_SHORT.map((d, i) => <span key={i} style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "999px", fontWeight: 600, background: habit.days.includes(i) ? "#2563eb" : "#1f293700", border: "1px solid", borderColor: habit.days.includes(i) ? "#2563eb" : "#1f2937", color: habit.days.includes(i) ? "#fff" : "#4b5563" }}>{d}</span>)}
              </div>
            )}
            {habit.frequency === "daily" && <span style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "999px", background: "#2563eb", border: "1px solid #2563eb", color: "#fff", fontWeight: 600, marginTop: "6px", display: "inline-block" }}>Daily</span>}
          </div>
          <span style={{ color: "#374151", fontSize: "12px", marginLeft: "4px" }}>{calOpen ? "▲" : "▼"}</span>
        </div>
        <div style={{ display: "flex", gap: "4px", marginLeft: "8px" }}>
          <button onClick={e => { e.stopPropagation(); onEdit(habit); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#4b5563", fontSize: "13px", padding: "4px", borderRadius: "6px" }}>✏️</button>
          {confirmDelete ? (
            <>
              <button onClick={e => { e.stopPropagation(); onDelete(habit.id); }} style={{ background: "#7f1d1d", border: "1px solid #f87171", borderRadius: "6px", color: "#f87171", fontSize: "11px", fontWeight: 700, cursor: "pointer", padding: "3px 8px", fontFamily: "inherit" }}>Delete</button>
              <button onClick={e => { e.stopPropagation(); setConfirmDelete(false); }} style={{ background: "none", border: "1px solid #374151", borderRadius: "6px", color: "#6b7280", fontSize: "11px", fontWeight: 700, cursor: "pointer", padding: "3px 8px", fontFamily: "inherit" }}>Cancel</button>
            </>
          ) : (
            <button onClick={e => { e.stopPropagation(); setConfirmDelete(true); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#4b5563", fontSize: "13px", padding: "4px", borderRadius: "6px" }}>✕</button>
          )}
        </div>
      </div>

      {/* Collapsible calendar */}
      {calOpen && (
        <div style={{ flex: 1 }}>
          <MiniCalendar habit={habit} today={today} pausePeriods={pausePeriods || []} isPremium={isPremium} onToggle={date => onToggle(habit.id, date)} />
        </div>
      )}

      {isScheduledToday && !isPaused && (
        <button onClick={() => onToggle(habit.id, today)}
          style={{ width: "100%", marginTop: "12px", padding: "10px", borderRadius: "8px", border: "1px solid", cursor: "pointer", fontWeight: 700, fontSize: "13px", fontFamily: "inherit", background: doneToday ? "#10b98120" : "#2563eb", borderColor: doneToday ? "#10b98140" : "#2563eb", color: doneToday ? "#10b981" : "#fff", transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
          {doneToday ? "✓ Done!" : "Mark as Done Today"}
        </button>
      )}
    </div>
  );
}