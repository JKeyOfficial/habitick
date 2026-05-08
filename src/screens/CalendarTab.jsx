import { useState, useMemo } from 'react';
import { DAYS_SHORT, MONTHS_SHORT } from '../utils/constants.js';
import { getDateStr, getCalendarDays, isSameDay, isDatePaused, parseDateLocal } from '../utils/helpers.js';

export function CalendarTab({ habits, todos, pausePeriods, shieldedDates, profile, onAddTodoForDate, onToggleTodo, onToggleHabit }) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const todayDate = new Date();
  const todayStr = getDateStr(todayDate);

  const cells = getCalendarDays(viewYear, viewMonth);

  const goBack = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const goForward = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();

  // Helper to format item pill
  const renderItemPill = (id, text, type, status, onClick, isMissed) => {
    let bg = "transparent";
    let color = "#9ca3af";
    let border = "1px solid #374151";

    if (status === "done") {
      bg = "#16a34a33";
      color = "#22c55e"; // Green for done
      border = "1px solid #16a34a66";
    } else if (status === "missed" || isMissed) {
      bg = "#7f1d1d33";
      color = "#f87171"; // Red for missed
      border = "1px solid #7f1d1d66";
    } else if (status === "holiday") {
      bg = "#78350f33";
      color = "#fcd34d"; // Yellow for holiday
      border = "1px solid #78350f66";
    } else if (status === "pending") {
      bg = "#1f2937";
      color = "#d1d5db"; // Gray for pending
      border = "1px solid #374151";
    }

    return (
      <div 
        key={`${type}-${id}`}
        onClick={(e) => { e.stopPropagation(); onClick && onClick(); }}
        style={{
          fontSize: "10px",
          padding: "2px 6px",
          borderRadius: "4px",
          background: bg,
          color: color,
          border: border,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          marginBottom: "2px",
          cursor: onClick ? "pointer" : "default",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: "4px"
        }}
        title={text}
      >
        <span style={{flexShrink: 0}}>{type === 'habit' ? '🔥' : '📝'}</span>
        <span style={{overflow: 'hidden', textOverflow: 'ellipsis'}}>{text}</span>
      </div>
    );
  };


  return (
    <div style={{ padding: "0", maxWidth: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", background: "#111827", padding: "16px 20px", borderRadius: "12px", border: "1px solid #1f2937" }}>
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "20px", margin: 0, color: "#f9fafb" }}>Calendar</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <button onClick={goBack} style={{ background: "#1f2937", border: "1px solid #374151", color: "#e5e7eb", cursor: "pointer", fontSize: "16px", padding: "6px 12px", borderRadius: "8px", transition: "background 0.2s" }}>‹</button>
          <span style={{ color: "#f9fafb", fontSize: "16px", fontWeight: 700, minWidth: "120px", textAlign: "center" }}>{MONTHS_SHORT[viewMonth]} {viewYear}</span>
          <button onClick={goForward} style={{ background: "#1f2937", border: "1px solid #374151", color: "#e5e7eb", cursor: "pointer", fontSize: "16px", padding: "6px 12px", borderRadius: "8px", transition: "background 0.2s" }}>›</button>
        </div>
      </div>

      <div style={{ border: "1px solid #1f2937", borderRadius: "12px", overflow: "hidden", background: "#0d1117" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", background: "#111827", borderBottom: "1px solid #1f2937" }}>
          {DAYS_SHORT.map(d => <div key={d} style={{ fontSize: "12px", color: "#9ca3af", padding: "12px 0", fontWeight: 700, textAlign: "center" }}>{d}</div>)}
        </div>
        
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {(() => {
            const firstDay = new Date(viewYear, viewMonth, 1).getDay();
            
            return cells.map((cell, i) => {
              let cellMonth = viewMonth;
              let cellYear = viewYear;
              
              if (!cell.curr) {
                if (i < firstDay) {
                  cellMonth = viewMonth - 1;
                  if (cellMonth < 0) { cellMonth = 11; cellYear = viewYear - 1; }
                } else {
                  cellMonth = viewMonth + 1;
                  if (cellMonth > 11) { cellMonth = 0; cellYear = viewYear + 1; }
                }
              }
              
              const cellDate = new Date(cellYear, cellMonth, cell.day);
              const dateStr = getDateStr(cellDate);
              const isToday = isSameDay(cellDate, todayDate);
              const isFuture = cellDate > todayDate && !isToday;
              const isPausedDay = isDatePaused(pausePeriods || [], dateStr);
              const dow = cellDate.getDay();
              
              const backdateCutoff = new Date(todayDate);
              backdateCutoff.setHours(0, 0, 0, 0);

              // Find habits for this day
              const dayHabits = habits.filter(h => {
                const habitCreatedDate = parseDateLocal((h.createdDate || h.created_date || todayStr).substring(0, 10));
                // Habit exists on this day?
                if (cellDate < habitCreatedDate) return false;
                // Habit scheduled for this day?
                return h.frequency === "daily" || (h.days && h.days.includes(dow));
              });

              // Find todos for this day
              const dayTodos = todos.filter(t => t.due_date === dateStr || (t.done_date === dateStr && !t.due_date));
              
              const hasActivity = dayHabits.length > 0 || dayTodos.length > 0;

              return (
                <div 
                  key={i} 
                  onClick={() => onAddTodoForDate(dateStr)} // Click anywhere in the cell to add a task for this date
                  style={{ 
                    minHeight: "100px", 
                    borderRight: (i + 1) % 7 === 0 ? "none" : "1px solid #1f2937", 
                    borderBottom: "1px solid #1f2937", 
                    padding: "6px",
                    background: cell.curr ? (isPausedDay ? "#78350f15" : "transparent") : "#11182766",
                    opacity: cell.curr ? 1 : 0.5,
                    cursor: "pointer",
                    transition: "background 0.15s",
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                  }}
                  onMouseOver={e => { if(cell.curr) e.currentTarget.style.background = "#1f293766"; }}
                  onMouseOut={e => { if(cell.curr) e.currentTarget.style.background = isPausedDay ? "#78350f15" : "transparent"; }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <span style={{ 
                      fontSize: "12px", 
                      fontWeight: isToday ? 800 : 600, 
                      color: isToday ? "#fff" : (cell.curr ? "#d1d5db" : "#6b7280"),
                      background: isToday ? "#2563eb" : "transparent",
                      width: "24px",
                      height: "24px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "50%"
                    }}>
                      {cell.day}
                    </span>
                    {isPausedDay && <span title="Holiday Mode" style={{ fontSize: "12px" }}>🏖️</span>}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "2px", flex: 1, overflowY: "auto", maxHeight: "120px" }}>
                    {dayHabits.map(h => {
                       const isDone = (h.completedDates || []).includes(dateStr);
                       const isTooOld = cellDate < backdateCutoff;
                       
                       let status = "pending";
                       if (isDone) status = "done";
                       else if (isPausedDay) status = "holiday";
                       else if ((isTooOld && !isDone) || (dateStr < todayStr && !isDone)) status = "missed";
                       
                       // Set in stone: Can only toggle if it's today
                       const canToggle = dateStr === todayStr;

                       return renderItemPill(h.id, h.name, "habit", status, canToggle ? () => onToggleHabit(h.id, dateStr) : undefined, status === "missed");
                    })}
                    {dayTodos.map(t => {
                       const isDone = t.done && ((t.doneDate === dateStr) || (t.done_date === dateStr) || t.due_date === dateStr);
                       const isMissed = !t.done && dateStr < todayStr;
                       
                       let status = "pending";
                       if (isDone) status = "done";
                       else if (isMissed) status = "missed";

                       return renderItemPill(t.id, t.text, "todo", status, () => onToggleTodo(t.id));
                    })}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>
    </div>
  );
}
