import { useState } from 'react';
import { DAYS_SHORT, MONTHS_SHORT } from '../utils/constants.js';
import { getDateStr, parseDateLocal, isSameDay, getCalendarDays, isDatePaused } from '../utils/helpers.js';

export function MiniCalendar({ habit, today, onToggle, pausePeriods, isPremium, shieldedDates }) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const cells = getCalendarDays(viewYear, viewMonth);
  const todayDate = new Date();

  const goBack = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const goForward = () => {
    const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();
    if (isCurrentMonth) return;
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };
  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();

  return (
    <div style={{ padding: "8px 2px 4px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
        <button onClick={goBack} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: "14px", padding: "2px 6px", borderRadius: "4px" }}>‹</button>
        <span style={{ color: "#9ca3af", fontSize: "11px", fontWeight: 600 }}>{MONTHS_SHORT[viewMonth]} {viewYear}</span>
        <button onClick={goForward} style={{ background: "none", border: "none", color: isCurrentMonth ? "#2d3748" : "#6b7280", cursor: isCurrentMonth ? "default" : "pointer", fontSize: "14px", padding: "2px 6px", borderRadius: "4px" }}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "2px", textAlign: "center" }}>
        {DAYS_SHORT.map(d => <div key={d} style={{ fontSize: "10px", color: "#6b7280", padding: "2px 0", fontWeight: 600 }}>{d[0]}</div>)}
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
            const isDone = habit.completedDates?.includes(dateStr);
            const backdateCutoff = new Date(todayDate);
            backdateCutoff.setHours(0, 0, 0, 0);
            // After today, it's set in stone. No more backdating window.
            const createdStr = (habit.createdDate || habit.created_date || getDateStr(todayDate)).substring(0, 10);
            const habitCreatedDate = parseDateLocal(createdStr);
            const isFuture = cellDate > todayDate && !isToday;
            const isTooOld = cellDate < backdateCutoff || cellDate < habitCreatedDate;
            const isPausedDay = isDatePaused(pausePeriods || [], dateStr);
            const dow = cellDate.getDay();
            const isScheduled = habit.frequency === "daily" || (habit.days && habit.days.includes(dow));
            const isShielded = (shieldedDates || []).includes(dateStr);
            const isBlocked = isFuture || isTooOld || isPausedDay || !isScheduled;
            let bg = "transparent", color = "#4b5563", border = "none";
            if (isPausedDay) { color = "#374151"; }
            else if (isToday && isDone) { bg = "#22c55e"; color = "#fff"; }
            else if (isToday) { bg = "transparent"; color = "#60a5fa"; border = "1.5px solid #3b82f6"; }
            else if (isDone) { bg = "#16a34a33"; color = "#22c55e"; }
            else if (isShielded && !isDone && isScheduled) { bg = "#3b82f633"; color = "#60a5fa"; }
            else if (!isScheduled || isFuture || isTooOld) { color = "#374151"; }
            const extraOpacity = !cell.curr ? 0.45 : 1;
            return (
              <div key={i} onClick={() => !isBlocked && onToggle(dateStr)}
                style={{ fontSize: "11px", borderRadius: "50%", width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", cursor: isBlocked ? "default" : "pointer", background: bg, color, border, fontWeight: isToday ? 700 : 400, transition: "background 0.15s", opacity: (isPausedDay ? 0.25 : !isScheduled ? 0.3 : 1) * extraOpacity, position: "relative" }}>
                {cell.day}
                {isShielded && !isDone && isScheduled && (
                  <span style={{ position: "absolute", top: "-4px", right: "-4px", fontSize: "10px", filter: "drop-shadow(0 0 2px rgba(0,0,0,0.5))" }}>🛡️</span>
                )}
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}