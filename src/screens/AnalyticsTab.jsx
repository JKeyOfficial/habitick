import { useState } from 'react';
import { DAYS_SHORT } from '../utils/constants.js';
import { getDateStr, parseDateLocal, calcStats } from '../utils/helpers.js';

function MoodInsights({ journalEntries, today }) {
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
  const topWeekMood = Object.entries(weekCounts).sort((a, b) => b[1] - a[1]).find(([, v]) => v > 0);
  const totalEntries = Object.values(weekCounts).reduce((a, b) => a + b, 0);
  const moodLabels = { great: "Great 🌟", good: "Good 😊", okay: "Okay 😐", bad: "Bad 😔" };
  const insights = [];
  if (topWeekMood) {
    const [mood, count] = topWeekMood;
    if (positive.includes(mood)) insights.push({ emoji: "🌟", text: `You felt ${moodLabels[mood].split(" ")[0].toLowerCase()} ${count} time${count !== 1 ? "s" : ""} this week!` });
    else insights.push({ emoji: "💙", text: `You logged ${count} entr${count !== 1 ? "ies" : "y"} this week. Showing up every day is the win.` });
  }
  if (weekCounts.great > 0) insights.push({ emoji: "✨", text: `${weekCounts.great} great day${weekCounts.great !== 1 ? "s" : ""} this week. You're building something real.` });
  if (monthCounts.great + monthCounts.good >= 15) insights.push({ emoji: "🔥", text: `${monthCounts.great + monthCounts.good} positive days this month. That's a strong month.` });
  if (positiveTrend !== null && positiveTrend > 0) insights.push({ emoji: "📈", text: `${positiveTrend}% more positive days than last month.` });
  else if (positiveTrend !== null && positiveTrend < 0) insights.push({ emoji: "💪", text: `Tougher month than last — but you're still here, still tracking. That counts.` });
  if (totalEntries === 7) insights.push({ emoji: "🏅", text: "Perfect journal week — 7 entries in 7 days." });
  else if (totalEntries >= 5) insights.push({ emoji: "📓", text: `${totalEntries} journal entries this week.` });
  if (insights.length === 0) insights.push({ emoji: "📓", text: "Start logging your mood in the journal to unlock personalised insights." });
  return (
    <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "14px", padding: "22px", marginTop: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <h3 style={{ margin: 0, fontFamily: "'Syne', sans-serif", color: "#f9fafb", fontWeight: 700 }}>Mood Insights</h3>
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

export function AnalyticsTab({ habits, todos, pausePeriods, isPremium, journalEntries, profile }) {
  const [range, setRange] = useState("7days");
  const today = new Date();
  const todayStr = getDateStr(today);
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
    if (!start) return true;
    const d = parseDateLocal(dateStr);
    return d >= start && d <= today;
  };
  const { currentStreak, bestStreak, shields, cumulativeCompletedDays } = calcStats(habits, pausePeriods, isPremium, profile);
  const shieldThreshold = isPremium ? 7 : 14;
  const daysToNextShield = shields >= 5 ? null : shieldThreshold - (cumulativeCompletedDays % shieldThreshold);
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
    const end = new Date(); end.setHours(0, 0, 0, 0);
    while (d <= end) {
      const ds = getDateStr(d);
      const dow = d.getDay();
      habits.forEach(h => {
        const createdStr = (h.createdDate || h.created_date || todayStr).substring(0, 10);
        if (ds < createdStr) return;
        const scheduled = h.frequency === "daily" || (h.days && h.days.includes(dow));
        if (scheduled) { scheduledCount++; if ((h.completedDates || []).map(x => x.substring(0, 10)).includes(ds)) completedCount++; }
      });
      d.setDate(d.getDate() + 1);
    }
    const total = habits.reduce((sum, h) => sum + (h.completedDates || []).filter(ds => inRange(ds.substring(0, 10))).length, 0);
    return { completionRate: scheduledCount === 0 ? null : Math.round((completedCount / scheduledCount) * 100), totalCompletions: total };
  })();
  const chartDays = rangeDays || 365;
  const chartPoints = Math.min(chartDays, 30);
  const chartData = Array.from({ length: chartPoints }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() - (chartPoints - 1 - i));
    const ds = getDateStr(d);
    const label = chartPoints <= 7 ? DAYS_SHORT[d.getDay()] : chartPoints <= 31 ? String(d.getDate()) : DAYS_SHORT[d.getDay()][0];
    return { label, habits: habits.filter(h => (h.completedDates || []).map(x => x.substring(0, 10)).includes(ds)).length, tasks: todos.filter(t => t.doneDate === ds).length };
  });
  const useWeekly = rangeDays === 365 || rangeDays === null;
  const finalChartData = useWeekly ? (() => {
    return Array.from({ length: 26 }, (_, wi) => {
      const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() - wi * 7);
      let h = 0, t = 0;
      for (let day = 0; day < 7; day++) {
        const d = new Date(weekEnd); d.setDate(d.getDate() - day);
        const ds = getDateStr(d);
        h += habits.filter(hb => (hb.completedDates || []).map(x => x.substring(0, 10)).includes(ds)).length;
        t += todos.filter(td => td.doneDate === ds).length;
      }
      const d = new Date(weekEnd); d.setDate(d.getDate() - 6);
      return { label: `${d.getDate()}/${d.getMonth() + 1}`, habits: h, tasks: t };
    }).reverse();
  })() : chartData;
  const maxVal = Math.max(...finalChartData.flatMap(d => [d.habits, d.tasks]), 1);
  const chartTitle = range === "7days" ? "Daily Activity — Last 7 Days" : range === "30days" ? "Daily Activity — Last 30 Days" : range === "year" ? "Weekly Activity — Last Year" : "Weekly Activity — All Time";
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
          <button key={val} onClick={() => setRange(val)} style={{ padding: "7px 18px", borderRadius: "999px", border: "1px solid", borderColor: range === val ? "#2563eb" : "#374151", background: range === val ? "#2563eb" : "#111827", color: range === val ? "#fff" : "#9ca3af", cursor: "pointer", fontWeight: 600, fontSize: "13px", fontFamily: "inherit" }}>{label}</button>
        ))}
      </div>
      <div className="ht-analytics-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px", marginBottom: "28px" }}>
        {stats.map((stat, i) => (
          <div key={i} style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "14px", padding: "20px 18px" }}>
            <div style={{ fontSize: "20px", marginBottom: "10px" }}>{stat.icon}</div>
            <div style={{ color: "#6b7280", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>{stat.label}</div>
            <div style={{ fontFamily: "'Syne', sans-serif", color: "#f9fafb", fontWeight: 800, fontSize: "26px" }}>{stat.value}</div>
            {stat.sub && <div style={{ color: "#4b5563", fontSize: "10px", marginTop: "6px" }}>{stat.sub}</div>}
          </div>
        ))}
      </div>
      <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "14px", padding: "22px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, fontFamily: "'Syne', sans-serif", color: "#f9fafb", fontWeight: 700, fontSize: "14px" }}>{chartTitle}</h3>
          <div style={{ display: "flex", gap: "16px", fontSize: "11px", color: "#9ca3af" }}>
            <span><span style={{ display: "inline-block", width: "10px", height: "10px", background: "#3b82f6", borderRadius: "2px", marginRight: "5px" }} />Habits</span>
            <span><span style={{ display: "inline-block", width: "10px", height: "10px", background: "#22c55e", borderRadius: "2px", marginRight: "5px" }} />Tasks</span>
          </div>
        </div>
        <div key={range} style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: "120px", overflowX: "auto" }}>
          {finalChartData.map((d, i) => (
            <div key={i} style={{ minWidth: finalChartData.length > 14 ? "18px" : undefined, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", flex: 1 }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: "2px", width: "100%" }}>
                <div style={{ background: "#3b82f6", borderRadius: "4px 4px 0 0", height: `${(d.habits / maxVal) * 90}%`, minHeight: d.habits > 0 ? "4px" : "0" }} />
                <div style={{ background: "#22c55e", borderRadius: "4px 4px 0 0", height: `${(d.tasks / maxVal) * 90}%`, minHeight: d.tasks > 0 ? "4px" : "0" }} />
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