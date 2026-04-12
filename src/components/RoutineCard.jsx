import { useState } from 'react';
import { HabitCard } from './HabitCard.jsx';

export function RoutineCard({ routine, habits, today, onToggle, onDelete, onDeleteRoutine, onEdit, onEjectFromRoutine, isPaused, pausePeriods, isPremium, shieldedDates, dragState, dropTargetId, onDragStartHabit, onDragEndHabit, onDragEnterHabit, onDropOnRoutine, onDropOnStandalone, dragHandleProps }) {
  const [dragOver, setDragOver] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const todayDow = new Date().getDay();

  const scheduledHabits = habits.filter(h =>
    h.frequency === "daily" || (h.days && h.days.includes(todayDow))
  );
  const doneCount = scheduledHabits.filter(h => (h.completedDates || []).includes(today)).length;
  const totalCount = scheduledHabits.length;
  const allDone = totalCount > 0 && doneCount === totalCount;

  const handleDragOver = e => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = e => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDragOver(false);
  };
  const handleDrop = e => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (dragState) { onDropOnRoutine(dragState, routine.id); }
  };

  return (
    <div
      {...dragHandleProps}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        border: `2px solid ${allDone ? "#10b981" : dragOver ? "#2563eb" : "#1f2937"}`,
        borderRadius: "18px",
        padding: "18px",
        background: allDone ? "#10b98108" : dragOver ? "#2563eb08" : "#0d1117",
        transition: "border-color 0.3s, background 0.3s",
        position: "relative",
        height: "100%",
        boxSizing: "border-box",
        cursor: dragHandleProps ? "grab" : "default",
      }}>

      {/* Routine header */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: collapsed ? 0 : "16px" }}>
        <span style={{ fontSize: "20px" }}>{routine.emoji || "📋"}</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "16px", color: allDone ? "#10b981" : "#f9fafb", letterSpacing: "-0.01em" }}>{routine.name}</span>
            {allDone && <span style={{ fontSize: "12px", color: "#10b981", fontWeight: 700 }}>✓ Complete!</span>}
          </div>
          {totalCount > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
              <div style={{ flex: 1, maxWidth: "120px", height: "4px", borderRadius: "999px", background: "#1f2937", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${totalCount > 0 ? (doneCount / totalCount) * 100 : 0}%`, background: allDone ? "#10b981" : "#2563eb", borderRadius: "999px", transition: "width 0.4s ease" }} />
              </div>
              <span style={{ fontSize: "11px", color: "#6b7280", fontWeight: 600 }}>{doneCount}/{totalCount} done</span>
            </div>
          )}
        </div>
        <div onPointerDown={e => e.stopPropagation()} style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          <button onClick={() => onEdit(routine)} style={{ background: "none", border: "none", cursor: "pointer", color: "#4b5563", fontSize: "13px", padding: "4px 6px", borderRadius: "6px" }}>✏️</button>
          {confirmDelete ? (
            <>
              <button onClick={() => onDeleteRoutine(routine.id)} style={{ background: "#7f1d1d", border: "1px solid #f87171", borderRadius: "6px", color: "#f87171", fontSize: "11px", fontWeight: 700, cursor: "pointer", padding: "3px 8px", fontFamily: "inherit" }}>Delete</button>
              <button onClick={() => setConfirmDelete(false)} style={{ background: "none", border: "1px solid #374151", borderRadius: "6px", color: "#6b7280", fontSize: "11px", fontWeight: 700, cursor: "pointer", padding: "3px 8px", fontFamily: "inherit" }}>Cancel</button>
            </>
          ) : (
            <button onClick={() => setConfirmDelete(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "#4b5563", fontSize: "13px", padding: "4px 6px", borderRadius: "6px" }}>✕</button>
          )}
          <button onClick={() => setCollapsed(c => !c)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: "16px", padding: "4px 6px", borderRadius: "6px", lineHeight: 1 }}>{collapsed ? "›" : "‹"}</button>
        </div>
      </div>

      {/* Habits grid inside routine */}
      {!collapsed && (
        <>
          {habits.length === 0 ? (
            <div style={{ textAlign: "center", padding: "28px 16px", color: "#374151", fontSize: "14px", border: "1px dashed #1f2937", borderRadius: "12px", pointerEvents: "none" }}>
              Drag habits here to add them to this routine
            </div>
          ) : (
            <div className="ht-habit-grid" onPointerDown={e => e.stopPropagation()}>
              {habits.map(h => (
                <HabitCard
                  key={h.id}
                  habit={h}
                  today={today}
                  onToggle={onToggle}
                  onDelete={onDelete}
                  onEdit={onEdit}
                  isPaused={isPaused}
                  pausePeriods={pausePeriods}
                  isPremium={isPremium}
                  shieldedDates={shieldedDates}
                  draggable
                  onDragStart={onDragStartHabit}
                  onDragEnd={onDragEndHabit}
                  onDragEnter={onDragEnterHabit}
                  isDropTarget={dropTargetId === h.id && dragState !== h.id}
                  onEjectFromRoutine={onEjectFromRoutine}
                  inRoutine
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}