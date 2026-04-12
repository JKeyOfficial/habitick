import { MAX_SHIELDS } from "./constants.js";

export function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseDateLocal(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

export function getCalendarDays(year, month) {
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

export function isDayComplete(habits, dateStr) {
  const dow = parseDateLocal(dateStr).getDay();
  const existing = habits.filter(h => (h.createdDate || h.created_date || dateStr).substring(0, 10) <= dateStr);
  const scheduled = existing.filter(h => h.frequency === "daily" || (h.days && h.days.includes(dow)));
  if (scheduled.length === 0) return null; // rest day
  return scheduled.every(h => (h.completedDates || []).includes(dateStr));
}

export function isDatePaused(pausePeriods, dateStr) {
  const ds = dateStr.substring(0, 10);
  return pausePeriods.some(p => {
    const start = (p.start || '').substring(0, 10);
    const end = p.end ? p.end.substring(0, 10) : null;
    return ds >= start && (end === null || ds < end);
  });
}

export function calcStats(habits, pausePeriods, isPremium, profile = null) {
  const today = getDateStr(new Date());
  const initialShields = (profile && profile.initial_shields) ? Number(profile.initial_shields) : 0;
  const initialShieldsDate = profile && profile.initial_shields_granted_at ? (profile.initial_shields_granted_at || '').substring(0, 10) : null;
  if (habits.length === 0) {
    const availableInitial = (initialShields > 0 && initialShieldsDate && initialShieldsDate <= today) ? Math.min(initialShields, MAX_SHIELDS) : 0;
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

  const fwd = new Date(parseDateLocal(earliestHabitDate));
  const fwdEnd = new Date(parseDateLocal(today));
  let initialShieldsApplied = false;

  while (fwd <= fwdEnd) {
    const ds = getDateStr(fwd);

    if (!isDatePaused(pausePeriods, ds)) {
      if (initialShields > 0 && initialShieldsDate && ds === initialShieldsDate && !initialShieldsApplied) {
        for (let k = 0; k < initialShields; k++) shieldGrants.push(ds);
        initialShieldsApplied = true;
        shieldsPool = Math.min(shieldGrants.length, MAX_SHIELDS);
      }

      const complete = isDayComplete(normalisedHabits, ds);

      if (complete === true) {
        cumulativeCompletedDays++;
        const newThresholds = Math.floor(cumulativeCompletedDays / shieldThreshold);
        if (newThresholds > shieldsEarnedThresholds) {
          const delta = newThresholds - shieldsEarnedThresholds;
          for (let k = 0; k < delta; k++) shieldGrants.push(ds);
          shieldsEarnedThresholds = newThresholds;
          shieldsPool = Math.min(shieldGrants.length, MAX_SHIELDS);
        }

        tempStreak++;
        if (tempStreak > bestStreak) bestStreak = tempStreak;
      } else if (complete === false && ds !== today) {
        tempStreak = 0;
      } else if (complete === null) {
        // rest day — no habits scheduled, but not a miss; counts toward best streak
        tempStreak++;
        if (tempStreak > bestStreak) bestStreak = tempStreak;
      }
    }

    fwd.setDate(fwd.getDate() + 1);
  }

  // ── Backward pass: compute CURRENT streak, using shields on missed days ──
  let currentStreak = 0;
  let shieldedDates = [];
  if (shieldGrants.length > MAX_SHIELDS) shieldGrants = shieldGrants.slice(-MAX_SHIELDS);
  let shieldsList = shieldGrants.slice();

  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const todayDateObj = new Date(d);

  for (let i = 0; i < 1100; i++) {
    const ds = getDateStr(d);
    if (ds < earliestHabitDate) break;
    if (isDatePaused(pausePeriods, ds)) { d.setDate(d.getDate() - 1); continue; }

    const complete = isDayComplete(normalisedHabits, ds);

    if (complete === null) {
      currentStreak++;
      d.setDate(d.getDate() - 1);
      continue;
    }
    if (!complete && ds === today) {
      d.setDate(d.getDate() - 1);
      continue;
    }
    if (!complete) {
      const dayDiff = Math.round((todayDateObj - d) / (1000 * 60 * 60 * 24));
      let foundIdx = -1;
      
      // Only allow shield usage within the last 48 hours (2 days)
      if (dayDiff <= 2) {
        for (let j = shieldsList.length - 1; j >= 0; j--) {
          if (shieldsList[j] <= ds) { foundIdx = j; break; }
        }
      }

      if (foundIdx >= 0) {
        shieldsList.splice(foundIdx, 1);
        shieldedDates.push(ds);
        d.setDate(d.getDate() - 1);
        continue;
      }
      break;
    }

    currentStreak++;
    d.setDate(d.getDate() - 1);
  }

  const shieldsRemaining = shieldsList.length;
  return { currentStreak, bestStreak, shields: shieldsRemaining, cumulativeCompletedDays, shieldedDates };
}
