import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase.js';
import { FREE_JOURNAL_DAYS } from '../utils/constants.js';
import { getTodayStr, getDateStr, parseDateLocal } from '../utils/helpers.js';

const MOOD_OPTIONS = [
  { value: "great", label: "Great", emoji: "🌟" },
  { value: "good", label: "Good", emoji: "😊" },
  { value: "okay", label: "Okay", emoji: "😐" },
  { value: "bad", label: "Bad", emoji: "😔" },
];
const CHAR_LIMIT = 2000;

export function JournalTab({ journalEntries, setJournalEntries, session, today, isPremium }) {
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

  useEffect(() => {
    setDraft(entry?.content || "");
    setMood(entry?.mood || "");
    setSaved(false);
  }, [currentDate]);

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
    if (!isPremium && nextStr < journalCutoff) return;
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
    return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
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

      {sortedDates.length > 0 && (
        <div style={{ textAlign: "center", marginTop: "16px", color: "#4b5563", fontSize: "12px" }}>
          {sortedDates.length} {sortedDates.length === 1 ? "entry" : "entries"} written
        </div>
      )}
    </div>
  );
}