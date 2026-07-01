import { useState } from 'react';
import { DAYS_SHORT } from '../utils/constants.js';
import { MiniCalendar } from './MiniCalendar.jsx';
import { calcHabitStreak, parseDateLocal } from '../utils/helpers.js';

export function HabitCard({ 
  habit, 
  today, 
  activeDate = today,
  onToggle, 
  onDelete, 
  onEdit, 
  isPaused, 
  pausePeriods, 
  isPremium, 
  shieldedDates, 
  draggable: isDraggable, 
  onDragStart, 
  onDragEnd, 
  onDragEnter, 
  isDropTarget, 
  onEjectFromRoutine, 
  inRoutine, 
  dragHandleProps 
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  
  const activeDateObj = parseDateLocal(activeDate);
  const activeDow = activeDateObj.getDay();
  const isScheduledOnActiveDate = habit.frequency === "daily" || (habit.days && habit.days.includes(activeDow));
  const doneOnActiveDate = habit.completedDates?.includes(activeDate);

  const streak = calcHabitStreak(habit, today, pausePeriods);
  const isFuture = activeDate > today;

  return (
    <div
      className="ht-habit-card"
      style={{ 
        background: isDropTarget ? "#1e293b" : "rgba(22, 31, 48, 0.4)", 
        border: `1px solid ${isDropTarget ? "#3b82f6" : "rgba(255, 255, 255, 0.05)"}`, 
        borderRadius: "16px", 
        padding: "14px 16px", 
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)", 
        transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)", 
        display: "flex", 
        flexDirection: "column",
        position: "relative",
        userSelect: "none",
        width: "100%",
        maxWidth: "100%",
        overflow: "hidden",
        boxSizing: "border-box",
        marginBottom: "8px"
      }}
    >
      {/* Row Header */}
      <div 
        style={{ 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "space-between",
          cursor: "pointer",
          width: "100%"
        }}
        onClick={() => setExpanded(e => !e)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0, flex: 1 }}>
          {/* Drag Handle */}
          {dragHandleProps && (
            <div 
              {...dragHandleProps}
              style={{ 
                color: "#4b5563", 
                fontSize: "16px", 
                padding: "4px", 
                cursor: "grab", 
                touchAction: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}
              onClick={e => e.stopPropagation()}
            >
              ⠿
            </div>
          )}

          {/* Habit Info */}
          <div style={{ minWidth: 0 }}>
            <div style={{ 
              fontFamily: "'Syne', sans-serif", 
              fontWeight: 700, 
              fontSize: "15px", 
              color: doneOnActiveDate ? "#9ca3af" : "#f9fafb", 
              textDecoration: doneOnActiveDate ? "line-through" : "none",
              letterSpacing: "-0.01em", 
              lineHeight: 1.2,
              transition: "color 0.2s"
            }}>
              {habit.name}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
              <span style={{ fontSize: "11px", color: "#6b7280", fontWeight: 500, display: "flex", alignItems: "center", gap: "3px" }}>
                {streak} day streak
              </span>
              <span style={{ color: "#374151", fontSize: "10px" }}>|</span>
              {habit.frequency === "weekly" && habit.days && (
                <span style={{ fontSize: "10px", color: "#6b7280" }}>
                  {habit.days.map(d => DAYS_SHORT[d]).join(", ")}
                </span>
              )}
              {habit.frequency === "daily" && (
                <span style={{ fontSize: "10px", color: "#6b7280" }}>Daily</span>
              )}
            </div>
          </div>
        </div>

        {/* Interactive circular checkbox */}
        <div 
          onClick={(e) => {
            e.stopPropagation();
            if (isScheduledOnActiveDate && !isPaused && !isFuture && activeDate === today) {
              onToggle(habit.id, activeDate);
            }
          }}
          className="ht-habit-checkbox"
          style={{
            width: "22px",
            height: "22px",
            borderRadius: "50%",
            border: doneOnActiveDate 
              ? "2px solid #3b82f6" 
              : (isScheduledOnActiveDate && !isFuture && activeDate === today 
                  ? "2px solid #3b82f6" 
                  : "2px solid rgba(255, 255, 255, 0.25)"
                ),
            background: doneOnActiveDate 
              ? "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)" 
              : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            cursor: (isScheduledOnActiveDate && !isPaused && !isFuture && activeDate === today) ? "pointer" : "default",
            transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
            boxShadow: doneOnActiveDate ? "0 0 8px rgba(59, 130, 246, 0.4)" : "none",
            opacity: (isScheduledOnActiveDate && !isPaused && !isFuture && activeDate === today) || doneOnActiveDate ? 1 : 0.5
          }}
        >
          {doneOnActiveDate && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
      </div>

      {/* Expanded Actions & Calendar */}
      {expanded && (
        <div style={{ marginTop: "12px", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "12px" }}>
          {/* Action Row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <div style={{ display: "flex", gap: "8px" }}>
              <button 
                onClick={(e) => { e.stopPropagation(); onEdit(habit); }}
                style={{ 
                  background: "rgba(255, 255, 255, 0.05)", 
                  border: "1px solid rgba(255, 255, 255, 0.08)", 
                  cursor: "pointer", 
                  color: "#d1d5db", 
                  fontSize: "12px", 
                  padding: "5px 10px", 
                  borderRadius: "8px", 
                  transition: "background 0.2s",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                <span>Edit</span>
              </button>
              {inRoutine && onEjectFromRoutine && (
                <button 
                  onClick={(e) => { e.stopPropagation(); onEjectFromRoutine(habit.id); }}
                  style={{ 
                    background: "rgba(255, 255, 255, 0.05)", 
                    border: "1px solid rgba(255, 255, 255, 0.08)", 
                    cursor: "pointer", 
                    color: "#d1d5db", 
                    fontSize: "12px", 
                    padding: "5px 10px", 
                    borderRadius: "8px", 
                    transition: "background 0.2s",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px"
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22V8M5 12l7-7 7 7"/></svg>
                  <span>Remove from Routine</span>
                </button>
              )}
            </div>

            {confirmDelete ? (
              <div style={{ display: "flex", gap: "6px" }}>
                <button 
                  onClick={(e) => { e.stopPropagation(); onDelete(habit.id); }}
                  style={{ 
                    background: "#7f1d1d", 
                    border: "1px solid #f8717133", 
                    borderRadius: "8px", 
                    color: "#f87171", 
                    fontSize: "11px", 
                    fontWeight: 700, 
                    cursor: "pointer", 
                    padding: "5px 10px" 
                  }}
                >
                  Confirm Delete
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
                  style={{ 
                    background: "rgba(255, 255, 255, 0.05)", 
                    border: "1px solid rgba(255, 255, 255, 0.08)", 
                    borderRadius: "8px", 
                    color: "#d1d5db", 
                    fontSize: "11px", 
                    fontWeight: 700, 
                    cursor: "pointer", 
                    padding: "5px 10px" 
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button 
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                style={{ 
                  background: "rgba(220, 38, 38, 0.1)", 
                  border: "1px solid rgba(220, 38, 38, 0.2)", 
                  cursor: "pointer", 
                  color: "#ef4444", 
                  fontSize: "12px", 
                  padding: "5px 10px", 
                  borderRadius: "8px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                <span>Delete</span>
              </button>
            )}
          </div>

          {/* Mini Calendar History */}
          <div style={{ background: "rgba(0,0,0,0.15)", borderRadius: "10px", padding: "10px" }}>
            <MiniCalendar 
              habit={habit} 
              today={today} 
              pausePeriods={pausePeriods || []} 
              isPremium={isPremium} 
              onToggle={date => onToggle(habit.id, date)} 
              shieldedDates={shieldedDates} 
            />
          </div>
        </div>
      )}
    </div>
  );
}