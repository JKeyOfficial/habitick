// ─── HABITICK — Full Supabase Version ───────────────────────────────────────
// Setup: npm install @supabase/supabase-js
// Then fill in your SUPABASE_URL and SUPABASE_ANON_KEY below.
// Run the schema.sql in your Supabase SQL editor first.

import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ── Replace these with your project values ───────────────────────────────────
// Supabase Dashboard → Project Settings → API
const SUPABASE_URL = "https://ftsqfgnarbqeloyjrpzc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0c3FmZ25hcmJxZWxveWpycHpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NTA4MDQsImV4cCI6MjA4ODMyNjgwNH0._vCV9TJSMJgvEWssmEm843g82qQi0ud07Q28WRyPx5s";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Date helpers ─────────────────────────────────────────────────────────────
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function getDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function parseDateLocal(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function isSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}
function getCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = firstDay - 1; i >= 0; i--) cells.push({ day: prevDays - i, curr: false });
  for (let i = 1; i <= daysInMonth; i++) cells.push({ day: i, curr: true });
  while (cells.length < 35) cells.push({ day: cells.length - daysInMonth - firstDay + 1, curr: false });
  return cells;
}

// ─── Streak logic ─────────────────────────────────────────────────────────────
function isDayComplete(habits, dateStr) {
  const dow = parseDateLocal(dateStr).getDay();
  const scheduled = habits.filter(h => h.frequency === "daily" || (h.days && h.days.includes(dow)));
  if (scheduled.length === 0) return null; // rest day — counts but doesn't require completion
  return scheduled.every(h => (h.completedDates || []).includes(dateStr));
}
function isDatePaused(pausePeriods, dateStr) {
  const ds = dateStr.substring(0, 10);
  return pausePeriods.some(p => {
    const start = (p.start || '').substring(0, 10);
    const end = p.end ? p.end.substring(0, 10) : null;
    // end is exclusive — if you resume today, today is NOT paused
    return ds >= start && (end === null || ds < end);
  });
}
function calcStreak(habits, pausePeriods) {
  if (habits.length === 0) return 0;

  const today = getDateStr(new Date());

  const normalisedHabits = habits.map(h => ({
    ...h,
    createdDate: ((h.createdDate || h.created_date || today)).substring(0, 10),
    completedDates: (h.completedDates || []).map(d => d.substring(0, 10)),
  }));

  const earliestHabitDate = normalisedHabits.reduce((earliest, h) => {
    return h.createdDate < earliest ? h.createdDate : earliest;
  }, today);

  let streak = 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);

  for (let i = 0; i < 1100; i++) {
    const ds = getDateStr(d);
    if (ds < earliestHabitDate) break;                          // don't go before first habit
    if (isDatePaused(pausePeriods, ds)) { d.setDate(d.getDate() - 1); continue; } // skip paused days
    const complete = isDayComplete(normalisedHabits, ds);
    if (complete === null) { streak++; d.setDate(d.getDate() - 1); continue; } // rest day counts
    if (!complete && ds === today) { d.setDate(d.getDate() - 1); continue; }   // today not done yet — skip, don't break
    if (!complete) break;                                        // missed a past day — streak ends
    streak++;
    d.setDate(d.getDate() - 1);
  }

  return streak;
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const S = {
  input: { width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #374151", background: "#1f2937", color: "#f9fafb", fontSize: "14px", boxSizing: "border-box", fontFamily: "inherit", outline: "none" },
  btnPrimary: { width: "100%", padding: "11px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "14px", cursor: "pointer", fontFamily: "inherit" },
  btnSecondary: { width: "100%", padding: "11px", borderRadius: "8px", border: "1px solid #374151", background: "#1f2937", color: "#9ca3af", fontWeight: 600, fontSize: "14px", cursor: "pointer", fontFamily: "inherit" },
  label: { color: "#9ca3af", fontSize: "13px", display: "block", marginBottom: "6px" },
};

// ─── Auth Screen ──────────────────────────────────────────────────────────────
function AuthScreen() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handle = async () => {
    setError(""); setMessage(""); setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage("Check your email to confirm your account, then sign in.");
        setMode("signin");
      } else if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (error) throw error;
        setMessage("Password reset link sent — check your email.");
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleGoogle = () => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });

  return (
    <div style={{ minHeight: "100vh", width: "100%", background: "#0d1117", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&display=swap'); html, body, #root { margin: 0; padding: 0; width: 100%; min-height: 100vh; } * { box-sizing: border-box; } button,input { font-family: inherit; }`}</style>
      <div style={{ width: "380px", maxWidth: "90vw" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ fontSize: "36px", marginBottom: "8px" }}>⚡</div>
          <div style={{ fontWeight: 800, fontSize: "24px", color: "#f9fafb" }}>HabiTick</div>
          <div style={{ color: "#6b7280", fontSize: "14px", marginTop: "4px" }}>
            {mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Welcome back"}
          </div>
        </div>
        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "16px", padding: "28px" }}>
          {mode !== "forgot" && (
            <>
              <button onClick={handleGoogle} style={{ ...S.btnSecondary, display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginBottom: "20px" }}>
                <svg width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                Continue with Google
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
                <div style={{ flex: 1, height: "1px", background: "#1f2937" }} />
                <span style={{ color: "#4b5563", fontSize: "12px" }}>or</span>
                <div style={{ flex: 1, height: "1px", background: "#1f2937" }} />
              </div>
            </>
          )}
          <label style={S.label}>Email</label>
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="you@example.com"
            style={{ ...S.input, marginBottom: "14px" }} onKeyDown={e => e.key === "Enter" && handle()} />
          {mode !== "forgot" && (
            <>
              <label style={S.label}>Password</label>
              <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="••••••••"
                style={{ ...S.input, marginBottom: mode === "signin" ? "6px" : "18px" }} onKeyDown={e => e.key === "Enter" && handle()} />
              {mode === "signin" && (
                <div style={{ textAlign: "right", marginBottom: "18px" }}>
                  <button onClick={() => { setMode("forgot"); setError(""); setMessage(""); }} style={{ background: "none", border: "none", color: "#3b82f6", fontSize: "12px", cursor: "pointer", padding: 0 }}>Forgot password?</button>
                </div>
              )}
            </>
          )}
          {error && <div style={{ color: "#f87171", fontSize: "13px", marginBottom: "12px", textAlign: "center" }}>{error}</div>}
          {message && <div style={{ color: "#34d399", fontSize: "13px", marginBottom: "12px", textAlign: "center" }}>{message}</div>}
          <button onClick={handle} disabled={loading} style={{ ...S.btnPrimary, opacity: loading ? 0.7 : 1 }}>
            {loading ? "..." : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}
          </button>
          <div style={{ textAlign: "center", marginTop: "18px", fontSize: "13px", color: "#6b7280" }}>
            {mode === "signin" && <>No account? <button onClick={() => { setMode("signup"); setError(""); setMessage(""); }} style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", fontWeight: 600, padding: 0 }}>Sign up</button></>}
            {mode === "signup" && <>Have an account? <button onClick={() => { setMode("signin"); setError(""); setMessage(""); }} style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", fontWeight: 600, padding: 0 }}>Sign in</button></>}
            {mode === "forgot" && <button onClick={() => { setMode("signin"); setError(""); setMessage(""); }} style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", fontWeight: 600, padding: 0 }}>Back to sign in</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Mini Calendar ────────────────────────────────────────────────────────────
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function MiniCalendar({ habit, today, onToggle, pausePeriods }) {
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
    if (isCurrentMonth) return; // can't go past current month
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
        {cells.map((cell, i) => {
          if (!cell.curr) return <div key={i} style={{ padding: "4px 0", fontSize: "11px", color: "#2d3748" }}>{cell.day}</div>;
          const cellDate = new Date(viewYear, viewMonth, cell.day);
          const dateStr = getDateStr(cellDate);
          const isToday = isSameDay(cellDate, todayDate);
          const isDone = habit.completedDates?.includes(dateStr);
          const twoDaysAgo = new Date(todayDate); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
          const createdStr = (habit.createdDate || habit.created_date || getDateStr(todayDate)).substring(0, 10);
          const habitCreatedDate = parseDateLocal(createdStr);
          const isFuture = cellDate > todayDate && !isToday;
          const isTooOld = cellDate < twoDaysAgo || cellDate < habitCreatedDate;
          const isPausedDay = isDatePaused(pausePeriods || [], dateStr);
          const dow = cellDate.getDay();
          const isScheduled = habit.frequency === "daily" || (habit.days && habit.days.includes(dow));
          const isBlocked = isFuture || isTooOld || isPausedDay || !isScheduled;
          let bg = "transparent", color = "#4b5563", border = "none";
          if (isPausedDay) { color = "#374151"; }
          else if (isToday && isDone) { bg = "#22c55e"; color = "#fff"; }
          else if (isToday) { bg = "transparent"; color = "#60a5fa"; border = "1.5px solid #3b82f6"; }
          else if (isDone) { bg = "#16a34a33"; color = "#22c55e"; }
          else if (!isScheduled || isFuture || isTooOld) { color = "#374151"; }
          return (
            <div key={i} onClick={() => !isBlocked && onToggle(dateStr)}
              style={{ fontSize: "11px", borderRadius: "50%", width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", cursor: isBlocked ? "default" : "pointer", background: bg, color, border, fontWeight: isToday ? 700 : 400, transition: "background 0.15s", opacity: isPausedDay ? 0.25 : !isScheduled ? 0.3 : 1 }}>
              {cell.day}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Habit Card ───────────────────────────────────────────────────────────────
function HabitCard({ habit, today, onToggle, onDelete, onEdit, isPaused, pausePeriods }) {
  const todayDow = new Date().getDay();
  const isScheduledToday = habit.frequency === "daily" || (habit.days && habit.days.includes(todayDow));
  const doneToday = habit.completedDates?.includes(today);
  return (
    <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "14px", padding: "18px", minWidth: "240px", flex: "1 1 260px", maxWidth: "340px", boxShadow: "0 1px 3px rgba(0,0,0,0.3)", transition: "border-color 0.2s", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: doneToday ? "#10b981" : "#2563eb", flexShrink: 0, marginTop: "1px" }} />
          <div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "15px", color: "#f9fafb", letterSpacing: "-0.01em" }}>{habit.name}</div>
            {habit.frequency === "weekly" && habit.days && (
              <div style={{ display: "flex", gap: "4px", marginTop: "6px", flexWrap: "wrap" }}>
                {DAYS_SHORT.map((d, i) => <span key={i} style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "999px", fontWeight: 600, background: habit.days.includes(i) ? "#2563eb" : "#1f293700", border: "1px solid", borderColor: habit.days.includes(i) ? "#2563eb" : "#1f2937", color: habit.days.includes(i) ? "#fff" : "#4b5563" }}>{d}</span>)}
              </div>
            )}
            {habit.frequency === "daily" && <span style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "999px", background: "#2563eb", border: "1px solid #2563eb", color: "#fff", fontWeight: 600, marginTop: "6px", display: "inline-block" }}>Daily</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          <button onClick={() => onEdit(habit)} style={{ background: "none", border: "none", cursor: "pointer", color: "#4b5563", fontSize: "13px", padding: "4px", borderRadius: "6px" }}>✏️</button>
          <button onClick={() => onDelete(habit.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#4b5563", fontSize: "13px", padding: "4px", borderRadius: "6px" }}>✕</button>
        </div>
      </div>
      <div style={{ flex: 1 }}><MiniCalendar habit={habit} today={today} pausePeriods={pausePeriods || []} onToggle={date => onToggle(habit.id, date)} /></div>
      {isScheduledToday && !isPaused && (
        <button onClick={() => onToggle(habit.id, today)}
          style={{ width: "100%", marginTop: "12px", padding: "10px", borderRadius: "8px", border: "1px solid", cursor: "pointer", fontWeight: 700, fontSize: "13px", fontFamily: "inherit", background: doneToday ? "#10b98120" : "#2563eb", borderColor: doneToday ? "#10b98140" : "#2563eb", color: doneToday ? "#10b981" : "#fff", transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
          {doneToday ? "✓ Done!" : "Mark as Done Today"}
        </button>
      )}
    </div>
  );
}

// ─── Habit Modal ──────────────────────────────────────────────────────────────
function HabitModal({ habit, onSave, onClose }) {
  const [name, setName] = useState(habit?.name || "");
  const [frequency, setFrequency] = useState(habit?.frequency || "daily");
  const [days, setDays] = useState(habit?.days || []);
  const toggleDay = i => setDays(prev => prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i]);
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#111827", border: "1px solid #374151", borderRadius: "16px", padding: "28px", width: "360px", maxWidth: "90vw" }}>
        <h2 style={{ margin: "0 0 20px", color: "#f9fafb", fontSize: "18px" }}>{habit ? "Edit Habit" : "New Habit"}</h2>
        <label style={S.label}>Habit name</label>
        <input value={name} onChange={e => setName(e.target.value)} style={{ ...S.input, marginBottom: "14px" }} placeholder="e.g. Morning Run" autoFocus />
        <label style={S.label}>Frequency</label>
        <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
          {["daily", "weekly"].map(f => <button key={f} onClick={() => setFrequency(f)} style={{ flex: 1, padding: "8px", borderRadius: "8px", border: "1px solid", borderColor: frequency === f ? "#2563eb" : "#374151", background: frequency === f ? "#1d4ed8" : "#1f2937", color: frequency === f ? "#fff" : "#9ca3af", cursor: "pointer", fontWeight: 600, fontSize: "13px", textTransform: "capitalize" }}>{f}</button>)}
        </div>
        {frequency === "weekly" && (
          <div style={{ marginBottom: "16px" }}>
            <label style={S.label}>Select days</label>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {DAYS_SHORT.map((d, i) => <button key={i} onClick={() => toggleDay(i)} style={{ padding: "6px 10px", borderRadius: "999px", border: "1px solid", borderColor: days.includes(i) ? "#2563eb" : "#374151", background: days.includes(i) ? "#2563eb" : "#1f2937", color: days.includes(i) ? "#fff" : "#9ca3af", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}>{d}</button>)}
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
          <button onClick={onClose} style={S.btnSecondary}>Cancel</button>
          <button onClick={() => { if (name.trim()) onSave({ name: name.trim(), frequency, days: frequency === "weekly" ? days : [] }); }} style={S.btnPrimary}>{habit ? "Save" : "Add Habit"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Todo Item + Modal ────────────────────────────────────────────────────────
function TodoItem({ todo, onToggle, onDelete }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", background: "#111827", border: "1px solid #1f2937", borderRadius: "12px", marginBottom: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "border-color 0.15s" }}>
      <button onClick={() => onToggle(todo.id)} style={{ width: "20px", height: "20px", borderRadius: "6px", border: "1.5px solid", borderColor: todo.done ? "#10b981" : "#374151", background: todo.done ? "#10b981" : "transparent", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "11px", fontWeight: 900, transition: "all 0.15s" }}>{todo.done ? "✓" : ""}</button>
      <span style={{ flex: 1, color: todo.done ? "#4b5563" : "#e5e7eb", fontSize: "14px", textDecoration: todo.done ? "line-through" : "none" }}>{todo.text}</span>
      {todo.priority && <span style={{ fontSize: "10px", padding: "3px 10px", borderRadius: "999px", fontWeight: 700, border: "1px solid", background: todo.priority === "high" ? "#7f1d1d30" : todo.priority === "med" ? "#78350f30" : "#1c3a2a30", borderColor: todo.priority === "high" ? "#fca5a540" : todo.priority === "med" ? "#fcd34d40" : "#86efac40", color: todo.priority === "high" ? "#fca5a5" : todo.priority === "med" ? "#fcd34d" : "#86efac" }}>{todo.priority}</span>}
      <button onClick={() => onDelete(todo.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#374151", fontSize: "13px", padding: "4px", borderRadius: "6px" }}>✕</button>
    </div>
  );
}
function TodoModal({ onSave, onClose }) {
  const [text, setText] = useState("");
  const [priority, setPriority] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#111827", border: "1px solid #374151", borderRadius: "16px", padding: "28px", width: "360px", maxWidth: "90vw" }}>
        <h2 style={{ margin: "0 0 20px", color: "#f9fafb", fontSize: "18px" }}>New To-Do</h2>
        <input value={text} onChange={e => setText(e.target.value)} style={{ ...S.input, marginBottom: "14px" }} placeholder="What needs to be done?" autoFocus onKeyDown={e => e.key === "Enter" && text.trim() && onSave({ text: text.trim(), priority })} />
        <label style={S.label}>Priority (optional)</label>
        <div style={{ display: "flex", gap: "8px" }}>
          {["", "high", "med", "low"].map(p => <button key={p} onClick={() => setPriority(p)} style={{ flex: 1, padding: "7px", borderRadius: "8px", border: "1px solid", borderColor: priority === p ? "#2563eb" : "#374151", background: priority === p ? "#1d4ed8" : "#1f2937", color: priority === p ? "#fff" : "#9ca3af", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}>{p === "" ? "None" : p[0].toUpperCase() + p.slice(1)}</button>)}
        </div>
        <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
          <button onClick={onClose} style={S.btnSecondary}>Cancel</button>
          <button onClick={() => { if (text.trim()) onSave({ text: text.trim(), priority }); }} style={S.btnPrimary}>Add</button>
        </div>
      </div>
    </div>
  );
}

// ─── Analytics Tab ────────────────────────────────────────────────────────────
function AnalyticsTab({ habits, todos, pausePeriods }) {
  const [range, setRange] = useState("7days");
  const today = new Date();
  const todayStr = getDateStr(today);

  const currentStreak = calcStreak(habits, pausePeriods);

  const bestStreak = (() => {
    const allDates = [...new Set(habits.flatMap(h => h.completedDates || []))].sort();
    let best = 0, cur = 0, prev = null;
    for (const ds of allDates) {
      if (isDatePaused(pausePeriods, ds)) { prev = ds; continue; }
      const complete = isDayComplete(habits, ds);
      if (complete === null) { prev = ds; continue; }
      if (!complete) { cur = 0; prev = ds; continue; }
      if (prev) {
        const d = new Date(prev); d.setDate(d.getDate() + 1);
        let contiguous = true;
        while (getDateStr(d) < ds) { const s = getDateStr(d); if (!isDatePaused(pausePeriods, s) && isDayComplete(habits, s) !== null) { contiguous = false; break; } d.setDate(d.getDate() + 1); }
        cur = contiguous ? cur + 1 : 1;
      } else cur = 1;
      if (cur > best) best = cur;
      prev = ds;
    }
    return best;
  })();

  // Completion rate: actual completions / total scheduled habit-days since earliest habit
  const completionRate = (() => {
    if (habits.length === 0) return null;
    const earliestDate = habits.reduce((earliest, h) => {
      const created = (h.createdDate || todayStr).substring(0, 10);
      return created < earliest ? created : earliest;
    }, todayStr);

    let scheduledCount = 0;
    let completedCount = 0;
    const d = new Date(earliestDate);
    d.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(0, 0, 0, 0);

    while (d <= end) {
      const ds = getDateStr(d);
      if (!isDatePaused(pausePeriods, ds)) {
        const dow = d.getDay();
        habits.forEach(h => {
          const scheduled = h.frequency === "daily" || (h.days && h.days.includes(dow));
          if (scheduled) {
            scheduledCount++;
            if ((h.completedDates || []).map(x => x.substring(0, 10)).includes(ds)) completedCount++;
          }
        });
      }
      d.setDate(d.getDate() + 1);
    }
    if (scheduledCount === 0) return null;
    return Math.round((completedCount / scheduledCount) * 100);
  })();

  // Total individual habit completions
  const totalCompletions = habits.reduce((sum, h) => sum + (h.completedDates || []).length, 0);

  const getRangeDays = () => range === "7days" ? 7 : range === "30days" ? 30 : range === "year" ? 365 : null;
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() - (6 - i));
    const ds = getDateStr(d);
    return { label: DAYS_SHORT[d.getDay()], habits: habits.filter(h => (h.completedDates || []).map(x => x.substring(0,10)).includes(ds)).length, tasks: todos.filter(t => t.doneDate === ds).length };
  });
  const maxVal = Math.max(...last7.flatMap(d => [d.habits, d.tasks]), 1);

  const stats = [
    { icon: "🔥", label: "Current Streak", value: `${currentStreak} days`, sub: "All scheduled habits done" },
    { icon: "🏆", label: "Best Streak", value: `${bestStreak} days`, sub: "Personal record" },
    { icon: "📊", label: "Completion Rate", value: completionRate !== null ? `${completionRate}%` : "—", sub: `${totalCompletions} total completions` },
    { icon: "📅", label: "Active Habits", value: habits.length, sub: `${todos.filter(t => t.done).length}/${todos.length} tasks done` },
  ];

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "10px 0" }}>
      <h1 style={{ fontFamily: "'Syne', sans-serif", textAlign: "center", color: "#f9fafb", fontWeight: 800, fontSize: "28px", marginBottom: "24px", letterSpacing: "-0.02em" }}>Your Analytics</h1>
      <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginBottom: "28px" }}>
        {[["7days", "7 Days"], ["30days", "30 Days"], ["year", "Year"], ["all", "All Time"]].map(([val, label]) => (
          <button key={val} onClick={() => setRange(val)} style={{ padding: "7px 18px", borderRadius: "999px", border: "1px solid", borderColor: range === val ? "#2563eb" : "#374151", background: range === val ? "#2563eb" : "#111827", color: range === val ? "#fff" : "#9ca3af", cursor: "pointer", fontWeight: 600, fontSize: "13px", transition: "all 0.15s", fontFamily: "inherit" }}>{label}</button>
        ))}
      </div>
      <div className="ht-analytics-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px", marginBottom: "28px" }}>
        {stats.map((stat, i) => (
          <div key={i} style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "14px", padding: "20px 18px", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize: "20px", marginBottom: "10px" }}>{stat.icon}</div>
            <div style={{ color: "#6b7280", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>{stat.label}</div>
            <div style={{ fontFamily: "'Syne', sans-serif", color: "#f9fafb", fontWeight: 800, fontSize: "26px", letterSpacing: "-0.02em" }}>{stat.value}</div>
            {stat.sub && <div style={{ color: "#4b5563", fontSize: "10px", marginTop: "6px" }}>{stat.sub}</div>}
          </div>
        ))}
      </div>
      <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "14px", padding: "22px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, fontFamily: "'Syne', sans-serif", color: "#f9fafb", fontWeight: 700, letterSpacing: "-0.01em" }}>Weekly Activity</h3>
          <div style={{ display: "flex", gap: "16px", fontSize: "11px", color: "#9ca3af" }}>
            <span><span style={{ display: "inline-block", width: "10px", height: "10px", background: "#3b82f6", borderRadius: "2px", marginRight: "5px" }} />Habits</span>
            <span><span style={{ display: "inline-block", width: "10px", height: "10px", background: "#22c55e", borderRadius: "2px", marginRight: "5px" }} />Tasks</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "10px", height: "120px" }}>
          {last7.map((d, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: "2px", width: "100%" }}>
                <div style={{ background: "#3b82f6", borderRadius: "4px 4px 0 0", height: `${(d.habits / maxVal) * 90}%`, minHeight: d.habits > 0 ? "4px" : "0", transition: "height 0.5s" }} />
                <div style={{ background: "#22c55e", borderRadius: "4px 4px 0 0", height: `${(d.tasks / maxVal) * 90}%`, minHeight: d.tasks > 0 ? "4px" : "0", transition: "height 0.5s" }} />
              </div>
              <div style={{ color: "#6b7280", fontSize: "11px", marginTop: "6px" }}>{d.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


// ─── Journal Tab ──────────────────────────────────────────────────────────────
const MOOD_OPTIONS = [
  { value: "great", label: "Great", emoji: "🌟" },
  { value: "good",  label: "Good",  emoji: "😊" },
  { value: "okay",  label: "Okay",  emoji: "😐" },
  { value: "bad",   label: "Bad",   emoji: "😔" },
];
const CHAR_LIMIT = 2000;

function JournalTab({ journalEntries, setJournalEntries, session, today }) {
  const [currentDate, setCurrentDate] = useState(today);
  const [draft, setDraft] = useState("");
  const [mood, setMood] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const autosaveTimer = useRef(null);
  const latestDraft = useRef(draft);
  const latestMood = useRef(mood);
  const latestDate = useRef(currentDate);

  const sortedDates = Object.keys(journalEntries).sort();
  const entry = journalEntries[currentDate];

  // Load entry into draft when date changes
  useEffect(() => {
    setDraft(entry?.content || "");
    setMood(entry?.mood || "");
    setSaved(false);
  }, [currentDate]);

  // Keep refs in sync
  useEffect(() => { latestDraft.current = draft; }, [draft]);
  useEffect(() => { latestMood.current = mood; }, [mood]);
  useEffect(() => { latestDate.current = currentDate; }, [currentDate]);

  const save = async (draftVal, moodVal, dateVal) => {
    if (!draftVal.trim() && !moodVal) return;
    setSaving(true);
    const payload = { user_id: session.user.id, entry_date: dateVal, content: draftVal.trim(), mood: moodVal || null };
    const { data, error } = await supabase.from("journal_entries").upsert(payload, { onConflict: "user_id,entry_date" }).select().single();
    if (!error && data) {
      setJournalEntries(prev => ({ ...prev, [dateVal]: data }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  };

  const scheduleAutosave = () => {
    if (latestDate.current > today) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      save(latestDraft.current, latestMood.current, latestDate.current);
    }, 1000);
  };

  const goBack = () => {
    const d = parseDateLocal(currentDate);
    d.setDate(d.getDate() - 1);
    setCurrentDate(getDateStr(d));
  };
  const goForward = () => {
    if (currentDate >= today) return;
    const d = parseDateLocal(currentDate);
    d.setDate(d.getDate() + 1);
    setCurrentDate(getDateStr(d));
  };
  const jumpPrevWritten = () => {
    const prev = sortedDates.filter(d => d < currentDate).pop();
    if (prev) setCurrentDate(prev);
  };
  const jumpNextWritten = () => {
    const next = sortedDates.find(d => d > currentDate);
    if (next) setCurrentDate(next);
  };

  const hasPrevWritten = sortedDates.some(d => d < currentDate);
  const hasNextWritten = sortedDates.some(d => d > currentDate);
  const isToday = currentDate === today;
  const isFuture = currentDate > today;

  const formatDisplayDate = (ds) => {
    const d = parseDateLocal(ds);
    const opts = { weekday: "long", day: "numeric", month: "long", year: "numeric" };
    return d.toLocaleDateString("en-GB", opts);
  };

  const charsLeft = CHAR_LIMIT - draft.length;

  return (
    <div style={{ maxWidth: "680px", margin: "0 auto", padding: "10px 0" }}>
      {/* Date nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "28px" }}>
        <div style={{ display: "flex", gap: "6px" }}>
          <button onClick={jumpPrevWritten} disabled={!hasPrevWritten} title="Previous entry" style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #374151", background: "#111827", color: hasPrevWritten ? "#9ca3af" : "#2d3748", cursor: hasPrevWritten ? "pointer" : "default", fontSize: "16px", fontWeight: 700 }}>«</button>
          <button onClick={goBack} title="Previous day" style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #374151", background: "#111827", color: "#9ca3af", cursor: "pointer", fontSize: "16px", fontWeight: 700 }}>‹</button>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#f9fafb", fontWeight: 700, fontSize: "16px" }}>
            {isToday ? "Today" : formatDisplayDate(currentDate)}
          </div>
          {isToday && <div style={{ color: "#6b7280", fontSize: "12px", marginTop: "2px" }}>{formatDisplayDate(currentDate)}</div>}
          {entry && <div style={{ color: "#22c55e", fontSize: "11px", marginTop: "4px" }}>● Entry saved</div>}
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          <button onClick={goForward} disabled={isToday} title="Next day" style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #374151", background: "#111827", color: isToday ? "#2d3748" : "#9ca3af", cursor: isToday ? "default" : "pointer", fontSize: "16px", fontWeight: 700 }}>›</button>
          <button onClick={jumpNextWritten} disabled={!hasNextWritten} title="Next entry" style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #374151", background: "#111827", color: hasNextWritten ? "#9ca3af" : "#2d3748", cursor: hasNextWritten ? "pointer" : "default", fontSize: "16px", fontWeight: 700 }}>»</button>
        </div>
      </div>

      {/* Page */}
      <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "16px", padding: "28px" }}>
        {/* Mood */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{ color: "#6b7280", fontSize: "12px", fontWeight: 600, marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>How are you feeling?</div>
          <div style={{ display: "flex", gap: "8px" }}>
            {MOOD_OPTIONS.map(m => (
              <button key={m.value} onClick={() => { setMood(prev => prev === m.value ? "" : m.value); scheduleAutosave(); }} style={{ flex: 1, padding: "10px 6px", borderRadius: "10px", border: "1px solid", borderColor: mood === m.value ? "#2563eb" : "#1f2937", background: mood === m.value ? "#1d4ed820" : "#0d1117", cursor: "pointer", textAlign: "center", transition: "all 0.15s" }}>
                <div style={{ fontSize: "20px", marginBottom: "4px" }}>{m.emoji}</div>
                <div style={{ fontSize: "11px", color: mood === m.value ? "#60a5fa" : "#4b5563", fontWeight: 600 }}>{m.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Text area */}
        <div style={{ marginBottom: "16px" }}>
          <div style={{ color: "#6b7280", fontSize: "12px", fontWeight: 600, marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Your thoughts</div>
          <textarea
            value={draft}
            onChange={e => { if (e.target.value.length <= CHAR_LIMIT) { setDraft(e.target.value); scheduleAutosave(); } }}
            placeholder={isFuture ? "" : "Write anything — what happened today, how you feel, what you're grateful for..."}
            disabled={isFuture}
            style={{ width: "100%", minHeight: "220px", padding: "14px", borderRadius: "10px", border: "1px solid #1f2937", background: "#0d1117", color: "#e5e7eb", fontSize: "15px", fontFamily: "inherit", lineHeight: 1.7, resize: "vertical", outline: "none", boxSizing: "border-box", cursor: isFuture ? "default" : "text" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
            <span style={{ fontSize: "11px", color: charsLeft < 100 ? "#f87171" : "#4b5563" }}>{charsLeft} characters remaining</span>
            <span style={{ fontSize: "11px", color: saving ? "#6b7280" : "#22c55e", fontWeight: 600, minWidth: "60px", textAlign: "right" }}>{saving ? "Saving..." : saved ? "✓ Saved" : ""}</span>
          </div>
        </div>
      </div>

      {/* Entry count */}
      {sortedDates.length > 0 && (
        <div style={{ textAlign: "center", marginTop: "16px", color: "#4b5563", fontSize: "12px" }}>
          {sortedDates.length} {sortedDates.length === 1 ? "entry" : "entries"} written
        </div>
      )}
    </div>
  );
}


// ─── DragSheet ────────────────────────────────────────────────────────────────
function DragSheet({ onClose, children }) {
  const [dragY, setDragY] = useState(0);
  const [startY, setStartY] = useState(null);
  const [dragging, setDragging] = useState(false);

  const onTouchStart = e => { setStartY(e.touches[0].clientY); setDragging(true); };
  const onTouchMove = e => {
    if (!dragging || startY === null) return;
    const delta = e.touches[0].clientY - startY;
    if (delta > 0) setDragY(delta);
  };
  const onTouchEnd = () => {
    if (dragY > 120) { onClose(); }
    setDragY(0); setStartY(null); setDragging(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000d", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "20px 20px 0 0", padding: "16px 24px 40px", width: "100%", maxWidth: "480px", maxHeight: "92vh", overflowY: dragY > 10 ? "hidden" : "auto", transform: `translateY(${dragY}px)`, transition: dragging ? "none" : "transform 0.3s ease", willChange: "transform", touchAction: "pan-x" }}>
        {/* Drag handle */}
        <div style={{ width: "40px", height: "4px", background: "#374151", borderRadius: "999px", margin: "0 auto 20px", cursor: "grab" }} />
        {children}
      </div>
    </div>
  );
}

// ─── Profile Modal ────────────────────────────────────────────────────────────
function ProfileModal({ session, profile, onUpdate, onClose }) {
  const [tab, setTab] = useState("profile");
  const [username, setUsername] = useState(profile?.username || "");
  const [usernameMsg, setUsernameMsg] = useState("");
  const [usernameErr, setUsernameErr] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [emailErr, setEmailErr] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || null);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const avatarLetter = (profile?.username || session.user.email || "?")[0].toUpperCase();

  const uploadAvatar = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast("Image must be under 2MB", "error"); return; }
    setUploadingAvatar(true);
    const ext = file.name.split(".").pop();
    const path = `${session.user.id}/avatar.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (upErr) { showToast("Upload failed", "error"); setUploadingAvatar(false); return; }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = data.publicUrl + "?t=" + Date.now();
    await supabase.from("profiles").upsert({ id: session.user.id, avatar_url: url, updated_at: new Date().toISOString() });
    setAvatarUrl(url);
    onUpdate(prev => ({ ...prev, avatar_url: url }));
    showToast("Profile photo updated!");
    setUploadingAvatar(false);
  };

  const removeAvatar = async () => {
    await supabase.storage.from("avatars").remove([`${session.user.id}/avatar.jpg`, `${session.user.id}/avatar.png`, `${session.user.id}/avatar.jpeg`, `${session.user.id}/avatar.webp`]);
    await supabase.from("profiles").upsert({ id: session.user.id, avatar_url: null, updated_at: new Date().toISOString() });
    setAvatarUrl(null);
    onUpdate(prev => ({ ...prev, avatar_url: null }));
    showToast("Photo removed");
  };

  const saveUsername = async () => {
    setUsernameMsg(""); setUsernameErr("");
    if (!username.trim()) return;
    if (username.length < 3) { setUsernameErr("Must be at least 3 characters"); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) { setUsernameErr("Letters, numbers and underscores only"); return; }
    setSavingUsername(true);
    const { error } = await supabase.from("profiles").upsert({ id: session.user.id, username: username.trim(), updated_at: new Date().toISOString() });
    if (error) setUsernameErr(error.message.includes("unique") ? "Username already taken" : error.message);
    else { onUpdate(prev => ({ ...prev, username: username.trim() })); showToast("Username saved!"); }
    setSavingUsername(false);
  };

  const saveEmail = async () => {
    setEmailMsg(""); setEmailErr("");
    if (!newEmail.trim()) return;
    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    if (error) setEmailErr(error.message);
    else { showToast("Confirmation sent — check your inbox"); setEmailMsg("Confirmation sent to both addresses."); }
    setSavingEmail(false);
  };

  const savePassword = async () => {
    setPwMsg(""); setPwErr("");
    if (!newPw) return;
    if (newPw.length < 8) { setPwErr("Must be at least 8 characters"); return; }
    if (newPw !== confirmPw) { setPwErr("Passwords don't match"); return; }
    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    if (error) setPwErr(error.message);
    else { showToast("Password updated!"); setNewPw(""); setConfirmPw(""); }
    setSavingPw(false);
  };

  const sendResetLink = async () => {
    setResetSent(true);
    await supabase.auth.resetPasswordForEmail(session.user.email);
    showToast("Reset link sent to " + session.user.email);
    setTimeout(() => setResetSent(false), 4000);
  };

  const inp = { width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #1f2937", background: "#0d1117", color: "#f9fafb", fontSize: "14px", boxSizing: "border-box", fontFamily: "inherit", outline: "none", marginBottom: "12px" };
  const lbl = { color: "#6b7280", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: "7px" };
  const tabStyle = (key) => ({ flex: 1, padding: "8px 6px", borderRadius: "8px", border: "1px solid", borderColor: tab === key ? "#2563eb" : "#1f2937", background: tab === key ? "#2563eb" : "transparent", color: tab === key ? "#fff" : "#6b7280", cursor: "pointer", fontWeight: 600, fontSize: "12px", fontFamily: "inherit", transition: "all 0.15s" });

  return (
    <DragSheet onClose={onClose}>
      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: "20px", left: "50%", transform: "translateX(-50%)", background: toast.type === "error" ? "#7f1d1d" : "#064e3b", border: `1px solid ${toast.type === "error" ? "#f87171" : "#10b981"}`, borderRadius: "10px", padding: "10px 20px", color: toast.type === "error" ? "#fca5a5" : "#6ee7b7", fontWeight: 600, fontSize: "14px", zIndex: 300, whiteSpace: "nowrap", boxShadow: "0 8px 24px rgba(0,0,0,0.4)", animation: "fadeUp 0.2s ease" }}>
          {toast.type !== "error" && "✓ "}{toast.msg}
        </div>
      )}

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <h2 style={{ margin: 0, fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "20px", color: "#f9fafb", letterSpacing: "-0.02em" }}>Your Profile</h2>
          <button onClick={onClose} style={{ background: "#1f2937", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: "16px", width: "32px", height: "32px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>

        {/* Avatar upload */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "24px" }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            {avatarUrl
              ? <img src={avatarUrl} alt="avatar" style={{ width: "64px", height: "64px", borderRadius: "50%", objectFit: "cover", border: "2px solid #2563eb" }} />
              : <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "26px", color: "#fff" }}>{avatarLetter}</div>
            }
            <label style={{ position: "absolute", bottom: "-2px", right: "-2px", width: "22px", height: "22px", background: "#374151", border: "2px solid #111827", borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px" }}>
              {uploadingAvatar ? "⏳" : "📷"}
              <input type="file" accept="image/*" onChange={uploadAvatar} style={{ display: "none" }} />
            </label>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "16px", color: "#f9fafb" }}>{profile?.username || "No username yet"}</div>
            <div style={{ fontSize: "12px", color: "#4b5563", marginTop: "2px", marginBottom: "8px" }}>{session.user.email}</div>
            {avatarUrl && <button onClick={removeAvatar} style={{ background: "none", border: "none", color: "#6b7280", fontSize: "11px", cursor: "pointer", padding: 0, textDecoration: "underline" }}>Remove photo</button>}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "20px" }}>
          <button style={tabStyle("profile")} onClick={() => setTab("profile")}>Username</button>
          <button style={tabStyle("email")} onClick={() => setTab("email")}>Email</button>
          <button style={tabStyle("password")} onClick={() => setTab("password")}>Password</button>
        </div>

        {/* Username tab */}
        {tab === "profile" && (
          <div>
            <label style={lbl}>Username</label>
            <input value={username} onChange={e => setUsername(e.target.value)} style={inp} placeholder="e.g. john_doe" onKeyDown={e => e.key === "Enter" && saveUsername()} />
            <div style={{ fontSize: "11px", color: "#374151", marginBottom: "14px" }}>Letters, numbers and underscores · min 3 chars</div>
            {usernameErr && <div style={{ color: "#f87171", fontSize: "13px", marginBottom: "10px" }}>{usernameErr}</div>}
            <button onClick={saveUsername} disabled={savingUsername} style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "14px", cursor: "pointer", fontFamily: "inherit", opacity: savingUsername ? 0.7 : 1 }}>{savingUsername ? "Saving..." : "Save Username"}</button>
          </div>
        )}

        {/* Email tab */}
        {tab === "email" && (
          <div>
            <div style={{ background: "#0d1117", border: "1px solid #1f2937", borderRadius: "8px", padding: "12px", marginBottom: "16px", fontSize: "13px", color: "#4b5563" }}>
              Current: <span style={{ color: "#9ca3af", fontWeight: 600 }}>{session.user.email}</span>
            </div>
            <label style={lbl}>New Email Address</label>
            <input value={newEmail} onChange={e => setNewEmail(e.target.value)} type="email" style={inp} placeholder="new@email.com" />
            {emailErr && <div style={{ color: "#f87171", fontSize: "13px", marginBottom: "10px" }}>{emailErr}</div>}
            {emailMsg && <div style={{ color: "#10b981", fontSize: "13px", marginBottom: "10px" }}>{emailMsg}</div>}
            <button onClick={saveEmail} disabled={savingEmail} style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "14px", cursor: "pointer", fontFamily: "inherit", opacity: savingEmail ? 0.7 : 1 }}>{savingEmail ? "Sending..." : "Update Email"}</button>
          </div>
        )}

        {/* Password tab */}
        {tab === "password" && (
          <div>
            <label style={lbl}>New Password</label>
            <input value={newPw} onChange={e => setNewPw(e.target.value)} type="password" style={inp} placeholder="Min. 8 characters" />
            <label style={lbl}>Confirm Password</label>
            <input value={confirmPw} onChange={e => setConfirmPw(e.target.value)} type="password" style={inp} placeholder="Repeat new password" />
            {pwErr && <div style={{ color: "#f87171", fontSize: "13px", marginBottom: "10px" }}>{pwErr}</div>}
            <button onClick={savePassword} disabled={savingPw} style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "14px", cursor: "pointer", fontFamily: "inherit", opacity: savingPw ? 0.7 : 1, marginBottom: "10px" }}>{savingPw ? "Updating..." : "Update Password"}</button>
            <button onClick={sendResetLink} disabled={resetSent} style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #1f2937", background: resetSent ? "#064e3b" : "transparent", color: resetSent ? "#6ee7b7" : "#6b7280", fontWeight: 600, fontSize: "13px", cursor: resetSent ? "default" : "pointer", fontFamily: "inherit", transition: "all 0.3s" }}>
              {resetSent ? "✓ Link sent to your email!" : "Send reset link instead"}
            </button>
          </div>
        )}

        {/* Sign out */}
        <div style={{ borderTop: "1px solid #1f2937", marginTop: "24px", paddingTop: "16px" }}>
          <button onClick={() => supabase.auth.signOut()} style={{ width: "100%", padding: "11px", borderRadius: "8px", border: "1px solid #374151", background: "transparent", color: "#6b7280", fontWeight: 600, fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}>Sign out</button>
        </div>
    </DragSheet>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function HabiTick() {
  const [session, setSession] = useState(undefined); // undefined=loading, null=signed out
  const [tab, setTab] = useState("tasks");
  const [habits, setHabits] = useState([]);
  const [todos, setTodos] = useState([]);
  const [pausePeriods, setPausePeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showHabitModal, setShowHabitModal] = useState(false);
  const [editingHabit, setEditingHabit] = useState(null);
  const [showTodoModal, setShowTodoModal] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showTodayOnly, setShowTodayOnly] = useState(false);
  const [journalEntries, setJournalEntries] = useState({}); // keyed by date string
  const [profile, setProfile] = useState(null);
  const [showProfile, setShowProfile] = useState(false);

  const today = getTodayStr();
  const todayDow = new Date().getDay();

  // ── Auth listener ──────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s ?? null));
    return () => subscription.unsubscribe();
  }, []);

  // ── Load all data when signed in ───────────────────────────────────────────
  useEffect(() => {
    if (session === undefined) return;
    if (!session) { setLoading(false); return; }
    loadAll();
  }, [session]);

  const loadAll = async () => {
    setLoading(true);
    const uid = session.user.id;
    const [habitsRes, completionsRes, todosRes, pauseRes, journalRes, profileRes] = await Promise.all([
      supabase.from("habits").select("*").eq("user_id", uid).order("created_at"),
      supabase.from("habit_completions").select("habit_id, completed_date").eq("user_id", uid),
      supabase.from("todos").select("*").eq("user_id", uid).order("created_at"),
      supabase.from("pause_periods").select("*").eq("user_id", uid).order("created_at"),
      supabase.from("journal_entries").select("*").eq("user_id", uid).order("entry_date"),
      supabase.from("profiles").select("*").eq("id", uid).single(),
    ]);
    const completionsByHabit = {};
    (completionsRes.data || []).forEach(c => {
      if (!completionsByHabit[c.habit_id]) completionsByHabit[c.habit_id] = [];
      completionsByHabit[c.habit_id].push(c.completed_date.substring(0, 10));
    });
    setHabits((habitsRes.data || []).map(h => ({ ...h, createdDate: (h.created_date || getDateStr(new Date())).substring(0, 10), completedDates: completionsByHabit[h.id] || [] })));
    setTodos((todosRes.data || []).map(t => ({ ...t, doneDate: t.done_date ? t.done_date.substring(0, 10) : null })));
    setPausePeriods((pauseRes.data || []).map(p => ({ id: p.id, start: (p.start_date || '').substring(0, 10), end: p.end_date ? p.end_date.substring(0, 10) : null })));
    const entriesMap = {};
    (journalRes.data || []).forEach(e => { entriesMap[e.entry_date.substring(0, 10)] = e; });
    setJournalEntries(entriesMap);
    setProfile(profileRes.data || null);
    setLoading(false);
  };

  // ── Habit actions ──────────────────────────────────────────────────────────
  const toggleHabit = async (habitId, dateStr) => {
    const habit = habits.find(h => h.id === habitId);
    const isDone = habit.completedDates.includes(dateStr);
    setHabits(prev => prev.map(h => h.id !== habitId ? h : { ...h, completedDates: isDone ? h.completedDates.filter(d => d !== dateStr) : [...h.completedDates, dateStr] }));
    if (isDone) {
      await supabase.from("habit_completions").delete().eq("habit_id", habitId).eq("completed_date", dateStr);
    } else {
      await supabase.from("habit_completions").insert({ habit_id: habitId, user_id: session.user.id, completed_date: dateStr });
    }
  };

  const saveHabit = async ({ name, frequency, days }) => {
    if (editingHabit) {
      const { data } = await supabase.from("habits").update({ name, frequency, days }).eq("id", editingHabit.id).select().single();
      setHabits(prev => prev.map(h => h.id === editingHabit.id ? { ...h, ...data, createdDate: data.created_date } : h));
    } else {
      const { data } = await supabase.from("habits").insert({ user_id: session.user.id, name, frequency, days, created_date: today }).select().single();
      setHabits(prev => [...prev, { ...data, createdDate: data.created_date, completedDates: [] }]);
    }
    setShowHabitModal(false); setEditingHabit(null);
  };

  const deleteHabit = async id => {
    setHabits(prev => prev.filter(h => h.id !== id));
    await supabase.from("habits").delete().eq("id", id);
  };

  // ── Todo actions ───────────────────────────────────────────────────────────
  const addTodo = async ({ text, priority }) => {
    const { data } = await supabase.from("todos").insert({ user_id: session.user.id, text, priority: priority || null, done: false }).select().single();
    setTodos(prev => [...prev, { ...data, doneDate: null }]);
    setShowTodoModal(false);
  };

  const toggleTodo = async id => {
    const todo = todos.find(t => t.id === id);
    const nowDone = !todo.done;
    const doneDate = nowDone ? today : null;
    setTodos(prev => prev.map(t => t.id === id ? { ...t, done: nowDone, doneDate } : t));
    await supabase.from("todos").update({ done: nowDone, done_date: doneDate }).eq("id", id);
  };

  const deleteTodo = async id => {
    setTodos(prev => prev.filter(t => t.id !== id));
    await supabase.from("todos").delete().eq("id", id);
  };

  // ── Pause mode ─────────────────────────────────────────────────────────────
  const isPaused = pausePeriods.some(p => p.end === null);
  const togglePause = async () => {
    if (isPaused) {
      const active = pausePeriods.find(p => p.end === null);
      await supabase.from("pause_periods").update({ end_date: today }).eq("id", active.id);
      setPausePeriods(prev => prev.map(p => p.end === null ? { ...p, end: today.substring(0, 10) } : p));
    } else {
      const { data } = await supabase.from("pause_periods").insert({ user_id: session.user.id, start_date: today, end_date: null }).select().single();
      setPausePeriods(prev => [...prev, { id: data.id, start: (data.start_date || '').substring(0, 10), end: null }]);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const todayHabits = showTodayOnly ? habits.filter(h => h.frequency === "daily" || (h.days && h.days.includes(todayDow))) : habits;
  const doneToday = habits.filter(h => (h.frequency === "daily" || (h.days && h.days.includes(todayDow))) && (h.completedDates || []).includes(today)).length;
  const totalToday = habits.filter(h => h.frequency === "daily" || (h.days && h.days.includes(todayDow))).length;
  const currentStreak = calcStreak(habits, pausePeriods);
  const visibleTodos = showCompleted ? todos : todos.filter(t => !t.done);

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (session === undefined) return <div style={{ minHeight: "100vh", background: "#0d1117", display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280", fontFamily: "system-ui" }}>Loading...</div>;
  if (!session) return <AuthScreen />;

  // ── UI ─────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", fontFamily: "'DM Sans', system-ui, sans-serif", color: "#f9fafb" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@400;500;600;700;800&display=swap');
        html, body, #root { margin: 0; padding: 0; width: 100%; min-height: 100vh; }
        * { box-sizing: border-box; }
        button, input, textarea, select { font-family: inherit; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #374151; border-radius: 3px; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .ht-header-pills { display: flex; gap: 8px; align-items: center; }
        .ht-main { max-width: 1200px; margin: 0 auto; padding: 24px 40px 100px; }
        .ht-tabs { display: flex; justify-content: center; gap: 6px; padding: 18px 16px 10px; }
        .ht-habit-grid { display: flex; flex-wrap: wrap; gap: 14px; }
        .ht-bottom-nav { display: none; }
        .ht-header-username { display: inline; }
        @media (max-width: 640px) {
          .ht-header-pills { display: none; }
          .ht-main { padding: 70px 16px 90px; }
          .ht-tabs { display: none; }
          .ht-habit-grid { flex-direction: column; }
          .ht-habit-grid > * { max-width: 100% !important; min-width: 0 !important; flex: 1 1 100% !important; }
          .ht-bottom-nav { display: flex; position: fixed; bottom: 0; left: 0; right: 0; background: #0d1117; border-top: 1px solid #1f2937; z-index: 50; padding: 8px 0 20px; justify-content: space-around; }
          .ht-header-username { display: none; }
          .ht-analytics-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", height: "60px", borderBottom: "1px solid #1f2937", position: "sticky", top: 0, background: "#0d1117", zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img src="/habitick-blue-logo.png" alt="HabiTick" style={{ width: "32px", height: "32px", borderRadius: "8px", flexShrink: 0, objectFit: "contain" }} />
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "18px", letterSpacing: "-0.02em" }}>HabiTick</span>
        </div>
        <div className="ht-header-pills" style={{ position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
          {!isPaused && <div style={{ display: "flex", gap: "6px", alignItems: "center", background: "#111827", border: "1px solid #22c55e33", borderRadius: "999px", padding: "5px 14px", fontSize: "12px", color: "#22c55e", fontWeight: 600 }}>✓ {doneToday}/{totalToday} habits today</div>}
          <div style={{ display: "flex", gap: "6px", alignItems: "center", background: "#111827", border: `1px solid ${isPaused ? "#f59e0b66" : "#3b82f633"}`, borderRadius: "999px", padding: "5px 14px", fontSize: "12px", color: isPaused ? "#fcd34d" : "#60a5fa", fontWeight: 600 }}>
            {isPaused ? "⏸ Streak frozen" : `🔥 Streak: ${currentStreak} days`}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button onClick={() => setShowProfile(true)} style={{ display: "flex", alignItems: "center", gap: "8px", background: "#111827", border: "1px solid #1f2937", borderRadius: "999px", padding: "4px 14px 4px 4px", cursor: "pointer", transition: "border-color 0.2s" }}>
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt="avatar" style={{ width: "30px", height: "30px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
              : <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "13px", color: "#fff", flexShrink: 0 }}>
                  {(profile?.username || session.user.email || "?")[0].toUpperCase()}
                </div>
            }
            <span className="ht-header-username" style={{ color: "#9ca3af", fontSize: "13px", fontWeight: 600, maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {profile?.username || "Profile"}
            </span>
          </button>
        </div>
      </header>

      <div className="ht-tabs">
        {[["tasks", "Tasks & Habits"], ["analytics", "Analytics"], ["journal", "Journal"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{ padding: "8px 22px", borderRadius: "8px", border: "1px solid", borderColor: tab === key ? "#2563eb" : "#1f2937", background: tab === key ? "#2563eb" : "#111827", color: tab === key ? "#fff" : "#6b7280", cursor: "pointer", fontWeight: 600, fontSize: "14px", transition: "all 0.15s", fontFamily: "inherit" }}>{label}</button>
        ))}
      </div>

      <main className="ht-main">
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px", color: "#6b7280" }}>Loading your data...</div>
        ) : tab === "tasks" ? (
          <>
            <section style={{ marginBottom: "36px" }}>
              <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "22px", marginBottom: "16px", letterSpacing: "-0.02em", color: "#f9fafb" }}>Habits</h2>
              <button onClick={() => { setEditingHabit(null); setShowHabitModal(true); }} style={{ width: "100%", padding: "13px", borderRadius: "10px", border: "1px solid #1f2937", background: "#111827", color: "#60a5fa", cursor: "pointer", fontWeight: 700, fontSize: "14px", marginBottom: "14px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", transition: "border-color 0.2s, background 0.2s" }}>+ Add New Habit</button>
              <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
                <button onClick={() => setShowTodayOnly(p => !p)} style={{ padding: "7px 16px", borderRadius: "8px", border: "1px solid", borderColor: showTodayOnly ? "#2563eb" : "#374151", background: showTodayOnly ? "#1d4ed8" : "#111827", color: showTodayOnly ? "#fff" : "#9ca3af", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}>{showTodayOnly ? "Show All Habits" : "Show Today's Habits"}</button>
                <button onClick={togglePause} style={{ padding: "7px 16px", borderRadius: "8px", border: "1px solid", borderColor: isPaused ? "#f59e0b" : "#374151", background: isPaused ? "#78350f" : "#111827", color: isPaused ? "#fcd34d" : "#9ca3af", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}>{isPaused ? "⏸ Holiday Mode ON — Resume" : "⏸ Pause / Holiday Mode"}</button>
              </div>
              {isPaused && (
                <div style={{ background: "#78350f33", border: "1px solid #f59e0b66", borderRadius: "10px", padding: "12px 16px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "20px" }}>🏖️</span>
                  <div>
                    <div style={{ color: "#fcd34d", fontWeight: 700, fontSize: "14px" }}>Holiday Mode Active</div>
                    <div style={{ color: "#d97706", fontSize: "12px", marginTop: "2px" }}>Your streak is frozen. Habits are locked until you resume.</div>
                  </div>
                </div>
              )}
              <div className="ht-habit-grid">
                {todayHabits.length === 0 && <div style={{ color: "#4b5563", fontSize: "14px", padding: "20px 0" }}>No habits yet. Add your first one!</div>}
                {todayHabits.map(h => <HabitCard key={h.id} habit={h} today={today} onToggle={toggleHabit} onDelete={deleteHabit} isPaused={isPaused} pausePeriods={pausePeriods} onEdit={habit => { setEditingHabit(habit); setShowHabitModal(true); }} />)}
              </div>
            </section>
            <section>
              <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "22px", marginBottom: "16px", letterSpacing: "-0.02em", color: "#f9fafb" }}>To-Do List</h2>
              <button onClick={() => setShowTodoModal(true)} style={{ width: "100%", padding: "13px", borderRadius: "10px", border: "1px solid #1f2937", background: "#111827", color: "#60a5fa", cursor: "pointer", fontWeight: 700, fontSize: "14px", marginBottom: "14px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", transition: "border-color 0.2s, background 0.2s" }}>+ Add New To-Do</button>
              <button onClick={() => setShowCompleted(p => !p)} style={{ padding: "7px 16px", borderRadius: "8px", border: "1px solid #374151", background: "#111827", color: "#9ca3af", cursor: "pointer", fontWeight: 600, fontSize: "13px", marginBottom: "14px" }}>{showCompleted ? "Hide Completed" : "Show Completed"}</button>
              {visibleTodos.length === 0 && <div style={{ color: "#4b5563", fontSize: "14px" }}>Nothing here yet!</div>}
              {visibleTodos.map(t => <TodoItem key={t.id} todo={t} onToggle={toggleTodo} onDelete={deleteTodo} />)}
            </section>
          </>
        ) : tab === "analytics" ? (
          <AnalyticsTab habits={habits} todos={todos} pausePeriods={pausePeriods} />
        ) : tab === "journal" ? (
          <JournalTab journalEntries={journalEntries} setJournalEntries={setJournalEntries} session={session} today={today} />
        ) : null}
      </main>
      {showHabitModal && <HabitModal habit={editingHabit} onSave={saveHabit} onClose={() => { setShowHabitModal(false); setEditingHabit(null); }} />}
      {showTodoModal && <TodoModal onSave={addTodo} onClose={() => setShowTodoModal(false)} />}
      {showProfile && <ProfileModal session={session} profile={profile} onUpdate={setProfile} onClose={() => setShowProfile(false)} />}

      {/* Mobile bottom nav */}
      <nav className="ht-bottom-nav">
        {[["tasks","🏠","Habits"],["analytics","📊","Stats"],["journal","📓","Journal"],["profile","👤","Profile"]].map(([key, icon, label]) => (
          <button key={key} onClick={() => key === "profile" ? setShowProfile(true) : setTab(key)}
            style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", padding: "6px 12px", borderRadius: "10px", color: tab === key ? "#3b82f6" : "#4b5563", transition: "color 0.15s" }}>
            <span style={{ fontSize: "20px" }}>{icon}</span>
            <span style={{ fontSize: "10px", fontWeight: 700, color: tab === key ? "#3b82f6" : "#4b5563" }}>{label}</span>
          </button>
        ))}
      </nav>

      {/* Mobile streak bar */}
      <style>{`@media (max-width: 640px) { .ht-mobile-streak { display: flex !important; } }`}</style>
      <div className="ht-mobile-streak" style={{ display: "none", position: "fixed", top: "60px", left: 0, right: 0, background: "#0d1117", borderBottom: "1px solid #1f2937", padding: "8px 16px", gap: "8px", zIndex: 40, justifyContent: "center" }}>
        {!isPaused && <div style={{ display: "flex", gap: "6px", alignItems: "center", background: "#111827", border: "1px solid #22c55e33", borderRadius: "999px", padding: "5px 14px", fontSize: "12px", color: "#22c55e", fontWeight: 600 }}>✓ {doneToday}/{totalToday} today</div>}
        <div style={{ display: "flex", gap: "6px", alignItems: "center", background: "#111827", border: `1px solid ${isPaused ? "#f59e0b66" : "#3b82f633"}`, borderRadius: "999px", padding: "5px 14px", fontSize: "12px", color: isPaused ? "#fcd34d" : "#60a5fa", fontWeight: 600 }}>
          {isPaused ? "⏸ Frozen" : `🔥 ${currentStreak} days`}
        </div>
      </div>
    </div>
  );
}