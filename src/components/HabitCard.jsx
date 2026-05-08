import { useState } from 'react';
import { DAYS_SHORT, S } from '../utils/constants.js';
import { MiniCalendar } from './MiniCalendar.jsx';

export function HabitCard({ habit, today, onToggle, onDelete, onEdit, isPaused, pausePeriods, isPremium, shieldedDates, draggable: isDraggable, onDragStart, onDragEnd, onDragEnter, isDropTarget, onEjectFromRoutine, inRoutine, dragHandleProps }) {
  const [calOpen, setCalOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const todayDow = new Date().getDay();
  const isScheduledToday = habit.frequency === "daily" || (habit.days && habit.days.includes(todayDow));
  const doneToday = habit.completedDates?.includes(today);

  return (
    <div
      onDragEnter={e => { e.preventDefault(); if (onDragEnter) onDragEnter(habit.id); }}
      onDragLeave={e => {
        e.preventDefault();
        if (e.currentTarget.contains(e.relatedTarget)) return;
        if (onDragEnter) onDragEnter(null);
      }}
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); }}
      style={{ 
        background: "#111827", 
        border: `1px solid ${isDropTarget ? "#2563eb" : "#1f2937"}`, 
        borderRadius: "16px", 
        padding: "16px", 
        minWidth: "240px", 
        flex: "1 1 260px", 
        maxWidth: "340px", 
        boxShadow: isDropTarget ? "0 0 0 2px #2563eb40" : "0 4px 12px rgba(0,0,0,0.2)", 
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)", 
        display: "flex", 
        flexDirection: "column",
        position: "relative"
      }}>

      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: calOpen ? "12px" : "0", minHeight: "60px" }}>
        <div onClick={() => setCalOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, cursor: "pointer", userSelect: "none" }}>
          <div 
            {...dragHandleProps} 
            style={{ color: "#374151", fontSize: "16px", cursor: "grab", padding: "4px", marginLeft: "-4px" }}
            onClick={e => e.stopPropagation()}
          >
            ⠿
          </div>
          <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: doneToday ? "#10b981" : "#2563eb", flexShrink: 0, boxShadow: `0 0 10px ${doneToday ? "#10b98166" : "#2563eb66"}` }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "15px", color: "#f9fafb", letterSpacing: "-0.01em", lineHeight: 1.2 }}>{habit.name}</div>
            <div style={{ display: "flex", gap: "6px", marginTop: "6px", flexWrap: "wrap" }}>
              {habit.frequency === "weekly" && habit.days && DAYS_SHORT.map((d, i) => (
                <span key={i} style={{ fontSize: "9px", padding: "2px 6px", borderRadius: "999px", fontWeight: 700, background: habit.days.includes(i) ? "#2563eb20" : "transparent", border: "1px solid", borderColor: habit.days.includes(i) ? "#2563eb" : "#1f2937", color: habit.days.includes(i) ? "#60a5fa" : "#4b5563" }}>{d}</span>
              ))}
              {habit.frequency === "daily" && <span style={{ fontSize: "9px", padding: "2px 8px", borderRadius: "999px", background: "#2563eb20", border: "1px solid #2563eb", color: "#60a5fa", fontWeight: 700 }}>Daily</span>}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "4px", marginLeft: "8px" }}>
          <button onClick={e => { e.stopPropagation(); onEdit(habit); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#4b5563", fontSize: "14px", padding: "4px", borderRadius: "6px", transition: "color 0.2s" }}>✏️</button>
          {confirmDelete ? (
            <div style={{ display: "flex", gap: "4px" }}>
              <button onClick={e => { e.stopPropagation(); onDelete(habit.id); }} style={{ background: "#7f1d1d", border: "1px solid #f8717133", borderRadius: "6px", color: "#f87171", fontSize: "10px", fontWeight: 700, cursor: "pointer", padding: "4px 8px" }}>Delete</button>
              <button onClick={e => { e.stopPropagation(); setConfirmDelete(false); }} style={{ background: "#1f2937", border: "1px solid #374151", borderRadius: "6px", color: "#9ca3af", fontSize: "10px", fontWeight: 700, cursor: "pointer", padding: "4px 8px" }}>Esc</button>
            </div>
          ) : (
            <button onClick={e => { e.stopPropagation(); setConfirmDelete(true); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#4b5563", fontSize: "14px", padding: "4px", borderRadius: "6px" }}>✕</button>
          )}
        </div>
      </div>

      {/* Collapsible calendar */}
      {calOpen && (
        <div style={{ marginTop: "8px", borderTop: "1px solid #1f2937", paddingTop: "12px" }}>
          <MiniCalendar habit={habit} today={today} pausePeriods={pausePeriods || []} isPremium={isPremium} onToggle={date => onToggle(habit.id, date)} shieldedDates={shieldedDates} />
        </div>
      )}

      {isScheduledToday && !isPaused && (
        <button onClick={() => onToggle(habit.id, today)}
          style={{ width: "100%", marginTop: "16px", padding: "12px", borderRadius: "10px", border: "none", cursor: "pointer", fontWeight: 800, fontSize: "13px", background: doneToday ? "#10b98120" : "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)", color: doneToday ? "#10b981" : "#fff", transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", boxShadow: doneToday ? "none" : "0 4px 12px rgba(37,99,235,0.3)" }}>
          {doneToday ? "✓ COMPLETED" : "MARK AS DONE"}
        </button>
      )}
    </div>
  );
}