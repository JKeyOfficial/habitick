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

// ── Stripe ────────────────────────────────────────────────────────────────────
// This is called via your Vercel serverless function — no key needed in frontend
const STRIPE_CHECKOUT_URL = "/api/create-checkout"; // Vercel function

// ── Plan limits ───────────────────────────────────────────────────────────────
const FREE_HABIT_LIMIT = 5;
const FREE_TODO_LIMIT = 5;        // max active (non-done) todos for free users
const FREE_JOURNAL_DAYS = 7;      // how many days back free users can access
const LIFETIME_USER_LIMIT = 100;  // first N users get lifetime premium
const MAX_SHIELDS = 5;            // maximum shields a user can hold

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
  // Fill remaining cells to complete full weeks (5 or 6 rows as needed)
  while (cells.length % 7 !== 0) cells.push({ day: cells.length - daysInMonth - firstDay + 1, curr: false });
  return cells;
}

// ─── Streak & Shield logic ────────────────────────────────────────────────────
function isDayComplete(habits, dateStr) {
  const dow = parseDateLocal(dateStr).getDay();
  const existing = habits.filter(h => (h.createdDate || h.created_date || dateStr).substring(0, 10) <= dateStr);
  const scheduled = existing.filter(h => h.frequency === "daily" || (h.days && h.days.includes(dow)));
  if (scheduled.length === 0) return null; // rest day
  return scheduled.every(h => (h.completedDates || []).includes(dateStr));
}

function isDatePaused(pausePeriods, dateStr) {
  const ds = dateStr.substring(0, 10);
  return pausePeriods.some(p => {
    const start = (p.start || '').substring(0, 10);
    const end = p.end ? p.end.substring(0, 10) : null;
    return ds >= start && (end === null || ds < end);
  });
}

// ── Shield & Streak calculation ───────────────────────────────────────────────
// How it works:
//   • Shields are earned by cumulative completed days across ALL streaks combined
//     (not consecutive — 1+2+3+1+7 all count toward the total).
//   • Pro users earn 1 shield every 7 cumulative completed days.
//   • Free users earn 1 shield every 14 cumulative completed days.
//   • Maximum 5 shields at any time.
//   • A shield absorbs one missed day, keeping the streak alive but NOT
//     incrementing the streak count for that day.
//   • No DB column needed — derived fresh from completion history each time.
function calcStats(habits, pausePeriods, isPremium, profile = null) {
  const today = getDateStr(new Date());
  const initialShields = (profile && profile.initial_shields) ? Number(profile.initial_shields) : 0;
  const initialShieldsDate = profile && profile.initial_shields_granted_at ? (profile.initial_shields_granted_at || '').substring(0, 10) : null;
  if (habits.length === 0) {
    const availableInitial = (initialShields > 0 && initialShieldsDate && initialShieldsDate <= today) ? Math.min(initialShields, 5) : 0;
    return { currentStreak: 0, bestStreak: 0, shields: availableInitial, cumulativeCompletedDays: 0 };
  }
  
  // Pro: 1 shield per 7 cumulative completed days
  // Free: 1 shield per 14 cumulative completed days
  const shieldThreshold = isPremium ? 7 : 14;

  const normalisedHabits = habits.map(h => ({
    ...h,
    createdDate: (h.createdDate || h.created_date || today).substring(0, 10),
    completedDates: (h.completedDates || []).map(d => d.substring(0, 10)),
  }));

  const earliestHabitDate = normalisedHabits.reduce((earliest, h) => {
    return h.createdDate < earliest ? h.createdDate : earliest;
  }, today);

  // ── Forward pass: count cumulative completed days → earn shields; track best streak ──
  let cumulativeCompletedDays = 0;
  let shieldsEarnedThresholds = 0; // how many shield thresholds crossed so far
  let shieldsPool = 0;             // shields available (capped at MAX_SHIELDS)
  let shieldGrants = [];           // list of grant dates (YYYY-MM-DD) for each shield
  let bestStreak = 0;
  let tempStreak = 0;              // for best-streak tracking (no shield protection)

  // If the user's profile contains an initial shield grant, only apply it
  // once the forward iteration reaches the grant date so it cannot be
  // retroactively applied to days before it was given.

  const fwd = new Date(parseDateLocal(earliestHabitDate));
  const fwdEnd = new Date(parseDateLocal(today));
  let initialShieldsApplied = false;

  while (fwd <= fwdEnd) {
    const ds = getDateStr(fwd);

    if (!isDatePaused(pausePeriods, ds)) {
      // If this date is the initial-shields grant date, add them now (once)
      if (initialShields > 0 && initialShieldsDate && ds === initialShieldsDate && !initialShieldsApplied) {
        for (let k = 0; k < initialShields; k++) shieldGrants.push(ds);
        initialShieldsApplied = true;
        shieldsPool = Math.min(shieldGrants.length, MAX_SHIELDS);
      }

      const complete = isDayComplete(normalisedHabits, ds);

      if (complete === true) {
        cumulativeCompletedDays++;

        // Check if a new shield threshold was crossed
        const newThresholds = Math.floor(cumulativeCompletedDays / shieldThreshold);
        if (newThresholds > shieldsEarnedThresholds) {
          const delta = newThresholds - shieldsEarnedThresholds;
          for (let k = 0; k < delta; k++) shieldGrants.push(ds);
          shieldsEarnedThresholds = newThresholds;
          shieldsPool = Math.min(shieldGrants.length, MAX_SHIELDS);
        }

        // Best-streak tracking (consecutive, no shield protection)
        tempStreak++;
        if (tempStreak > bestStreak) bestStreak = tempStreak;
      } else if (complete === false && ds !== today) {
        // Missed day — reset temp streak (no shields applied to best-streak calc)
        tempStreak = 0;
      } else if (complete === null) {
        // Rest day — streak continues but doesn't add to cumulative completed days
        tempStreak++;
        if (tempStreak > bestStreak) bestStreak = tempStreak;
      }
      // If ds === today && complete === false: skip — day not yet over
    }

    fwd.setDate(fwd.getDate() + 1);
  }

  // ── Backward pass: compute CURRENT streak, using shields on missed days ──
  // Shields protect a missed day (streak doesn't break) but do NOT add to the count.
  let currentStreak = 0;
  // Keep only the most recent MAX_SHIELDS grants
  if (shieldGrants.length > MAX_SHIELDS) shieldGrants = shieldGrants.slice(-MAX_SHIELDS);
  // copy grant-date list; we'll consume entries as we hit missed days
  let shieldsList = shieldGrants.slice();

  const d = new Date();
  d.setHours(0, 0, 0, 0);

  for (let i = 0; i < 1100; i++) {
    const ds = getDateStr(d);
    if (ds < earliestHabitDate) break;
    if (isDatePaused(pausePeriods, ds)) { d.setDate(d.getDate() - 1); continue; }

    const complete = isDayComplete(normalisedHabits, ds);

    if (complete === null) {
      // Rest day — counts toward streak length, no action needed
      currentStreak++;
      d.setDate(d.getDate() - 1);
      continue;
    }
    if (!complete && ds === today) {
      // Today's habits not done yet — don't penalise, just skip
      d.setDate(d.getDate() - 1);
      continue;
    }
    if (!complete) {
      // Missed day — use a shield if available that was granted on or before this date
      let foundIdx = -1;
      for (let j = shieldsList.length - 1; j >= 0; j--) {
        if (shieldsList[j] <= ds) { foundIdx = j; break; }
      }
      if (foundIdx >= 0) {
        shieldsList.splice(foundIdx, 1); // consume that shield
        d.setDate(d.getDate() - 1);
        continue;
      }
      break; // No applicable shield → streak ends here
    }

    // Completed day
    currentStreak++;
    d.setDate(d.getDate() - 1);
  }

  const shieldsRemaining = shieldsList.length;
  return { currentStreak, bestStreak, shields: shieldsRemaining, cumulativeCompletedDays };
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
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // Give the new user one initial shield on sign up (persist if possible).
        try {
          const userId = data?.user?.id;
          if (userId) {
            await supabase.from("profiles").upsert({ id: userId, initial_shields: 1, initial_shields_granted_at: getTodayStr(), updated_at: new Date().toISOString() });
          }
        } catch (e) {
          // non-fatal if DB schema doesn't have the columns yet
          console.warn("Could not persist initial shield:", e?.message || e);
        }
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

  const isWebView = /wv/.test(navigator.userAgent) && /Android/.test(navigator.userAgent);
  const handleGoogle = () => supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });

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
          {mode !== "forgot" && !isWebView && (
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
function MiniCalendar({ habit, today, onToggle, pausePeriods, isPremium }) {
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
        {(() => {
          const firstDay = new Date(viewYear, viewMonth, 1).getDay();
          return cells.map((cell, i) => {
            // determine which month the cell belongs to (prev, current, next)
            let cellMonth = viewMonth;
            let cellYear = viewYear;
            if (!cell.curr) {
              if (i < firstDay) {
                // previous month
                cellMonth = viewMonth - 1;
                if (cellMonth < 0) { cellMonth = 11; cellYear = viewYear - 1; }
              } else {
                // next month
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
            if (isPremium) backdateCutoff.setDate(backdateCutoff.getDate() - 7);
            else backdateCutoff.setDate(backdateCutoff.getDate() - 1);
            const createdStr = (habit.createdDate || habit.created_date || getDateStr(todayDate)).substring(0, 10);
            const habitCreatedDate = parseDateLocal(createdStr);
            const isFuture = cellDate > todayDate && !isToday;
            const isTooOld = cellDate < backdateCutoff || cellDate < habitCreatedDate;
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

            // dim non-current-month days visually
            const extraOpacity = !cell.curr ? 0.45 : 1;

            return (
              <div key={i} onClick={() => !isBlocked && onToggle(dateStr)}
                style={{ fontSize: "11px", borderRadius: "50%", width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", cursor: isBlocked ? "default" : "pointer", background: bg, color, border, fontWeight: isToday ? 700 : 400, transition: "background 0.15s", opacity: (isPausedDay ? 0.25 : !isScheduled ? 0.3 : 1) * extraOpacity }}>
                {cell.day}
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}

// ─── Routine Card ────────────────────────────────────────────────────────────
function RoutineCard({ routine, habits, today, onToggle, onDelete, onDeleteRoutine, onEdit, onEjectFromRoutine, isPaused, pausePeriods, isPremium, dragState, dropTargetId, onDragStartHabit, onDragEndHabit, onDragEnterHabit, onDropOnRoutine, onDropOnStandalone }) {
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
    if (dragState) {
      onDropOnRoutine(dragState, routine.id);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        border: `2px solid ${allDone ? "#10b981" : dragOver ? "#2563eb" : "#1f2937"}`,
        borderRadius: "18px",
        padding: "18px",
        marginBottom: "20px",
        background: allDone ? "#10b98108" : dragOver ? "#2563eb08" : "#0d1117",
        transition: "border-color 0.3s, background 0.3s",
        position: "relative",
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
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
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
            <div className="ht-habit-grid">
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

// ─── Routine Modal ────────────────────────────────────────────────────────────
const ROUTINE_EMOJIS = ["📋","🌅","🌙","💪","🧘","🏃","📚","🎯","✨","🔥","⚡","🎸","🥗","💻","🧠"];
function RoutineModal({ routine, habitsList, onSave, onClose, onEject }) {
  const [name, setName] = useState(routine?.name || "");
  const [emoji, setEmoji] = useState(routine?.emoji || "📋");
  const routineHabits = habitsList?.filter(h => h.routine_id === routine?.id) || [];
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div style={{ background: "#111827", border: "1px solid #374151", borderRadius: "16px", padding: "28px", width: "100%", maxWidth: "380px", maxHeight: "90vh", overflowY: "auto" }}>
        <h2 style={{ margin: "0 0 20px", color: "#f9fafb", fontSize: "18px", fontFamily: "'Syne', sans-serif", fontWeight: 800 }}>{routine ? "Edit Routine" : "New Routine"}</h2>
        <label style={S.label}>Routine name</label>
        <input value={name} onChange={e => setName(e.target.value)} style={{ ...S.input, marginBottom: "18px" }} placeholder="e.g. Morning Routine" autoFocus={!routine} onKeyDown={e => e.key === "Enter" && name.trim() && onSave({ name: name.trim(), emoji })} />
        <label style={S.label}>Icon</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "24px", marginTop: "8px" }}>
          {ROUTINE_EMOJIS.map(e => (
            <button key={e} onClick={() => setEmoji(e)} style={{ width: "40px", height: "40px", borderRadius: "10px", border: `2px solid ${emoji === e ? "#2563eb" : "#1f2937"}`, background: emoji === e ? "#1d4ed820" : "#1f2937", fontSize: "20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>{e}</button>
          ))}
        </div>
        {routine && routineHabits.length > 0 && (
          <>
            <label style={{ ...S.label, marginBottom: "10px", display: "block" }}>Habits in this routine</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "20px" }}>
              {routineHabits.map(h => (
                <div key={h.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0d1117", border: "1px solid #1f2937", borderRadius: "8px", padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#2563eb" }} />
                    <span style={{ color: "#e5e7eb", fontSize: "14px", fontWeight: 600 }}>{h.name}</span>
                  </div>
                  <button onClick={() => onEject(h.id)} style={{ background: "none", border: "1px solid #374151", borderRadius: "6px", color: "#6b7280", fontSize: "11px", fontWeight: 600, cursor: "pointer", padding: "3px 8px", fontFamily: "inherit" }}>↗ Remove</button>
                </div>
              ))}
            </div>
          </>
        )}
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={onClose} style={S.btnSecondary}>Cancel</button>
          <button onClick={() => { if (name.trim()) onSave({ name: name.trim(), emoji }); }} style={S.btnPrimary}>{routine ? "Save" : "Create Routine"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Habit Card ───────────────────────────────────────────────────────────────
function HabitCard({ habit, today, onToggle, onDelete, onEdit, isPaused, pausePeriods, isPremium, draggable: isDraggable, onDragStart, onDragEnd, onDragEnter, isDropTarget, onEjectFromRoutine, inRoutine }) {
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
      onDrop={e => {
        e.preventDefault();
        e.stopPropagation();
      }}
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
        <input value={name} onChange={e => setName(e.target.value)} style={{ ...S.input, marginBottom: "14px" }} placeholder="e.g. Morning Run" autoFocus={!habit} />
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
function formatDueDate(dueDate, dueTime) {
  if (!dueDate) return null;
  const today = getTodayStr();
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return getDateStr(d); })();
  const dayLabel = dueDate === today ? "Today" : dueDate === tomorrow ? "Tomorrow" : parseDateLocal(dueDate).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return dueTime ? `${dayLabel} at ${dueTime}` : dayLabel;
}

function TodoItem({ todo, onToggle, onDelete, onEdit }) {
  const today = getTodayStr();
  const isOverdue = !todo.done && todo.due_date && todo.due_date < today;
  const isDueToday = !todo.done && todo.due_date === today;
  const dueLabel = formatDueDate(todo.due_date, todo.due_time);

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "14px 16px", background: "#111827", border: `1px solid ${isOverdue ? "#7f1d1d60" : "#1f2937"}`, borderRadius: "12px", marginBottom: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "border-color 0.15s" }}>
      <button onClick={() => onToggle(todo.id)} style={{ width: "20px", height: "20px", borderRadius: "6px", border: "1.5px solid", borderColor: todo.done ? "#10b981" : "#374151", background: todo.done ? "#10b981" : "transparent", cursor: "pointer", flexShrink: 0, marginTop: "1px", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "11px", fontWeight: 900, transition: "all 0.15s" }}>{todo.done ? "✓" : ""}</button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", color: todo.done ? "#4b5563" : "#e5e7eb", fontSize: "14px", textDecoration: todo.done ? "line-through" : "none" }}>{todo.text}</span>
        {dueLabel && !todo.done && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", marginTop: "5px", fontSize: "11px", fontWeight: 600, color: isOverdue ? "#f87171" : isDueToday ? "#fcd34d" : "#6b7280" }}>
            {isOverdue ? "⚠️" : "🕐"} {dueLabel}
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
        {todo.priority && <span style={{ fontSize: "10px", padding: "3px 10px", borderRadius: "999px", fontWeight: 700, border: "1px solid", background: todo.priority === "high" ? "#7f1d1d30" : todo.priority === "med" ? "#78350f30" : "#1c3a2a30", borderColor: todo.priority === "high" ? "#fca5a540" : todo.priority === "med" ? "#fcd34d40" : "#86efac40", color: todo.priority === "high" ? "#fca5a5" : todo.priority === "med" ? "#fcd34d" : "#86efac" }}>{todo.priority}</span>}
        <button onClick={() => onEdit(todo)} style={{ background: "none", border: "none", cursor: "pointer", color: "#4b5563", fontSize: "13px", padding: "4px", borderRadius: "6px" }}>✏️</button>
        <button onClick={() => onDelete(todo.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#374151", fontSize: "13px", padding: "4px", borderRadius: "6px" }}>✕</button>
      </div>
    </div>
  );
}

function TodoModal({ todo, onSave, onClose }) {
  const [text, setText] = useState(todo?.text || "");
  const [priority, setPriority] = useState(todo?.priority || "");
  const [dueDate, setDueDate] = useState(todo?.due_date || "");
  const [dueTime, setDueTime] = useState(todo?.due_time || "");

  const today = getTodayStr();
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return getDateStr(d); })();

  const inferDayMode = () => {
    if (!todo?.due_date) return "none";
    if (todo.due_date === today) return "today";
    if (todo.due_date === tomorrow) return "tomorrow";
    return "custom";
  };
  const [dayMode, setDayMode] = useState(inferDayMode);

  const handleDaySelect = (mode) => {
    if (dayMode === mode) { setDayMode("none"); setDueDate(""); setDueTime(""); return; }
    setDayMode(mode);
    if (mode === "today") setDueDate(today);
    else if (mode === "tomorrow") setDueDate(tomorrow);
    else if (mode === "custom") setDueDate("");
  };

  const dayOptions = [
    { label: "Today", mode: "today" },
    { label: "Tomorrow", mode: "tomorrow" },
    { label: "Custom", mode: "custom" },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div style={{ background: "#111827", border: "1px solid #374151", borderRadius: "16px", padding: "24px", width: "100%", maxWidth: "380px" }}>
        <h2 style={{ margin: "0 0 18px", color: "#f9fafb", fontSize: "18px", fontFamily: "'Syne', sans-serif", fontWeight: 800 }}>{todo ? "Edit To-Do" : "New To-Do"}</h2>

        <input value={text} onChange={e => setText(e.target.value)} style={{ ...S.input, marginBottom: "18px" }} placeholder="What needs to be done?" autoFocus onKeyDown={e => e.key === "Enter" && text.trim() && onSave({ text: text.trim(), priority, due_date: dueDate || null, due_time: dueTime || null })} />

        <label style={{ ...S.label, marginBottom: "8px" }}>Due day (optional)</label>
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
          {dayOptions.map(({ label, mode }) => (
            <button key={mode} onClick={() => handleDaySelect(mode)}
              style={{ flex: 1, padding: "8px 4px", borderRadius: "8px", border: "1px solid", borderColor: dayMode === mode ? "#2563eb" : "#374151", background: dayMode === mode ? "#1d4ed8" : "#1f2937", color: dayMode === mode ? "#fff" : "#9ca3af", cursor: "pointer", fontSize: "12px", fontWeight: 600, fontFamily: "inherit" }}>{label}</button>
          ))}
        </div>

        {dayMode === "custom" && (
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} min={today}
            style={{ ...S.input, marginBottom: "12px", colorScheme: "dark" }} />
        )}

        {dayMode !== "none" && (
          <>
            <label style={{ ...S.label, marginBottom: "8px" }}>Time (optional)</label>
            <input type="time" value={dueTime} onChange={e => setDueTime(e.target.value)}
              style={{ ...S.input, marginBottom: "18px", colorScheme: "dark" }} />
          </>
        )}

        <label style={{ ...S.label, marginBottom: "8px" }}>Priority (optional)</label>
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          {["", "high", "med", "low"].map(p => <button key={p} onClick={() => setPriority(p)} style={{ flex: 1, padding: "7px", borderRadius: "8px", border: "1px solid", borderColor: priority === p ? "#2563eb" : "#374151", background: priority === p ? "#1d4ed8" : "#1f2937", color: priority === p ? "#fff" : "#9ca3af", cursor: "pointer", fontSize: "12px", fontWeight: 600, fontFamily: "inherit" }}>{p === "" ? "None" : p[0].toUpperCase() + p.slice(1)}</button>)}
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={onClose} style={S.btnSecondary}>Cancel</button>
          <button onClick={() => { if (text.trim()) onSave({ text: text.trim(), priority, due_date: dueDate || null, due_time: dueTime || null }); }} style={S.btnPrimary}>{todo ? "Save" : "Add"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Analytics Tab ────────────────────────────────────────────────────────────
const MOOD_MESSAGES = [
  (m, p) => `You've logged ${m} as your mood ${p} time${p !== 1 ? "s" : ""} this week. Keep it up! 🌟`,
  (m, p) => `${p} day${p !== 1 ? "s" : ""} feeling ${m} this week — that's something to celebrate.`,
  (m, p) => `This month you've felt ${m} ${p} time${p !== 1 ? "s" : ""}. Your habits are working. 💪`,
];

function MoodInsights({ journalEntries, today }) {
  const moodLabels = { great: "Great 🌟", good: "Good 😊", okay: "Okay 😐", bad: "Bad 😔" };
  const positive = ["great", "good"];

  const getRange = (days) => {
    const result = [];
    for (let i = 0; i < days; i++) {
      const d = parseDateLocal(today);
      d.setDate(d.getDate() - i);
      result.push(getDateStr(d));
    }
    return result;
  };

  const week = getRange(7);
  const thisMonth = getRange(30);
  const lastMonth = getRange(60).slice(30);

  const countMoods = (dates) => {
    const counts = { great: 0, good: 0, okay: 0, bad: 0 };
    dates.forEach(d => { const m = journalEntries[d]?.mood; if (m) counts[m]++; });
    return counts;
  };

  const weekCounts = countMoods(week);
  const monthCounts = countMoods(thisMonth);
  const lastMonthCounts = countMoods(lastMonth);

  const totalPositiveThisMonth = positive.reduce((s, m) => s + monthCounts[m], 0);
  const totalPositiveLastMonth = positive.reduce((s, m) => s + lastMonthCounts[m], 0);
  const positiveTrend = lastMonthCounts > 0
    ? Math.round(((totalPositiveThisMonth - totalPositiveLastMonth) / Math.max(totalPositiveLastMonth, 1)) * 100)
    : null;

  const topWeekMood = Object.entries(weekCounts).sort((a,b) => b[1]-a[1]).find(([,v]) => v > 0);
  const totalEntries = Object.values(weekCounts).reduce((a,b) => a+b, 0);

  const insights = [];

  if (topWeekMood) {
    const [mood, count] = topWeekMood;
    if (positive.includes(mood)) {
      insights.push({ emoji: "🌟", text: `You felt ${moodLabels[mood].split(" ")[0].toLowerCase()} ${count} time${count !== 1 ? "s" : ""} this week — your best mood this week!` });
    } else {
      insights.push({ emoji: "💙", text: `You logged ${count} entr${count !== 1 ? "ies" : "y"} this week. Showing up every day is the win.` });
    }
  }
  if (weekCounts.great > 0) insights.push({ emoji: "✨", text: `${weekCounts.great} great day${weekCounts.great !== 1 ? "s" : ""} this week. You're building something real.` });
  if (monthCounts.great + monthCounts.good >= 15) insights.push({ emoji: "🔥", text: `${monthCounts.great + monthCounts.good} positive days this month. That's a strong month.` });
  if (positiveTrend !== null && positiveTrend > 0) insights.push({ emoji: "📈", text: `${positiveTrend}% more positive days than last month. The habits are paying off.` });
  else if (positiveTrend !== null && positiveTrend < 0) insights.push({ emoji: "💪", text: `Tougher month than last — but you're still here, still tracking. That counts.` });
  if (totalEntries === 7) insights.push({ emoji: "🏅", text: "Perfect journal week — 7 entries in 7 days. Consistency is everything." });
  else if (totalEntries >= 5) insights.push({ emoji: "📓", text: `${totalEntries} journal entries this week. You're building a habit of reflection.` });
  if (monthCounts.great > 0 && monthCounts.bad > 0) insights.push({ emoji: "🌈", text: "You've had highs and lows this month — that's life, and you tracked it all." });
  if (insights.length === 0) insights.push({ emoji: "📓", text: "Start logging your mood in the journal to unlock personalised insights here." });

  return (
    <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "14px", padding: "22px", marginTop: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <h3 style={{ margin: 0, fontFamily: "'Syne', sans-serif", color: "#f9fafb", fontWeight: 700, letterSpacing: "-0.01em" }}>Mood Insights</h3>
        <span style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "999px", background: "#2563eb20", border: "1px solid #2563eb40", color: "#60a5fa", fontWeight: 700 }}>Pro</span>
      </div>
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
        {Object.entries({ great: "🌟", good: "😊", okay: "😐", bad: "😔" }).map(([mood, emoji]) => (
          <div key={mood} style={{ flex: 1, background: "#0d1117", borderRadius: "10px", padding: "12px 8px", textAlign: "center", border: "1px solid #1f2937" }}>
            <div style={{ fontSize: "18px", marginBottom: "4px" }}>{emoji}</div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "20px", color: weekCounts[mood] > 0 ? "#f9fafb" : "#374151" }}>{weekCounts[mood]}</div>
            <div style={{ fontSize: "10px", color: "#4b5563", marginTop: "2px", textTransform: "capitalize" }}>{mood}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {insights.map((ins, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "10px", background: "#0d1117", borderRadius: "10px", padding: "12px 14px", border: "1px solid #1f2937" }}>
            <span style={{ fontSize: "16px", flexShrink: 0 }}>{ins.emoji}</span>
            <span style={{ fontSize: "13px", color: "#9ca3af", lineHeight: 1.5 }}>{ins.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalyticsTab({ habits, todos, pausePeriods, isPremium, journalEntries, profile }) {
  const [range, setRange] = useState("7days");
  const today = new Date();
  const todayStr = getDateStr(today);

  // Range helpers
  const rangeDays = range === "7days" ? 7 : range === "30days" ? 30 : range === "year" ? 365 : null;

  const getRangeStart = () => {
    if (!rangeDays) return null;
    const d = new Date(today);
    d.setDate(d.getDate() - (rangeDays - 1));
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const inRange = (dateStr) => {
    const start = getRangeStart();
    if (!start) return true; // all time
    const d = parseDateLocal(dateStr);
    return d >= start && d <= today;
  };

  const { currentStreak, bestStreak, shields, cumulativeCompletedDays } = calcStats(habits, pausePeriods, isPremium, profile);
  const shieldThreshold = isPremium ? 7 : 14;
  const daysToNextShield = shields >= 5
    ? null // maxed out
    : shieldThreshold - (cumulativeCompletedDays % shieldThreshold);

  // Completion rate — filtered by range
  const { completionRate, totalCompletions } = (() => {
    if (habits.length === 0) return { completionRate: null, totalCompletions: 0 };

    const start = getRangeStart();
    const earliestHabit = habits.reduce((earliest, h) => {
      const created = (h.createdDate || todayStr).substring(0, 10);
      return created < earliest ? created : earliest;
    }, todayStr);

    const rangeStart = start ? start : parseDateLocal(earliestHabit);
    let scheduledCount = 0, completedCount = 0;
    const d = new Date(rangeStart);
    d.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(0, 0, 0, 0);

    while (d <= end) {
      const ds = getDateStr(d);
      if (!isDatePaused(pausePeriods, ds)) {
        const dow = d.getDay();
        habits.forEach(h => {
          const createdStr = (h.createdDate || h.created_date || todayStr).substring(0, 10);
          if (ds < createdStr) return; // habit didn't exist yet
          const scheduled = h.frequency === "daily" || (h.days && h.days.includes(dow));
          if (scheduled) {
            scheduledCount++;
            if ((h.completedDates || []).map(x => x.substring(0, 10)).includes(ds)) completedCount++;
          }
        });
      }
      d.setDate(d.getDate() + 1);
    }
    const total = habits.reduce((sum, h) => {
      const dates = (h.completedDates || []).filter(ds => inRange(ds.substring(0, 10)));
      return sum + dates.length;
    }, 0);
    return {
      completionRate: scheduledCount === 0 ? null : Math.round((completedCount / scheduledCount) * 100),
      totalCompletions: total,
    };
  })();

  // Chart data — driven by range
  const chartDays = rangeDays || 365;
  const chartPoints = Math.min(chartDays, 30); // max 30 bars
  const chartData = Array.from({ length: chartPoints }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (chartPoints - 1 - i));
    const ds = getDateStr(d);
    const label = chartPoints <= 7
      ? DAYS_SHORT[d.getDay()]
      : chartPoints <= 31
      ? String(d.getDate())
      : DAYS_SHORT[d.getDay()][0];
    return {
      label,
      habits: habits.filter(h => (h.completedDates || []).map(x => x.substring(0,10)).includes(ds)).length,
      tasks: todos.filter(t => t.doneDate === ds).length,
    };
  });

  // For year/all-time, group into weeks
  const useWeekly = rangeDays === 365 || rangeDays === null;
  const finalChartData = useWeekly ? (() => {
    const weeks = 26; // ~6 months of weeks
    return Array.from({ length: weeks }, (_, wi) => {
      const weekEnd = new Date(today);
      weekEnd.setDate(weekEnd.getDate() - wi * 7);
      let h = 0, t = 0;
      for (let day = 0; day < 7; day++) {
        const d = new Date(weekEnd);
        d.setDate(d.getDate() - day);
        const ds = getDateStr(d);
        h += habits.filter(hb => (hb.completedDates || []).map(x => x.substring(0,10)).includes(ds)).length;
        t += todos.filter(td => td.doneDate === ds).length;
      }
      const d = new Date(weekEnd);
      d.setDate(d.getDate() - 6);
      return { label: `${d.getDate()}/${d.getMonth()+1}`, habits: h, tasks: t };
    }).reverse();
  })() : chartData;

  const maxVal = Math.max(...finalChartData.flatMap(d => [d.habits, d.tasks]), 1);
  const chartTitle = range === "7days" ? "Daily Activity — Last 7 Days"
    : range === "30days" ? "Daily Activity — Last 30 Days"
    : range === "year" ? "Weekly Activity — Last Year"
    : "Weekly Activity — All Time";

  const stats = [
    { icon: "🔥", label: "Current Streak", value: `${currentStreak} days`, sub: "All scheduled habits done" },
    { icon: "🛡️", label: "Shields", value: `${shields}/5`, sub: shields >= 5 ? "Max shields held!" : `Next in ${daysToNextShield} completed day${daysToNextShield !== 1 ? "s" : ""}` },
    { icon: "🏆", label: "Best Streak", value: `${bestStreak} days`, sub: "Personal record" },
    { icon: "📊", label: "Completion Rate", value: completionRate !== null ? `${completionRate}%` : "—", sub: `${totalCompletions} completions` },
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
          <h3 style={{ margin: 0, fontFamily: "'Syne', sans-serif", color: "#f9fafb", fontWeight: 700, letterSpacing: "-0.01em", fontSize: "14px" }}>{chartTitle}</h3>
          <div style={{ display: "flex", gap: "16px", fontSize: "11px", color: "#9ca3af" }}>
            <span><span style={{ display: "inline-block", width: "10px", height: "10px", background: "#3b82f6", borderRadius: "2px", marginRight: "5px" }} />Habits</span>
            <span><span style={{ display: "inline-block", width: "10px", height: "10px", background: "#22c55e", borderRadius: "2px", marginRight: "5px" }} />Tasks</span>
          </div>
        </div>
        <div key={range} style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: "120px", overflowX: "auto" }}>
          {finalChartData.map((d, i) => (
            <div key={i} style={{ minWidth: finalChartData.length > 14 ? "18px" : undefined, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", flex: 1 }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: "2px", width: "100%" }}>
                <div style={{ background: "#3b82f6", borderRadius: "4px 4px 0 0", height: `${(d.habits / maxVal) * 90}%`, minHeight: d.habits > 0 ? "4px" : "0", transition: "height 0.5s" }} />
                <div style={{ background: "#22c55e", borderRadius: "4px 4px 0 0", height: `${(d.tasks / maxVal) * 90}%`, minHeight: d.tasks > 0 ? "4px" : "0", transition: "height 0.5s" }} />
              </div>
              {finalChartData.length <= 30 && <div style={{ color: "#6b7280", fontSize: "9px", marginTop: "4px", whiteSpace: "nowrap" }}>{d.label}</div>}
            </div>
          ))}
        </div>
      </div>
      {isPremium && <MoodInsights journalEntries={journalEntries || {}} today={todayStr} />}
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

function JournalTab({ journalEntries, setJournalEntries, session, today, isPremium }) {
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

  const journalCutoff = (() => {
    const d = parseDateLocal(today);
    d.setDate(d.getDate() - (FREE_JOURNAL_DAYS - 1));
    return getDateStr(d);
  })();

  const goBack = () => {
    const next = parseDateLocal(currentDate);
    next.setDate(next.getDate() - 1);
    const nextStr = getDateStr(next);
    if (!isPremium && nextStr < journalCutoff) return; // blocked for free users
    setCurrentDate(nextStr);
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
  const isJournalLocked = !isPremium && currentDate < journalCutoff;
  const atJournalLimit = !isPremium && (() => {
    const next = parseDateLocal(currentDate);
    next.setDate(next.getDate() - 1);
    return getDateStr(next) < journalCutoff;
  })();

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
          <button onClick={goBack} title="Previous day" style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #374151", background: "#111827", color: atJournalLimit ? "#2d3748" : "#9ca3af", cursor: atJournalLimit ? "default" : "pointer", fontSize: "16px", fontWeight: 700 }}>‹</button>
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
      <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "16px", padding: "28px", position: "relative" }}>
        {isJournalLocked && (
          <div style={{ position: "absolute", inset: 0, borderRadius: "16px", background: "#0d111799", backdropFilter: "blur(4px)", zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px" }}>
            <div style={{ fontSize: "32px" }}>🔒</div>
            <div style={{ color: "#f9fafb", fontWeight: 700, fontSize: "15px" }}>Premium journal history</div>
            <div style={{ color: "#9ca3af", fontSize: "13px", textAlign: "center", maxWidth: "240px" }}>Free accounts can access the last {FREE_JOURNAL_DAYS} days. Upgrade for full history.</div>
          </div>
        )}
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


// ─── Onboarding ───────────────────────────────────────────────────────────────
function OnboardingScreen({ session, onComplete }) {
  const [step, setStep] = useState(0); // 0=welcome, 1=username+photo, 2=allset
  const [username, setUsername] = useState("");
  const [usernameErr, setUsernameErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const uploadAvatar = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setUsernameErr("Image must be under 2MB"); return; }
    setUploadingAvatar(true);
    const ext = file.name.split(".").pop();
    const path = `${session.user.id}/avatar.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (upErr) { setUsernameErr("Upload failed"); setUploadingAvatar(false); return; }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    setAvatarUrl(data.publicUrl + "?t=" + Date.now());
    setUploadingAvatar(false);
  };

  const handleSave = async () => {
    setUsernameErr("");
    if (username.length < 3) { setUsernameErr("Must be at least 3 characters"); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) { setUsernameErr("Letters, numbers and underscores only"); return; }
    setSaving(true);
    const { error } = await supabase.from("profiles").upsert({
      id: session.user.id,
      username: username.trim(),
      avatar_url: avatarUrl || null,
      // give one initial shield at onboarding completion if not already present
      initial_shields: 1,
      initial_shields_granted_at: getTodayStr(),
      updated_at: new Date().toISOString(),
    });
    if (error?.message?.includes("unique")) { setUsernameErr("Username already taken"); setSaving(false); return; }
    if (error) { setUsernameErr(error.message); setSaving(false); return; }
    setSaving(false);
    setStep(2);
  };

  const avatarLetter = (username || session.user.email || "?")[0].toUpperCase();

  const fadeUp = { animation: "fadeUp 0.4s ease forwards" };

  if (step === 0) return (
    <div style={{ minHeight: "100vh", background: "#0d1117", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', system-ui, sans-serif", padding: "24px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;600;700;800&display=swap'); @keyframes fadeUp { from { opacity:0; transform:translateY(16px);} to {opacity:1;transform:translateY(0);} } * { box-sizing: border-box; }`}</style>
      <div style={{ textAlign: "center", maxWidth: "400px", width: "100%", ...fadeUp }}>
        <div style={{ fontSize: "64px", marginBottom: "20px" }}>⚡</div>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "36px", color: "#f9fafb", margin: "0 0 14px", letterSpacing: "-0.03em" }}>Welcome to HabiTick</h1>
        <p style={{ color: "#6b7280", fontSize: "16px", lineHeight: 1.6, margin: "0 0 40px" }}>The habit tracker that grows with you.<br/>Let's get you set up in 30 seconds.</p>
        <button onClick={() => setStep(1)} style={{ width: "100%", padding: "15px", borderRadius: "12px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "16px", cursor: "pointer", fontFamily: "inherit" }}>Let's go →</button>
      </div>
    </div>
  );

  if (step === 1) return (
    <div style={{ minHeight: "100vh", background: "#0d1117", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', system-ui, sans-serif", padding: "24px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;600;700;800&display=swap'); @keyframes fadeUp { from { opacity:0; transform:translateY(16px);} to {opacity:1;transform:translateY(0);} } * { box-sizing: border-box; } input { outline: none; }`}</style>
      <div style={{ width: "100%", maxWidth: "400px", ...fadeUp }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ fontSize: "28px", marginBottom: "8px" }}>👤</div>
          <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "26px", color: "#f9fafb", margin: "0 0 8px", letterSpacing: "-0.02em" }}>Set up your profile</h2>
          <p style={{ color: "#6b7280", fontSize: "14px", margin: 0 }}>Choose a username and optionally add a photo</p>
        </div>

        {/* Avatar */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "28px" }}>
          <label style={{ position: "relative", cursor: "pointer" }}>
            {avatarUrl
              ? <img src={avatarUrl} alt="avatar" style={{ width: "88px", height: "88px", borderRadius: "50%", objectFit: "cover", border: "3px solid #2563eb" }} />
              : <div style={{ width: "88px", height: "88px", borderRadius: "50%", background: "#1f2937", border: "2px dashed #374151", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                  <span style={{ fontSize: "24px" }}>{uploadingAvatar ? "⏳" : "📷"}</span>
                  <span style={{ fontSize: "10px", color: "#6b7280", fontWeight: 600 }}>Add photo</span>
                </div>
            }
            {avatarUrl && (
              <div style={{ position: "absolute", bottom: 0, right: 0, width: "26px", height: "26px", borderRadius: "50%", background: "#2563eb", border: "2px solid #0d1117", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px" }}>📷</div>
            )}
            <input type="file" accept="image/*" onChange={uploadAvatar} style={{ display: "none" }} />
          </label>
        </div>

        {/* Username */}
        <label style={{ color: "#9ca3af", fontSize: "13px", display: "block", marginBottom: "6px" }}>Username <span style={{ color: "#f87171" }}>*</span></label>
        <input
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="e.g. jacob_h"
          autoFocus
          onKeyDown={e => e.key === "Enter" && handleSave()}
          style={{ width: "100%", padding: "12px 14px", borderRadius: "10px", border: `1px solid ${usernameErr ? "#f87171" : "#374151"}`, background: "#1f2937", color: "#f9fafb", fontSize: "15px", fontFamily: "inherit", marginBottom: "6px" }}
        />
        <div style={{ fontSize: "11px", color: "#374151", marginBottom: usernameErr ? "6px" : "24px" }}>Letters, numbers and underscores · min 3 chars</div>
        {usernameErr && <div style={{ color: "#f87171", fontSize: "13px", marginBottom: "16px" }}>{usernameErr}</div>}

        <button onClick={handleSave} disabled={saving || !username.trim()} style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "none", background: username.trim().length >= 3 ? "#2563eb" : "#1f2937", color: username.trim().length >= 3 ? "#fff" : "#4b5563", fontWeight: 700, fontSize: "15px", cursor: username.trim().length >= 3 ? "pointer" : "default", fontFamily: "inherit", transition: "all 0.2s", opacity: saving ? 0.7 : 1 }}>
          {saving ? "Saving..." : "Continue →"}
        </button>
        <button onClick={() => setStep(0)} style={{ width: "100%", marginTop: "10px", padding: "12px", borderRadius: "12px", border: "none", background: "transparent", color: "#4b5563", fontWeight: 600, fontSize: "14px", cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
      </div>
    </div>
  );

  if (step === 2) return (
    <div style={{ minHeight: "100vh", background: "#0d1117", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', system-ui, sans-serif", padding: "24px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;600;700;800&display=swap'); @keyframes fadeUp { from { opacity:0; transform:translateY(16px);} to {opacity:1;transform:translateY(0);} } @keyframes pop { 0%{transform:scale(0.5);opacity:0} 70%{transform:scale(1.15)} 100%{transform:scale(1);opacity:1} } * { box-sizing: border-box; }`}</style>
      <div style={{ textAlign: "center", maxWidth: "400px", width: "100%", ...fadeUp }}>
        <div style={{ fontSize: "72px", marginBottom: "20px", animation: "pop 0.5s ease forwards" }}>🎉</div>
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "30px", color: "#f9fafb", margin: "0 0 10px", letterSpacing: "-0.02em" }}>You're all set, {username}!</h2>
        <p style={{ color: "#6b7280", fontSize: "15px", lineHeight: 1.6, margin: "0 0 24px" }}>Time to build your first habit.<br/>Start small — one habit changes everything.</p>
        <div style={{ textAlign: "left", background: "#0d1117", border: "1px solid #1f2937", padding: "12px", borderRadius: "10px", marginBottom: "20px" }}>
          <div style={{ fontWeight: 700, color: "#f9fafb", marginBottom: "8px" }}>Quick tips</div>
          <div style={{ color: "#9ca3af", fontSize: "13px", marginBottom: "8px" }}><strong>Routine</strong>: Group habits into routines (morning, evening, etc.) to check several items at once and build momentum.</div>
          <div style={{ color: "#9ca3af", fontSize: "13px" }}><strong>Shields</strong>: You start with one shield — each shield protects one missed day so your streak doesn't break, but it won't increment the streak. Pro users earn shields faster (every 7 completed days vs 14 for free). Max 5 shields.</div>
        </div>
        <button
          onClick={() => {
            const { data } = supabase.from("profiles").select("*").eq("id", session.user.id).single().then(({ data }) => onComplete(data));
          }}
          style={{ width: "100%", padding: "15px", borderRadius: "12px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "16px", cursor: "pointer", fontFamily: "inherit" }}>
          + Add my first habit →
        </button>
      </div>
    </div>
  );

  return null;
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
        style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "20px 20px 0 0", padding: "16px 24px 40px", width: "100%", maxWidth: "480px", maxHeight: "88vh", minHeight: "70vh", overflowY: dragY > 10 ? "hidden" : "auto", transform: `translateY(${dragY}px)`, transition: dragging ? "none" : "transform 0.3s ease", willChange: "transform", touchAction: "pan-x" }}>
        {/* Drag handle */}
        <div style={{ width: "48px", height: "5px", background: "#374151", borderRadius: "999px", margin: "0 auto 20px", cursor: "grab" }} />
        {children}
      </div>
    </div>
  );
}

// ─── Billing Tab ─────────────────────────────────────────────────────────────
function BillingTab({ profile, session, showToast }) {
  const [loading, setLoading] = useState(false);

  const isPremium = profile?.is_premium === true;
  const isLifetime = profile?.is_lifetime === true;
  const hasStripe = !!profile?.stripe_customer_id;

  const openPortal = async () => {
    if (!profile?.stripe_customer_id) return;
    setLoading(true);
    try {
      const res = await fetch("/api/billing-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: profile.stripe_customer_id }),
      });
      const { url, error } = await res.json();
      if (error) throw new Error(error);
      window.location.href = url;
    } catch (err) {
      showToast("Could not open billing portal. Try again.", "error");
    }
    setLoading(false);
  };

  const row = (label, value, highlight) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #1f2937" }}>
      <span style={{ color: "#6b7280", fontSize: "13px" }}>{label}</span>
      <span style={{ color: highlight ? "#10b981" : "#f9fafb", fontWeight: 600, fontSize: "13px" }}>{value}</span>
    </div>
  );

  return (
    <div>
      {/* Plan card */}
      <div style={{ background: "#0d1117", border: `1px solid ${isPremium ? "#2563eb40" : "#1f2937"}`, borderRadius: "12px", padding: "16px", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "16px", color: "#f9fafb" }}>
            {isLifetime ? "Founder Plan" : isPremium ? "Pro Plan" : "Free Plan"}
          </span>
          <span style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "999px", fontWeight: 700,
            background: isLifetime ? "#065f46" : isPremium ? "#2563eb20" : "#1f2937",
            border: `1px solid ${isLifetime ? "#10b981" : isPremium ? "#2563eb" : "#374151"}`,
            color: isLifetime ? "#10b981" : isPremium ? "#60a5fa" : "#6b7280"
          }}>
            {isLifetime ? "LIFETIME FREE ✦" : isPremium ? "ACTIVE" : "FREE"}
          </span>
        </div>

        {isLifetime && row("Price", "Free, forever", true)}
        {!isLifetime && isPremium && row("Price", "£0.99 / month", false)}
        {!isPremium && row("Price", "£0", false)}

        {isLifetime && row("Billing", "Never — you're a founding member", true)}
        {!isLifetime && isPremium && row("Billing", "Managed via Stripe", false)}
        {!isPremium && row("Upgrade", "£0.99/month for unlimited everything", false)}

        {row("Habits", isPremium ? "Unlimited" : `${FREE_HABIT_LIMIT} max`, isPremium)}
        {row("Journal history", isPremium ? "All time" : "Last 7 days", isPremium)}
        {row("Backdating", isPremium ? "7 days" : "Yesterday only", isPremium)}
      </div>

      {/* Actions */}
      {isLifetime && (
        <div style={{ background: "#065f4620", border: "1px solid #10b98130", borderRadius: "10px", padding: "14px", textAlign: "center" }}>
          <div style={{ fontSize: "20px", marginBottom: "6px" }}>🎉</div>
          <div style={{ color: "#10b981", fontWeight: 700, fontSize: "13px" }}>You're a founding member</div>
          <div style={{ color: "#4b5563", fontSize: "12px", marginTop: "4px" }}>Premium is yours free, forever. No card, no billing, ever.</div>
        </div>
      )}

      {!isLifetime && isPremium && hasStripe && (
        <button onClick={openPortal} disabled={loading} style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #374151", background: "transparent", color: "#9ca3af", fontWeight: 600, fontSize: "14px", cursor: loading ? "default" : "pointer", fontFamily: "inherit", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Opening..." : "Manage subscription →"}
        </button>
      )}

      {!isLifetime && isPremium && !hasStripe && (
        <div style={{ color: "#4b5563", fontSize: "12px", textAlign: "center" }}>No billing information found.</div>
      )}

      {!isPremium && (
        <button onClick={() => showToast("Use the Upgrade button from the app", "error")} style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "14px", cursor: "pointer", fontFamily: "inherit" }}>
          Upgrade to Pro — £0.99/month →
        </button>
      )}
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
  const [showDeleteConfirm1, setShowDeleteConfirm1] = useState(false);
  const [showDeleteConfirm2, setShowDeleteConfirm2] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE") return;
    setDeletingAccount(true);
    try {
      const uid = session.user.id;
      // Delete all user data in order
      await supabase.from("habit_completions").delete().eq("user_id", uid);
      await supabase.from("habits").delete().eq("user_id", uid);
      await supabase.from("todos").delete().eq("user_id", uid);
      await supabase.from("pause_periods").delete().eq("user_id", uid);
      await supabase.from("journal_entries").delete().eq("user_id", uid);
      await supabase.from("profiles").delete().eq("id", uid);
      // Delete the auth user via Supabase admin — requires a serverless function
      await fetch("https://app.habitick.pro/api/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid }),
      });
      await supabase.auth.signOut();
    } catch (err) {
      showToast("Something went wrong. Please try again.", "error");
      setDeletingAccount(false);
    }
  };
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
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "16px", color: "#f9fafb", display: "flex", alignItems: "center", gap: "8px" }}>
              {profile?.username || "No username yet"}
              {profile?.is_premium && (
                <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "999px", background: "#2563eb", color: "#fff", fontWeight: 700, letterSpacing: "0.04em" }}>
                  {profile?.is_lifetime ? "FOUNDER ✦" : "PRO"}
                </span>
              )}
            </div>
            <div style={{ fontSize: "12px", color: "#4b5563", marginTop: "2px", marginBottom: "8px" }}>{session.user.email}</div>
            {avatarUrl && <button onClick={removeAvatar} style={{ background: "none", border: "none", color: "#6b7280", fontSize: "11px", cursor: "pointer", padding: 0, textDecoration: "underline" }}>Remove photo</button>}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "20px" }}>
          <button style={tabStyle("profile")} onClick={() => setTab("profile")}>Username</button>
          <button style={tabStyle("email")} onClick={() => setTab("email")}>Email</button>
          <button style={tabStyle("password")} onClick={() => setTab("password")}>Password</button>
          <button style={tabStyle("billing")} onClick={() => setTab("billing")}>Billing</button>
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

        {/* Billing tab */}
        {tab === "billing" && (
          <BillingTab profile={profile} session={session} showToast={showToast} />
        )}

        {/* Sign out */}
        <div style={{ borderTop: "1px solid #1f2937", marginTop: "24px", paddingTop: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <button onClick={() => supabase.auth.signOut()} style={{ width: "100%", padding: "11px", borderRadius: "8px", border: "1px solid #374151", background: "transparent", color: "#6b7280", fontWeight: 600, fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}>Sign out</button>
          <button onClick={() => setShowDeleteConfirm1(true)} style={{ width: "100%", padding: "11px", borderRadius: "8px", border: "1px solid #7f1d1d", background: "transparent", color: "#f87171", fontWeight: 600, fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}>Delete account</button>
        </div>

        {/* Delete confirm — step 1 */}
        {showDeleteConfirm1 && (
          <div style={{ position: "fixed", inset: 0, background: "#000d", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
            <div style={{ background: "#111827", border: "1px solid #374151", borderRadius: "20px", padding: "28px", width: "100%", maxWidth: "360px", textAlign: "center" }}>
              <div style={{ fontSize: "36px", marginBottom: "12px" }}>⚠️</div>
              <h2 style={{ margin: "0 0 10px", fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "19px", color: "#f9fafb", letterSpacing: "-0.02em" }}>Delete your account?</h2>
              <p style={{ color: "#9ca3af", fontSize: "14px", lineHeight: 1.6, marginBottom: "24px" }}>This will permanently delete all your habits, todos, journal entries and account data. <strong style={{ color: "#f87171" }}>This cannot be undone.</strong></p>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <button onClick={() => { setShowDeleteConfirm1(false); setShowDeleteConfirm2(true); }} style={{ width: "100%", padding: "13px", borderRadius: "10px", border: "1px solid #7f1d1d", background: "#7f1d1d30", color: "#f87171", fontWeight: 700, fontSize: "14px", cursor: "pointer", fontFamily: "inherit" }}>Yes, I want to delete my account</button>
                <button onClick={() => setShowDeleteConfirm1(false)} style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #374151", background: "transparent", color: "#6b7280", fontWeight: 600, fontSize: "14px", cursor: "pointer", fontFamily: "inherit" }}>Cancel, keep my account</button>
              </div>
            </div>
          </div>
        )}

        {/* Delete confirm — step 2 (type DELETE) */}
        {showDeleteConfirm2 && (
          <div style={{ position: "fixed", inset: 0, background: "#000d", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
            <div style={{ background: "#111827", border: "1px solid #374151", borderRadius: "20px", padding: "28px", width: "100%", maxWidth: "360px", textAlign: "center" }}>
              <div style={{ fontSize: "36px", marginBottom: "12px" }}>🗑️</div>
              <h2 style={{ margin: "0 0 10px", fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "19px", color: "#f9fafb", letterSpacing: "-0.02em" }}>Are you absolutely sure?</h2>
              <p style={{ color: "#9ca3af", fontSize: "14px", lineHeight: 1.6, marginBottom: "20px" }}>Type <strong style={{ color: "#f87171", letterSpacing: "0.05em" }}>DELETE</strong> below to confirm.</p>
              <input
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE here"
                style={{ width: "100%", padding: "12px", borderRadius: "8px", border: `1px solid ${deleteConfirmText === "DELETE" ? "#f87171" : "#374151"}`, background: "#0d1117", color: "#f9fafb", fontSize: "15px", fontFamily: "inherit", textAlign: "center", boxSizing: "border-box", outline: "none", letterSpacing: "0.05em", marginBottom: "16px" }}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmText !== "DELETE" || deletingAccount}
                  style={{ width: "100%", padding: "13px", borderRadius: "10px", border: "none", background: deleteConfirmText === "DELETE" ? "#dc2626" : "#374151", color: deleteConfirmText === "DELETE" ? "#fff" : "#6b7280", fontWeight: 700, fontSize: "14px", cursor: deleteConfirmText === "DELETE" ? "pointer" : "default", fontFamily: "inherit", transition: "all 0.2s", opacity: deletingAccount ? 0.7 : 1 }}>
                  {deletingAccount ? "Deleting..." : "Permanently delete everything"}
                </button>
                <button onClick={() => { setShowDeleteConfirm2(false); setDeleteConfirmText(""); }} style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #374151", background: "transparent", color: "#6b7280", fontWeight: 600, fontSize: "14px", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              </div>
            </div>
          </div>
        )}
    </DragSheet>
  );
}

// ─── Lifetime Banner ──────────────────────────────────────────────────────────
function LifetimeBanner({ userNumber, onDismiss }) {
  return (
    <div style={{ background: "linear-gradient(90deg, #1d4ed820 0%, #065f4620 100%)", borderBottom: "1px solid #2563eb30", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ fontSize: "18px" }}>🎉</span>
        <div>
          <span style={{ color: "#f9fafb", fontWeight: 700, fontSize: "13px" }}>
            You're user #{userNumber} of {LIFETIME_USER_LIMIT} — you have <span style={{ color: "#10b981" }}>free premium for life</span>.
          </span>
          <span style={{ color: "#6b7280", fontSize: "12px", marginLeft: "8px" }}>No card needed. Ever.</span>
        </div>
      </div>
      <button onClick={onDismiss} style={{ background: "none", border: "none", color: "#4b5563", cursor: "pointer", fontSize: "16px", padding: "2px 6px", borderRadius: "4px", lineHeight: 1 }}>✕</button>
    </div>
  );
}

// ─── Upgrade Modal ────────────────────────────────────────────────────────────
function UpgradeModal({ onClose, onUpgrade, reason }) {
  const reasons = {
    habits: { icon: "📋", title: "You've reached the free habit limit", desc: `Free accounts can track up to ${FREE_HABIT_LIMIT} habits. Upgrade to add unlimited habits.` },
    todos: { icon: "✅", title: "You've reached the free to-do limit", desc: `Free accounts can have up to ${FREE_TODO_LIMIT} active to-dos. Upgrade for unlimited.` },
    journal: { icon: "📓", title: "Journal history locked", desc: `Free accounts can access the last ${FREE_JOURNAL_DAYS} days of journal entries. Upgrade for your full history.` },
  };
  const r = reasons[reason] || reasons.habits;
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000c", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: "#111827", border: "1px solid #374151", borderRadius: "20px", padding: "32px", width: "100%", maxWidth: "380px", textAlign: "center" }}>
        <div style={{ fontSize: "40px", marginBottom: "16px" }}>{r.icon}</div>
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "20px", color: "#f9fafb", marginBottom: "10px", letterSpacing: "-0.02em" }}>{r.title}</h2>
        <p style={{ color: "#6b7280", fontSize: "14px", lineHeight: 1.6, marginBottom: "24px" }}>{r.desc}</p>
        <div style={{ background: "#0d1117", border: "1px solid #2563eb30", borderRadius: "12px", padding: "16px", marginBottom: "24px" }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "32px", color: "#f9fafb" }}>99p<span style={{ fontSize: "14px", color: "#6b7280", fontWeight: 500 }}> / month</span></div>
          <div style={{ color: "#10b981", fontSize: "12px", fontWeight: 600, marginTop: "4px" }}>🔥 Founder pricing — lock it in forever</div>
        </div>
        <button onClick={onUpgrade} style={{ width: "100%", padding: "13px", borderRadius: "10px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "15px", cursor: "pointer", fontFamily: "inherit", marginBottom: "10px" }}>Upgrade to Pro →</button>
        <button onClick={onClose} style={{ width: "100%", padding: "11px", borderRadius: "10px", border: "1px solid #374151", background: "transparent", color: "#6b7280", fontWeight: 600, fontSize: "14px", cursor: "pointer", fontFamily: "inherit" }}>Maybe later</button>
      </div>
    </div>
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
  const [editingTodo, setEditingTodo] = useState(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showTodayOnly, setShowTodayOnly] = useState(() => {
    const saved = localStorage.getItem("ht_showTodayOnly");
    return saved === null ? false : saved === "true";
  });
  const [journalEntries, setJournalEntries] = useState({}); // keyed by date string
  const [profile, setProfile] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [routines, setRoutines] = useState([]);
  const [showRoutineModal, setShowRoutineModal] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState(null);
  const [draggedHabitId, setDraggedHabitId] = useState(null);
  const [draggedHabit, setDraggedHabit] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [standaloneDragOver, setStandaloneDragOver] = useState(false);

  // Track cursor position during drag for live floating card
  useEffect(() => {
    const handleDragOver = e => {
      if (draggedHabitId) setDragPos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("dragover", handleDragOver);
    return () => window.removeEventListener("dragover", handleDragOver);
  }, [draggedHabitId]);
  const [lifetimeBannerDismissed, setLifetimeBannerDismissed] = useState(false);

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
    const [habitsRes, completionsRes, todosRes, pauseRes, journalRes, profileRes, routinesRes] = await Promise.all([
      supabase.from("habits").select("*").eq("user_id", uid).order("created_at"),
      supabase.from("habit_completions").select("habit_id, completed_date").eq("user_id", uid),
      supabase.from("todos").select("*").eq("user_id", uid).order("created_at"),
      supabase.from("pause_periods").select("*").eq("user_id", uid).order("created_at"),
      supabase.from("journal_entries").select("*").eq("user_id", uid).order("entry_date"),
      supabase.from("profiles").select("*").eq("id", uid).single(),
      supabase.from("routines").select("*").eq("user_id", uid).order("created_at"),
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
    setRoutines(routinesRes.data || []);
    setLoading(false);
  };

  // ── Routine actions ────────────────────────────────────────────────────────
  const saveRoutine = async ({ name, emoji }) => {
    if (editingRoutine) {
      const { data } = await supabase.from("routines").update({ name, emoji }).eq("id", editingRoutine.id).select().single();
      setRoutines(prev => prev.map(r => r.id === editingRoutine.id ? data : r));
    } else {
      const { data } = await supabase.from("routines").insert({ user_id: session.user.id, name, emoji }).select().single();
      setRoutines(prev => [...prev, data]);
    }
    setShowRoutineModal(false); setEditingRoutine(null);
  };

  const deleteRoutine = async id => {
    // Remove routine_id from all habits in this routine first
    await supabase.from("habits").update({ routine_id: null }).eq("routine_id", id);
    setHabits(prev => prev.map(h => h.routine_id === id ? { ...h, routine_id: null } : h));
    await supabase.from("routines").delete().eq("id", id);
    setRoutines(prev => prev.filter(r => r.id !== id));
  };

  const moveHabitToRoutine = async (habitId, routineId) => {
    await supabase.from("habits").update({ routine_id: routineId }).eq("id", habitId);
    setHabits(prev => prev.map(h => h.id === habitId ? { ...h, routine_id: routineId } : h));
  };

  const swapHabits = (dragId, targetId) => {
    if (!dragId || !targetId || dragId === targetId) return;
    setHabits(prev => {
      const arr = [...prev];
      const dragIdx = arr.findIndex(h => h.id === dragId);
      const targetIdx = arr.findIndex(h => h.id === targetId);
      if (dragIdx === -1 || targetIdx === -1) return prev;
      // Also inherit the routine_id of the target position
      const dragRoutine = arr[dragIdx].routine_id;
      const targetRoutine = arr[targetIdx].routine_id;
      arr[dragIdx] = { ...arr[dragIdx], routine_id: targetRoutine };
      arr[targetIdx] = { ...arr[targetIdx], routine_id: dragRoutine };
      // Swap positions
      [arr[dragIdx], arr[targetIdx]] = [arr[targetIdx], arr[dragIdx]];
      // Persist routine_id changes if they differ
      if (dragRoutine !== targetRoutine) {
        supabase.from("habits").update({ routine_id: targetRoutine ?? null }).eq("id", dragId);
        supabase.from("habits").update({ routine_id: dragRoutine ?? null }).eq("id", targetId);
      }
      return arr;
    });
  };
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
      if (!isPremium && habits.length >= FREE_HABIT_LIMIT) {
        setShowHabitModal(false); setShowUpgradeModal("habits"); return;
      }
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
  const addTodo = async ({ text, priority, due_date, due_time }) => {
    const activeTodos = todos.filter(t => !t.done);
    if (!isPremium && activeTodos.length >= FREE_TODO_LIMIT) {
      setShowTodoModal(false);
      setShowUpgradeModal("todos");
      return;
    }
    const { data } = await supabase.from("todos").insert({ user_id: session.user.id, text, priority: priority || null, done: false, due_date: due_date || null, due_time: due_time || null }).select().single();
    setTodos(prev => [...prev, { ...data, doneDate: null }]);
    setShowTodoModal(false);
  };

  const saveTodo = async ({ text, priority, due_date, due_time }) => {
    const { data } = await supabase.from("todos").update({ text, priority: priority || null, due_date: due_date || null, due_time: due_time || null }).eq("id", editingTodo.id).select().single();
    setTodos(prev => prev.map(t => t.id === editingTodo.id ? { ...t, ...data } : t));
    setShowTodoModal(false); setEditingTodo(null);
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
  
  // New Streak calculation call
  const isPremium = profile?.is_premium === true || profile?.is_lifetime === true;
  const { currentStreak, shields } = calcStats(habits, pausePeriods, isPremium, profile);

  const priorityOrder = { high: 1, med: 2, low: 3, "": 4 };
  const visibleTodos = (showCompleted ? todos : todos.filter(t => !t.done)).slice().sort((a, b) => {
    // Completed todos sink to bottom
    if (a.done !== b.done) return a.done ? 1 : -1;
    // If both are completed, show most-recently completed first
    if (a.done && b.done) {
      const aDone = a.doneDate || "";
      const bDone = b.doneDate || "";
      if (aDone !== bDone) return aDone < bDone ? 1 : -1; // newer first
      // fallback to priority then id for stable ordering
      const pr = (priorityOrder[a.priority || ""] || 4) - (priorityOrder[b.priority || ""] || 4);
      if (pr !== 0) return pr;
      return a.id < b.id ? -1 : 1;
    }
    // Sort by due date/time first — no due date goes last
    const aDate = a.due_date ? `${a.due_date}${a.due_time ? `T${a.due_time}` : "T23:59"}` : "9999";
    const bDate = b.due_date ? `${b.due_date}${b.due_time ? `T${b.due_time}` : "T23:59"}` : "9999";
    if (aDate !== bDate) return aDate < bDate ? -1 : 1;
    // Same day — sort by priority
    return (priorityOrder[a.priority || ""] || 4) - (priorityOrder[b.priority || ""] || 4);
  });

  // ── Premium ────────────────────────────────────────────────────────────────
  const isLifetime = profile?.is_lifetime === true;
  const userNumber = profile?.user_number || null;

  const handleUpgrade = async () => {
    try {
      const res = await fetch(STRIPE_CHECKOUT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: session.user.id, userEmail: session.user.email }),
      });
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      alert("Something went wrong. Please try again.");
    }
  };

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (session === undefined) return <div style={{ minHeight: "100vh", background: "#0d1117", display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280", fontFamily: "system-ui" }}>Loading...</div>;
  if (!session) return <AuthScreen />;
  if (!loading && profile && !profile.username) return <OnboardingScreen session={session} onComplete={p => { setProfile(p); setShowHabitModal(true); }} />;

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
        .ht-founder-banner { position: relative; z-index: 45; }
        @media (max-width: 640px) {
          .ht-header-pills { display: none; }
          .ht-main { padding: 100px 16px 90px; }
          .ht-tabs { display: none; }
          .ht-habit-grid { flex-direction: column; }
          .ht-habit-grid > * { max-width: 100% !important; min-width: 0 !important; flex: 1 1 100% !important; }
          .ht-bottom-nav { display: flex; position: fixed; bottom: 0; left: 0; right: 0; background: #0d1117; border-top: 1px solid #1f2937; z-index: 50; padding: 8px 0 20px; justify-content: space-around; }
          .ht-header-username { display: none; }
          .ht-analytics-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .ht-founder-banner { position: fixed; top: 60px; left: 0; right: 0; z-index: 45; background: linear-gradient(90deg, #1d3a6e 0%, #064e3b 100%) !important; }
          .ht-main-with-banner { padding-top: 160px !important; }
        }
      `}</style>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", height: "60px", borderBottom: "1px solid #1f2937", position: "sticky", top: 0, background: "#0d1117", zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img src="/habitick-blue-logo.png" alt="HabiTick" style={{ width: "32px", height: "32px", borderRadius: "8px", flexShrink: 0, objectFit: "contain" }} />
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "18px", letterSpacing: "-0.02em" }}>HabiTick</span>
        </div>
        <div className="ht-header-pills" style={{ position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
          {!isPaused && <div style={{ display: "flex", gap: "6px", alignItems: "center", background: "#111827", border: "1px solid #22c55e33", borderRadius: "999px", padding: "5px 14px", fontSize: "12px", color: "#22c55e", fontWeight: 600 }}>✓ {doneToday}/{totalToday} habits today</div>}
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <div style={{ display: "flex", gap: "6px", alignItems: "center", background: "#111827", border: `1px solid ${isPaused ? "#f59e0b66" : "#3b82f633"}`, borderRadius: "999px", padding: "5px 14px", fontSize: "12px", color: isPaused ? "#fcd34d" : "#60a5fa", fontWeight: 600 }}>
              {isPaused ? "⏸ Streak frozen" : `🔥 Streak: ${currentStreak} days`}
            </div>
            <div style={{ display: "flex", gap: "6px", alignItems: "center", background: "#111827", border: `1px solid ${isPaused ? "#f59e0b66" : "#3b82f633"}`, borderRadius: "999px", padding: "5px 14px", fontSize: "12px", color: isPaused ? "#fcd34d" : "#60a5fa", fontWeight: 600 }}>
              {`🛡️ Shields: ${typeof shields === 'number' ? `${shields}/${MAX_SHIELDS}` : `0/${MAX_SHIELDS}`}`}
            </div>
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

      {/* Lifetime founder banner */}
      {isLifetime && userNumber && userNumber <= 100 && !lifetimeBannerDismissed && (
        <div className="ht-founder-banner" style={{ background: "linear-gradient(90deg, #1d4ed820 0%, #10b98115 100%)", borderBottom: "1px solid #2563eb30", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
            <span style={{ fontSize: "18px", flexShrink: 0 }}>🎉</span>
            <span style={{ fontSize: "13px", color: "#93c5fd", fontWeight: 600, lineHeight: 1.5 }}>
              You're <span style={{ color: "#60a5fa", fontWeight: 800 }}>#{userNumber}</span> of 100 founding members — Premium is yours <span style={{ color: "#10b981" }}>free, forever</span>.
            </span>
          </div>
          <button onClick={() => setLifetimeBannerDismissed(true)} style={{ background: "none", border: "none", color: "#4b5563", cursor: "pointer", fontSize: "18px", padding: "4px 8px", flexShrink: 0, lineHeight: 1 }}>✕</button>
        </div>
      )}

      <div className="ht-tabs">
        {[["tasks", "Tasks & Habits"], ["analytics", "Analytics"], ["journal", "Journal"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{ padding: "8px 22px", borderRadius: "8px", border: "1px solid", borderColor: tab === key ? "#2563eb" : "#1f2937", background: tab === key ? "#2563eb" : "#111827", color: tab === key ? "#fff" : "#6b7280", cursor: "pointer", fontWeight: 600, fontSize: "14px", transition: "all 0.15s", fontFamily: "inherit" }}>{label}</button>
        ))}
      </div>

      <main className={`ht-main${isLifetime && userNumber <= 100 && !lifetimeBannerDismissed ? " ht-main-with-banner" : ""}`}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px", color: "#6b7280" }}>Loading your data...</div>
        ) : tab === "tasks" ? (
          <>
            <section style={{ marginBottom: "36px" }}>
              <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "22px", marginBottom: "16px", letterSpacing: "-0.02em", color: "#f9fafb" }}>Habits</h2>
              {!isPremium && habits.length >= FREE_HABIT_LIMIT && (
                <div style={{ background: "#1d4ed820", border: "1px solid #2563eb40", borderRadius: "10px", padding: "14px 16px", marginBottom: "14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                  <div>
                    <div style={{ color: "#60a5fa", fontWeight: 700, fontSize: "14px" }}>Habit limit reached ({FREE_HABIT_LIMIT}/{FREE_HABIT_LIMIT})</div>
                    <div style={{ color: "#4b5563", fontSize: "12px", marginTop: "2px" }}>Upgrade to Premium for unlimited habits</div>
                  </div>
                  <button onClick={() => setShowUpgradeModal(true)} style={{ padding: "7px 14px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "13px", cursor: "pointer", whiteSpace: "nowrap" }}>Upgrade →</button>
                </div>
              )}
              <div style={{ display: "flex", gap: "12px", marginBottom: "14px" }}>
                {(!isPremium && habits.length >= FREE_HABIT_LIMIT) ? null : (
                  <button onClick={() => { setEditingHabit(null); setShowHabitModal(true); }} style={{ flex: 1, padding: "13px", borderRadius: "10px", border: "1px solid #1f2937", background: "#111827", color: "#60a5fa", cursor: "pointer", fontWeight: 700, fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", transition: "border-color 0.2s, background 0.2s" }}>+ Add New Habit</button>
                )}
                <button onClick={() => { setEditingRoutine(null); setShowRoutineModal(true); }} style={{ flex: 1, padding: "13px", borderRadius: "10px", border: "1px solid #1f2937", background: "#111827", color: "#a78bfa", cursor: "pointer", fontWeight: 700, fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", transition: "border-color 0.2s, background 0.2s" }}>+ New Routine</button>
              </div>
              <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
                <button onClick={() => setShowTodayOnly(p => { localStorage.setItem("ht_showTodayOnly", String(!p)); return !p; })} style={{ padding: "7px 16px", borderRadius: "8px", border: "1px solid", borderColor: showTodayOnly ? "#2563eb" : "#374151", background: showTodayOnly ? "#1d4ed8" : "#111827", color: showTodayOnly ? "#fff" : "#9ca3af", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}>{showTodayOnly ? "Show All Habits" : "Show Today's Habits"}</button>
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
                {/* Routine cards */}
                {routines.map(routine => {
                  const routineHabits = todayHabits.filter(h => h.routine_id === routine.id);
                  return (
                    <RoutineCard
                      key={routine.id}
                      routine={routine}
                      habits={routineHabits}
                      today={today}
                      onToggle={toggleHabit}
                      onDelete={deleteHabit}
                      onDeleteRoutine={deleteRoutine}
                      onEjectFromRoutine={habitId => moveHabitToRoutine(habitId, null)}
                      onEdit={thing => {
                        // distinguish habit vs routine by checking for habit.frequency
                        if (thing.frequency !== undefined) { setEditingHabit(thing); setShowHabitModal(true); }
                        else { setEditingRoutine(thing); setShowRoutineModal(true); }
                      }}
                      isPaused={isPaused}
                      pausePeriods={pausePeriods}
                      isPremium={isPremium}
                      dragState={draggedHabitId}
                      dropTargetId={dropTargetId}
                      onDragStartHabit={(id, habit) => { setDraggedHabitId(id); setDraggedHabit(habit); }}
                      onDragEndHabit={() => { if (draggedHabitId && dropTargetId) swapHabits(draggedHabitId, dropTargetId); setDraggedHabitId(null); setDraggedHabit(null); setDropTargetId(null); }}
                      onDragEnterHabit={targetId => setDropTargetId(targetId)}
                      onDropOnRoutine={moveHabitToRoutine}
                    />
                  );
                })}

                {/* Standalone habits — with drop zone to remove from routine */}
                {draggedHabitId && habits.find(h => h.id === draggedHabitId)?.routine_id && (
                  <div
                    onDragOver={e => { e.preventDefault(); setStandaloneDragOver(true); }}
                    onDragLeave={() => setStandaloneDragOver(false)}
                    onDrop={e => { e.preventDefault(); setStandaloneDragOver(false); const id = e.dataTransfer.getData("habitId"); if (id) moveHabitToRoutine(id, null); }}
                    style={{ gridColumn: "1 / -1", border: `2px dashed ${standaloneDragOver ? "#2563eb" : "#374151"}`, borderRadius: "14px", padding: "20px", textAlign: "center", color: standaloneDragOver ? "#60a5fa" : "#374151", fontSize: "14px", fontWeight: 600, transition: "all 0.2s", background: standaloneDragOver ? "#2563eb08" : "transparent", marginBottom: "8px" }}>
                    ↓ Drop here to remove from routine
                  </div>
                )}
                {todayHabits.filter(h => !h.routine_id).length === 0 && routines.length === 0 && (
                  <div style={{ color: "#4b5563", fontSize: "14px", padding: "20px 0" }}>No habits yet. Add your first one!</div>
                )}
                {todayHabits.filter(h => !h.routine_id).map(h => (
                  <HabitCard
                    key={h.id}
                    habit={h}
                    today={today}
                    onToggle={toggleHabit}
                    onDelete={deleteHabit}
                    isPaused={isPaused}
                    pausePeriods={pausePeriods}
                    isPremium={isPremium}
                    onEdit={habit => { setEditingHabit(habit); setShowHabitModal(true); }}
                    draggable
                    onDragStart={(id, habit) => { setDraggedHabitId(id); setDraggedHabit(habit); }}
                    onDragEnd={() => { if (draggedHabitId && dropTargetId) swapHabits(draggedHabitId, dropTargetId); setDraggedHabitId(null); setDraggedHabit(null); setDropTargetId(null); }}
                    onDragEnter={targetId => setDropTargetId(targetId)}
                    isDropTarget={dropTargetId === h.id && draggedHabitId !== h.id}
                  />
                ))}
              </div>
            </section>
            <section>
              <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "22px", marginBottom: "16px", letterSpacing: "-0.02em", color: "#f9fafb" }}>To-Do List</h2>
              <button onClick={() => setShowTodoModal(true)} style={{ width: "100%", padding: "13px", borderRadius: "10px", border: "1px solid #1f2937", background: "#111827", color: "#60a5fa", cursor: "pointer", fontWeight: 700, fontSize: "14px", marginBottom: "14px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", transition: "border-color 0.2s, background 0.2s" }}>+ Add New To-Do</button>
              <button onClick={() => setShowCompleted(p => !p)} style={{ padding: "7px 16px", borderRadius: "8px", border: "1px solid #374151", background: "#111827", color: "#9ca3af", cursor: "pointer", fontWeight: 600, fontSize: "13px", marginBottom: "14px" }}>{showCompleted ? "Hide Completed" : "Show Completed"}</button>
              {visibleTodos.length === 0 && <div style={{ color: "#4b5563", fontSize: "14px" }}>Nothing here yet!</div>}
              {visibleTodos.map(t => <TodoItem key={t.id} todo={t} onToggle={toggleTodo} onDelete={deleteTodo} onEdit={todo => { setEditingTodo(todo); setShowTodoModal(true); }} />)}
            </section>
          </>
        ) : tab === "analytics" ? (
          <AnalyticsTab habits={habits} todos={todos} pausePeriods={pausePeriods} isPremium={isPremium} journalEntries={journalEntries} profile={profile} />
        ) : tab === "journal" ? (
          <JournalTab journalEntries={journalEntries} setJournalEntries={setJournalEntries} session={session} today={today} isPremium={isPremium} />
        ) : null}
      </main>
      {showHabitModal && <HabitModal habit={editingHabit} onSave={saveHabit} onClose={() => { setShowHabitModal(false); setEditingHabit(null); }} />}
      {showTodoModal && <TodoModal todo={editingTodo} onSave={editingTodo ? saveTodo : addTodo} onClose={() => { setShowTodoModal(false); setEditingTodo(null); }} />}
      {showRoutineModal && <RoutineModal routine={editingRoutine} habitsList={habits} onSave={saveRoutine} onEject={habitId => moveHabitToRoutine(habitId, null)} onClose={() => { setShowRoutineModal(false); setEditingRoutine(null); }} />}

      {/* Live floating drag card */}
      {draggedHabitId && draggedHabit && (
        <div style={{ position: "fixed", left: dragPos.x + 16, top: dragPos.y - 20, width: "260px", pointerEvents: "none", zIndex: 9999, opacity: 0.92, transform: "rotate(2deg)", filter: "drop-shadow(0 8px 24px rgba(37,99,235,0.35))", transition: "filter 0.1s" }}>
          <div style={{ background: "#111827", border: "2px solid #2563eb", borderRadius: "14px", padding: "14px 16px", display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ color: "#374151", fontSize: "14px" }}>⠿</span>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#2563eb", flexShrink: 0 }} />
            <div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "14px", color: "#f9fafb" }}>{draggedHabit.name}</div>
              <div style={{ fontSize: "10px", color: "#6b7280", marginTop: "2px", textTransform: "capitalize" }}>{draggedHabit.frequency}</div>
            </div>
          </div>
        </div>
      )}
      {showProfile && <ProfileModal session={session} profile={profile} onUpdate={setProfile} onClose={() => setShowProfile(false)} />}
      {showUpgradeModal && <UpgradeModal onUpgrade={handleUpgrade} onClose={() => setShowUpgradeModal(false)} reason={showUpgradeModal} />}

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
      <div className="ht-mobile-streak" style={{ display: "none", position: "fixed", top: isLifetime && userNumber && userNumber <= 100 && !lifetimeBannerDismissed ? "120px" : "60px", left: 0, right: 0, background: "#0d1117", borderBottom: "1px solid #1f2937", padding: "8px 16px", gap: "8px", zIndex: 40, justifyContent: "center" }}>
        {!isPaused && <div style={{ display: "flex", gap: "6px", alignItems: "center", background: "#111827", border: "1px solid #22c55e33", borderRadius: "999px", padding: "5px 14px", fontSize: "12px", color: "#22c55e", fontWeight: 600 }}>✓ {doneToday}/{totalToday} today</div>}
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <div style={{ display: "flex", gap: "6px", alignItems: "center", background: "#111827", border: `1px solid ${isPaused ? "#f59e0b66" : "#3b82f633"}`, borderRadius: "999px", padding: "5px 14px", fontSize: "12px", color: isPaused ? "#fcd34d" : "#60a5fa", fontWeight: 600 }}>
            {isPaused ? "⏸ Frozen" : `🔥 ${currentStreak} days`}
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center", background: "#111827", border: `1px solid ${isPaused ? "#f59e0b66" : "#3b82f633"}`, borderRadius: "999px", padding: "5px 14px", fontSize: "12px", color: isPaused ? "#fcd34d" : "#60a5fa", fontWeight: 600 }}>
            {`🛡️ Shields: ${typeof shields === 'number' ? `${shields}/${MAX_SHIELDS}` : `0/${MAX_SHIELDS}`}`}
          </div>
        </div>
      </div>
    </div>
  );
}