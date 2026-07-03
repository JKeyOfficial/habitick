import { useState } from 'react';
import { S, DAYS_SHORT } from '../utils/constants.js';

export function HabitModal({ habit, profile, habits = [], onSave, onClose }) {
  const [name, setName] = useState(habit?.name || "");
  const [frequency, setFrequency] = useState(habit?.frequency || "daily");
  const [days, setDays] = useState(habit?.days || []);
  const [reminderTime, setReminderTime] = useState(habit?.reminder_time || "");

  const toggleDay = i => setDays(prev => prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i]);

  // Smart checking to filter out suggestions that are duplicates of existing habits or vague meta-advice
  const isDuplicateOrMeta = (recName) => {
    const normRec = recName.toLowerCase().trim();
    
    // Filter out generic advice, routine hacks, sprints, flows, etc.
    const strictMetaKeywords = ["consistency", "habits", "routine", "sprint", "flow", "pattern", "boost", "optimize", "coaching", "performance"];
    if (strictMetaKeywords.some(w => normRec.includes(w))) {
      return true;
    }

    return habits.some(h => {
      const existing = h.name.toLowerCase().trim();
      if (existing === normRec) return true;
      if (existing.includes(normRec) || normRec.includes(existing)) return true;

      // Token match for significant words (length > 3, e.g. "creatine", "spanish")
      const existingTokens = existing.split(/\s+/).filter(t => t.length > 3);
      const recTokens = normRec.split(/\s+/).filter(t => t.length > 3);
      return recTokens.some(rt => existingTokens.includes(rt));
    });
  };

  // Extract recommendations based on user's AI data + premium defaults
  const aiSuggList = [];
  if (profile?.ai_suggestions) {
    Object.values(profile.ai_suggestions).forEach(list => {
      if (Array.isArray(list)) {
        list.forEach(item => {
          if (item && (item.type === "habit_recommendation" || item.type === "habit_pairing")) {
            if (item.title && !aiSuggList.includes(item.title) && !isDuplicateOrMeta(item.title)) {
              aiSuggList.push(item.title);
            }
          }
        });
      }
    });
  }

  const defaultRecs = [
    { name: "Drink 500ml Water", emoji: "💧", time: "08:00" },
    { name: "10m Meditation", emoji: "🧘", time: "07:30" },
    { name: "Read 10 Pages", emoji: "📚", time: "21:30" },
    { name: "Stretch & Yoga", emoji: "🤸", time: "07:00" },
    { name: "Evening Walk", emoji: "🚶", time: "19:00" },
    { name: "Make Bed", emoji: "🛏️", time: "07:10" },
    { name: "Gym Session", emoji: "🏋️", time: "18:00" }
  ];

  const filteredDefaults = defaultRecs.filter(r => !isDuplicateOrMeta(r.name) && !aiSuggList.includes(r.name));

  const finalRecs = [
    ...aiSuggList.map(title => ({ name: title, emoji: "✨", isAI: true })),
    ...filteredDefaults
  ].slice(0, 4);

  const handleSelectRec = (rec) => {
    setName(rec.name);
    if (rec.time) {
      setReminderTime(rec.time);
    }
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(6, 8, 12, 0.8)",
      backdropFilter: "blur(12px)",
      zIndex: 20000,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "16px"
    }}>
      <div
        style={{
          background: "linear-gradient(135deg, rgba(22, 28, 45, 0.95) 0%, rgba(13, 17, 23, 0.98) 100%)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "24px",
          padding: "28px",
          width: "100%",
          maxWidth: "420px",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
          animation: "scaleUp 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)"
        }}
      >
        <h2 style={{
          margin: "0 0 20px",
          fontFamily: "'Syne', sans-serif",
          color: "#f9fafb",
          fontWeight: 800,
          fontSize: "20px",
          letterSpacing: "-0.02em"
        }}>
          {habit ? "Edit Habit" : "New Habit"}
        </h2>

        {/* Recommendations Section */}
        {!habit && finalRecs.length > 0 && (
          <div style={{ marginBottom: "20px" }}>
            <span style={{
              color: "#a78bfa",
              fontSize: "11px",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              display: "block",
              marginBottom: "8px"
            }}>
              Suggested For You
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {finalRecs.map((rec, i) => (
                <button
                  key={i}
                  onClick={() => handleSelectRec(rec)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "999px",
                    border: rec.isAI ? "1px solid rgba(167, 139, 250, 0.3)" : "1px solid rgba(255, 255, 255, 0.08)",
                    background: rec.isAI ? "rgba(167, 139, 250, 0.08)" : "rgba(255, 255, 255, 0.02)",
                    color: rec.isAI ? "#c084fc" : "#d1d5db",
                    fontSize: "11.5px",
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.15s",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontFamily: "inherit"
                  }}
                  className="ht-rec-btn"
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = "scale(1.04)";
                    e.currentTarget.style.background = rec.isAI ? "rgba(167, 139, 250, 0.15)" : "rgba(255, 255, 255, 0.06)";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = "none";
                    e.currentTarget.style.background = rec.isAI ? "rgba(167, 139, 250, 0.08)" : "rgba(255, 255, 255, 0.02)";
                  }}
                >
                  <span>{rec.emoji}</span>
                  <span>{rec.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <label style={S.label}>Habit name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          style={{
            ...S.input,
            background: "rgba(0, 0, 0, 0.25)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            marginBottom: "16px",
            fontSize: "15px"
          }}
          placeholder="e.g. Morning Run"
          autoFocus={!habit}
        />

        <label style={S.label}>Frequency</label>
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          {["daily", "weekly"].map(f => (
            <button
              key={f}
              onClick={() => setFrequency(f)}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: "10px",
                border: "1px solid",
                borderColor: frequency === f ? "#2563eb" : "rgba(255, 255, 255, 0.08)",
                background: frequency === f ? "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)" : "rgba(255, 255, 255, 0.02)",
                color: frequency === f ? "#fff" : "#9ca3af",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: "13px",
                textTransform: "capitalize",
                fontFamily: "inherit",
                transition: "all 0.15s"
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {frequency === "weekly" && (
          <div style={{ marginBottom: "16px" }}>
            <label style={S.label}>Select days</label>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "4px" }}>
              {DAYS_SHORT.map((d, i) => (
                <button
                  key={i}
                  onClick={() => toggleDay(i)}
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    border: "1px solid",
                    borderColor: days.includes(i) ? "#2563eb" : "rgba(255, 255, 255, 0.08)",
                    background: days.includes(i) ? "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)" : "rgba(255, 255, 255, 0.02)",
                    color: days.includes(i) ? "#fff" : "#9ca3af",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: 700,
                    fontFamily: "inherit",
                    transition: "all 0.15s",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  {d[0]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginBottom: "24px" }}>
          <label style={S.label}>Daily Reminder Time (Optional)</label>
          <input
            type="time"
            value={reminderTime}
            onChange={e => setReminderTime(e.target.value)}
            style={{
              ...S.input,
              background: "rgba(0, 0, 0, 0.25)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              colorScheme: "dark",
              fontSize: "15px"
            }}
          />
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={onClose}
            style={{
              ...S.btnSecondary,
              flex: 1,
              padding: "12px",
              borderRadius: "12px",
              fontWeight: 700,
              fontSize: "14px",
              border: "1px solid rgba(255,255,255,0.08)"
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => { if (name.trim()) onSave({ name: name.trim(), frequency, days: frequency === "weekly" ? days : [], reminder_time: reminderTime || null }); }}
            style={{
              ...S.btnPrimary,
              flex: 1,
              padding: "12px",
              borderRadius: "12px",
              fontWeight: 700,
              fontSize: "14px",
              background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
              border: "none"
            }}
          >
            {habit ? "Save Changes" : "Add Habit"}
          </button>
        </div>
      </div>
    </div>
  );
}