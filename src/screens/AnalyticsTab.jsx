import { useState, useEffect } from 'react';
import { DAYS_SHORT } from '../utils/constants.js';
import { getDateStr, parseDateLocal, calcStats } from '../utils/helpers.js';
import { encryptText, decryptText } from '../utils/crypto.js';
import { supabase } from '../lib/supabase.js';

// Default Gemini API key provided by the developer
const DEFAULT_GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";

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
    <div style={{
      background: "linear-gradient(135deg, rgba(22, 31, 48, 0.4) 0%, rgba(13, 17, 23, 0.5) 100%)",
      border: "1px solid rgba(255, 255, 255, 0.05)",
      borderRadius: "20px",
      padding: "22px",
      marginTop: "20px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.3)"
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <h3 style={{ margin: 0, fontFamily: "'Syne', sans-serif", color: "#f9fafb", fontWeight: 800, fontSize: "15px", letterSpacing: "-0.01em" }}>Mood Insights</h3>
        <span style={{ fontSize: "10px", padding: "3px 10px", borderRadius: "999px", background: "rgba(59, 130, 246, 0.15)", border: "1px solid rgba(59, 130, 246, 0.25)", color: "#60a5fa", fontWeight: 700 }}>Premium</span>
      </div>
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
        {Object.entries({ great: "🌟", good: "😊", okay: "😐", bad: "😔" }).map(([mood, emoji]) => (
          <div key={mood} style={{ flex: 1, background: "rgba(255,255,255,0.02)", borderRadius: "12px", padding: "12px 8px", textAlign: "center", border: "1px solid rgba(255, 255, 255, 0.04)" }}>
            <div style={{ fontSize: "18px", marginBottom: "4px" }}>{emoji}</div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "20px", color: weekCounts[mood] > 0 ? "#f9fafb" : "#374151" }}>{weekCounts[mood]}</div>
            <div style={{ fontSize: "10px", color: "#4b5563", marginTop: "2px", textTransform: "capitalize" }}>{mood}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {insights.map((ins, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "10px", background: "rgba(255,255,255,0.01)", borderRadius: "10px", padding: "12px 14px", border: "1px solid rgba(255,255,255,0.03)" }}>
            <span style={{ fontSize: "16px", flexShrink: 0 }}>{ins.emoji}</span>
            <span style={{ fontSize: "13px", color: "#9ca3af", lineHeight: 1.5 }}>{ins.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function parseBold(text) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) => i % 2 === 1 ? <strong key={i} style={{ color: "#fff", fontWeight: 700 }}>{part}</strong> : part);
}

function renderMarkdown(text) {
  if (!text) return null;
  return text.split("\n").map((line, idx) => {
    let clean = line.trim();
    if (!clean) return <div key={idx} style={{ height: "8px" }} />;
    
    if (clean.startsWith("### ")) {
      return <h5 key={idx} style={{ margin: "14px 0 6px", color: "#fff", fontSize: "13px", fontWeight: 700 }}>{clean.substring(4)}</h5>;
    }
    if (clean.startsWith("## ") || clean.startsWith("# ")) {
      const val = clean.startsWith("## ") ? clean.substring(3) : clean.substring(2);
      return <h4 key={idx} style={{ margin: "18px 0 8px", color: "#a78bfa", fontSize: "14px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>{val}</h4>;
    }
    
    if (clean.startsWith("- ") || clean.startsWith("* ")) {
      const val = clean.substring(2);
      return (
        <div key={idx} style={{ display: "flex", gap: "8px", alignItems: "flex-start", margin: "4px 0 4px 8px" }}>
          <span style={{ color: "#a78bfa", fontSize: "12px", marginTop: "2px" }}>•</span>
          <span style={{ fontSize: "13px", color: "#9ca3af", lineHeight: 1.4 }}>{parseBold(val)}</span>
        </div>
      );
    }

    return <p key={idx} style={{ margin: "0 0 8px", fontSize: "13px", color: "#d1d5db", lineHeight: 1.5 }}>{parseBold(clean)}</p>;
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

function AICoach({ habits, todos, goals = [], journalEntries, rangeDays, todayStr, isPremium, profile, setProfile, onRecommendHabit }) {
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

Write a warm, natural ${rangeDays === 7 ? "weekly" : "30-day"} summary (max 175 words) with this structure:

1. **Opening** – One strong, positive but honest sentence.
2. **Key Wins** – Highlight the most important achievements and positive developments.
3. **Patterns & Insights** – Comment on energy, habits, relationships, and what stands out. If the user writes repeatedly about a specific person, mention them by name and interpret the situation warmly and supportively.
4. **Encouragement + Advice** – Offer warm encouragement on positive areas (especially relationships) and one gentle, practical suggestion.
5. **Closing** – Motivational and uplifting final line.

Rules:
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
      const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${DEFAULT_GEMINI_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    1: "🔍 Reading habit completions database...",
    2: "📓 Correlating emotional journal notes...",
    3: "🧠 Synthesizing customized coaching plan..."
  };

  const hasCooldownActive = summary?.cachedTime && (Date.now() - summary.cachedTime < cooldownMs);

  if (!isPremium) {
    return (
      <div style={{
        background: "linear-gradient(135deg, rgba(167, 139, 250, 0.02) 0%, rgba(13, 17, 23, 0.4) 100%)",
        border: "1px solid rgba(255, 255, 255, 0.05)",
        borderRadius: "20px",
        padding: "24px",
        marginTop: "20px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
        position: "relative",
        overflow: "hidden"
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "20px" }}>✨</span>
            <h3 style={{ margin: 0, fontFamily: "'Syne', sans-serif", color: "#fff", fontWeight: 800, fontSize: "15px", letterSpacing: "-0.01em" }}>AI Performance Coach</h3>
          </div>
          <span style={{ fontSize: "10px", padding: "3px 10px", borderRadius: "999px", background: "rgba(167, 139, 250, 0.15)", border: "1px solid rgba(167, 139, 250, 0.25)", color: "#c084fc", fontWeight: 700 }}>Premium</span>
        </div>
        <div style={{ padding: "20px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", textAlign: "center" }}>
          <span style={{ fontSize: "32px" }}>🔒</span>
          <p style={{ color: "#9ca3af", fontSize: "13px", margin: "0 auto", lineHeight: 1.5, maxWidth: "340px" }}>
            Unlock warm, personalized weekly and monthly coaching summaries powered by Gemini AI. Upgrade to Premium for full access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(167, 139, 250, 0.05) 0%, rgba(13, 17, 23, 0.4) 100%)",
      border: "1px solid rgba(167, 139, 250, 0.15)",
      borderRadius: "20px",
      padding: "24px",
      marginTop: "20px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
      position: "relative",
      overflow: "hidden"
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "20px" }}>✨</span>
          <h3 style={{ margin: 0, fontFamily: "'Syne', sans-serif", color: "#fff", fontWeight: 800, fontSize: "15px", letterSpacing: "-0.01em" }}>AI Performance Coach</h3>
        </div>
        <span style={{ fontSize: "10px", padding: "3px 10px", borderRadius: "999px", background: "rgba(167, 139, 250, 0.15)", border: "1px solid rgba(167, 139, 250, 0.25)", color: "#c084fc", fontWeight: 700 }}>Premium</span>
      </div>

      {loadingStep === 0 && (
        <div style={{ textAlign: "center", padding: "20px 10px" }}>
          <p style={{ color: "#9ca3af", fontSize: "13px", margin: "0 0 16px", lineHeight: 1.5 }}>
            Generate a personalized weekly or monthly AI Coaching Review based on your logged habits, completed tasks, and journal entries.
          </p>
          <button
            onClick={triggerAnalysis}
            style={{
              padding: "10px 20px",
              borderRadius: "12px",
              border: "none",
              background: "linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)",
              color: "#fff",
              fontWeight: 700,
              fontSize: "13px",
              cursor: "pointer",
              boxShadow: "0 4px 20px rgba(124, 58, 237, 0.4)",
              transition: "all 0.2s"
            }}
          >
            Generate AI Performance Review
          </button>
        </div>
      )}

      {loadingStep > 0 && loadingStep < 4 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "30px 10px", gap: "16px" }}>
          <div className="ht-ai-pulse" style={{
            width: "48px",
            height: "48px",
            borderRadius: "50%",
            background: "rgba(167, 139, 250, 0.1)",
            border: "2px dashed #a78bfa",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "spin 2s linear infinite"
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
          </div>
          <span style={{ fontSize: "13px", color: "#c084fc", fontWeight: 600 }}>{stepTexts[loadingStep]}</span>
        </div>
      )}

      {loadingStep === 4 && summary && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", animation: "fadeUp 0.3s ease-out" }}>
          <div style={{ fontSize: "13.5px", color: "#d1d5db", lineHeight: 1.6 }}>
            {renderMarkdown(summary.text)}
          </div>

          {/* Feedback Loop */}
          <div style={{
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px solid rgba(255, 255, 255, 0.04)",
            borderRadius: "12px",
            padding: "12px 14px",
            marginTop: "8px"
          }}>
            {!feedbackSubmitted ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "12px", color: "#9ca3af" }}>Was this coaching summary helpful?</span>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      onClick={() => {
                        setFeedbackRating("up");
                        setFeedbackSubmitted(true);
                        saveFeedback("up", "");
                      }}
                      style={{
                        background: feedbackRating === "up" ? "rgba(34, 197, 94, 0.2)" : "rgba(255, 255, 255, 0.05)",
                        border: `1px solid ${feedbackRating === "up" ? "#22c55e" : "rgba(255, 255, 255, 0.1)"}`,
                        borderRadius: "8px",
                        color: feedbackRating === "up" ? "#4ade80" : "#d1d5db",
                        padding: "5px 10px",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer"
                      }}
                    >
                      👍 Yes
                    </button>
                    <button
                      onClick={() => setFeedbackRating("down")}
                      style={{
                        background: feedbackRating === "down" ? "rgba(239, 68, 68, 0.2)" : "rgba(255, 255, 255, 0.05)",
                        border: `1px solid ${feedbackRating === "down" ? "#ef4444" : "rgba(255, 255, 255, 0.1)"}`,
                        borderRadius: "8px",
                        color: feedbackRating === "down" ? "#f87171" : "#d1d5db",
                        padding: "5px 10px",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer"
                      }}
                    >
                      👎 No
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
                        minHeight: "60px",
                        background: "rgba(0, 0, 0, 0.2)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        borderRadius: "8px",
                        color: "#fff",
                        padding: "8px",
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
                        background: "rgba(167, 139, 250, 0.15)",
                        border: "1px solid rgba(167, 139, 250, 0.3)",
                        borderRadius: "6px",
                        color: "#a78bfa",
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "4px 12px",
                        cursor: "pointer"
                      }}
                    >
                      Submit Feedback
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: "12px", color: "#34d399", textAlign: "center", fontWeight: 600 }}>
                ✓ Thank you for your feedback! This helps train your AI Performance Coach.
              </div>
            )}
          </div>

          {/* Smart Suggestions Cards */}
          {suggestions && Array.isArray(suggestions) && suggestions.length > 0 && (
            <div style={{ marginTop: "16px", borderTop: "1px solid rgba(255, 255, 255, 0.05)", paddingTop: "16px" }}>
              <h4 style={{ margin: "0 0 12px 0", fontFamily: "'Syne', sans-serif", fontSize: "13px", fontWeight: 800, color: "#a78bfa" }}>Smart Suggestions</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {suggestions.map((s, idx) => {
                  let badgeText = "💡 Recommendation";
                  let badgeColor = "#60a5fa";
                  let badgeBg = "rgba(96, 165, 250, 0.15)";
                  let borderCol = "rgba(96, 165, 250, 0.25)";
                  
                  if (s.type === "habit_pairing") {
                    badgeText = "🔗 Habit Pairing";
                    badgeColor = "#c084fc";
                    badgeBg = "rgba(192, 132, 252, 0.15)";
                    borderCol = "rgba(192, 132, 252, 0.25)";
                  } else if (s.type === "consistency_pattern") {
                    badgeText = "📈 Consistency Insight";
                    badgeColor = "#34d399";
                    badgeBg = "rgba(52, 211, 153, 0.15)";
                    borderCol = "rgba(52, 211, 153, 0.25)";
                  }

                  const isHabitCreator = s.type === "habit_recommendation" || s.type === "habit_pairing";

                  return (
                    <div key={idx} style={{
                      background: "rgba(255, 255, 255, 0.015)",
                      border: "1px solid rgba(255, 255, 255, 0.03)",
                      borderRadius: "12px",
                      padding: "12px 14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "12.5px", color: "#fff" }}>{s.title}</span>
                        <span style={{ fontSize: "9px", padding: "1px 6px", borderRadius: "999px", background: badgeBg, border: `1px solid ${borderCol}`, color: badgeColor, fontWeight: 700 }}>
                          {badgeText}
                        </span>
                      </div>
                      
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <p style={{ margin: 0, fontSize: "11.5px", color: "#6b7280", lineHeight: 1.4 }}>{s.insight}</p>
                        <p style={{ margin: 0, fontSize: "12px", color: "#d1d5db", fontWeight: 600, lineHeight: 1.4 }}>💡 {s.actionable}</p>
                      </div>

                      {isHabitCreator && onRecommendHabit && (
                        <button
                          onClick={() => onRecommendHabit(s.title)}
                          style={{
                            alignSelf: "flex-end",
                            padding: "4px 10px",
                            borderRadius: "6px",
                            border: "none",
                            background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                            color: "#fff",
                            fontWeight: 700,
                            fontSize: "10px",
                            cursor: "pointer",
                            boxShadow: "0 2px 8px rgba(37, 99, 235, 0.2)",
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

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255, 255, 255, 0.05)", paddingTop: "14px", marginTop: "8px" }}>
            <span style={{ fontSize: "11px", color: "#6b7280", fontWeight: 600 }}>
              {hasCooldownActive && !profile?.is_admin ? `Cached (Refreshes in ${getCooldownRemainingStr()})` : "Ready to regenerate"}
            </span>
            {(!hasCooldownActive || profile?.is_admin) && (
              <button
                onClick={triggerAnalysis}
                disabled={hasCooldownActive && !profile?.is_admin}
                style={{
                  background: (hasCooldownActive && !profile?.is_admin) ? "none" : "rgba(167, 139, 250, 0.08)",
                  border: (hasCooldownActive && !profile?.is_admin) ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(167, 139, 250, 0.2)",
                  borderRadius: "8px",
                  color: (hasCooldownActive && !profile?.is_admin) ? "#4b5563" : "#a78bfa",
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "6px 12px",
                  cursor: (hasCooldownActive && !profile?.is_admin) ? "default" : "pointer",
                  transition: "all 0.15s"
                }}
              >
                Regenerate Review
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function AnalyticsTab({ habits, todos, goals = [], pausePeriods, isPremium, journalEntries, profile, setProfile, onRecommendHabit }) {
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
    { 
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
        </svg>
      ), 
      label: "Current Streak", 
      value: `${currentStreak} days`, 
      sub: "All scheduled habits done" 
    },
    { 
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      ), 
      label: "Shields", 
      value: `${shields}/${isPremium ? 5 : 3}`, 
      sub: shields >= (isPremium ? 5 : 3) ? "Max shields held!" : "Buy at the Profile XP Shop" 
    },
    { 
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
          <path d="M4 22h16"/>
          <path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34"/>
          <path d="M12 2a6 6 0 0 1 6 6c0 3.31-2.69 6-6 6a6 6 0 0 1-6-6 6 6 0 0 1 6-6z"/>
        </svg>
      ), 
      label: "Best Streak", 
      value: `${bestStreak} days`, 
      sub: "Personal record" 
    },
    { 
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.21 15.89A10 10 0 1 1 8 2.83"/>
          <path d="M22 12A10 10 0 0 0 12 2v10z"/>
        </svg>
      ), 
      label: "Completion Rate", 
      value: completionRate !== null ? `${completionRate}%` : "—", 
      sub: `${totalCompletions} completions` 
    },
  ];

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "10px 0" }}>
      <h1 style={{ fontFamily: "'Syne', sans-serif", textAlign: "center", color: "#f9fafb", fontWeight: 800, fontSize: "28px", marginBottom: "24px", letterSpacing: "-0.02em" }}>Your Analytics</h1>
      
      <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginBottom: "28px" }}>
        {[["7days", "7 Days"], ["30days", "30 Days"], ["year", "Year"], ["all", "All Time"]].map(([val, label]) => (
          <button 
            key={val} 
            onClick={() => setRange(val)} 
            style={{ 
              padding: "7px 18px", 
              borderRadius: "999px", 
              border: range === val ? "1px solid #2563eb" : "1px solid rgba(255,255,255,0.08)", 
              background: range === val ? "rgba(37,99,235,0.15)" : "rgba(255,255,255,0.02)", 
              color: range === val ? "#60a5fa" : "#9ca3af", 
              cursor: "pointer", 
              fontWeight: 700, 
              fontSize: "12.5px", 
              fontFamily: "inherit",
              transition: "all 0.2s"
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="ht-analytics-grid">
        {stats.map((stat, i) => (
          <div key={i} style={{ 
            background: "linear-gradient(135deg, rgba(22, 31, 48, 0.4) 0%, rgba(13, 17, 23, 0.5) 100%)",
            border: "1px solid rgba(255, 255, 255, 0.05)",
            borderRadius: "20px", 
            padding: "20px 18px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.3)"
          }}>
            <div style={{ marginBottom: "10px", display: "flex" }}>{stat.icon}</div>
            <div style={{ color: "#6b7280", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>{stat.label}</div>
            <div style={{ fontFamily: "'Syne', sans-serif", color: "#f9fafb", fontWeight: 800, fontSize: "26px" }}>{stat.value}</div>
            {stat.sub && <div style={{ color: "#4b5563", fontSize: "10px", marginTop: "6px" }}>{stat.sub}</div>}
          </div>
        ))}
      </div>

      <div style={{ 
        background: "linear-gradient(135deg, rgba(22, 31, 48, 0.4) 0%, rgba(13, 17, 23, 0.5) 100%)",
        border: "1px solid rgba(255, 255, 255, 0.05)",
        borderRadius: "20px", 
        padding: "22px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, fontFamily: "'Syne', sans-serif", color: "#f9fafb", fontWeight: 800, fontSize: "14px", letterSpacing: "-0.01em" }}>{chartTitle}</h3>
          <div style={{ display: "flex", gap: "16px", fontSize: "11px", color: "#9ca3af" }}>
            <span><span style={{ display: "inline-block", width: "10px", height: "10px", background: "#3b82f6", borderRadius: "3px", marginRight: "6px" }} />Habits</span>
            <span><span style={{ display: "inline-block", width: "10px", height: "10px", background: "#22c55e", borderRadius: "3px", marginRight: "6px" }} />Tasks</span>
          </div>
        </div>
        <div key={range} style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "120px", overflowX: "auto", paddingBottom: "4px" }}>
          {finalChartData.map((d, i) => (
            <div key={i} style={{ minWidth: finalChartData.length > 14 ? "18px" : undefined, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", flex: 1 }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: "2px", width: "100%" }}>
                <div style={{ 
                  background: "linear-gradient(180deg, #60a5fa 0%, #3b82f6 100%)", 
                  borderRadius: "3px 3px 0 0", 
                  height: `${(d.habits / maxVal) * 90}%`, 
                  minHeight: d.habits > 0 ? "4px" : "0",
                  boxShadow: d.habits > 0 ? "0 0 8px rgba(59, 130, 246, 0.4)" : "none"
                }} />
                <div style={{ 
                  background: "linear-gradient(180deg, #4ade80 0%, #22c55e 100%)", 
                  borderRadius: "3px 3px 0 0", 
                  height: `${(d.tasks / maxVal) * 90}%`, 
                  minHeight: d.tasks > 0 ? "4px" : "0",
                  boxShadow: d.tasks > 0 ? "0 0 8px rgba(34, 197, 94, 0.4)" : "none"
                }} />
              </div>
              {finalChartData.length <= 30 && <div style={{ color: "#6b7280", fontSize: "9px", marginTop: "6px", whiteSpace: "nowrap" }}>{d.label}</div>}
            </div>
          ))}
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
          onRecommendHabit={onRecommendHabit}
        />
      ) : (
        <div style={{
          background: "linear-gradient(135deg, rgba(167, 139, 250, 0.03) 0%, rgba(13, 17, 23, 0.4) 100%)",
          border: "1px solid rgba(167, 139, 250, 0.08)",
          borderRadius: "20px",
          padding: "20px 24px",
          marginTop: "20px",
          textAlign: "center"
        }}>
          <p style={{ color: "#6b7280", fontSize: "13px", margin: 0 }}>
            AI Coaching Summaries are optimized for **7 Days** and **30 Days** viewframes. Select one of those ranges to check your report.
          </p>
        </div>
      )}

      {isPremium && <MoodInsights journalEntries={journalEntries || {}} today={todayStr} />}
    </div>
  );
}