import { useState, useEffect } from 'react';
import { DAYS_SHORT } from '../utils/constants.js';
import { getDateStr, parseDateLocal, calcStats } from '../utils/helpers.js';
import { encryptText, decryptText } from '../utils/crypto.js';
import { supabase } from '../lib/supabase.js';

// Gemini API key is no longer exposed in the frontend bundle.
// AI summary requests are proxied through /api/ai-summary (server-side key).

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
  const positiveTrend = totalPositiveLastMonth > 0
    ? Math.round(((totalPositiveThisMonth - totalPositiveLastMonth) / totalPositiveLastMonth) * 100)
    : null;
  const topWeekMood = Object.entries(weekCounts).sort((a, b) => b[1] - a[1]).find(([, v]) => v > 0);
  const totalEntries = Object.values(weekCounts).reduce((a, b) => a + b, 0);
  const moodLabels = { great: "Great", good: "Good", okay: "Okay", bad: "Bad" };
  const insights = [];
  if (topWeekMood) {
    const [mood, count] = topWeekMood;
    if (positive.includes(mood)) insights.push({ tone: "#34d399", text: `You felt ${moodLabels[mood].toLowerCase()} ${count} time${count !== 1 ? "s" : ""} this week.` });
    else insights.push({ tone: "#60a5fa", text: `You logged ${count} entr${count !== 1 ? "ies" : "y"} this week. Showing up every day is the win.` });
  }
  if (weekCounts.great > 0) insights.push({ tone: "#60a5fa", text: `${weekCounts.great} great day${weekCounts.great !== 1 ? "s" : ""} this week — strong momentum.` });
  if (monthCounts.great + monthCounts.good >= 15) insights.push({ tone: "#f59e0b", text: `${monthCounts.great + monthCounts.good} positive days logged this month.` });
  if (positiveTrend !== null && positiveTrend > 0) insights.push({ tone: "#34d399", text: `${positiveTrend}% more positive days than last month.` });
  else if (positiveTrend !== null && positiveTrend < 0) insights.push({ tone: "#9ca3af", text: `Tougher month than last — staying consistent with tracking still counts.` });
  if (totalEntries === 7) insights.push({ tone: "#34d399", text: "Perfect journal week — 7 entries in 7 days." });
  else if (totalEntries >= 5) insights.push({ tone: "#60a5fa", text: `${totalEntries} journal entries logged this week.` });
  if (insights.length === 0) insights.push({ tone: "#6b7280", text: "Start logging your mood in the journal to unlock personalised insights." });

  return (
    <div style={{
      background: "var(--ht-bg-stat-card)",
      border: "1px solid var(--ht-border-stat-card)",
      borderRadius: "18px",
      padding: "20px 22px",
      marginTop: "16px",
      boxShadow: "var(--ht-shadow-stat-card)"
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <h3 style={{ margin: 0, fontFamily: "'Syne', sans-serif", color: "var(--ht-text-primary)", fontWeight: 700, fontSize: "15px", letterSpacing: "-0.01em" }}>Mood Insights</h3>
        <span style={{ fontSize: "10.5px", padding: "3px 9px", borderRadius: "999px", background: "rgba(59, 130, 246, 0.12)", border: "1px solid rgba(59, 130, 246, 0.25)", color: "#60a5fa", fontWeight: 700 }}>Pro</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "10px", marginBottom: "16px" }}>
        {Object.entries({ great: { label: "Great", dot: "#34d399" }, good: { label: "Good", dot: "#60a5fa" }, okay: { label: "Okay", dot: "#f59e0b" }, bad: { label: "Bad", dot: "#f87171" } }).map(([mood, meta]) => (
          <div key={mood} style={{ background: "var(--ht-bg-card-subtle)", borderRadius: "10px", padding: "12px 10px", textAlign: "center", border: "1px solid var(--ht-border-card)" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--ht-text-muted)", fontWeight: 600, marginBottom: "4px" }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: meta.dot }} />
              {meta.label}
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: "20px", color: weekCounts[mood] > 0 ? "var(--ht-text-primary)" : "var(--ht-text-muted)" }}>{weekCounts[mood]}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {insights.map((ins, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", background: "var(--ht-bg-card-subtle)", borderRadius: "10px", padding: "10px 14px", border: "1px solid var(--ht-border-card)" }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: ins.tone, flexShrink: 0 }} />
            <span style={{ fontSize: "13px", color: "var(--ht-text-secondary)", lineHeight: 1.5 }}>{ins.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Parse inline markdown (**bold**, *italic*, `code`) into React elements
 * so raw asterisks never leak into the UI.
 */
function parseInline(text) {
  const tokenRegex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  const parts = text.split(tokenRegex);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={i} style={{ color: "inherit", fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={i} style={{ color: "inherit", fontStyle: "italic", fontWeight: "inherit" }}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return <code key={i} style={{ fontSize: "12px", padding: "1px 5px", borderRadius: "4px", background: "var(--ht-bg-card-subtle)", border: "1px solid var(--ht-border-card)" }}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

function renderMarkdown(text) {
  if (!text) return null;
  return text.split("\n").map((line, idx) => {
    let clean = line.trim();
    if (!clean) return <div key={idx} style={{ height: "6px" }} />;

    if (clean.startsWith("### ")) {
      return <h5 key={idx} style={{ margin: "14px 0 6px", color: "var(--ht-text-primary)", fontSize: "13px", fontWeight: 600 }}>{parseInline(clean.substring(4))}</h5>;
    }
    if (clean.startsWith("## ") || clean.startsWith("# ")) {
      const val = clean.startsWith("## ") ? clean.substring(3) : clean.substring(2);
      return <h4 key={idx} style={{ margin: "16px 0 6px", color: "var(--ht-text-primary)", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{parseInline(val)}</h4>;
    }

    if (clean.startsWith("- ") || clean.startsWith("* ")) {
      const val = clean.substring(2);
      return (
        <div key={idx} style={{ display: "flex", gap: "10px", alignItems: "flex-start", margin: "4px 0 4px 4px" }}>
          <span style={{ color: "var(--ht-text-muted)", fontSize: "13px", lineHeight: 1.6 }}>•</span>
          <span style={{ fontSize: "13.5px", color: "var(--ht-text-secondary)", lineHeight: 1.6 }}>{parseInline(val)}</span>
        </div>
      );
    }

    return <p key={idx} style={{ margin: "0 0 10px", fontSize: "13.5px", color: "var(--ht-text-secondary)", lineHeight: 1.65 }}>{parseInline(clean)}</p>;
  });
}

function getTypicalTimeStr(completionTimes, completions) {
  const times = [];
  completions.forEach(d => {
    const iso = completionTimes?.[d];
    if (iso) {
      const t = new Date(iso);
      if (!isNaN(t.getTime())) {
        times.push(t.getHours() * 60 + t.getMinutes());
      }
    }
  });
  if (times.length === 0) return "";
  const avgMins = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  const hrs = Math.floor(avgMins / 60);
  const mins = avgMins % 60;
  const ampm = hrs >= 12 ? "PM" : "AM";
  const displayHrs = hrs % 12 || 12;
  const displayMins = String(mins).padStart(2, '0');

  let period = "Morning";
  if (hrs >= 12 && hrs < 17) period = "Afternoon";
  else if (hrs >= 17 && hrs < 22) period = "Evening";
  else if (hrs >= 22 || hrs < 5) period = "Night";

  return ` (usually in the ${period} around ${displayHrs}:${displayMins} ${ampm})`;
}

function AICoach({ habits, todos, goals = [], journalEntries, rangeDays, todayStr, isPremium, profile, setProfile, session, onRecommendHabit }) {
  const [loadingStep, setLoadingStep] = useState(0);
  const [summary, setSummary] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [feedbackRating, setFeedbackRating] = useState(null);
  const [feedbackReason, setFeedbackReason] = useState("");
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  const cacheKey = `ht_ai_report_${rangeDays}days`;
  const timestampKey = `ht_ai_report_${rangeDays}days_timestamp`;

  const cooldownMs = rangeDays === 7
    ? 7 * 24 * 60 * 60 * 1000 // 7 days
    : 30 * 24 * 60 * 60 * 1000; // 30 days

  const saveFeedback = async (rating, reason) => {
    const currentPersona = profile?.ai_persona || {};
    const reports = currentPersona.reports || {};
    const currentReport = reports[rangeDays];
    if (currentReport) {
      currentReport.feedback = {
        rating,
        reason,
        timestamp: Date.now()
      };
    }

    const feedbacks = currentPersona.feedbacks || [];
    feedbacks.push({
      timestamp: Date.now(),
      rating,
      reason,
      summaryText: currentReport?.text || ""
    });

    const updatedPersona = {
      ...currentPersona,
      reports,
      feedbacks
    };

    try {
      const encryptedPersona = await encryptText(JSON.stringify(updatedPersona), profile.id);
      const encryptedSuggestions = await encryptText(JSON.stringify(profile?.ai_suggestions || {}), profile.id);

      const { data: updatedProfile } = await supabase
        .from("profiles")
        .update({
          ai_persona_encrypted: encryptedPersona,
          ai_suggestions_encrypted: encryptedSuggestions
        })
        .eq("id", profile.id)
        .select()
        .single();

      if (updatedProfile) {
        updatedProfile.ai_persona = updatedPersona;
        updatedProfile.ai_suggestions = profile?.ai_suggestions || {};
        setProfile(updatedProfile);
      }
    } catch (e) {
      console.error("Failed to save feedback to profile:", e);
    }
    setFeedbackSubmitted(true);
  };

  // Clear old cache once to apply the prompt changes
  useEffect(() => {
    const version = localStorage.getItem("ht_ai_cache_version");
    if (version !== "6") {
      localStorage.removeItem("ht_ai_report_7days");
      localStorage.removeItem("ht_ai_report_7days_timestamp");
      localStorage.removeItem("ht_ai_report_30days");
      localStorage.removeItem("ht_ai_report_30days_timestamp");
      localStorage.removeItem("ht_ai_suggestions_7");
      localStorage.removeItem("ht_ai_suggestions_30");
      localStorage.setItem("ht_ai_cache_version", "6");
    }
  }, []);

  // Load cached summary on mount or range change
  useEffect(() => {
    if (profile?.ai_suggestions) {
      setSuggestions(profile.ai_suggestions[rangeDays] || []);
    } else {
      setSuggestions([]);
    }

    setFeedbackRating(null);
    setFeedbackReason("");

    const report = profile?.ai_persona?.reports?.[rangeDays];
    if (report) {
      const isWithinCooldown = Date.now() - report.timestamp < cooldownMs;
      if (isWithinCooldown) {
        setSummary({ isAI: true, text: report.text, cachedTime: report.timestamp });
        setFeedbackSubmitted(!!report.feedback);
        setLoadingStep(4);
        return;
      }
    }

    setSummary(null);
    setFeedbackSubmitted(false);
    setLoadingStep(0);
  }, [rangeDays, profile?.ai_suggestions, profile?.ai_persona]);

  const getCooldownRemainingStr = () => {
    const cachedTime = profile?.ai_persona?.reports?.[rangeDays]?.timestamp;
    if (!cachedTime) return "";
    const nextAvailable = Number(cachedTime) + cooldownMs;
    const remainingMs = nextAvailable - Date.now();
    if (remainingMs <= 0) return "";

    const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
    if (remainingDays > 1) return `${remainingDays} days`;

    const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
    return `${remainingHours} hours`;
  };

  const buildPrompt = () => {
    const start = new Date();
    start.setDate(start.getDate() - rangeDays);
    const startStr = getDateStr(start);

    // Goals data
    const activeGoalsDetails = (goals || []).filter(g => !g.completed).map(g => `- ${g.title}${g.description ? ` (${g.description})` : ""}${g.target_date ? ` (Target: ${g.target_date})` : ""}`).join("\n");
    const completedGoalsDetails = (goals || []).filter(g => g.completed).map(g => `- ${g.title} (Completed on ${g.completed_at ? g.completed_at.substring(0, 10) : "recently"})`).join("\n");

    // Habits data
    const habitDetails = habits.map(h => {
      const completions = (h.completedDates || []).filter(d => d >= startStr && d <= todayStr);
      let scheduled = 0;
      const d = new Date(start);
      while (d <= new Date()) {
        const ds = getDateStr(d);
        if (ds >= (h.createdDate || h.created_date || todayStr)) {
          if (h.frequency === "daily" || (h.days && h.days.includes(d.getDay()))) {
            scheduled++;
          }
        }
        d.setDate(d.getDate() + 1);
      }
      const timeStr = getTypicalTimeStr(h.completionTimes, completions);
      return `- ${h.name}: Completed ${completions.length}/${scheduled} times (${scheduled > 0 ? Math.round((completions.length / scheduled) * 100) : 0}% completion)${timeStr}`;
    }).join("\n");

    // Tasks data
    const completedTasks = todos.filter(t => t.done && t.doneDate && t.doneDate >= startStr && t.doneDate <= todayStr).map(t => `- ${t.text} (Completed on ${t.doneDate})`).join("\n");
    const pendingTasks = todos.filter(t => !t.done && (!t.due_date || t.due_date <= todayStr)).map(t => `- ${t.text} (Due: ${t.due_date || "No due date"})`).join("\n");

    // Journal entries
    const journalDetails = Object.entries(journalEntries)
      .filter(([date]) => date >= startStr && date <= todayStr)
      .map(([date, e]) => `Date: ${date}\nMood: ${e.mood || "Not specified"}\nNote: ${e.content || "No note written"}`)
      .join("\n\n");

    const cleanPersona = { ...profile?.ai_persona };
    delete cleanPersona.feedbacks;
    const savedPersona = profile?.ai_persona ? JSON.stringify(cleanPersona, null, 2) : "No previous persona data.";

    const feedbacks = profile?.ai_persona?.feedbacks || [];
    const feedbackList = feedbacks.slice(-5).map(f =>
      `- Rated ${f.rating === 'up' ? '👍 Helpful' : '👎 Unhelpful'} on a previous coaching summary.${f.reason ? ` Reason/correction from user: "${f.reason}"` : ""}`
    ).join("\n");

    return `You are a wise, supportive, and observant personal coach. Analyze the user's last ${rangeDays} days using their habits, tasks, journal entries, and long-term goals.

Long-term AI Context Memory (use this to maintain consistency, understand relationships like friends or love interests, stressors, and inferred demographics):
${savedPersona}

Historical Feedback Loop (use this feedback to adjust your coaching tone, recommendations, and insights. Avoid repeating things the user marked as unhelpful):
${feedbackList || "No feedback logged yet."}

Write a warm, natural ${rangeDays === 7 ? "weekly" : "30-day"} summary (max 250 words) with this structure:

1. **Opening** – One strong, positive but honest sentence.
2. **Key Wins** – Highlight the most important achievements and positive developments.
3. **Patterns & Insights** – Comment on energy, habits, relationships, and what stands out. If the user writes repeatedly about a specific person, mention them by name and interpret the situation warmly and supportively.
4. **Encouragement + Advice** – Offer warm encouragement on positive areas (especially relationships) and one gentle, practical suggestion.
5. **Closing** – Motivational and uplifting final line.

Rules:
- Be honest. Acknowledge the bad things, the pain, but try to support them.
- Never use placeholder names. Only use real names that appear in the user's journal entries or Context Memory.
- Read between the lines. Be specific when the user shows strong interest or emotion toward someone.
- Be caring and supportive, like a good friend who notices what matters to them.
- Look at the user's Long-term Goals and connect them to their daily habits and tasks. If you notice a habit or task directly supporting a long-term goal (for example, a study habit supporting a goal to pass an exam like AZ-104, or a running habit supporting a goal to run a marathon), highlight this connection in your Patterns & Insights or Encouragement (e.g., "Keep up the streak of studying, it will help you pass that AZ-104 exam!").
- Balance honesty with encouragement. No fluff.

Data:
Long-term Goals:
Active Goals:
${activeGoalsDetails || "No active goals logged."}
Completed Goals:
${completedGoalsDetails || "No completed goals logged."}

Habits:
${habitDetails || "No habits logged."}

Tasks:
${completedTasks ? `Completed:\n${completedTasks}` : ""}
${pendingTasks ? `Pending:\n${pendingTasks}` : ""}
${!completedTasks && !pendingTasks ? "No tasks logged." : ""}

Journal:
${journalDetails || "No journal entries logged."}

---
CRITICAL INSTRUCTION FOR STRUCTURED DATA EXTRACTION:
At the very end of your response, output a structured JSON block enclosed in the custom tags. Update the Dynamic Persona Map and generate 3 custom recommendations/insights (2 of type 'habit_recommendation' or 'habit_pairing', and 1 of type 'consistency_pattern').

CRITICAL RULES FOR RECOMMENDATIONS:
1. SPECIFIC & ACTIONABLE TITLES ONLY: For type 'habit_recommendation' and 'habit_pairing', the 'title' MUST be a specific, discrete, trackable habit name (e.g., 'Play Guitar', 'Learn Japanese', '10-minute Walk', 'Journal thoughts') and NOT a vague, high-level goal, routine advice, or general process (do NOT output 'Boost Afternoon Habits', 'Improve Consistency', 'Optimize Routine', 'Spanish Study Flow', or anything containing the words 'sprint', 'flow', 'routine', 'consistency', 'boost', 'habits'). The titles must be ready to be added directly as a habit list entry.
2. DO NOT recommend habits that the user is already tracking or variations of them (refer to the "Data: Habits" section above). For example, if they already track a habit named "Creatine" or "Spanish", do not recommend "Boost Creatine Consistency" or "Spanish Study Flow" or variations of them.
3. HOLISTIC APPROACH: Based on the user's journals and lifestyle, recommend entirely new, complementary habits or habits that address gaps identified in their journals (e.g., stress relief, learning a different creative instrument or skill, mindfulness, physical exercise, reading/studying different topics).

Use exactly this format:
\`\`\`JSON_DATA_START
{
  "persona": {
    "inferredAgeBracket": "...",
    "inferredGender": "...",
    "keyPeople": ["Name (Relationship - Details)"],
    "coreStressors": ["Stressor - Details"],
    "peakEnergyTime": "..."
  },
  "suggestions": [
    {
      "title": "Evening Walk",
      "type": "habit_recommendation",
      "insight": "On days you logged high stress, walking for 10 minutes significantly improved your mood.",
      "actionable": "Set up a 10-minute evening walk habit immediately after dinner."
    },
    ...
  ]
}
\`\`\`JSON_DATA_END

Keep suggestions relevant to the completion times, stress levels, and journal reflections. Do not include markdown code block backticks inside the tag itself.`;
  };

  const triggerAnalysis = async () => {
    // Spam protection check
    const lastReportTime = profile?.ai_persona?.reports?.[rangeDays]?.timestamp;
    if (lastReportTime && !profile?.is_admin) {
      const isWithinCooldown = Date.now() - lastReportTime < cooldownMs;
      if (isWithinCooldown) {
        alert(`Limit reached. You can only generate one ${rangeDays === 7 ? "weekly" : "monthly"} AI summary every ${rangeDays === 7 ? "7" : "30"} days to prevent spam.`);
        return;
      }
    }

    setLoadingStep(1);
    try {
      await new Promise(r => setTimeout(r, 450));
      setLoadingStep(2);
      await new Promise(r => setTimeout(r, 450));
      setLoadingStep(3);

      const prompt = buildPrompt();
      const response = await fetch('/api/ai-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        const message = errorJson?.error?.message || `HTTP ${response.status}`;
        throw new Error(message);
      }

      const data = await response.json();
      let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error("Invalid response format: No text returned.");
      }

      // Extract and save Dynamic Persona Map + Suggestions
      const startTag = "```JSON_DATA_START";
      const endTag = "```JSON_DATA_END";

      const startIndex = text.indexOf(startTag);
      const endIndex = text.indexOf(endTag);

      let newPersona = {};
      let suggestionsList = [];
      let parsedSucceeded = false;

      if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
        const jsonText = text.substring(startIndex + startTag.length, endIndex).trim();
        try {
          const parsed = JSON.parse(jsonText);
          newPersona = parsed.persona || {};
          suggestionsList = parsed.suggestions || [];
          parsedSucceeded = true;
        } catch (e) {
          console.warn("Failed to parse AI structured data JSON:", e);
        }
        // Strip the JSON block from the text shown to the user
        text = (text.substring(0, startIndex) + text.substring(endIndex + endTag.length)).trim();
      }

      // Sync updated report text, timestamp, suggestions, and persona to Supabase
      const currentPersona = profile?.ai_persona || {};
      const updatedPersona = {
        ...currentPersona,
        ...newPersona,
        reports: {
          ...(currentPersona.reports || {}),
          [rangeDays]: {
            text: text,
            timestamp: Date.now(),
            feedback: null
          }
        }
      };

      const currentSuggestions = profile?.ai_suggestions || {};
      const newSuggestions = parsedSucceeded ? {
        ...currentSuggestions,
        [rangeDays]: suggestionsList
      } : currentSuggestions;

      try {
        const encryptedPersona = await encryptText(JSON.stringify(updatedPersona), profile.id);
        const encryptedSuggestions = await encryptText(JSON.stringify(newSuggestions), profile.id);

        const { data: updatedProfile } = await supabase
          .from("profiles")
          .update({
            ai_persona_encrypted: encryptedPersona,
            ai_suggestions_encrypted: encryptedSuggestions
          })
          .eq("id", profile.id)
          .select()
          .single();

        if (updatedProfile) {
          updatedProfile.ai_persona = updatedPersona;
          updatedProfile.ai_suggestions = newSuggestions;
          setProfile(updatedProfile);
        }
      } catch (e) {
        console.error("Failed to sync new report to Supabase:", e);
      }

      // Reset local feedback states for the UI
      setFeedbackRating(null);
      setFeedbackReason("");
      setFeedbackSubmitted(false);

      // Cache results in localStorage as fallback
      localStorage.setItem(cacheKey, text);
      localStorage.setItem(timestampKey, String(Date.now()));

      setSummary({ isAI: true, text, cachedTime: Date.now() });
      setLoadingStep(4);
    } catch (err) {
      console.error("Gemini API Connection Failed:", err);
      alert(`Failed to connect to Gemini API: ${err.message}`);
      setLoadingStep(0);
    }
  };

  const stepTexts = {
    1: "Reading habit completions...",
    2: "Correlating journal reflections...",
    3: "Synthesizing coaching summary..."
  };

  const hasCooldownActive = summary?.cachedTime && (Date.now() - summary.cachedTime < cooldownMs);

  const coachHeader = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{
          width: "32px",
          height: "32px",
          borderRadius: "10px",
          background: "linear-gradient(135deg, rgba(139, 92, 246, 0.18) 0%, rgba(59, 130, 246, 0.14) 100%)",
          border: "1px solid rgba(139, 92, 246, 0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#a78bfa",
          boxShadow: "0 2px 8px rgba(139, 92, 246, 0.15)"
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="rgba(167, 139, 250, 0.22)" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
          </svg>
        </div>
        <div>
          <h3 style={{ margin: 0, fontFamily: "'Syne', sans-serif", color: "var(--ht-text-primary)", fontWeight: 700, fontSize: "15px", letterSpacing: "-0.01em" }}>AI Performance Coach</h3>
        </div>
      </div>
      <span style={{ fontSize: "10.5px", padding: "3px 9px", borderRadius: "999px", background: "rgba(139, 92, 246, 0.12)", border: "1px solid rgba(139, 92, 246, 0.25)", color: "#a78bfa", fontWeight: 700 }}>Pro</span>
    </div>
  );

  if (!isPremium) {
    return (
      <div style={{
        background: "var(--ht-bg-stat-card)",
        border: "1px solid var(--ht-border-stat-card)",
        borderRadius: "18px",
        padding: "20px 22px",
        marginTop: "16px",
        boxShadow: "var(--ht-shadow-stat-card)"
      }}>
        {coachHeader}
        <div style={{ padding: "24px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", textAlign: "center" }}>
          <div style={{
            width: "36px",
            height: "36px",
            borderRadius: "10px",
            background: "var(--ht-bg-card-subtle)",
            border: "1px solid var(--ht-border-card)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--ht-text-muted)"
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <p style={{ color: "var(--ht-text-secondary)", fontSize: "13px", margin: "0 auto", lineHeight: 1.5, maxWidth: "360px" }}>
            Unlock personalized weekly and monthly coaching summaries powered by your encrypted habit and journal data. Upgrade to Pro for full access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: "var(--ht-bg-stat-card)",
      border: "1px solid var(--ht-border-stat-card)",
      borderRadius: "18px",
      padding: "20px 22px",
      marginTop: "16px",
      boxShadow: "var(--ht-shadow-stat-card)"
    }}>
      {coachHeader}

      {loadingStep === 0 && (
        <div style={{ textAlign: "center", padding: "20px 10px" }}>
          <p style={{ color: "var(--ht-text-secondary)", fontSize: "13px", margin: "0 auto 16px", lineHeight: 1.55, maxWidth: "460px" }}>
            Generate a personalized {rangeDays === 7 ? "weekly" : "monthly"} coaching review from your logged habits, completed tasks, and journal entries.
          </p>
          <button
            onClick={triggerAnalysis}
            style={{
              padding: "9px 18px",
              borderRadius: "9px",
              border: "1px solid rgba(59, 130, 246, 0.35)",
              background: "var(--ht-accent)",
              color: "#fff",
              fontWeight: 600,
              fontSize: "13px",
              fontFamily: "inherit",
              cursor: "pointer",
              transition: "opacity 0.15s"
            }}
          >
            Generate Coaching Review
          </button>
        </div>
      )}

      {loadingStep > 0 && loadingStep < 4 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 10px", gap: "12px" }}>
          <div style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            border: "2px solid var(--ht-border-card)",
            borderTopColor: "var(--ht-accent)",
            animation: "spin 0.9s linear infinite"
          }} />
          <span style={{ fontSize: "12.5px", color: "var(--ht-text-secondary)", fontWeight: 500 }}>{stepTexts[loadingStep]}</span>
        </div>
      )}

      {loadingStep === 4 && summary && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", animation: "fadeUp 0.25s ease-out" }}>
          <div style={{ fontSize: "13.5px", color: "var(--ht-text-secondary)", lineHeight: 1.65 }}>
            {renderMarkdown(summary.text)}
          </div>

          {/* Feedback Loop */}
          <div style={{
            background: "var(--ht-bg-card-subtle)",
            border: "1px solid var(--ht-border-card)",
            borderRadius: "10px",
            padding: "10px 14px",
            marginTop: "4px"
          }}>
            {!feedbackSubmitted ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontSize: "12px", color: "var(--ht-text-muted)" }}>Was this summary helpful?</span>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      onClick={() => {
                        setFeedbackRating("up");
                        setFeedbackSubmitted(true);
                        saveFeedback("up", "");
                      }}
                      style={{
                        background: feedbackRating === "up" ? "rgba(16, 185, 129, 0.12)" : "var(--ht-bg-card)",
                        border: `1px solid ${feedbackRating === "up" ? "rgba(16, 185, 129, 0.35)" : "var(--ht-border-card)"}`,
                        borderRadius: "7px",
                        color: feedbackRating === "up" ? "#34d399" : "var(--ht-text-secondary)",
                        padding: "4px 10px",
                        fontSize: "12px",
                        fontWeight: 500,
                        fontFamily: "inherit",
                        cursor: "pointer"
                      }}
                    >
                      Helpful
                    </button>
                    <button
                      onClick={() => setFeedbackRating("down")}
                      style={{
                        background: feedbackRating === "down" ? "rgba(239, 68, 68, 0.12)" : "var(--ht-bg-card)",
                        border: `1px solid ${feedbackRating === "down" ? "rgba(239, 68, 68, 0.35)" : "var(--ht-border-card)"}`,
                        borderRadius: "7px",
                        color: feedbackRating === "down" ? "#f87171" : "var(--ht-text-secondary)",
                        padding: "4px 10px",
                        fontSize: "12px",
                        fontWeight: 500,
                        fontFamily: "inherit",
                        cursor: "pointer"
                      }}
                    >
                      Not helpful
                    </button>
                  </div>
                </div>

                {feedbackRating === "down" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
                    <textarea
                      placeholder="How can this review be improved? (e.g. more specific suggestions, tone adjustment...)"
                      value={feedbackReason}
                      onChange={(e) => setFeedbackReason(e.target.value)}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        minHeight: "60px",
                        background: "var(--ht-bg-input)",
                        border: "1px solid var(--ht-border-card)",
                        borderRadius: "8px",
                        color: "var(--ht-text-primary)",
                        padding: "8px 10px",
                        fontSize: "12px",
                        fontFamily: "inherit",
                        resize: "vertical",
                        outline: "none"
                      }}
                    />
                    <button
                      onClick={() => {
                        setFeedbackSubmitted(true);
                        saveFeedback("down", feedbackReason);
                      }}
                      style={{
                        alignSelf: "flex-end",
                        background: "var(--ht-bg-card)",
                        border: "1px solid var(--ht-border-hover)",
                        borderRadius: "7px",
                        color: "var(--ht-text-primary)",
                        fontSize: "11.5px",
                        fontWeight: 600,
                        fontFamily: "inherit",
                        padding: "5px 12px",
                        cursor: "pointer"
                      }}
                    >
                      Submit Feedback
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: "12px", color: "#34d399", textAlign: "center", fontWeight: 500 }}>
                Feedback saved — future summaries will adapt to your preferences.
              </div>
            )}
          </div>

          {/* Smart Suggestions Cards */}
          {suggestions && Array.isArray(suggestions) && suggestions.length > 0 && (
            <div style={{ marginTop: "8px", borderTop: "1px solid var(--ht-border-card)", paddingTop: "16px" }}>
              <h4 style={{ margin: "0 0 12px 0", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--ht-text-muted)" }}>Recommended Actions</h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
                {suggestions.map((s, idx) => {
                  let badgeText = "Recommendation";
                  let badgeColor = "#60a5fa";
                  let dotColor = "#3b82f6";

                  if (s.type === "habit_pairing") {
                    badgeText = "Habit Pairing";
                    badgeColor = "#a78bfa";
                    dotColor = "#8b5cf6";
                  } else if (s.type === "consistency_pattern") {
                    badgeText = "Consistency";
                    badgeColor = "#34d399";
                    dotColor = "#10b981";
                  }

                  const isHabitCreator = s.type === "habit_recommendation" || s.type === "habit_pairing";

                  return (
                    <div key={idx} style={{
                      background: "var(--ht-bg-card-subtle)",
                      border: "1px solid var(--ht-border-card)",
                      borderRadius: "10px",
                      padding: "12px 14px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: "10px"
                    }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--ht-text-primary)" }}>{s.title}</span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "10px", padding: "2px 7px", borderRadius: "6px", background: "var(--ht-bg-card)", border: "1px solid var(--ht-border-card)", color: badgeColor, fontWeight: 600, whiteSpace: "nowrap" }}>
                            <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: dotColor }} />
                            {badgeText}
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: "12px", color: "var(--ht-text-muted)", lineHeight: 1.45 }}>{s.insight}</p>
                        <p style={{ margin: 0, fontSize: "12px", color: "var(--ht-text-secondary)", fontWeight: 500, lineHeight: 1.45 }}>{s.actionable}</p>
                      </div>

                      {isHabitCreator && onRecommendHabit && (
                        <button
                          onClick={() => onRecommendHabit(s.title)}
                          style={{
                            alignSelf: "flex-start",
                            padding: "5px 10px",
                            borderRadius: "7px",
                            border: "1px solid var(--ht-border-hover)",
                            background: "var(--ht-bg-card)",
                            color: "var(--ht-text-primary)",
                            fontWeight: 600,
                            fontSize: "11px",
                            fontFamily: "inherit",
                            cursor: "pointer",
                            transition: "all 0.15s"
                          }}
                        >
                          + Add as Habit
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--ht-border-card)", paddingTop: "12px", marginTop: "4px" }}>
            <span style={{ fontSize: "11.5px", color: "var(--ht-text-muted)", fontWeight: 500 }}>
              {hasCooldownActive && !profile?.is_admin ? `Cached — refreshes in ${getCooldownRemainingStr()}` : "Ready to regenerate"}
            </span>
            {(!hasCooldownActive || profile?.is_admin) && (
              <button
                onClick={triggerAnalysis}
                disabled={hasCooldownActive && !profile?.is_admin}
                style={{
                  background: "var(--ht-bg-card-subtle)",
                  border: "1px solid var(--ht-border-card)",
                  borderRadius: "7px",
                  color: "var(--ht-text-secondary)",
                  fontSize: "11.5px",
                  fontWeight: 600,
                  fontFamily: "inherit",
                  padding: "5px 11px",
                  cursor: "pointer",
                  transition: "all 0.15s"
                }}
              >
                Regenerate
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function getDayHabitCompletion(habits, dateObj, todayStr) {
  const ds = getDateStr(dateObj);
  const dow = dateObj.getDay();
  let scheduled = 0;
  let completed = 0;
  habits.forEach(h => {
    const createdStr = (h.createdDate || h.created_date || todayStr).substring(0, 10);
    if (ds < createdStr) return;
    const isScheduled = h.frequency === "daily" || (h.days && h.days.includes(dow));
    if (isScheduled) {
      scheduled++;
      if ((h.completedDates || []).some(x => x.substring(0, 10) === ds)) {
        completed++;
      }
    }
  });
  return { ds, scheduled, completed };
}

function buildSmoothLinePath(pts, minY, maxY) {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = Math.max(minY, Math.min(maxY, p1.y + (p2.y - p0.y) / 6));
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = Math.max(minY, Math.min(maxY, p2.y - (p3.y - p1.y) / 6));
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

export function AnalyticsTab({ habits, todos, goals = [], pausePeriods, isPremium, journalEntries, profile, setProfile, session, onRecommendHabit }) {
  const [range, setRange] = useState("7days");
  const [cachedMissedDay, setCachedMissedDay] = useState(null);
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
  const { completionRate, totalCompletions, mostMissedHabit, mostMissedDay } = (() => {
    if (habits.length === 0) return { completionRate: null, totalCompletions: 0, mostMissedHabit: null, mostMissedDay: null };
    const start = getRangeStart();
    const earliestHabit = habits.reduce((earliest, h) => {
      const created = (h.createdDate || todayStr).substring(0, 10);
      return created < earliest ? created : earliest;
    }, todayStr);
    const rangeStart = start ? start : parseDateLocal(earliestHabit);
    let scheduledCount = 0, completedCount = 0;
    const habitMissMap = new Map();
    const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const weekdayStats = weekdayNames.map(name => ({ name, scheduled: 0, missed: 0 }));

    const d = new Date(rangeStart);
    d.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(0, 0, 0, 0);
    while (d <= end) {
      const ds = getDateStr(d);
      const dow = d.getDay();
      habits.forEach(h => {
        const createdStr = (h.createdDate || h.created_date || todayStr).substring(0, 10);
        if (ds < createdStr) return;
        const isScheduled = h.frequency === "daily" || (h.days && h.days.includes(dow));
        if (!isScheduled) return;
        const done = (h.completedDates || []).some(x => x.substring(0, 10) === ds);
        scheduledCount++;
        if (done) completedCount++;

        const prev = habitMissMap.get(h.id) || { name: h.name, scheduled: 0, completed: 0, missed: 0 };
        prev.scheduled++;
        if (done) prev.completed++;
        else prev.missed++;
        habitMissMap.set(h.id, prev);

        weekdayStats[dow].scheduled++;
        if (!done) weekdayStats[dow].missed++;
      });
      d.setDate(d.getDate() + 1);
    }

    const missedHabits = Array.from(habitMissMap.values()).filter(x => x.missed > 0);
    missedHabits.sort((a, b) => b.missed - a.missed || (b.missed / b.scheduled) - (a.missed / a.scheduled));
    const topMissedHabit = missedHabits[0] || null;

    const missedDays = weekdayStats.filter(x => x.scheduled > 0 && x.missed > 0);
    missedDays.sort((a, b) => (b.missed / b.scheduled) - (a.missed / a.scheduled) || b.missed - a.missed);
    const topMissedDay = missedDays[0] || null;

    const total = habits.reduce((sum, h) => sum + (h.completedDates || []).filter(ds => inRange(ds.substring(0, 10))).length, 0);
    return {
      completionRate: scheduledCount === 0 ? null : Math.round((completedCount / scheduledCount) * 100),
      totalCompletions: total,
      mostMissedHabit: topMissedHabit,
      mostMissedDay: topMissedDay
    };
  })();
  const chartDays = rangeDays || 365;
  const chartPoints = Math.min(chartDays, 30);
  const chartData = Array.from({ length: chartPoints }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() - (chartPoints - 1 - i));
    const { ds, scheduled, completed } = getDayHabitCompletion(habits, d, todayStr);
    const label = chartPoints <= 7 ? DAYS_SHORT[d.getDay()] : chartPoints <= 31 ? String(d.getDate()) : DAYS_SHORT[d.getDay()][0];
    const pct = scheduled > 0 ? Math.round((completed / scheduled) * 100) : null;
    const tasks = todos.filter(t => t.doneDate === ds).length;
    return { label, pct, completed, scheduled, tasks };
  });
  const useWeekly = rangeDays === 365 || rangeDays === null;
  const finalChartData = useWeekly ? (() => {
    return Array.from({ length: 26 }, (_, wi) => {
      const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() - wi * 7);
      let completed = 0, scheduled = 0, tasks = 0;
      for (let day = 0; day < 7; day++) {
        const d = new Date(weekEnd); d.setDate(d.getDate() - day);
        const dayStats = getDayHabitCompletion(habits, d, todayStr);
        scheduled += dayStats.scheduled;
        completed += dayStats.completed;
        tasks += todos.filter(td => td.doneDate === dayStats.ds).length;
      }
      const d = new Date(weekEnd); d.setDate(d.getDate() - 6);
      const pct = scheduled > 0 ? Math.round((completed / scheduled) * 100) : null;
      return { label: `${d.getDate()}/${d.getMonth() + 1}`, pct, completed, scheduled, tasks };
    }).reverse();
  })() : chartData;
  const perfectCount = finalChartData.filter(d => d.pct === 100).length;
  const [hoveredBar, setHoveredBar] = useState(null);
  const chartTitle = range === "7days" ? "Completion Rate — Last 7 Days" : range === "30days" ? "Completion Rate — Last 30 Days" : range === "year" ? "Weekly Completion — Last Year" : "Weekly Completion — All Time";

  const stats = [
    {
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(249, 115, 22, 0.16)" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
        </svg>
      ),
      iconBg: "rgba(249, 115, 22, 0.1)",
      iconBorder: "rgba(249, 115, 22, 0.22)",
      label: "Current Streak",
      value: `${currentStreak}`,
      unit: currentStreak === 1 ? "day" : "days",
      sub: "All scheduled habits done"
    },
    {
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(96, 165, 250, 0.16)" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
      iconBg: "rgba(59, 130, 246, 0.1)",
      iconBorder: "rgba(59, 130, 246, 0.22)",
      label: "Shields",
      value: `${shields}`,
      unit: `/ ${isPremium ? 5 : 3}`,
      sub: shields >= (isPremium ? 5 : 3) ? "Max shields held" : "Earned every 5 perfect days"
    },
    {
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(234, 179, 8, 0.16)" stroke="#eab308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <path d="M4 22h16" />
          <path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34" />
          <path d="M12 2a6 6 0 0 1 6 6c0 3.31-2.69 6-6 6a6 6 0 0 1-6-6 6 6 0 0 1 6-6z" />
        </svg>
      ),
      iconBg: "rgba(234, 179, 8, 0.1)",
      iconBorder: "rgba(234, 179, 8, 0.22)",
      label: "Best Streak",
      value: `${bestStreak}`,
      unit: bestStreak === 1 ? "day" : "days",
      sub: "Personal record"
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(16, 185, 129, 0.2)" strokeWidth="2.5" />
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="#10b981"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 9}`}
            strokeDashoffset={`${2 * Math.PI * 9 - ((completionRate ?? 0) / 100) * (2 * Math.PI * 9)}`}
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
      ),
      iconBg: "rgba(16, 185, 129, 0.1)",
      iconBorder: "rgba(16, 185, 129, 0.22)",
      label: "Completion Rate",
      value: completionRate !== null ? `${completionRate}%` : "—",
      unit: "",
      sub: `${totalCompletions} completions`
    },
  ];

  const barMaxWidth = finalChartData.length <= 7 ? "48px" : finalChartData.length <= 14 ? "26px" : "16px";
  const barRadius = finalChartData.length <= 7 ? "14px" : "8px";
  const isLineChart = range !== "7days";
  useEffect(() => {
    if (isLineChart) setCachedMissedDay(mostMissedDay);
  }, [isLineChart, mostMissedDay]);
  const visibleMissedDay = isLineChart ? mostMissedDay : cachedMissedDay;
  const activeChartData = isLineChart ? (() => {
    const firstIdx = finalChartData.findIndex(d => d.pct !== null);
    return firstIdx > 0 ? finalChartData.slice(firstIdx) : finalChartData;
  })() : finalChartData;

  // Build contiguous line segments for non-null percentage points
  const lineSegments = (() => {
    if (!isLineChart || activeChartData.length === 0) return [];
    const n = activeChartData.length;
    const segments = [];
    let current = [];
    activeChartData.forEach((d, i) => {
      if (d.pct !== null) {
        const x = n > 1 ? (i / (n - 1)) * 1000 : 500;
        const y = 200 - (d.pct / 100) * 200;
        current.push({ x, y, index: i, pct: d.pct });
      } else if (current.length > 0) {
        segments.push(current);
        current = [];
      }
    });
    if (current.length > 0) segments.push(current);
    return segments;
  })();

  // Pick ~5-6 evenly spaced x-axis labels for line chart legibility
  const lineAxisTicks = (() => {
    const n = activeChartData.length;
    if (n <= 1) return activeChartData.map((d, i) => ({ index: i, label: d.label, leftPct: 50 }));
    const tickCount = Math.min(6, n);
    const indices = new Set();
    for (let t = 0; t < tickCount; t++) {
      indices.add(Math.round((t / (tickCount - 1)) * (n - 1)));
    }
    return Array.from(indices).map(idx => ({ index: idx, label: activeChartData[idx].label, leftPct: (idx / (n - 1)) * 100 }));
  })();

  return (
    <div style={{ maxWidth: "1000px", width: "100%", margin: "0 auto", padding: "12px 0 32px", fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header & Segmented Range Control */}
      <div className="ht-analytics-header">
        <div>
          <h1 style={{ margin: 0, fontFamily: "'Syne', sans-serif", color: "var(--ht-text-primary)", fontWeight: 800, fontSize: "24px", letterSpacing: "-0.02em" }}>Your Analytics</h1>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--ht-text-muted)" }}>Consistency, streaks, and activity overview</p>
        </div>

        <div style={{
          display: "inline-flex",
          alignSelf: "flex-start",
          background: "var(--ht-bg-stat-card)",
          border: "1px solid var(--ht-border-stat-card)",
          borderRadius: "12px",
          padding: "4px",
          gap: "2px",
          boxShadow: "var(--ht-shadow-card)"
        }}>
          {[["7days", "7 Days"], ["30days", "30 Days"], ["year", "Year"], ["all", "All Time"]].map(([val, label]) => {
            const active = range === val;
            return (
              <button
                key={val}
                onClick={() => setRange(val)}
                style={{
                  padding: "6px 13px",
                  borderRadius: "8px",
                  border: active ? "1px solid rgba(59, 130, 246, 0.3)" : "1px solid transparent",
                  background: active ? "rgba(59, 130, 246, 0.15)" : "transparent",
                  color: active ? "#60a5fa" : "var(--ht-text-secondary)",
                  cursor: "pointer",
                  fontWeight: active ? 700 : 500,
                  fontSize: "12px",
                  fontFamily: "inherit",
                  transition: "all 0.15s",
                  whiteSpace: "nowrap"
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="ht-analytics-grid">
        {stats.map((stat, i) => (
          <div key={i} style={{
            background: "var(--ht-bg-stat-card)",
            border: "1px solid var(--ht-border-stat-card)",
            borderRadius: "18px",
            padding: "18px 18px",
            boxShadow: "var(--ht-shadow-stat-card)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            minWidth: 0
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", gap: "8px" }}>
              <span style={{ color: "var(--ht-text-muted)", fontSize: "10.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{stat.label}</span>
              <div style={{
                width: "32px",
                height: "32px",
                borderRadius: "10px",
                background: stat.iconBg,
                border: `1px solid ${stat.iconBorder}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}>
                {stat.icon}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "5px" }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontVariantNumeric: "tabular-nums", color: "var(--ht-text-primary)", fontWeight: 800, fontSize: "26px", letterSpacing: "-0.03em", lineHeight: 1.1 }}>{stat.value}</span>
              {stat.unit && <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--ht-text-muted)" }}>{stat.unit}</span>}
            </div>
            {stat.sub && <div style={{ color: "var(--ht-text-muted)", fontSize: "11px", marginTop: "8px" }}>{stat.sub}</div>}
          </div>
        ))}
      </div>

      {/* Completion Rate Chart */}
      <div className="ht-analytics-chart" style={{
        background: "var(--ht-bg-stat-card)",
        border: "1px solid var(--ht-border-stat-card)",
        borderRadius: "18px",
        padding: "20px 22px",
        boxShadow: "var(--ht-shadow-stat-card)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontFamily: "'Syne', sans-serif", color: "var(--ht-text-primary)", fontWeight: 700, fontSize: "15px", letterSpacing: "-0.01em" }}>{chartTitle}</h3>
            {hoveredBar !== null && activeChartData[hoveredBar] && (
              <span style={{ fontSize: "11.5px", color: "var(--ht-text-secondary)", fontVariantNumeric: "tabular-nums", background: "var(--ht-bg-card-subtle)", border: "1px solid var(--ht-border-card)", borderRadius: "8px", padding: "2px 9px" }}>
                {activeChartData[hoveredBar].pct !== null
                  ? `${activeChartData[hoveredBar].label}: ${activeChartData[hoveredBar].pct}% (${activeChartData[hoveredBar].completed}/${activeChartData[hoveredBar].scheduled} habits${activeChartData[hoveredBar].tasks > 0 ? ` · ${activeChartData[hoveredBar].tasks} tasks` : ""})`
                  : `${activeChartData[hoveredBar].label}: No habits scheduled`}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: "14px", fontSize: "11.5px", color: "var(--ht-text-secondary)", fontVariantNumeric: "tabular-nums" }}>
            {isLineChart ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "12px", height: "3px", background: "linear-gradient(90deg, #60a5fa, #34d399)", borderRadius: "2px" }} />
                Completion %
              </span>
            ) : (
              <>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "9px", height: "9px", background: "linear-gradient(180deg, #34d399 0%, #10b981 100%)", borderRadius: "3px" }} />
                  100% <span style={{ color: "var(--ht-text-muted)" }}>({perfectCount})</span>
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "9px", height: "9px", background: "linear-gradient(180deg, #60a5fa 0%, #3b82f6 100%)", borderRadius: "3px" }} />
                  Partial
                </span>
              </>
            )}
            {completionRate !== null && (
              <span style={{ color: "var(--ht-text-muted)", fontWeight: 600 }}>
                Avg {completionRate}%
              </span>
            )}
          </div>
        </div>

        <div key={range} style={{ display: "flex", gap: "12px", alignItems: "stretch", height: "196px" }}>
          {/* Y-Axis Labels */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            paddingBottom: "26px",
            fontSize: "10.5px",
            color: "var(--ht-text-muted)",
            fontVariantNumeric: "tabular-nums",
            textAlign: "right",
            minWidth: "30px",
            userSelect: "none"
          }}>
            <span>100%</span>
            <span>50%</span>
            <span>0%</span>
          </div>

          {isLineChart ? (
            /* Line Chart for 30 Days, Year, All Time */
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
              <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
                {/* Horizontal Gridlines */}
                <div style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  pointerEvents: "none"
                }}>
                  <div style={{ borderTop: "1px dashed var(--ht-border-subtle)", width: "100%" }} />
                  <div style={{ borderTop: "1px dashed var(--ht-border-subtle)", width: "100%" }} />
                  <div style={{ borderTop: "1px solid var(--ht-border-card)", width: "100%" }} />
                </div>

                {/* SVG Line + Area */}
                <svg
                  viewBox="0 0 1000 200"
                  preserveAspectRatio="none"
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
                >
                  <defs>
                    <linearGradient id="htLineAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.01" />
                    </linearGradient>
                    <linearGradient id="htLineStrokeGrad" x1="0" y1="1" x2="0" y2="0">
                      <stop offset="0%" stopColor="#3b82f6" />
                      <stop offset="75%" stopColor="#60a5fa" />
                      <stop offset="100%" stopColor="#34d399" />
                    </linearGradient>
                  </defs>

                  {lineSegments.map((seg, si) => {
                    if (seg.length < 2) return null;
                    const lineD = buildSmoothLinePath(seg, 0, 200);
                    const areaD = `${lineD} L ${seg[seg.length - 1].x.toFixed(2)} 200 L ${seg[0].x.toFixed(2)} 200 Z`;
                    return (
                      <g key={si}>
                        <path d={areaD} fill="url(#htLineAreaGrad)" />
                        <path
                          d={lineD}
                          fill="none"
                          stroke="url(#htLineStrokeGrad)"
                          strokeWidth="3"
                          vectorEffect="non-scaling-stroke"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </g>
                    );
                  })}
                </svg>

                {/* Hover Guide & Active Dot */}
                {hoveredBar !== null && activeChartData[hoveredBar] && (() => {
                  const d = activeChartData[hoveredBar];
                  const leftPct = activeChartData.length > 1 ? (hoveredBar / (activeChartData.length - 1)) * 100 : 50;
                  const topPct = d.pct !== null ? 100 - d.pct : null;
                  const dotColor = d.pct === 100 ? "#10b981" : d.pct === 0 ? "#f59e0b" : "#3b82f6";
                  return (
                    <>
                      <div style={{
                        position: "absolute",
                        left: `${leftPct}%`,
                        top: 0,
                        bottom: 0,
                        width: "1px",
                        borderLeft: "1px dashed var(--ht-border-hover)",
                        pointerEvents: "none"
                      }} />
                      {topPct !== null && (
                        <div style={{
                          position: "absolute",
                          left: `${leftPct}%`,
                          top: `${topPct}%`,
                          width: "10px",
                          height: "10px",
                          borderRadius: "50%",
                          background: dotColor,
                          border: "2px solid var(--ht-bg-stat-card)",
                          boxShadow: `0 0 10px ${dotColor}`,
                          transform: "translate(-50%, -50%)",
                          pointerEvents: "none",
                          zIndex: 2
                        }} />
                      )}
                    </>
                  );
                })()}

                {/* Invisible Hover Columns */}
                <div style={{ position: "absolute", inset: 0, display: "flex", zIndex: 3 }}>
                  {activeChartData.map((d, i) => (
                    <div
                      key={i}
                      onMouseEnter={() => setHoveredBar(i)}
                      onMouseLeave={() => setHoveredBar(null)}
                      title={d.pct !== null
                        ? `${d.label}: ${d.pct}% (${d.completed}/${d.scheduled} habits${d.tasks > 0 ? `, ${d.tasks} tasks` : ""})`
                        : `${d.label}: No habits scheduled`}
                      style={{ flex: 1, height: "100%", cursor: "crosshair" }}
                    />
                  ))}
                </div>
              </div>

              {/* Spaced X-Axis Labels */}
              <div style={{ position: "relative", height: "26px", marginTop: "0px" }}>
                {lineAxisTicks.map((tick, ti) => {
                  const isFirst = ti === 0;
                  const isLast = ti === lineAxisTicks.length - 1;
                  return (
                    <span
                      key={tick.index}
                      style={{
                        position: "absolute",
                        left: `${tick.leftPct}%`,
                        top: "8px",
                        transform: isFirst ? "translateX(0)" : isLast ? "translateX(-100%)" : "translateX(-50%)",
                        fontSize: "10.5px",
                        fontWeight: 600,
                        color: "var(--ht-text-muted)",
                        fontVariantNumeric: "tabular-nums",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {tick.label}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Bar Chart for 7 Days */
            <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "flex-end", gap: "10px", paddingBottom: "2px" }}>
              {/* Horizontal Gridlines */}
              <div style={{
                position: "absolute",
                inset: 0,
                bottom: "26px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                pointerEvents: "none"
              }}>
                <div style={{ borderTop: "1px dashed var(--ht-border-subtle)", width: "100%" }} />
                <div style={{ borderTop: "1px dashed var(--ht-border-subtle)", width: "100%" }} />
                <div style={{ borderTop: "1px solid var(--ht-border-card)", width: "100%" }} />
              </div>

              {finalChartData.map((d, i) => {
                const isHovered = hoveredBar === i;
                const isPerfect = d.pct === 100;
                const tooltip = d.pct !== null
                  ? `${d.label}: ${d.pct}% (${d.completed}/${d.scheduled} habits${d.tasks > 0 ? `, ${d.tasks} tasks` : ""})`
                  : `${d.label}: No habits scheduled`;

                return (
                  <div
                    key={i}
                    onMouseEnter={() => setHoveredBar(i)}
                    onMouseLeave={() => setHoveredBar(null)}
                    title={tooltip}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      height: "100%",
                      flex: 1,
                      position: "relative",
                      zIndex: 1,
                      cursor: "default"
                    }}
                  >
                    <div style={{
                      flex: 1,
                      width: "100%",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-end",
                      alignItems: "center"
                    }}>
                      <div style={{
                        width: "100%",
                        maxWidth: barMaxWidth,
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "flex-end",
                        background: "var(--ht-bg-card-subtle)",
                        border: `1px solid ${isHovered ? "var(--ht-border-hover)" : "var(--ht-border-subtle)"}`,
                        borderRadius: barRadius,
                        overflow: "hidden",
                        opacity: d.pct === null ? 0.45 : hoveredBar !== null && !isHovered ? 0.5 : 1,
                        transition: "opacity 0.15s ease, border-color 0.15s ease"
                      }}>
                        {d.pct !== null && d.pct > 0 ? (
                          <div style={{
                            background: isPerfect
                              ? "linear-gradient(180deg, #34d399 0%, #10b981 100%)"
                              : "linear-gradient(180deg, #60a5fa 0%, #2563eb 100%)",
                            borderRadius: barRadius,
                            height: `${d.pct}%`,
                            minHeight: "10px",
                            boxShadow: isPerfect
                              ? "0 0 14px rgba(16, 185, 129, 0.28)"
                              : "0 0 14px rgba(59, 130, 246, 0.22)",
                            transition: "height 0.25s ease"
                          }} />
                        ) : d.pct === 0 ? (
                          <div style={{
                            background: "linear-gradient(180deg, rgba(251, 191, 36, 0.75) 0%, rgba(245, 158, 11, 0.7) 100%)",
                            height: "6px",
                            width: "100%",
                            borderRadius: barRadius
                          }} />
                        ) : null}
                      </div>
                    </div>
                    <div style={{
                      color: isHovered ? "var(--ht-text-primary)" : "var(--ht-text-muted)",
                      fontSize: "10.5px",
                      fontWeight: isHovered ? 700 : 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      marginTop: "8px",
                      whiteSpace: "nowrap",
                      transition: "color 0.15s"
                    }}>
                      {d.label}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Missed Habit (7d) -> Two-Split with Most Missed Day (30d / Year / All Time) */}
      <div className={`ht-missed-split${isLineChart ? " ht-missed-split--expanded" : ""}`}>
        {/* Most Missed Habit */}
        <div style={{
          background: "var(--ht-bg-stat-card)",
          border: "1px solid var(--ht-border-stat-card)",
          borderRadius: "18px",
          padding: "18px 18px",
          boxShadow: "var(--ht-shadow-stat-card)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          minWidth: 0
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", gap: "8px" }}>
            <span style={{ color: "var(--ht-text-muted)", fontSize: "10.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Most Missed Habit</span>
            <div style={{
              width: "32px",
              height: "32px",
              borderRadius: "10px",
              background: mostMissedHabit ? "rgba(245, 158, 11, 0.1)" : "rgba(16, 185, 129, 0.1)",
              border: `1px solid ${mostMissedHabit ? "rgba(245, 158, 11, 0.22)" : "rgba(16, 185, 129, 0.22)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: mostMissedHabit ? "#f59e0b" : "#10b981",
              flexShrink: 0
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
          </div>
          {mostMissedHabit ? (
            <>
              <div style={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 800,
                fontSize: "26px",
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
                color: "var(--ht-text-primary)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis"
              }} title={mostMissedHabit.name}>
                {mostMissedHabit.name}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", fontSize: "11px", color: "var(--ht-text-muted)", marginTop: "8px", fontVariantNumeric: "tabular-nums" }}>
                <span>Missed {mostMissedHabit.missed} of {mostMissedHabit.scheduled} times</span>
                <span style={{ color: "#f59e0b", fontWeight: 600 }}>
                  {Math.round((mostMissedHabit.completed / mostMissedHabit.scheduled) * 100)}% done
                </span>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: "26px", letterSpacing: "-0.03em", lineHeight: 1.1, color: "var(--ht-text-primary)" }}>
                {habits.length === 0 ? "No habits yet" : "None — 100%!"}
              </div>
              <div style={{ fontSize: "11px", color: "var(--ht-text-muted)", marginTop: "8px" }}>
                {habits.length === 0 ? "Add habits to track misses" : "Every scheduled habit completed"}
              </div>
            </>
          )}
        </div>

        {/* Most Missed Day */}
        <div
          className="ht-missed-day-card"
          aria-hidden={!isLineChart}
          style={{
            background: "var(--ht-bg-stat-card)",
            border: "1px solid var(--ht-border-stat-card)",
            borderRadius: "18px",
            boxShadow: "var(--ht-shadow-stat-card)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", gap: "8px" }}>
            <span style={{ color: "var(--ht-text-muted)", fontSize: "10.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Most Missed Day</span>
            <div style={{
              width: "32px",
              height: "32px",
              borderRadius: "10px",
              background: visibleMissedDay ? "rgba(245, 158, 11, 0.1)" : "rgba(16, 185, 129, 0.1)",
              border: `1px solid ${visibleMissedDay ? "rgba(245, 158, 11, 0.22)" : "rgba(16, 185, 129, 0.22)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: visibleMissedDay ? "#f59e0b" : "#10b981",
              flexShrink: 0
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
          </div>
          {visibleMissedDay ? (
            <>
              <div style={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 800,
                fontSize: "26px",
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
                color: "var(--ht-text-primary)"
              }}>
                {visibleMissedDay.name}s
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", fontSize: "11px", color: "var(--ht-text-muted)", marginTop: "8px", fontVariantNumeric: "tabular-nums" }}>
                <span>{visibleMissedDay.missed} of {visibleMissedDay.scheduled} habits missed</span>
                <span style={{ color: "#f59e0b", fontWeight: 600 }}>
                  {Math.round((visibleMissedDay.missed / visibleMissedDay.scheduled) * 100)}% miss rate
                </span>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: "26px", letterSpacing: "-0.03em", lineHeight: 1.1, color: "var(--ht-text-primary)" }}>
                {habits.length === 0 ? "No data yet" : "None — 100%!"}
              </div>
              <div style={{ fontSize: "11px", color: "var(--ht-text-muted)", marginTop: "8px" }}>
                {habits.length === 0 ? "Add habits to track daily trends" : "No missed habits in this period"}
              </div>
            </>
          )}
        </div>
      </div>

      {rangeDays !== null && (rangeDays === 7 || rangeDays === 30) ? (
        <AICoach
          habits={habits}
          todos={todos}
          goals={goals}
          journalEntries={journalEntries}
          rangeDays={rangeDays}
          todayStr={todayStr}
          isPremium={isPremium}
          profile={profile}
          setProfile={setProfile}
          session={session}
          onRecommendHabit={onRecommendHabit}
        />
      ) : (
        <div style={{
          background: "var(--ht-bg-stat-card)",
          border: "1px solid var(--ht-border-stat-card)",
          borderRadius: "18px",
          padding: "18px 22px",
          marginTop: "16px",
          boxShadow: "var(--ht-shadow-stat-card)",
          textAlign: "center"
        }}>
          <p style={{ color: "var(--ht-text-muted)", fontSize: "13px", margin: 0 }}>
            AI Coaching Summaries are optimized for <strong style={{ color: "var(--ht-text-secondary)" }}>7 Days</strong> and <strong style={{ color: "var(--ht-text-secondary)" }}>30 Days</strong> timeframes. Select one of those ranges to view your report.
          </p>
        </div>
      )}

      {isPremium && <MoodInsights journalEntries={journalEntries || {}} today={todayStr} />}
    </div>
  );
}