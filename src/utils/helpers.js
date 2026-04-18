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

  // ── Unified single pass: compute streaks, earn and consume shields chronologically ──
  let cumulativeCompletedDays = 0;
  let shieldsEarnedThresholds = 0;
  let activeShields = 0;
  let currentStreak = 0;
  let bestStreak = 0;
  let shieldedDates = [];
  let initialShieldsApplied = false;

  const fwd = new Date(parseDateLocal(earliestHabitDate));
  const fwdEnd = new Date(parseDateLocal(today));

  while (fwd <= fwdEnd) {
    const ds = getDateStr(fwd);

    if (!isDatePaused(pausePeriods, ds)) {
      if (initialShields > 0 && initialShieldsDate && ds === initialShieldsDate && !initialShieldsApplied) {
        activeShields += initialShields;
        if (activeShields > MAX_SHIELDS) activeShields = MAX_SHIELDS;
        initialShieldsApplied = true;
      }

      const complete = isDayComplete(normalisedHabits, ds);

      if (complete === true) {
        cumulativeCompletedDays++;
        const newThresholds = Math.floor(cumulativeCompletedDays / shieldThreshold);
        if (newThresholds > shieldsEarnedThresholds) {
          const delta = newThresholds - shieldsEarnedThresholds;
          activeShields += delta;
          if (activeShields > MAX_SHIELDS) activeShields = MAX_SHIELDS;
          shieldsEarnedThresholds = newThresholds;
        }

        currentStreak++;
        if (currentStreak > bestStreak) bestStreak = currentStreak;
      } else if (complete === null) {
        // Rest day
        currentStreak++;
        if (currentStreak > bestStreak) bestStreak = currentStreak;
      } else if (complete === false && ds !== today) {
        // Missed day in the past
        if (currentStreak > 0 && activeShields > 0) {
          activeShields--;
          shieldedDates.push(ds);
          currentStreak++;
          if (currentStreak > bestStreak) bestStreak = currentStreak;
        } else {
          currentStreak = 0;
        }
      } else if (complete === false && ds === today) {
        // Today is incomplete, it does not break the streak or consume shields yet
      }
    }

    fwd.setDate(fwd.getDate() + 1);
  }

  return { currentStreak, bestStreak, shields: activeShields, cumulativeCompletedDays, shieldedDates };
}
