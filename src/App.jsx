import { useState, useEffect, useRef } from "react";
import { supabase } from "./lib/supabase.js";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Config and Utils
import { STRIPE_CHECKOUT_URL, FREE_HABIT_LIMIT, FREE_TODO_LIMIT, FREE_JOURNAL_DAYS, LIFETIME_USER_LIMIT, MAX_SHIELDS, DAYS_SHORT, MONTHS_SHORT, S, VAPID_PUBLIC_KEY } from "./utils/constants.js";
import { getTodayStr, getDateStr, parseDateLocal, isSameDay, getCalendarDays, isDayComplete, isDatePaused, calcStats } from "./utils/helpers.js";
import { NotificationManager } from "./utils/notifications.js";


// Layout & Reusable Core Components
import { DragSheet } from "./components/DragSheet.jsx";
import { LifetimeBanner } from "./components/LifetimeBanner.jsx";
import { UpgradeModal } from "./components/UpgradeModal.jsx";
import { ProfileModal } from "./components/ProfileModal.jsx";
import { AuthScreen } from "./screens/AuthScreen.jsx";
import { OnboardingScreen } from "./screens/OnboardingScreen.jsx";

// Feature Modules
import { RoutineSortableItem } from "./components/RoutineSortableItem.jsx";
import { RoutineCard } from "./components/RoutineCard.jsx";
import { RoutineModal } from "./components/RoutineModal.jsx";
import { HabitCard } from "./components/HabitCard.jsx";
import { HabitModal } from "./components/HabitModal.jsx";
import { TodoItem, TodoModal } from "./components/Todos.jsx";
import { AnalyticsTab } from "./screens/AnalyticsTab.jsx";
import { JournalTab } from "./screens/JournalTab.jsx";
import { BillingTab } from "./screens/BillingTab.jsx";

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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const today = getTodayStr();
  const todayDow = new Date().getDay();

  // ── Auth listener ──────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s ?? null));
    
    // Register Service Worker for notifications
    NotificationManager.registerServiceWorker();

    return () => subscription.unsubscribe();
  }, []);


  // Load banner dismissal state from localStorage
  useEffect(() => {
    if (session?.user?.id) {
      const dismissed = localStorage.getItem(`ht_founder_dismissed_${session.user.id}`) === "true";
      setLifetimeBannerDismissed(dismissed);
    }
  }, [session]);

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
    const profileData = profileRes.data || null;
    setProfile(profileData);

    // Auto-detect and save timezone if missing or changed
    if (profileData) {
      const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (profileData.timezone !== browserTz) {
        supabase.from("profiles").update({ timezone: browserTz }).eq("id", uid).then(() => {
          setProfile(prev => ({ ...prev, timezone: browserTz }));
        });
      }
    }


    // Sort routines by saved order
    const routineData = routinesRes.data || [];
    const savedOrder = localStorage.getItem(`ht_routineOrder_${uid}`);
    if (savedOrder) {
      try {
        const orderIds = JSON.parse(savedOrder);
        const sorted = [];
        const map = new Map(routineData.map(r => [r.id, r]));
        orderIds.forEach(id => {
          if (map.has(id)) { sorted.push(map.get(id)); map.delete(id); }
        });
        map.forEach(r => sorted.push(r));
        setRoutines(sorted);
      } catch { setRoutines(routineData); }
    } else {
      setRoutines(routineData);
    }

    setLoading(false);
  };

  // ── Routine actions ────────────────────────────────────────────────────────
  const handleDragEndRoutines = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setRoutines((items) => {
        const oldIndex = items.findIndex(r => r.id === active.id);
        const newIndex = items.findIndex(r => r.id === over.id);
        const newRoutines = arrayMove(items, oldIndex, newIndex);
        localStorage.setItem(`ht_routineOrder_${session?.user?.id}`, JSON.stringify(newRoutines.map(r => r.id)));
        return newRoutines;
      });
    }
  };

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
    if (dateStr !== today) return; // Set in stone: only today's habits can be toggled
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
  const { currentStreak, shields, shieldedDates } = calcStats(habits, pausePeriods, isPremium, profile);

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
          <button onClick={() => {
            setLifetimeBannerDismissed(true);
            if (session?.user?.id) localStorage.setItem(`ht_founder_dismissed_${session.user.id}`, "true");
          }} style={{ background: "none", border: "none", color: "#4b5563", cursor: "pointer", fontSize: "18px", padding: "4px 8px", flexShrink: 0, lineHeight: 1 }}>✕</button>
        </div>
      )}

      <div className="ht-tabs">
        {[["tasks", "Tasks & Habits"], ["analytics", "Analytics"], ["journal", "Journal"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{ padding: "8px 22px", borderRadius: "8px", border: "1px solid", borderColor: tab === key ? "#2563eb" : "#1f2937", background: tab === key ? "#2563eb" : "#111827", color: tab === key ? "#fff" : "#6b7280", cursor: "pointer", fontWeight: 600, fontSize: "14px", transition: "all 0.15s", fontFamily: "inherit" }}>{label}</button>
        ))}
      </div>

      <main
        className={`ht-main${isLifetime && userNumber <= 100 && !lifetimeBannerDismissed ? " ht-main-with-banner" : ""}`}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault();
          const habitId = e.dataTransfer.getData("habitId") || draggedHabitId;
          if (habitId) {
            const hab = habits.find(h => h.id === habitId);
            // Drop onto nothing (background page) inside a routine ejects it
            if (hab && hab.routine_id) {
              moveHabitToRoutine(habitId, null);
            }
          }
        }}
      >
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
              {/* Routine cards Grid */}
              {routines.length > 0 && (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEndRoutines}
                >
                  <SortableContext
                    items={routines.map(r => r.id)}
                    strategy={rectSortingStrategy}
                  >
                    <div className="ht-habit-grid" style={{ marginBottom: "14px", width: "100%" }}>
                      {routines.map(routine => {
                        const routineHabits = todayHabits.filter(h => h.routine_id === routine.id);
                        const widthFactor = Math.min(Math.max(routineHabits.length, 1), 3);
                        const flexBasis = widthFactor === 3 ? "100%" : widthFactor === 2 ? "calc((100% - 14px) * 0.666)" : "calc((100% - 28px) * 0.333)";

                        return (
                          <RoutineSortableItem
                            key={routine.id}
                            routine={routine}
                            routineHabits={routineHabits}
                            widthFactor={widthFactor}
                            flexBasis={flexBasis}
                            today={today}
                            onToggle={toggleHabit}
                            onDelete={deleteHabit}
                            onDeleteRoutine={deleteRoutine}
                            onEjectFromRoutine={habitId => moveHabitToRoutine(habitId, null)}
                            onEdit={thing => {
                              if (thing.frequency !== undefined) { setEditingHabit(thing); setShowHabitModal(true); }
                              else { setEditingRoutine(thing); setShowRoutineModal(true); }
                            }}
                            isPaused={isPaused}
                            pausePeriods={pausePeriods}
                            isPremium={isPremium}
                            shieldedDates={shieldedDates || []}
                            dragState={draggedHabitId}
                            dropTargetId={dropTargetId}
                            onDragStartHabit={(id, habit) => { setDraggedHabitId(id); setDraggedHabit(habit); }}
                            onDragEndHabit={() => { if (draggedHabitId && dropTargetId) swapHabits(draggedHabitId, dropTargetId); setDraggedHabitId(null); setDraggedHabit(null); setDropTargetId(null); }}
                            onDragEnterHabit={targetId => setDropTargetId(targetId)}
                            onDropOnRoutine={moveHabitToRoutine}
                          />
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              )}

              {/* Standalone Habits Grid */}
              <div className="ht-habit-grid">
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
                    shieldedDates={shieldedDates || []}
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
        {[["tasks", "🏠", "Habits"], ["analytics", "📊", "Stats"], ["journal", "📓", "Journal"], ["profile", "👤", "Profile"]].map(([key, icon, label]) => (
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
