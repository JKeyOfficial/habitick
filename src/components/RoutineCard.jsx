import { useState } from 'react';
import { HabitSortableItem } from './HabitSortableItem.jsx';
import { HabitCard } from './HabitCard.jsx';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

export function RoutineCard({ routine, habits, today, onToggle, onDelete, onDeleteRoutine, onEdit, onEjectFromRoutine, isPaused, pausePeriods, isPremium, shieldedDates, dragState, dropTargetId, onDragStartHabit, onDragEndHabit, onDragEnterHabit, onDropOnRoutine, onDropOnStandalone, dragHandleProps, isDraggingOverlay }) {
  const [collapsed, setCollapsed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const todayDow = new Date().getDay();

  const scheduledHabits = habits.filter(h =>
    h.frequency === "daily" || (h.days && h.days.includes(todayDow))
  );
  const doneCount = scheduledHabits.filter(h => (h.completedDates || []).includes(today)).length;
  const totalCount = scheduledHabits.length;
  const allDone = totalCount > 0 && doneCount === totalCount;

  const content = (
    <>
      {/* Routine header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: collapsed ? 0 : "20px" }}>
        <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: "#1f2937", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", boxShadow: "inset 0 1px 3px rgba(255,255,255,0.05)" }}>
          {routine.emoji || "📋"}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "17px", color: allDone ? "#10b981" : "#f9fafb", letterSpacing: "-0.01em" }}>{routine.name}</span>
            {allDone && <span style={{ fontSize: "11px", color: "#10b981", fontWeight: 800, background: "#10b98115", padding: "2px 8px", borderRadius: "999px" }}>COMPLETED</span>}
          </div>
          {totalCount > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "6px" }}>
              <div style={{ flex: 1, maxWidth: "140px", height: "5px", borderRadius: "999px", background: "#1f2937", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${totalCount > 0 ? (doneCount / totalCount) * 100 : 0}%`, background: allDone ? "#10b981" : "#2563eb", borderRadius: "999px", transition: "width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)" }} />
              </div>
              <span style={{ fontSize: "11px", color: "#6b7280", fontWeight: 700 }}>{doneCount}/{totalCount}</span>
            </div>
          )}
        </div>
        {!isDraggingOverlay && (
          <div onPointerDown={e => e.stopPropagation()} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <button onClick={() => onEdit(routine)} style={{ background: "none", border: "none", cursor: "pointer", color: "#4b5563", fontSize: "14px", padding: "6px", borderRadius: "8px", transition: "all 0.2s" }}>✏️</button>
            {confirmDelete ? (
              <div style={{ display: "flex", gap: "4px" }}>
                <button onClick={() => onDeleteRoutine(routine.id)} style={{ background: "#7f1d1d", border: "1px solid #f8717133", borderRadius: "8px", color: "#f87171", fontSize: "11px", fontWeight: 800, cursor: "pointer", padding: "4px 10px" }}>Delete</button>
                <button onClick={() => setConfirmDelete(false)} style={{ background: "#1f2937", border: "1px solid #374151", borderRadius: "8px", color: "#6b7280", fontSize: "11px", fontWeight: 800, cursor: "pointer", padding: "4px 10px" }}>No</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "#4b5563", fontSize: "14px", padding: "6px", borderRadius: "8px" }}>✕</button>
            )}
            <button onClick={() => setCollapsed(c => !c)} style={{ background: "#111827", border: "1px solid #1f2937", cursor: "pointer", color: "#6b7280", fontSize: "16px", width: "28px", height: "28px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>{collapsed ? "↓" : "↑"}</button>
          </div>
        )}
      </div>

      {/* Habits grid inside routine */}
      {!collapsed && (
        <div style={{ marginTop: "10px" }}>
          {habits.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "#374151", fontSize: "14px", border: "1px dashed #1f2937", borderRadius: "12px", pointerEvents: "none" }}>
              Drag habits here to organize
            </div>
          ) : (
            <div className="ht-habit-grid" onPointerDown={e => e.stopPropagation()}>
              {isDraggingOverlay ? (
                habits.map(h => (
                  <HabitCard 
                    key={h.id} 
                    habit={h} 
                    today={today} 
                    onToggle={() => {}} 
                    onDelete={() => {}} 
                    onEdit={() => {}} 
                    isPaused={isPaused} 
                    pausePeriods={pausePeriods} 
                    isPremium={isPremium} 
                    shieldedDates={shieldedDates} 
                  />
                ))
              ) : (
                <SortableContext items={habits.map(h => h.id)} strategy={verticalListSortingStrategy}>
                  {habits.map(h => (
                    <HabitSortableItem
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
                      onEjectFromRoutine={onEjectFromRoutine}
                      inRoutine
                    />
                  ))}
                </SortableContext>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    <div
      style={{
        border: `1px solid ${allDone ? "#10b98166" : "#1f2937"}`,
        borderRadius: "24px",
        padding: "20px",
        background: allDone ? "linear-gradient(145deg, #10b98108 0%, #064e3b10 100%)" : "linear-gradient(145deg, #111827 0%, #0d1117 100%)",
        transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        position: "relative",
        height: "100%",
        boxSizing: "border-box",
        boxShadow: allDone ? "0 8px 24px rgba(16,185,129,0.1)" : "0 4px 12px rgba(0,0,0,0.2)",
        opacity: isDraggingOverlay ? 0.9 : 1,
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        WebkitTapHighlightColor: "transparent"
      }}>
      <div {...dragHandleProps} style={{ touchAction: "none", cursor: "grab" }}>
        {content.props.children[0]} 
      </div>
      {content.props.children.slice(1)}
    </div>
  );
}