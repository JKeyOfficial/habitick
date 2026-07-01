import { useState } from 'react';
import { HabitSortableItem } from './HabitSortableItem.jsx';
import { HabitCard } from './HabitCard.jsx';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { parseDateLocal } from '../utils/helpers.js';

export function RoutineCard({ 
  routine, 
  habits, 
  today, 
  activeDate = today,
  onToggle, 
  onDelete, 
  onDeleteRoutine, 
  onEdit, 
  onEjectFromRoutine, 
  isPaused, 
  pausePeriods, 
  isPremium, 
  shieldedDates, 
  dragState, 
  dropTargetId, 
  onDragStartHabit, 
  onDragEndHabit, 
  onDragEnterHabit, 
  onDropOnRoutine, 
  onDropOnStandalone, 
  dragHandleProps, 
  isDraggingOverlay 
}) {
  const activeDateObj = parseDateLocal(activeDate);
  const activeDow = activeDateObj.getDay();
  const isFuture = activeDate > today;

  const scheduledHabits = habits.filter(h =>
    h.frequency === "daily" || (h.days && h.days.includes(activeDow))
  );
  const doneCount = scheduledHabits.filter(h => (h.completedDates || []).includes(activeDate)).length;
  const totalCount = scheduledHabits.length;
  const allDone = totalCount > 0 && doneCount === totalCount;

  const markAll = () => {
    if (isFuture || isPaused) return;
    scheduledHabits
      .filter(h => !(h.completedDates || []).includes(activeDate))
      .forEach(h => onToggle(h.id, activeDate));
  };

  const content = (
    <>
      {/* Routine header */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px", minWidth: 0, overflow: "hidden" }}>
        {/* Drag Handle — only this element initiates drag, matching HabitCard pattern */}
        {dragHandleProps && (
          <div
            {...dragHandleProps}
            style={{
              color: "#4b5563",
              fontSize: "16px",
              padding: "4px 4px",
              cursor: "grab",
              touchAction: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              userSelect: "none"
            }}
            onClick={e => e.stopPropagation()}
          >
            ⠿
          </div>
        )}
        {/* Emoji Icon Container */}
        <div style={{ 
          width: "36px", 
          height: "36px", 
          borderRadius: "10px", 
          background: "rgba(255, 255, 255, 0.05)", 
          border: "1px solid rgba(255, 255, 255, 0.08)",
          display: "flex", 
          alignItems: "center", 
          justifyContent: "center", 
          fontSize: "18px", 
          flexShrink: 0
        }}>
          {routine.emoji || "📋"}
        </div>

        {/* Name and Progress bar — flex:1 + minWidth:0 so it can shrink */}
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ 
              fontFamily: "'Syne', sans-serif", 
              fontWeight: 800, 
              fontSize: "15px", 
              color: allDone ? "#10b981" : "#f9fafb", 
              letterSpacing: "-0.01em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "block"
            }}>
              {routine.name}
            </span>
            {allDone && (
              <span style={{ 
                fontSize: "9px", 
                color: "#10b981", 
                fontWeight: 800, 
                background: "rgba(16, 185, 129, 0.1)", 
                padding: "2px 6px", 
                borderRadius: "999px",
                letterSpacing: "0.03em",
                flexShrink: 0
              }}>
                DONE
              </span>
            )}
          </div>
          {totalCount > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
              <div style={{ flex: 1, height: "3px", borderRadius: "999px", background: "rgba(255, 255, 255, 0.05)", overflow: "hidden", minWidth: 0 }}>
                <div style={{ 
                  height: "100%", 
                  width: `${(doneCount / totalCount) * 100}%`, 
                  background: allDone ? "linear-gradient(90deg, #10b981 0%, #059669 100%)" : "linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)", 
                  borderRadius: "999px", 
                  transition: "width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)" 
                }} />
              </div>
              <span style={{ fontSize: "10px", color: "#6b7280", fontWeight: 700, flexShrink: 0 }}>{doneCount}/{totalCount}</span>
            </div>
          )}
        </div>

        {/* Compact controls — only icons, no text */}
        {!isDraggingOverlay && (
          <div onPointerDown={e => e.stopPropagation()} style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0 }}>
            {/* Prominent Edit Routine Button */}
            <button 
              onClick={() => onEdit(routine)} 
              style={{ 
                background: "rgba(59, 130, 246, 0.08)", 
                border: "1px solid rgba(59, 130, 246, 0.2)", 
                borderRadius: "8px", 
                color: "#60a5fa", 
                fontSize: "11px", 
                fontWeight: 700, 
                cursor: "pointer", 
                padding: "4px 10px",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                whiteSpace: "nowrap",
                flexShrink: 0
              }}
              title="Edit Routine"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
              <span>Edit</span>
            </button>
          </div>
        )}
      </div>

      {/* Habits list inside routine — always expanded */}
      <div style={{ marginTop: "8px" }}>
        {habits.length === 0 ? (
          <div style={{ 
            textAlign: "center", 
            padding: "24px 16px", 
            color: "#4b5563", 
            fontSize: "13px", 
            border: "1px dashed rgba(255,255,255,0.05)", 
            borderRadius: "12px", 
            pointerEvents: "none" 
          }}>
            Drag habits here to organize
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }} onPointerDown={e => e.stopPropagation()}>
            {isDraggingOverlay ? (
              habits.map(h => (
                <HabitCard 
                  key={h.id} 
                  habit={h} 
                  today={today} 
                  activeDate={activeDate}
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
                    activeDate={activeDate}
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
    </>
  );

  return (
    <div
      className="ht-routine-card"
      style={{
        border: `1px solid ${allDone ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.05)"}`,
        borderRadius: "20px",
        padding: "16px",
        background: allDone 
          ? "linear-gradient(145deg, rgba(16, 185, 129, 0.03) 0%, rgba(4, 120, 87, 0.05) 100%)" 
          : "linear-gradient(145deg, rgba(22, 31, 48, 0.2) 0%, rgba(13, 17, 23, 0.3) 100%)",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        position: "relative",
        boxSizing: "border-box",
        boxShadow: allDone ? "0 4px 20px rgba(16,185,129,0.05)" : "0 4px 12px rgba(0,0,0,0.1)",
        opacity: isDraggingOverlay ? 0.9 : 1,
        userSelect: "none",
        width: "100%",
        maxWidth: "100%",
        overflow: "hidden",
        marginBottom: "12px"
      }}
    >
      {content}
    </div>
  );
}