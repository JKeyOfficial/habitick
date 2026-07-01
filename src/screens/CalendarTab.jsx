import { useState, useMemo, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase.js';
import { DAYS_SHORT, MONTHS_SHORT, FREE_JOURNAL_DAYS } from '../utils/constants.js';
import { getDateStr, getCalendarDays, isSameDay, isDatePaused, parseDateLocal } from '../utils/helpers.js';
import { encryptText } from '../utils/crypto.js';

export function CalendarTab({
  habits,
  todos,
  pausePeriods,
  shieldedDates,
  profile,
  onAddTodoForDate,
  onToggleTodo,
  onToggleHabit,
  onDeleteTodo,
  onAddTodoDirect,
  journalEntries = {},
  setJournalEntries,
  session,
  isPremium,
  today,
  setShowUpgradeModal
}) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDateStr, setSelectedDateStr] = useState(null);

  const todayDate = new Date();
  const todayStr = getDateStr(todayDate);

  const backdateCutoff = useMemo(() => {
    const d = new Date(todayDate);
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const cells = getCalendarDays(viewYear, viewMonth);

  const [draft, setDraft] = useState("");
  const [mood, setMood] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const autosaveTimer = useRef(null);
  const latestDraft = useRef(draft);
  const latestMood = useRef(mood);
  const activeDateRef = useRef(null);
  const hasUnsavedChanges = useRef(false);

  useEffect(() => { latestDraft.current = draft; }, [draft]);
  useEffect(() => { latestMood.current = mood; }, [mood]);

  const saveJournal = async (draftVal, moodVal, dateVal) => {
    if (!session?.user?.id) return;
    if (!draftVal.trim() && !moodVal) return;
    setSaving(true);
    const encryptedContent = await encryptText(draftVal.trim(), session.user.id);
    const payload = {
      user_id: session.user.id,
      entry_date: dateVal,
      content: encryptedContent,
      mood: moodVal || null
    };
    const { data, error } = await supabase
      .from("journal_entries")
      .upsert(payload, { onConflict: "user_id,entry_date" })
      .select()
      .single();
    if (!error && data) {
      if (setJournalEntries) {
        setJournalEntries(prev => ({ ...prev, [dateVal]: { ...data, content: draftVal.trim() } }));
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  };

  const scheduleAutosave = () => {
    if (activeDateRef.current > today) return;
    hasUnsavedChanges.current = true;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      saveJournal(latestDraft.current, latestMood.current, activeDateRef.current);
      hasUnsavedChanges.current = false;
    }, 1000);
  };

  useEffect(() => {
    if (selectedDateStr) {
      if (activeDateRef.current && activeDateRef.current !== selectedDateStr && hasUnsavedChanges.current) {
        saveJournal(latestDraft.current, latestMood.current, activeDateRef.current);
      }
      activeDateRef.current = selectedDateStr;
      const entry = journalEntries[selectedDateStr];
      setDraft(entry?.content || "");
      setMood(entry?.mood || "");
      setSaved(false);
      hasUnsavedChanges.current = false;
    } else {
      if (activeDateRef.current && hasUnsavedChanges.current) {
        saveJournal(latestDraft.current, latestMood.current, activeDateRef.current);
      }
      activeDateRef.current = null;
      hasUnsavedChanges.current = false;
    }
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [selectedDateStr]);

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
        onClick={(e) => { if (onClick) { e.stopPropagation(); onClick(); } }}
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
          cursor: "pointer",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: "4px"
        }}
        title={text}
      >
        <span style={{ flexShrink: 0 }}>{type === 'habit' ? '🔥' : '📝'}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>
      </div>
    );
  };

  // Memos for the selected date detail modal
  const selectedDateObject = useMemo(() => {
    if (!selectedDateStr) return null;
    return parseDateLocal(selectedDateStr);
  }, [selectedDateStr]);

  const selectedIsPausedDay = useMemo(() => {
    if (!selectedDateStr) return false;
    return isDatePaused(pausePeriods || [], selectedDateStr);
  }, [selectedDateStr, pausePeriods]);

  const selectedHabits = useMemo(() => {
    if (!selectedDateStr || !selectedDateObject) return [];
    const dow = selectedDateObject.getDay();
    return habits.filter(h => {
      const habitCreatedDate = parseDateLocal((h.createdDate || h.created_date || todayStr).substring(0, 10));
      if (selectedDateObject < habitCreatedDate) return false;
      return h.frequency === "daily" || (h.days && h.days.includes(dow));
    });
  }, [selectedDateStr, selectedDateObject, habits, todayStr]);

  const selectedTodos = useMemo(() => {
    if (!selectedDateStr) return [];
    return todos.filter(t => t.due_date === selectedDateStr || (t.done_date === selectedDateStr && !t.due_date));
  }, [selectedDateStr, todos]);

  const selectedHabitCompletedCount = useMemo(() => {
    return selectedHabits.filter(h => (h.completedDates || []).includes(selectedDateStr)).length;
  }, [selectedHabits, selectedDateStr]);

  const journalCutoff = useMemo(() => {
    const todayVal = today || todayStr;
    const d = parseDateLocal(todayVal);
    d.setDate(d.getDate() - (FREE_JOURNAL_DAYS - 1));
    return getDateStr(d);
  }, [today, todayStr]);

  const isJournalLocked = useMemo(() => {
    if (!selectedDateStr || !journalCutoff) return false;
    return !isPremium && selectedDateStr < journalCutoff;
  }, [selectedDateStr, journalCutoff, isPremium]);

  return (
    <div style={{ padding: "0", maxWidth: "100%" }}>
      <style>{`
        @keyframes htFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes htSlideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .day-detail-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(3, 7, 18, 0.85);
          backdrop-filter: blur(8px);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: htFadeIn 0.2s ease-out;
        }
        .day-detail-container {
          background: #111827;
          border: 1px solid #1f2937;
          border-radius: 16px;
          width: 95%;
          max-width: 900px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.7);
          animation: htSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .day-detail-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 18px 20px;
          border-bottom: 1px solid #1f2937;
          background: #111827;
          flex-shrink: 0;
        }
        @media (max-width: 768px) {
          .day-detail-container {
            max-width: 100%;
            width: 100%;
            height: 100%;
            max-height: 100vh;
            border-radius: 0;
            border: none;
            margin: 0;
          }
          .day-detail-header {
            padding: 14px 16px;
          }
          .day-detail-header h3 {
            font-size: 16px !important;
          }
        }
        .day-detail-content {
          display: flex;
          flex-direction: row;
          gap: 24px;
          padding: 20px 24px;
          overflow-y: auto;
          flex: 1;
        }
        .day-detail-left {
          flex: 1.1;
          display: flex;
          flex-direction: column;
          gap: 20px;
          min-width: 0;
        }
        .day-detail-right {
          flex: 0.9;
          display: flex;
          flex-direction: column;
          gap: 20px;
          min-width: 0;
          border-left: 1px solid #1f2937;
          padding-left: 24px;
        }
        .day-detail-section-card {
          background: #1f293740;
          border: 1px solid #1f2937;
          border-radius: 12px;
          padding: 16px;
        }
        @media (max-width: 768px) {
          .day-detail-content {
            flex-direction: column;
            gap: 12px;
            padding: 12px;
          }
          .day-detail-left {
            gap: 12px;
          }
          .day-detail-right {
            border-left: none;
            padding-left: 0;
            border-top: 1px solid #1f2937;
            padding-top: 12px;
          }
          .day-detail-section-card {
            padding: 12px;
            border-radius: 10px;
          }
        }
        .mood-grid {
          display: flex;
          gap: 8px;
        }
        .mood-btn {
          flex: 1;
          padding: 10px 6px;
          border-radius: 10px;
          border: 1px solid #1f2937;
          background: #0d1117;
          cursor: pointer;
          transition: all 0.15s;
          text-align: center;
        }
        .mood-btn:hover:not(:disabled) {
          background: #1f293780;
          border-color: #374151;
        }
        .mood-btn:disabled {
          cursor: default;
          opacity: 0.6;
        }
        .mood-btn.active {
          border-color: #2563eb;
          background: rgba(29, 78, 216, 0.15);
        }
        .mood-label {
          font-size: 11px;
          color: #4b5563;
          font-weight: 600;
          margin-top: 4px;
        }
        .mood-btn.active .mood-label {
          color: #60a5fa;
        }
        @media (max-width: 768px) {
          .mood-grid {
            gap: 6px;
          }
          .mood-btn {
            padding: 8px 4px;
            border-radius: 8px;
          }
          .mood-btn .mood-emoji {
            font-size: 16px !important;
          }
          .mood-label {
            font-size: 10px;
            margin-top: 2px;
          }
        }
        .journal-textarea {
          width: 100%;
          min-height: 180px;
          padding: 12px 14px;
          border-radius: 10px;
          border: 1px solid #1f2937;
          background: #0d1117;
          color: #e5e7eb;
          font-size: 14px;
          font-family: inherit;
          line-height: 1.6;
          resize: vertical;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.2s;
        }
        .journal-textarea:focus:not(:disabled) {
          border-color: #2563eb;
        }
        .journal-textarea:disabled {
          color: #6b7280;
          cursor: default;
        }
        @media (max-width: 768px) {
          .journal-textarea {
            min-height: 120px;
            padding: 10px 12px;
            font-size: 13px;
          }
        }
        .journal-locked-container {
          border-radius: 12px;
          background: #0d111766;
          border: 1px dashed #1f2937;
          padding: 24px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          min-height: 180px;
          flex: 1;
        }
        @media (max-width: 768px) {
          .journal-locked-container {
            padding: 16px;
            min-height: 140px;
            gap: 8px;
          }
        }
        .upgrade-inline-btn {
          background: #2563eb;
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.2s;
        }
        .upgrade-inline-btn:hover {
          background: #1d4ed8;
        }
        .detail-section {
          padding: 16px 20px;
          border-bottom: 1px solid #1f2937;
        }
        .detail-section:last-child {
          border-bottom: none;
        }
        .detail-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 10px;
        }
        .detail-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          background: #1f293780;
          border: 1px solid #1f2937;
          border-radius: 10px;
          transition: background-color 0.15s;
        }
        .detail-item:hover {
          background: #1f2937;
        }
        .detail-item-title {
          font-size: 14px;
          color: #e5e7eb;
          font-weight: 500;
        }
        .quick-add-input {
          flex: 1;
          background: #1f2937;
          border: 1px solid #374151;
          border-radius: 8px;
          padding: 8px 12px;
          color: #fff;
          font-size: 14px;
          outline: none;
          transition: border-color 0.15s;
          font-family: inherit;
        }
        .quick-add-input:focus {
          border-color: #3b82f6;
        }
        @media (max-width: 768px) {
          .detail-list {
            gap: 6px;
            margin-top: 8px;
          }
          .detail-item {
            padding: 8px 10px;
            border-radius: 8px;
          }
          .detail-item-title {
            font-size: 13px;
          }
          .detail-item .detail-status-badge {
            font-size: 10px !important;
            padding: 2px 6px !important;
          }
          .quick-add-input {
            padding: 7px 10px;
            font-size: 13px;
          }
        }
      `}</style>

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

              const completedHabitsCount = dayHabits.filter(h => (h.completedDates || []).includes(dateStr)).length;
              const totalHabitsCount = dayHabits.length;

              return (
                <div
                  key={i}
                  onClick={() => setSelectedDateStr(dateStr)} // Click cell to open details modal
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
                  onMouseOver={e => { if (cell.curr) e.currentTarget.style.background = "#1f293766"; }}
                  onMouseOut={e => { if (cell.curr) e.currentTarget.style.background = isPausedDay ? "#78350f15" : "transparent"; }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
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

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddTodoForDate(dateStr);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#9ca3af",
                        cursor: "pointer",
                        fontSize: "14px",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "color 0.2s, background-color 0.2s"
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.color = "#3b82f6";
                        e.currentTarget.style.backgroundColor = "#1f2937";
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.color = "#9ca3af";
                        e.currentTarget.style.backgroundColor = "transparent";
                      }}
                      title="Add task"
                    >
                      ＋
                    </button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "2px", flex: 1, overflowY: "auto", maxHeight: "120px" }}>
                    {totalHabitsCount > 0 && renderItemPill(
                      "summary",
                      `Habits (${completedHabitsCount}/${totalHabitsCount})`,
                      "habit",
                      completedHabitsCount === totalHabitsCount ? "done" : "missed",
                      undefined,
                      completedHabitsCount < totalHabitsCount
                    )}
                    {dayTodos.map(t => {
                      const isDone = t.done && ((t.doneDate === dateStr) || (t.done_date === dateStr) || t.due_date === dateStr);
                      const isMissed = !t.done && dateStr < todayStr;

                      let status = "pending";
                      if (isDone) status = "done";
                      else if (isMissed) status = "missed";

                      return renderItemPill(t.id, t.text, "todo", status, undefined);
                    })}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* Day Details Modal */}
      {selectedDateStr && selectedDateObject && (
        <div className="day-detail-overlay" onClick={() => setSelectedDateStr(null)}>
          <div className="day-detail-container" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px", borderBottom: "1px solid #1f2937", background: "#111827" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800, fontFamily: "'Syne', sans-serif", color: "#f9fafb" }}>
                  {selectedDateObject.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </h3>
                {selectedIsPausedDay && (
                  <span style={{ fontSize: "12px", color: "#fcd34d", display: "flex", alignItems: "center", gap: "4px", marginTop: "4px" }}>
                    🏖️ Holiday Mode Active
                  </span>
                )}
              </div>
              <button
                onClick={() => setSelectedDateStr(null)}
                style={{ background: "none", border: "none", color: "#9ca3af", fontSize: "20px", cursor: "pointer", padding: "4px" }}
              >
                ✕
              </button>
            </div>

            {/* Content Container */}
            <div className="day-detail-content">
              {/* Left Column (Habits & Tasks) */}
              <div className="day-detail-left">
                {/* Habits Section */}
                <div style={{ background: "#1f293740", border: "1px solid #1f2937", borderRadius: "12px", padding: "16px" }}>
                  <h4 style={{ margin: "0 0 12px 0", fontSize: "14px", fontWeight: 700, color: "#60a5fa", display: "flex", alignItems: "center", gap: "6px" }}>
                    🔥 Habits
                    <span style={{ fontSize: "12px", background: "#1e3a8a", color: "#93c5fd", padding: "2px 8px", borderRadius: "999px" }}>
                      {selectedHabitCompletedCount}/{selectedHabits.length}
                    </span>
                  </h4>

                  {selectedHabits.length === 0 ? (
                    <div style={{ color: "#4b5563", fontSize: "13px" }}>No habits scheduled for this day.</div>
                  ) : (
                    <div className="detail-list" style={{ marginTop: 0 }}>
                      {selectedHabits.map(h => {
                        const isDone = (h.completedDates || []).includes(selectedDateStr);
                        const isTooOld = selectedDateObject < backdateCutoff;
                        let statusStr = "Pending";
                        let badgeBg = "#1f2937";
                        let badgeColor = "#9ca3af";

                        if (isDone) {
                          statusStr = "Completed";
                          badgeBg = "#16a34a33";
                          badgeColor = "#22c55e";
                        } else if (selectedIsPausedDay) {
                          statusStr = "Holiday";
                          badgeBg = "#78350f33";
                          badgeColor = "#fcd34d";
                        } else if ((isTooOld && !isDone) || (selectedDateStr < todayStr && !isDone)) {
                          statusStr = "Missed";
                          badgeBg = "#7f1d1d33";
                          badgeColor = "#f87171";
                        }

                        const canToggle = selectedDateStr === todayStr;

                        return (
                          <div key={h.id} className="detail-item" style={{ opacity: canToggle ? 1 : 0.8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                              <button
                                disabled={!canToggle}
                                onClick={() => onToggleHabit(h.id, selectedDateStr)}
                                style={{
                                  width: "20px",
                                  height: "20px",
                                  borderRadius: "6px",
                                  border: "1.5px solid",
                                  borderColor: isDone ? "#22c55e" : "#374151",
                                  background: isDone ? "#22c55e" : "transparent",
                                  cursor: canToggle ? "pointer" : "not-allowed",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  color: "#fff",
                                  fontSize: "11px",
                                  fontWeight: 900
                                }}
                                title={!canToggle ? "Habits can only be toggled on the current day" : ""}
                              >
                                {isDone && "✓"}
                              </button>
                              <span className="detail-item-title" style={{ textDecoration: isDone ? "line-through" : "none", color: isDone ? "#4b5563" : "#e5e7eb" }}>
                                {h.name}
                              </span>
                            </div>
                            <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px", background: badgeBg, color: badgeColor }}>
                              {statusStr}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Tasks Section */}
                <div style={{ background: "#1f293740", border: "1px solid #1f2937", borderRadius: "12px", padding: "16px" }}>
                  <h4 style={{ margin: "0 0 12px 0", fontSize: "14px", fontWeight: 700, color: "#a78bfa", display: "flex", alignItems: "center", gap: "6px" }}>
                    📝 Tasks
                    <span style={{ fontSize: "12px", background: "#4c1d95", color: "#c084fc", padding: "2px 8px", borderRadius: "999px" }}>
                      {selectedTodos.filter(t => t.done).length}/{selectedTodos.length}
                    </span>
                  </h4>

                  {selectedTodos.length === 0 ? (
                    <div style={{ color: "#4b5563", fontSize: "13px" }}>No tasks for this day.</div>
                  ) : (
                    <div className="detail-list" style={{ marginTop: 0 }}>
                      {selectedTodos.map(t => {
                        const isDone = t.done && ((t.doneDate === selectedDateStr) || (t.done_date === selectedDateStr) || t.due_date === selectedDateStr);
                        const isMissed = !t.done && selectedDateStr < todayStr;

                        let badgeBg = "#1f2937";
                        let badgeColor = "#9ca3af";
                        let badgeText = "Pending";

                        if (isDone) {
                          badgeBg = "#16a34a33";
                          badgeColor = "#22c55e";
                          badgeText = "Done";
                        } else if (isMissed) {
                          badgeBg = "#7f1d1d33";
                          badgeColor = "#f87171";
                          badgeText = "Overdue";
                        }

                        return (
                          <div key={t.id} className="detail-item">
                            <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
                              <button
                                onClick={() => onToggleTodo(t.id)}
                                style={{
                                  width: "20px",
                                  height: "20px",
                                  borderRadius: "6px",
                                  border: "1.5px solid",
                                  borderColor: isDone ? "#22c55e" : "#374151",
                                  background: isDone ? "#22c55e" : "transparent",
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  color: "#fff",
                                  fontSize: "11px",
                                  fontWeight: 900,
                                  flexShrink: 0
                                }}
                              >
                                {isDone && "✓"}
                              </button>
                              <span className="detail-item-title" style={{ textDecoration: isDone ? "line-through" : "none", color: isDone ? "#4b5563" : "#e5e7eb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {t.text}
                              </span>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                              <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px", background: badgeBg, color: badgeColor }}>
                                {badgeText}
                              </span>

                              {onDeleteTodo && (
                                <button
                                  onClick={() => onDeleteTodo(t.id)}
                                  style={{ background: "none", border: "none", cursor: "pointer", color: "#4b5563", fontSize: "14px", padding: "2px", display: "flex", alignItems: "center", justifyContent: "center" }}
                                  title="Delete task"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Quick Add Todo Inline */}
                  {onAddTodoDirect && (
                    <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #1f2937" }}>
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const textVal = e.target.elements.todoText.value.trim();
                          if (textVal) {
                            const success = await onAddTodoDirect(textVal, selectedDateStr);
                            if (success) {
                              e.target.reset();
                            }
                          }
                        }}
                        style={{ display: "flex", gap: "8px" }}
                      >
                        <input
                          name="todoText"
                          className="quick-add-input"
                          placeholder="Quick add task..."
                          autoComplete="off"
                        />
                        <button
                          type="submit"
                          style={{
                            background: "#2563eb",
                            color: "#fff",
                            border: "none",
                            borderRadius: "8px",
                            padding: "8px 16px",
                            fontSize: "14px",
                            fontWeight: 700,
                            cursor: "pointer",
                            transition: "background 0.2s"
                          }}
                          onMouseOver={e => e.currentTarget.style.background = "#1d4ed8"}
                          onMouseOut={e => e.currentTarget.style.background = "#2563eb"}
                        >
                          Add
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column (Journal) */}
              <div className="day-detail-right">
                <div style={{ background: "#1f293740", border: "1px solid #1f2937", borderRadius: "12px", padding: "16px", display: "flex", flexDirection: "column", height: "100%", minHeight: "350px" }}>
                  <h4 style={{ margin: "0 0 16px 0", fontSize: "14px", fontWeight: 700, color: "#38bdf8", display: "flex", alignItems: "center", gap: "6px" }}>
                    📓 Journal
                  </h4>

                  {isJournalLocked ? (
                    <div className="journal-locked-container">
                      <div style={{ fontSize: "28px" }}>🔒</div>
                      <div style={{ color: "#f9fafb", fontWeight: 700, fontSize: "14px" }}>Premium Journal History</div>
                      <div style={{ color: "#9ca3af", fontSize: "12px", lineHeight: 1.5, maxWidth: "240px" }}>
                        Free accounts can access the last {FREE_JOURNAL_DAYS} days of journal history.
                      </div>
                      {setShowUpgradeModal && (
                        <button
                          className="upgrade-inline-btn"
                          onClick={() => {
                            setSelectedDateStr(null);
                            setShowUpgradeModal("journal");
                          }}
                        >
                          Upgrade to Premium
                        </button>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px", flex: 1 }}>
                      {/* Mood Picker */}
                      <div>
                        <div style={{ color: "#6b7280", fontSize: "11px", fontWeight: 600, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          How are you feeling?
                        </div>
                        <div className="mood-grid">
                          {[
                            { value: "great", label: "Great", emoji: "🌟" },
                            { value: "good", label: "Good", emoji: "😊" },
                            { value: "okay", label: "Okay", emoji: "😐" },
                            { value: "bad", label: "Bad", emoji: "😔" },
                          ].map(m => {
                            const isFuture = selectedDateStr > today;
                            return (
                              <button
                                key={m.value}
                                disabled={isFuture}
                                onClick={() => {
                                  setMood(prev => prev === m.value ? "" : m.value);
                                  scheduleAutosave();
                                }}
                                className={`mood-btn ${mood === m.value ? 'active' : ''}`}
                                title={isFuture ? "Cannot set mood for future days" : m.label}
                              >
                                <div style={{ fontSize: "18px", marginBottom: "2px" }}>{m.emoji}</div>
                                <div className="mood-label">{m.label}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Thoughts Textarea */}
                      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                        <div style={{ color: "#6b7280", fontSize: "11px", fontWeight: 600, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Your thoughts
                        </div>
                        <textarea
                          value={draft}
                          onChange={e => {
                            if (e.target.value.length <= 2000) {
                              setDraft(e.target.value);
                              scheduleAutosave();
                            }
                          }}
                          placeholder={selectedDateStr > today ? "Cannot write journal entries for future days." : "Write anything — what happened today, how you feel, what you're grateful for..."}
                          disabled={selectedDateStr > today}
                          className="journal-textarea"
                          style={{ flex: 1 }}
                        />
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
                          <span style={{ fontSize: "11px", color: 2000 - draft.length < 100 ? "#f87171" : "#4b5563" }}>
                            {2000 - draft.length} characters remaining
                          </span>
                          <span style={{ fontSize: "11px", color: saving ? "#6b7280" : "#22c55e", fontWeight: 600 }}>
                            {saving ? "Saving..." : saved ? "✓ Saved" : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
