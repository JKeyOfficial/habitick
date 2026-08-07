import { useState, useEffect, useRef } from "react";
import { supabase } from "./lib/supabase.js";
import {
  DndContext,
  closestCenter,
  closestCorners,
  pointerWithin,
  rectIntersection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  DragOverlay,
  defaultDropAnimationSideEffects
} from '@dnd-kit/core';

import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';


// Config and Utils
import { STRIPE_CHECKOUT_URL, FREE_HABIT_LIMIT, FREE_TODO_LIMIT, FREE_GOALS_LIMIT, FREE_JOURNAL_DAYS, LIFETIME_USER_LIMIT, MAX_SHIELDS, DAYS_SHORT, MONTHS_SHORT, S, VAPID_PUBLIC_KEY } from "./utils/constants.js";
import { getTodayStr, getDateStr, parseDateLocal, isSameDay, getCalendarDays, isDayComplete, isDatePaused, calcStats, calcXp, getLevel, getXpForLevelStart } from "./utils/helpers.js";
import { NotificationManager } from "./utils/notifications.js";
import { decryptText, encryptText } from "./utils/crypto.js";


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
import { HabitSortableItem } from "./components/HabitSortableItem.jsx";
import { HabitModal } from "./components/HabitModal.jsx";
import { TodoItem, TodoModal } from "./components/Todos.jsx";
import { AnalyticsTab } from "./screens/AnalyticsTab.jsx";
import { JournalTab } from "./screens/JournalTab.jsx";
import { BillingTab } from "./screens/BillingTab.jsx";
import { GoalsTab } from "./screens/GoalsTab.jsx";
import { GoalModal } from "./components/GoalModal.jsx";
const restrictToVerticalAxis = ({ transform }) => ({
  ...transform,
  x: 0,
});

const customCollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) {
    return pointerCollisions;
  }
  return rectIntersection(args);
};

function StandaloneHabitsContainer({ children }) {
  const { setNodeRef } = useDroppable({
    id: "standalone-habits",
    data: { type: "standalone" }
  });

  return (
    <div ref={setNodeRef} style={{ width: "100%", minHeight: "60px", marginTop: "8px" }}>
      {children}
    </div>
  );
}

const renderTabIcon = (tabKey, isActive, size = 18) => {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: { display: "block", flexShrink: 0 }
  };

  switch (tabKey) {
    case "today":
      return (
        <svg {...props}>
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill={isActive ? "rgba(37, 99, 235, 0.2)" : "none"} />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      );
    case "goals":
      return (
        <svg {...props}>
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <path d="M4 22h16" />
          <path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34" />
          <path d="M12 2a4 4 0 0 0-4 4v5a4 4 0 0 0 8 0V6a4 4 0 0 0-4-4Z" fill={isActive ? "rgba(37, 99, 235, 0.2)" : "none"} />
        </svg>
      );
    case "tasks":
      return (
        <svg {...props}>
          <rect width="18" height="18" x="3" y="3" rx="2" fill={isActive ? "rgba(37, 99, 235, 0.2)" : "none"} />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "journal":
      return (
        <svg {...props}>
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" fill={isActive ? "rgba(37, 99, 235, 0.2)" : "none"} />
          <path d="M6 6h10M6 10h10M6 14h10" />
        </svg>
      );
    case "analytics":
      return (
        <svg {...props}>
          <line x1="18" x2="18" y1="20" y2="10" />
          <line x1="12" x2="12" y1="20" y2="4" />
          <line x1="6" x2="6" y1="20" y2="14" />
        </svg>
      );
  }
};

const sortItemsByOrder = (items, profileOrder, localStorageKey) => {
  if (!items || items.length === 0) return [];
  
  let orderIds = null;
  if (profileOrder && Array.isArray(profileOrder) && profileOrder.length > 0) {
    orderIds = profileOrder;
  } else {
    const saved = localStorage.getItem(localStorageKey);
    if (saved) {
      try { orderIds = JSON.parse(saved); } catch {}
    }
  }

  let sorted = [...items];
  if (orderIds && Array.isArray(orderIds) && orderIds.length > 0) {
    const map = new Map(items.map(item => [String(item.id), item]));
    const list = [];
    orderIds.forEach(id => {
      const sId = String(id);
      if (map.has(sId)) {
        list.push(map.get(sId));
        map.delete(sId);
      }
    });
    map.forEach(item => list.push(item));
    sorted = list;
  } else {
    const hasOrderIndex = items.some(i => typeof i.order_index === 'number' && i.order_index !== 0);
    if (hasOrderIndex) {
      sorted.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    }
  }

  try {
    localStorage.setItem(localStorageKey, JSON.stringify(sorted.map(i => i.id)));
  } catch {}

  return sorted;
};

const persistRoutineOrder = (newRoutines, userId) => {
  if (!userId) return;
  const routineIds = newRoutines.map(r => r.id);
  try {
    localStorage.setItem(`ht_routineOrder_${userId}`, JSON.stringify(routineIds));
  } catch {}
  
  newRoutines.forEach((r, idx) => {
    supabase.from("routines").update({ order_index: idx }).eq("id", r.id).then(({ error }) => {
      if (error) console.warn("Supabase routine order update warning:", error.message);
    }).catch(err => console.warn("Routine order sync error:", err));
  });

  supabase.from("profiles").update({ routine_order: routineIds }).eq("id", userId).then(({ error }) => {
    if (error) console.warn("Supabase profile routine_order update warning:", error.message);
  }).catch(err => console.warn("Profile routine_order sync error:", err));
};

const persistHabitOrder = (newHabits, userId) => {
  if (!userId) return;
  const habitIds = newHabits.map(h => h.id);
  try {
    localStorage.setItem(`ht_habitOrder_${userId}`, JSON.stringify(habitIds));
  } catch {}

  newHabits.forEach((h, idx) => {
    const validRoutineId = typeof h.routine_id === "string" && h.routine_id.trim() !== "" ? h.routine_id : null;
    supabase.from("habits").update({ order_index: idx, routine_id: validRoutineId }).eq("id", h.id).then(({ error }) => {
      if (error) {
        console.warn("Supabase habit order update warning:", error.message);
        // Fallback: If routine_id column is missing in DB schema, attempt updating order_index alone
        if (error.code === "PGRST204" || error.status === 400) {
          supabase.from("habits").update({ order_index: idx }).eq("id", h.id).catch(() => {});
        }
      }
    }).catch(err => console.warn("Habit order sync error:", err));
  });

  supabase.from("profiles").update({ habit_order: habitIds }).eq("id", userId).then(({ error }) => {
    if (error) console.warn("Supabase profile habit_order update warning:", error.message);
  }).catch(err => console.warn("Profile habit_order sync error:", err));
};

export default function HabiTick() {
  const [session, setSession] = useState(undefined); // undefined=loading, null=signed out
  const [tab, setTab] = useState("today");
  const [selectedDate, setSelectedDate] = useState(() => getTodayStr());
  const [habits, setHabits] = useState([]);
  const [todos, setTodos] = useState([]);
  const [pausePeriods, setPausePeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showHabitModal, setShowHabitModal] = useState(false);
  const [editingHabit, setEditingHabit] = useState(null);
  const [showTodoModal, setShowTodoModal] = useState(false);
  const [goals, setGoals] = useState([]);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);

  // Handle deep linking from PWA shortcuts
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlTab = params.get("tab");
    if (urlTab && ["today", "calendar", "tasks", "journal", "analytics"].includes(urlTab)) {
      setTab(urlTab);
    }
  }, []);

  const [editingTodo, setEditingTodo] = useState(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showTodayOnly, setShowTodayOnly] = useState(() => {
    const saved = localStorage.getItem("ht_showTodayOnly");
    return saved === null ? false : saved === "true";
  });
  const [hideEmptyRoutines, setHideEmptyRoutines] = useState(() => {
    const saved = localStorage.getItem("ht_hideEmptyRoutines");
    return saved === null ? false : saved === "true";
  });
  const [journalEntries, setJournalEntries] = useState({}); // keyed by date string
  const [profile, setProfile] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [routines, setRoutines] = useState([]);
  const [showRoutineModal, setShowRoutineModal] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [draggedHabit, setDraggedHabit] = useState(null);
  const [draggedRoutine, setDraggedRoutine] = useState(null);
  const [draggedItemWidth, setDraggedItemWidth] = useState(null);
  const [lifetimeBannerDismissed, setLifetimeBannerDismissed] = useState(false);
  const [showShieldPopover, setShowShieldPopover] = useState(false);
  const [profileTab, setProfileTab] = useState("account");


  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const today = getTodayStr();
  const todayDow = new Date().getDay();

  // Helper to generate the week strip containing the today's date
  const getWeekDays = (baseDateStr) => {
    const baseDate = parseDateLocal(baseDateStr);
    const day = baseDate.getDay();
    // Monday is first
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(baseDate);
    monday.setDate(baseDate.getDate() + diffToMonday);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push({
        dateStr: getDateStr(d),
        dayNum: d.getDate(),
        dayName: DAYS_SHORT[d.getDay()],
      });
    }
    return days;
  };

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
    const [habitsRes, completionsRes, todosRes, pauseRes, journalRes, profileRes, routinesRes, goalsRes] = await Promise.all([
      supabase.from("habits").select("*").eq("user_id", uid).order("created_at"),
      supabase.from("habit_completions").select("habit_id, completed_date, completed_at, timezone").eq("user_id", uid),
      supabase.from("todos").select("*").eq("user_id", uid).order("created_at"),
      supabase.from("pause_periods").select("*").eq("user_id", uid).order("created_at"),
      supabase.from("journal_entries").select("*").eq("user_id", uid).order("entry_date"),
      supabase.from("profiles").select("*").eq("id", uid).single(),
      supabase.from("routines").select("*").eq("user_id", uid).order("created_at"),
      supabase.from("goals").select("*").eq("user_id", uid).order("created_at"),
    ]);
    const completionsByHabit = {};
    const completionTimesByHabit = {};
    (completionsRes.data || []).forEach(c => {
      const dateStr = c.completed_date.substring(0, 10);
      if (!completionsByHabit[c.habit_id]) completionsByHabit[c.habit_id] = [];
      completionsByHabit[c.habit_id].push(dateStr);

      if (!completionTimesByHabit[c.habit_id]) completionTimesByHabit[c.habit_id] = {};
      if (c.completed_at) {
        completionTimesByHabit[c.habit_id][dateStr] = c.completed_at;
      }
    });

    // Parse profile data first
    const profileData = profileRes.data || null;
    if (profileData) {
      if (profileData.ai_persona_encrypted) {
        try {
          const decryptedPersona = await decryptText(profileData.ai_persona_encrypted, uid);
          profileData.ai_persona = JSON.parse(decryptedPersona);
        } catch (e) {
          console.warn("Failed to decrypt or parse ai_persona_encrypted:", e);
          profileData.ai_persona = {};
        }
      } else {
        profileData.ai_persona = {};
      }

      if (profileData.ai_suggestions_encrypted) {
        try {
          const decryptedSuggestions = await decryptText(profileData.ai_suggestions_encrypted, uid);
          profileData.ai_suggestions = JSON.parse(decryptedSuggestions);
        } catch (e) {
          console.warn("Failed to decrypt or parse ai_suggestions_encrypted:", e);
          profileData.ai_suggestions = {};
        }
      } else {
        profileData.ai_suggestions = {};
      }
    }
    setProfile(profileData);

    // Decrypt habit names & sort by DB / profile / localStorage order
    const decryptedHabits = [];
    for (const h of (habitsRes.data || [])) {
      const name = await decryptText(h.name, uid);
      decryptedHabits.push({
        ...h,
        name,
        createdDate: (h.created_date || getDateStr(new Date())).substring(0, 10), 
        completedDates: completionsByHabit[h.id] || [],
        completionTimes: completionTimesByHabit[h.id] || {}
      });
    }

    const loadedHabits = sortItemsByOrder(decryptedHabits, profileData?.habit_order, `ht_habitOrder_${uid}`);
    setHabits(loadedHabits);

    // Decrypt todo texts
    const loadedTodos = [];
    for (const t of (todosRes.data || [])) {
      const decryptedTextVal = await decryptText(t.text, uid);
      loadedTodos.push({
        ...t,
        text: decryptedTextVal,
        doneDate: t.done_date ? t.done_date.substring(0, 10) : null
      });
    }
    setTodos(loadedTodos);

    setPausePeriods((pauseRes.data || []).map(p => ({ id: p.id, start: (p.start_date || '').substring(0, 10), end: p.end_date ? p.end_date.substring(0, 10) : null })));
    const entriesMap = {};
    if (journalRes.data) {
      for (const e of journalRes.data) {
        const decryptedContent = await decryptText(e.content, uid);
        entriesMap[e.entry_date.substring(0, 10)] = { ...e, content: decryptedContent };
      }
    }
    setJournalEntries(entriesMap);

    // Auto-detect and save timezone if missing or changed
    if (profileData) {
      const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (profileData.timezone !== browserTz) {
        supabase.from("profiles").update({ timezone: browserTz }).eq("id", uid).then(() => {
          setProfile(prev => ({ ...prev, timezone: browserTz }));
        });
      }
    }

    // Decrypt routine names & sort by DB / profile / localStorage order
    const decryptedRoutines = [];
    for (const r of (routinesRes.data || [])) {
      const decryptedName = await decryptText(r.name, uid);
      decryptedRoutines.push({
        ...r,
        name: decryptedName
      });
    }

    const loadedRoutines = sortItemsByOrder(decryptedRoutines, profileData?.routine_order, `ht_routineOrder_${uid}`);
    setRoutines(loadedRoutines);

    // Decrypt goals title and description
    const decryptedGoals = [];
    for (const g of (goalsRes.data || [])) {
      const decryptedTitle = await decryptText(g.title, uid);
      const decryptedDesc = g.description ? await decryptText(g.description, uid) : "";
      decryptedGoals.push({
        ...g,
        title: decryptedTitle,
        description: decryptedDesc
      });
    }
    setGoals(decryptedGoals);
    setLoading(false);
  };

  const handleDragStart = (event) => {
    const { active } = event;
    setActiveId(active.id);
    const rect = active.rect.current.initial || active.rect.current.translated;
    if (rect?.width) {
      setDraggedItemWidth(rect.width);
    }
    if (active.data.current?.type === 'habit') {
      setDraggedHabit(active.data.current.habit);
    } else if (active.data.current?.type === 'routine') {
      const routine = routines.find(r => String(r.id) === String(active.id));
      setDraggedRoutine(routine || null);
    }
  };

  const handleDragOver = (event) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId === overId) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    if (!activeData || activeData.type !== 'habit') return;

    // IGNORE drags over non-habit drop targets (like tasks, calendar, background, headers)
    const isOverHabit = overData?.type === 'habit';
    const isOverRoutine = overData?.type === 'routine' || routines.some(r => String(r.id) === overId);
    const isOverStandalone = overId === 'standalone-habits' || overData?.type === 'standalone';

    if (!isOverHabit && !isOverRoutine && !isOverStandalone) {
      return;
    }

    setHabits((prev) => {
      const activeIndex = prev.findIndex(h => String(h.id) === activeId);
      if (activeIndex === -1) return prev;

      const activeItem = prev[activeIndex];

      // Dragged over standalone container or area
      if (overId === 'standalone-habits' || overData?.type === 'standalone') {
        if (activeItem.routine_id !== null) {
          const newHabits = [...prev];
          newHabits[activeIndex] = { ...activeItem, routine_id: null };
          return newHabits;
        }
        return prev;
      }

      // Dragged over a routine container
      if (overData?.type === 'routine' || routines.some(r => String(r.id) === overId)) {
        const targetRoutineId = overData?.type === 'routine' ? overId : routines.find(r => String(r.id) === overId)?.id;
        if (targetRoutineId && activeItem.routine_id !== String(targetRoutineId)) {
          const newHabits = [...prev];
          newHabits[activeIndex] = { ...activeItem, routine_id: String(targetRoutineId) };
          return newHabits;
        }
        return prev;
      }

      // Dragged over another habit
      if (overData?.type === 'habit') {
        const overIndex = prev.findIndex(h => String(h.id) === overId);
        if (overIndex === -1) return prev;

        const overItem = prev[overIndex];
        const overRoutineId = overItem.routine_id ?? null;

        const routineChanged = activeItem.routine_id !== overRoutineId;
        const indexChanged = activeIndex !== overIndex;

        if (!routineChanged && !indexChanged) {
          return prev;
        }

        let newHabits = [...prev];
        if (routineChanged) {
          newHabits[activeIndex] = { ...activeItem, routine_id: overRoutineId };
        }

        if (indexChanged) {
          return arrayMove(newHabits, activeIndex, overIndex);
        }

        return newHabits;
      }

      return prev;
    });
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;

    // Routine reordering persistence
    if (active.data.current?.type === 'routine' && over) {
      const activeId = String(active.id);
      const overId = String(over.id);
      if (activeId !== overId) {
        setRoutines((items) => {
          const oldIndex = items.findIndex(r => String(r.id) === activeId);
          const newIndex = items.findIndex(r => String(r.id) === overId);
          const newRoutines = arrayMove(items, oldIndex, newIndex);
          persistRoutineOrder(newRoutines, session?.user?.id);
          return newRoutines;
        });
      }
    }

    // Habit persistence (save current state of habits to DB/LocalStorage/Profile)
    if (active.data.current?.type === 'habit') {
      const activeId = String(active.id);
      setHabits(currentHabits => {
        const habit = currentHabits.find(h => String(h.id) === activeId);
        if (habit) {
          persistHabitOrder(currentHabits, session?.user?.id);
        }
        return currentHabits;
      });
    }

    setActiveId(null);
    setDraggedHabit(null);
    setDraggedRoutine(null);
    setDraggedItemWidth(null);
  };

  const saveRoutine = async ({ name, emoji }) => {
    const encryptedName = await encryptText(name, session.user.id);
    if (editingRoutine) {
      const { data } = await supabase.from("routines").update({ name: encryptedName, emoji }).eq("id", editingRoutine.id).select().single();
      setRoutines(prev => prev.map(r => r.id === editingRoutine.id ? { ...data, name } : r));
    } else {
      const nextIndex = routines.length;
      const { data } = await supabase.from("routines").insert({ user_id: session.user.id, name: encryptedName, emoji, order_index: nextIndex }).select().single();
      const newRoutines = [...routines, { ...data, name, order_index: nextIndex }];
      setRoutines(newRoutines);
      persistRoutineOrder(newRoutines, session?.user?.id);
    }
    setShowRoutineModal(false); setEditingRoutine(null);
  };

  const deleteRoutine = async id => {
    await supabase.from("habits").update({ routine_id: null }).eq("routine_id", id);
    setHabits(prev => {
      const updated = prev.map(h => h.routine_id === id ? { ...h, routine_id: null } : h);
      persistHabitOrder(updated, session?.user?.id);
      return updated;
    });
    await supabase.from("routines").delete().eq("id", id);
    setRoutines(prev => {
      const remaining = prev.filter(r => r.id !== id);
      persistRoutineOrder(remaining, session?.user?.id);
      return remaining;
    });
  };

  const moveHabitToRoutine = async (habitId, routineId) => {
    setHabits(prev => {
      const updated = prev.map(h => h.id === habitId ? { ...h, routine_id: routineId } : h);
      persistHabitOrder(updated, session?.user?.id);
      return updated;
    });
  };

  const swapHabits = (dragId, targetId) => {
    if (!dragId || !targetId || dragId === targetId) return;
    setHabits(prev => {
      const arr = [...prev];
      const dragIdx = arr.findIndex(h => h.id === dragId);
      const targetIdx = arr.findIndex(h => h.id === targetId);
      if (dragIdx === -1 || targetIdx === -1) return prev;
      const dragRoutine = arr[dragIdx].routine_id;
      const targetRoutine = arr[targetIdx].routine_id;
      arr[dragIdx] = { ...arr[dragIdx], routine_id: targetRoutine };
      arr[targetIdx] = { ...arr[targetIdx], routine_id: dragRoutine };
      [arr[dragIdx], arr[targetIdx]] = [arr[targetIdx], arr[dragIdx]];
      persistHabitOrder(arr, session?.user?.id);
      return arr;
    });
  };

  const toggleHabit = async (habitId, dateStr) => {
    // Can only toggle habits for the current day (today) to prevent continuity/streak manipulation
    if (dateStr !== today) return;
    const habit = habits.find(h => h.id === habitId);
    const isDone = habit.completedDates.includes(dateStr);
    setHabits(prev => prev.map(h => {
      if (h.id !== habitId) return h;
      return {
        ...h,
        completedDates: isDone 
          ? h.completedDates.filter(d => d !== dateStr) 
          : [...h.completedDates, dateStr],
        completionTimes: isDone
          ? (() => { const copy = { ...h.completionTimes }; delete copy[dateStr]; return copy; })()
          : { ...h.completionTimes, [dateStr]: new Date().toISOString() }
      };
    }));
    if (isDone) {
      await supabase.from("habit_completions").delete().eq("habit_id", habitId).eq("completed_date", dateStr);
    } else {
      const nowStr = new Date().toISOString();
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await supabase.from("habit_completions").insert({ 
        habit_id: habitId, 
        user_id: session.user.id, 
        completed_date: dateStr,
        completed_at: nowStr,
        timezone: userTimezone
      });
    }
  };

  const saveHabit = async ({ name, frequency, days }) => {
    const encryptedName = await encryptText(name, session.user.id);
    if (editingHabit) {
      const { data } = await supabase.from("habits").update({ name: encryptedName, frequency, days }).eq("id", editingHabit.id).select().single();
      setHabits(prev => prev.map(h => h.id === editingHabit.id ? { ...h, ...data, name, createdDate: data.created_date } : h));
    } else {
      if (!isPremium && habits.length >= FREE_HABIT_LIMIT) {
        setShowHabitModal(false); setShowUpgradeModal("habits"); return;
      }
      const nextIndex = habits.length;
      const { data } = await supabase.from("habits").insert({ user_id: session.user.id, name: encryptedName, frequency, days, created_date: today, order_index: nextIndex }).select().single();
      const newHabits = [...habits, { ...data, name, createdDate: data.created_date, order_index: nextIndex, completedDates: [], completionTimes: {} }];
      setHabits(newHabits);
      persistHabitOrder(newHabits, session?.user?.id);
    }
    setShowHabitModal(false); setEditingHabit(null);
  };

  const deleteHabit = async id => {
    setHabits(prev => {
      const newHabits = prev.filter(h => h.id !== id);
      persistHabitOrder(newHabits, session?.user?.id);
      return newHabits;
    });
    await supabase.from("habits").delete().eq("id", id);
  };

  const addTodo = async ({ text, priority, due_date, due_time }) => {
    const activeTodos = todos.filter(t => !t.done);
    if (!isPremium && activeTodos.length >= FREE_TODO_LIMIT) {
      setShowTodoModal(false); setShowUpgradeModal("todos"); return;
    }
    const encryptedText = await encryptText(text, session.user.id);
    const { data } = await supabase.from("todos").insert({ user_id: session.user.id, text: encryptedText, priority: priority || null, done: false, due_date: due_date || null, due_time: due_time || null }).select().single();
    setTodos(prev => [...prev, { ...data, text, doneDate: null }]);
    setShowTodoModal(false);
  };

  const saveTodo = async ({ text, priority, due_date, due_time }) => {
    const encryptedText = await encryptText(text, session.user.id);
    const { data } = await supabase.from("todos").update({ text: encryptedText, priority: priority || null, due_date: due_date || null, due_time: due_time || null }).eq("id", editingTodo.id).select().single();
    setTodos(prev => prev.map(t => t.id === editingTodo.id ? { ...t, ...data, text } : t));
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

  const addGoal = async (title, description, targetDate) => {
    if (!isPremium && goals.length >= FREE_GOALS_LIMIT) {
      setShowGoalModal(false);
      setShowUpgradeModal("goals");
      return;
    }
    const encryptedTitle = await encryptText(title, session.user.id);
    const encryptedDesc = description ? await encryptText(description, session.user.id) : null;
    const { data, error } = await supabase.from("goals").insert({
      user_id: session.user.id,
      title: encryptedTitle,
      description: encryptedDesc,
      target_date: targetDate || null,
      completed: false
    }).select().single();
    if (!error && data) {
      setGoals(prev => [...prev, { ...data, title, description }]);
    }
    setShowGoalModal(false);
  };

  const saveGoal = async (id, updates) => {
    const encryptedTitle = await encryptText(updates.title, session.user.id);
    const encryptedDesc = updates.description ? await encryptText(updates.description, session.user.id) : null;
    const { data, error } = await supabase.from("goals").update({
      title: encryptedTitle,
      description: encryptedDesc,
      target_date: updates.target_date || null
    }).eq("id", id).select().single();
    if (!error && data) {
      setGoals(prev => prev.map(g => g.id === id ? { ...data, title: updates.title, description: updates.description } : g));
    }
    setShowGoalModal(false); setEditingGoal(null);
  };

  const toggleGoal = async (id) => {
    const goal = goals.find(g => g.id === id);
    if (!goal) return;
    const nextCompleted = !goal.completed;
    const completedAt = nextCompleted ? new Date().toISOString() : null;

    // Instantly update local state for snappy UI
    setGoals(prev => prev.map(g => g.id === id ? { ...g, completed: nextCompleted, completed_at: completedAt } : g));

    await supabase.from("goals").update({
      completed: nextCompleted,
      completed_at: completedAt
    }).eq("id", id);
  };

  const deleteGoal = async (id) => {
    setGoals(prev => prev.filter(g => g.id !== id));
    await supabase.from("goals").delete().eq("id", id);
  };

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

  // Selected date computations
  const selectedDateObj = parseDateLocal(selectedDate);
  const selectedDow = selectedDateObj.getDay();

  const todayHabits = (showTodayOnly
    ? habits.filter(h => h.frequency === "daily" || (h.days && h.days.includes(selectedDow)))
    : habits
  ).filter(h => !h.createdDate || h.createdDate <= selectedDate);

  const isHabitInRoutine = (h) => h.routine_id && routines.some(r => String(r.id) === String(h.routine_id));

  const visibleRoutines = hideEmptyRoutines
    ? routines.filter(routine => todayHabits.some(h => h.routine_id && String(h.routine_id) === String(routine.id)))
    : routines;

  const doneOnSelectedDate = habits.filter(h =>
    (!h.createdDate || h.createdDate <= selectedDate) &&
    (h.frequency === "daily" || (h.days && h.days.includes(selectedDow))) &&
    (h.completedDates || []).includes(selectedDate)
  ).length;

  const totalOnSelectedDate = habits.filter(h =>
    (!h.createdDate || h.createdDate <= selectedDate) &&
    (h.frequency === "daily" || (h.days && h.days.includes(selectedDow)))
  ).length;

  const percent = totalOnSelectedDate > 0
    ? Math.round((doneOnSelectedDate / totalOnSelectedDate) * 100)
    : 0;

  // Keep original today counters for general badge statistics
  const doneToday = habits.filter(h => (h.frequency === "daily" || (h.days && h.days.includes(todayDow))) && (h.completedDates || []).includes(today)).length;
  const totalToday = habits.filter(h => h.frequency === "daily" || (h.days && h.days.includes(todayDow))).length;

  const isPremium = profile?.is_premium === true || profile?.is_lifetime === true;
  const { currentStreak, shields, maxShields, progressToNextShield, shieldedDates } = calcStats(habits, pausePeriods, isPremium, profile);

  const priorityOrder = { high: 1, med: 2, low: 3, "": 4 };
  const visibleTodos = (showCompleted ? todos : todos.filter(t => !t.done)).slice().sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.done && b.done) {
      const aDone = a.doneDate || "";
      const bDone = b.doneDate || "";
      if (aDone !== bDone) return aDone < bDone ? 1 : -1;
      const pr = (priorityOrder[a.priority || ""] || 4) - (priorityOrder[b.priority || ""] || 4);
      if (pr !== 0) return pr;
      return a.id < b.id ? -1 : 1;
    }
    const aDate = a.due_date ? `${a.due_date}${a.due_time ? `T${a.due_time}` : "T23:59"}` : "9999";
    const bDate = b.due_date ? `${b.due_date}${b.due_time ? `T${b.due_time}` : "T23:59"}` : "9999";
    if (aDate !== bDate) return aDate < bDate ? -1 : 1;
    return (priorityOrder[a.priority || ""] || 4) - (priorityOrder[b.priority || ""] || 4);
  });

  const isLifetime = profile?.is_lifetime === true;
  const userNumber = profile?.user_number || null;

  const handleUpgrade = async (planType = "monthly") => {
    try {
      const res = await fetch(STRIPE_CHECKOUT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: session.user.id, userEmail: session.user.email, planType }),
      });
      
      const text = await res.text();
      let data = {};
      try { data = JSON.parse(text); } catch {}

      if (res.ok && data?.url) {
        window.location.href = data.url;
      } else if (res.status === 404) {
        alert("Local Vite dev server cannot execute Vercel serverless functions (/api/create-checkout) directly.\n\nDeploy to Vercel or run `npx vercel dev` to test live Stripe Checkout, and ensure STRIPE_SECRET_KEY is set in your env!");
      } else {
        alert(data?.error || `Stripe error (${res.status}): ${text.slice(0, 100)}`);
      }
    } catch (err) {
      alert(`Checkout error: ${err.message || "Failed to reach serverless API."}`);
    }
  };

  if (session === undefined) return <div style={{ minHeight: "100vh", background: "#080b11", display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280", fontFamily: "system-ui" }}>Loading...</div>;
  if (!session) return <AuthScreen />;
  if (!loading && profile && !profile.username) return <OnboardingScreen session={session} onComplete={p => { setProfile(p); setShowHabitModal(true); }} />;

  // Progress Circle Geometry — larger, premium
  const progressRadius = 62;
  const progressStroke = 10;
  const progressNormalizedRadius = progressRadius - progressStroke;
  const progressCircumference = progressNormalizedRadius * 2 * Math.PI;
  const progressStrokeDashoffset = progressCircumference - (percent / 100) * progressCircumference;

  return (
    <div className="ht-app-layout">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@400;500;600;700;800&display=swap');
        
        html, body, #root {
          margin: 0;
          padding: 0;
          width: 100%;
          min-height: 100vh;
          min-height: 100dvh;
          background: #080b11;
          color: #f9fafb;
          font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
          overflow-x: hidden;
        }
        * { box-sizing: border-box; }
        button, input, textarea, select { font-family: inherit; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #1f293d; border-radius: 3px; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        
        /* App Container Layout */
        .ht-app-layout {
          display: flex;
          min-height: 100vh;
          min-height: 100dvh;
          width: 100%;
          background: #080b11;
          overflow-x: hidden;
          position: relative;
        }

        /* Responsive Sidebar */
        .ht-sidebar {
          width: 260px;
          background: #111622;
          border-right: 1px solid rgba(255, 255, 255, 0.05);
          display: flex;
          flex-direction: column;
          padding: 24px;
          position: fixed;
          left: 0;
          top: 0;
          bottom: 0;
          height: 100vh;
          flex-shrink: 0;
          z-index: 105;
        }

        .ht-sidebar-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 36px;
        }

        .ht-sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .ht-sidebar-link {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border-radius: 12px;
          color: #9ca3af;
          font-weight: 600;
          font-size: 14px;
          background: transparent;
          border: none;
          cursor: pointer;
          text-align: left;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .ht-sidebar-link:hover {
          color: #f9fafb;
          background: rgba(255, 255, 255, 0.03);
        }

        .ht-sidebar-link.active {
          color: #fff;
          background: #2563eb;
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
        }

        .ht-sidebar-footer {
          margin-top: auto;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          padding-top: 20px;
        }

        /* Content Area */
        .ht-content-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          overflow-x: hidden;
          padding-left: 260px; /* Offset the fixed sidebar */
        }

        .ht-header {
          height: 64px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          padding: 0 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(8, 11, 17, 0.8);
          backdrop-filter: blur(12px);
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .ht-main {
          flex: 1;
          padding: 32px;
          max-width: 1200px;
          width: 100%;
          margin: 0 auto;
          overflow-x: hidden;
        }

        /* Dashboard grid */
        .ht-dashboard-grid {
          display: flex;
          gap: 24px;
          align-items: flex-start;
        }

        .ht-dashboard-main {
          flex: 1.6;
          min-width: 0;
          overflow-x: hidden;
        }

        .ht-dashboard-sidebar {
          width: 340px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          flex-shrink: 0;
          min-width: 0;
        }

        .ht-bottom-nav {
          display: none;
        }

        .ht-mobile-only {
          display: none !important;
        }

        .ht-mobile-only-flex {
          display: none !important;
        }

        @media (max-width: 1024px) {
          .ht-dashboard-grid {
            flex-direction: column;
            align-items: stretch;
          }
          .ht-dashboard-main {
            width: 100%;
            max-width: 100%;
            flex: none;
          }
          .ht-dashboard-sidebar {
            width: 100%;
            max-width: 100%;
            flex: none;
          }
        }

        @media (max-width: 768px) {
          .ht-sidebar {
            display: none;
          }
          .ht-header {
            padding: 0 16px;
            /* Stay above bottom nav on mobile */
            position: sticky;
            top: 0;
            z-index: 100;
          }
          .ht-main {
            padding: 12px 12px 96px; /* Tighter sides on mobile so cards have more room */
            padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px));
          }
          /* Routine cards: tighter padding on small screens */
          .ht-routine-card {
            padding: 12px !important;
            border-radius: 16px !important;
          }
          /* Habit cards: tighter padding on small screens */
          .ht-habit-card {
            padding: 11px 12px !important;
            border-radius: 14px !important;
          }
          /* Scroll lives on the page body, not on a clipping wrapper */
          .ht-content-area {
            overflow-x: hidden;
            padding-left: 0 !important;
          }
          .ht-desktop-only {
            display: none !important;
          }
          .ht-mobile-only {
            display: block !important;
          }
          .ht-mobile-only-flex {
            display: flex !important;
          }
          .ht-bottom-nav {
            display: flex;
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            height: 64px;
            /* Extend into safe-area on notched phones */
            padding-bottom: env(safe-area-inset-bottom, 0px);
            height: calc(64px + env(safe-area-inset-bottom, 0px));
            background: rgba(13, 17, 26, 0.97);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-top: 1px solid rgba(255, 255, 255, 0.06);
            z-index: 9999;
            justify-content: space-around;
            align-items: flex-start;
            padding-top: 8px;
            box-shadow: 0 -4px 24px rgba(0,0,0,0.5);
            /* Guarantee it's always on top of any scroll container */
            will-change: transform;
          }
          .ht-bottom-nav-btn {
            background: none;
            border: none;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: #6b7280;
            cursor: pointer;
            gap: 4px;
            transition: color 0.15s;
            padding: 4px 8px;
            flex: 1;
            min-width: 0;
          }
          .ht-bottom-nav-btn.active {
            color: #3b82f6;
          }
          .ht-bottom-nav-btn span:first-child {
            font-size: 20px;
            line-height: 1;
          }
          .ht-bottom-nav-btn span:last-child {
            font-size: 10px;
            font-weight: 700;
          }
        }

        /* Extra tight layout for small phones (≤ 400px, e.g. iPhone 12 Pro at 390px) */
        @media (max-width: 400px) {
          .ht-main {
            padding: 10px 10px 96px;
            padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px));
          }
          .ht-routine-card {
            padding: 10px !important;
            border-radius: 14px !important;
          }
          .ht-habit-card {
            padding: 10px !important;
            border-radius: 12px !important;
          }
          /* Override inline styles for smaller phone typography */
          .ht-routine-card span {
            font-size: 13.5px !important;
          }
          .ht-habit-card span {
            font-size: 13px !important;
          }
          h2 {
            font-size: 18px !important;
          }
        }
      `}</style>

      {/* DESKTOP SIDEBAR */}
      <aside className="ht-sidebar">
        <div className="ht-sidebar-logo">
          <img src="/habitick-blue-logo.png" alt="HabiTick" style={{ width: "32px", height: "32px", borderRadius: "8px", objectFit: "contain" }} />
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "20px", letterSpacing: "-0.02em", color: "#fff" }}>HabiTick</span>
        </div>

        <nav className="ht-sidebar-nav">
          {[
            ["today", "Today"],
            ["tasks", "Tasks"],
            ["journal", "Journal"],
            ["goals", "Goals"],
            ["analytics", "Stats"]
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`ht-sidebar-link ${tab === key ? "active" : ""}`}
            >
              {renderTabIcon(key, tab === key, 18)}
              <span>{label}</span>
            </button>
          ))}
        </nav>



        <div className="ht-sidebar-footer">
          <button onClick={() => { setProfileTab("account"); setShowProfile(true); }} style={{ display: "flex", alignItems: "center", gap: "10px", background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.05)", borderRadius: "12px", padding: "10px 14px", cursor: "pointer", width: "100%", transition: "all 0.2s" }}>
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt="avatar" style={{ width: "28px", height: "28px", borderRadius: "50%", objectFit: "cover" }} />
              : <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "12px", color: "#fff" }}>
                {(profile?.username || session.user.email || "?")[0].toUpperCase()}
              </div>
            }
            <span style={{ color: "#d1d5db", fontSize: "13px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, textAlign: "left" }}>
              {profile?.username || "Profile"}
            </span>
            <span style={{ fontSize: "14px", color: "#6b7280" }}>⚙️</span>
          </button>
          <div className="ht-desktop-only" style={{ textAlign: "center", marginTop: "10px", fontSize: "10px", color: "#374151", letterSpacing: "0.02em", userSelect: "none" }}>
            Made with ❤︎⁠ by JKey
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="ht-content-area">
        {/* TOP HEADER */}
        <header className="ht-header">
          {/* Logo on Left for Mobile */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }} className="ht-mobile-only-flex">
            <img src="/habitick-blue-logo.png" alt="HabiTick" style={{ width: "28px", height: "28px", borderRadius: "6px", objectFit: "contain" }} />
            <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "16px", color: "#fff" }}>HabiTick</span>
          </div>

          {/* Dashboard Title on Left for Desktop */}
          <div style={{ fontSize: "13px", color: "#4b5563", fontWeight: 600 }} className="ht-desktop-only">
            {tab.charAt(0).toUpperCase() + tab.slice(1)} Dashboard
          </div>

          {/* Badges and Profile Button on Right */}
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <div style={{ display: "flex", gap: "6px", alignItems: "center", background: "#111622", border: `1px solid ${isPaused ? "rgba(245,158,11,0.15)" : "rgba(59,130,246,0.15)"}`, borderRadius: "999px", padding: "4px 12px", fontSize: "11px", color: isPaused ? "#fcd34d" : "#60a5fa", fontWeight: 600 }}>
              {isPaused ? (
                <>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                  <span>Streak frozen</span>
                </>
              ) : (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#f97316", flexShrink: 0 }}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>
                  <span>{currentStreak} days</span>
                </>
              )}
            </div>
            <div 
              style={{ position: "relative" }}
              onMouseEnter={() => setShowShieldPopover(true)}
              onMouseLeave={() => setShowShieldPopover(false)}
            >
              <button
                onClick={() => { setProfileTab("shields"); setShowShieldPopover(false); setShowProfile(true); }}
                style={{
                  display: "flex",
                  gap: "6px",
                  alignItems: "center",
                  background: showShieldPopover ? "rgba(37, 99, 235, 0.15)" : "#111622",
                  border: `1px solid ${showShieldPopover ? "#2563eb" : "rgba(59,130,246,0.15)"}`,
                  borderRadius: "999px",
                  padding: "4px 12px",
                  fontSize: "11px",
                  color: "#60a5fa",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                <span>{shields}/{isPremium ? 5 : 3}</span>
              </button>

              {showShieldPopover && (
                <div style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  paddingTop: "6px",
                  zIndex: 1000
                }}>
                  <div style={{
                    width: "260px",
                    background: "#111622",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "16px",
                    padding: "16px",
                    boxShadow: "0 12px 36px rgba(0, 0, 0, 0.5)",
                    animation: "fadeUp 0.15s ease-out"
                  }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#fff", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                      Streak Shields
                    </span>
                    <span style={{ fontSize: "11px", color: "#60a5fa", fontWeight: 700, background: "rgba(59, 130, 246, 0.1)", padding: "2px 8px", borderRadius: "999px", border: "1px solid rgba(59, 130, 246, 0.2)" }}>
                      {shields} / {maxShields}
                    </span>
                  </div>

                  <p style={{ margin: "0 0 12px", fontSize: "11.5px", color: "#9ca3af", lineHeight: 1.4 }}>
                    Streak Shields automatically protect your streak if you miss a day. Earn 1 shield every 5 perfect days.
                  </p>

                  {/* Progress bar towards next shield */}
                  <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: "10px", padding: "10px 12px", border: "1px solid rgba(255,255,255,0.04)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10.5px", color: "#6b7280", fontWeight: 600, marginBottom: "6px" }}>
                      <span>Next Shield</span>
                      <span style={{ color: "#3b82f6", fontWeight: 700 }}>{progressToNextShield} / 5 perfect days</span>
                    </div>
                    <div style={{ height: "4px", background: "rgba(255, 255, 255, 0.06)", borderRadius: "999px", overflow: "hidden" }}>
                      <div style={{ height: "100%", background: "#2563eb", width: `${(progressToNextShield / 5) * 100}%`, borderRadius: "999px", transition: "width 0.3s ease" }} />
                    </div>
                  </div>

                  <button
                    onClick={() => { setProfileTab("shields"); setShowShieldPopover(false); setShowProfile(true); }}
                    style={{
                      width: "100%",
                      marginTop: "12px",
                      background: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid rgba(255, 255, 255, 0.06)",
                      borderRadius: "8px",
                      color: "#9ca3af",
                      fontSize: "11px",
                      fontWeight: 600,
                      padding: "6px",
                      cursor: "pointer",
                      textAlign: "center",
                      transition: "all 0.15s"
                    }}
                  >
                    View Shield Rules & Stats →
                  </button>
                </div>
              </div>
            )}
            </div>

            {/* Profile Avatar Button on Mobile */}
            <button
              onClick={() => { setProfileTab("account"); setShowProfile(true); }}
              className="ht-mobile-only"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="avatar"
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "50%",
                    objectFit: "cover",
                    border: "1.5px solid #2563eb",
                    boxShadow: "0 0 10px rgba(37, 99, 235, 0.2)"
                  }}
                />
              ) : (
                <div style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  background: "#2563eb",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: "12px",
                  color: "#fff",
                  border: "1.5px solid #2563eb",
                  boxShadow: "0 0 10px rgba(37, 99, 235, 0.2)"
                }}>
                  {(profile?.username || session.user.email || "?")[0].toUpperCase()}
                </div>
              )}
            </button>
          </div>
        </header>

        {/* FOUNDER BANNER */}
        {isLifetime && userNumber && userNumber <= LIFETIME_USER_LIMIT && !lifetimeBannerDismissed && (
          <div className="ht-founder-banner" style={{ background: "linear-gradient(90deg, #1d4ed820 0%, #10b98115 100%)", borderBottom: "1px solid #2563eb30", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
              <span style={{ fontSize: "16px", flexShrink: 0 }}>🎉</span>
              <span style={{ fontSize: "12px", color: "#93c5fd", fontWeight: 600, lineHeight: 1.5 }}>
                You're <span style={{ color: "#60a5fa", fontWeight: 800 }}>#{userNumber}</span> of {LIFETIME_USER_LIMIT.toLocaleString()} founding members — Premium is yours <span style={{ color: "#10b981" }}>free, forever</span>.
              </span>
            </div>
            <button onClick={() => {
              setLifetimeBannerDismissed(true);
              if (session?.user?.id) localStorage.setItem(`ht_founder_dismissed_${session.user.id}`, "true");
            }} style={{ background: "none", border: "none", color: "#4b5563", cursor: "pointer", fontSize: "16px", padding: "4px 8px", flexShrink: 0, lineHeight: 1 }}>✕</button>
          </div>
        )}

        {/* DnD Context Main Wrapper */}
        <DndContext
          sensors={sensors}
          collisionDetection={customCollisionDetection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          autoScroll={{ threshold: { x: 0, y: 0.15 }, acceleration: 10 }}
          modifiers={[restrictToVerticalAxis]}
        >
          <main className="ht-main">
            {loading ? (
              <div style={{ textAlign: "center", padding: "60px", color: "#6b7280" }}>Loading your data...</div>
            ) : tab === "today" ? (
              /* TODAY VIEW LAYOUT */
              <>
                {/* 1. WEEK CALENDAR STRIP */}
                <div style={{ display: "flex", justifyContent: "space-between", background: "rgba(17, 22, 34, 0.6)", border: "1px solid rgba(255, 255, 255, 0.05)", borderRadius: "16px", padding: "10px", marginBottom: "20px" }}>
                  {getWeekDays(today).map((day) => {
                    const isSel = day.dateStr === selectedDate;
                    const isTod = day.dateStr === today;
                    const isPast = day.dateStr < today;

                    let bg = "transparent";
                    let color = "#9ca3af";
                    let border = "1px solid transparent";
                    let boxShadow = "none";

                    if (isSel) {
                      bg = "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)";
                      color = "#fff";
                      boxShadow = "0 4px 12px rgba(37, 99, 235, 0.3)";
                    } else if (isTod) {
                      bg = "rgba(59, 130, 246, 0.05)";
                      color = "#3b82f6";
                      border = "1px solid rgba(59, 130, 246, 0.15)";
                    } else if (isPast) {
                      const pDateObj = parseDateLocal(day.dateStr);
                      const pDow = pDateObj.getDay();
                      const pScheduled = habits.filter(h =>
                        (!h.createdDate || h.createdDate <= day.dateStr) &&
                        (h.frequency === "daily" || (h.days && h.days.includes(pDow)))
                      );
                      const pDone = pScheduled.filter(h => (h.completedDates || []).includes(day.dateStr));
                      const isAllDone = pScheduled.length > 0 && pDone.length === pScheduled.length;
                      const isAnyMissing = pScheduled.length > 0 && pDone.length < pScheduled.length;
                      const isShielded = (shieldedDates || []).includes(day.dateStr);

                      if (isAllDone) {
                        bg = "rgba(16, 185, 129, 0.06)";
                        color = "#10b981";
                        border = "1px solid rgba(16, 185, 129, 0.12)";
                      } else if (isShielded) {
                        bg = "rgba(59, 130, 246, 0.06)";
                        color = "#60a5fa";
                        border = "1px solid rgba(59, 130, 246, 0.15)";
                      } else if (isAnyMissing) {
                        bg = "rgba(245, 158, 11, 0.06)";
                        color = "#f59e0b";
                        border = "1px solid rgba(245, 158, 11, 0.12)";
                      }
                    }

                    const isShieldedDay = isPast && (shieldedDates || []).includes(day.dateStr);

                    return (
                      <button
                        key={day.dateStr}
                        onClick={() => setSelectedDate(day.dateStr)}
                        style={{
                          flex: 1,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          background: bg,
                          border,
                          borderRadius: "12px",
                          padding: "8px 2px",
                          color,
                          cursor: "pointer",
                          transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                          boxShadow,
                          margin: "0 2px",
                          position: "relative"
                        }}
                      >
                        <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", marginBottom: "4px", opacity: isSel ? 0.9 : 0.6 }}>
                          {day.dayName}
                        </span>
                        <span style={{ fontSize: "14px", fontWeight: 800 }}>
                          {day.dayNum}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Warning header when looking at past dates */}
                {selectedDate !== today && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.15)", borderRadius: "12px", padding: "10px 16px", marginBottom: "20px" }}>
                    <span style={{ fontSize: "13px", color: "#fcd34d", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" x2="12" y1="9" y2="13" /><line x1="12" x2="12" y1="17" y2="17" /></svg>
                      <span>Viewing status for {parseDateLocal(selectedDate).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
                    </span>
                    <button
                      onClick={() => setSelectedDate(today)}
                      style={{ background: "#f59e0b", border: "none", color: "#000", fontWeight: 700, fontSize: "11px", padding: "4px 10px", borderRadius: "6px", cursor: "pointer" }}
                    >
                      Back to Today
                    </button>
                  </div>
                )}

                {/* 2. DAILY PROGRESS CARD — full-width top card matching mockup */}
                <div style={{
                  background: "linear-gradient(135deg, rgba(22, 31, 48, 0.4) 0%, rgba(13, 17, 23, 0.5) 100%)",
                  border: "1px solid rgba(255, 255, 255, 0.05)",
                  borderRadius: "20px",
                  padding: "20px 24px",
                  marginBottom: "24px",
                  display: "flex",
                  alignItems: "center",
                  gap: "24px"
                }}>
                  {/* Circular Progress Ring on Left */}
                  <div style={{ position: "relative", width: "70px", height: "70px", flexShrink: 0 }}>
                    <svg height="70" width="70" style={{ transform: "rotate(-90deg)" }}>
                      <defs>
                        <linearGradient id="progressGradientToday" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#60a5fa" />
                          <stop offset="100%" stopColor="#3b82f6" />
                        </linearGradient>
                      </defs>
                      <circle
                        stroke="rgba(255,255,255,0.04)"
                        fill="transparent"
                        strokeWidth="5"
                        r="30"
                        cx="35"
                        cy="35"
                      />
                      <circle
                        stroke="url(#progressGradientToday)"
                        fill="transparent"
                        strokeWidth="5"
                        strokeDasharray={`${2 * Math.PI * 30}`}
                        strokeDashoffset={`${2 * Math.PI * 30 - (percent / 100) * (2 * Math.PI * 30)}`}
                        style={{
                          transition: 'stroke-dashoffset 0.7s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                        r="30"
                        cx="35"
                        cy="35"
                        strokeLinecap="round"
                      />
                    </svg>
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: "14px", fontWeight: 800, fontFamily: "'Syne', sans-serif" }}>{percent}%</span>
                    </div>
                  </div>

                  {/* Stats on Right */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 700, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.1em" }}>Daily Progress</div>

                    <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: "10px", color: "#6b7280", fontWeight: 600 }}>Completed</div>
                        <div style={{ fontSize: "15px", fontWeight: 800, color: "#fff", marginTop: "2px" }}>
                          {doneOnSelectedDate} <span style={{ fontSize: "11px", color: "#4b5563", fontWeight: 500 }}>/ {totalOnSelectedDate}</span>
                        </div>
                      </div>
                      <div style={{ width: "1px", background: "rgba(255,255,255,0.06)", alignSelf: "stretch", height: "24px" }} />
                      <div>
                        <div style={{ fontSize: "10px", color: "#6b7280", fontWeight: 600 }}>Streak</div>
                        <div style={{ fontSize: "15px", fontWeight: 800, color: "#3b82f6", marginTop: "2px" }}>
                          {currentStreak} days
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dashboard Grid */}
                <div className="ht-dashboard-grid">
                  {/* Left Column: Habits */}
                  <div className="ht-dashboard-main">


                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                      <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "20px", margin: 0, color: "#fff" }}>Habits</h2>
                    </div>

                    {!isPremium && habits.length >= FREE_HABIT_LIMIT && (
                      <div style={{ background: "rgba(37, 99, 235, 0.08)", border: "1px solid rgba(37, 99, 235, 0.15)", borderRadius: "12px", padding: "12px 16px", marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                        <div>
                          <div style={{ color: "#60a5fa", fontWeight: 700, fontSize: "13px" }}>Habit limit reached ({FREE_HABIT_LIMIT}/{FREE_HABIT_LIMIT})</div>
                          <div style={{ color: "#6b7280", fontSize: "11px", marginTop: "2px" }}>Upgrade to Premium for unlimited habits</div>
                        </div>
                        <button onClick={() => setShowUpgradeModal(true)} style={{ padding: "6px 12px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "12px", cursor: "pointer" }}>Upgrade</button>
                      </div>
                    )}

                    {/* Routines & Standalone lists */}
                    {visibleRoutines.length > 0 && (
                      <SortableContext items={visibleRoutines.map(r => r.id)} strategy={rectSortingStrategy}>
                        <div style={{ width: "100%" }}>
                          {visibleRoutines.map(routine => (
                            <RoutineSortableItem
                              key={routine.id}
                              routine={routine}
                              routineHabits={todayHabits.filter(h => h.routine_id && String(h.routine_id) === String(routine.id))}
                              widthFactor={1}
                              flexBasis="100%"
                              today={today}
                              activeDate={selectedDate}
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
                              dragState={activeId}
                              onDragStartHabit={() => { }}
                              onDragEndHabit={() => { }}
                              onDragEnterHabit={() => { }}
                              onDropOnRoutine={() => { }}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    )}

                    <StandaloneHabitsContainer>
                      {todayHabits.filter(h => !isHabitInRoutine(h)).length === 0 && visibleRoutines.length === 0 && (
                        <div style={{ color: "#4b5563", fontSize: "14px", padding: "20px 0", textAlign: "center" }}>
                          {habits.length === 0 ? "No habits yet. Add your first one!" : "No habits scheduled for today."}
                        </div>
                      )}
                      <SortableContext items={todayHabits.filter(h => !isHabitInRoutine(h)).map(h => h.id)} strategy={verticalListSortingStrategy}>
                        {todayHabits.filter(h => !isHabitInRoutine(h)).map(h => (
                          <HabitSortableItem
                            key={h.id}
                            habit={h}
                            today={today}
                            activeDate={selectedDate}
                            onToggle={toggleHabit}
                            onDelete={deleteHabit}
                            isPaused={isPaused}
                            pausePeriods={pausePeriods}
                            isPremium={isPremium}
                            shieldedDates={shieldedDates || []}
                            onEdit={habit => { setEditingHabit(habit); setShowHabitModal(true); }}
                          />
                        ))}
                      </SortableContext>
                    </StandaloneHabitsContainer>

                    {/* Quick Actions Bar */}
                    <div style={{
                      background: "rgba(22, 31, 48, 0.3)",
                      border: "1px solid rgba(255, 255, 255, 0.04)",
                      borderRadius: "20px",
                      padding: "16px",
                      marginTop: "24px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px"
                    }}>
                      <div style={{ display: "flex", gap: "10px", width: "100%" }}>
                        <button
                          onClick={() => { setEditingHabit(null); setShowHabitModal(true); }}
                          style={{ flex: 1, padding: "10px 14px", borderRadius: "12px", border: "1px solid rgba(59, 130, 246, 0.15)", background: "rgba(59, 130, 246, 0.05)", color: "#60a5fa", cursor: "pointer", fontWeight: 700, fontSize: "13px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
                          disabled={!isPremium && habits.length >= FREE_HABIT_LIMIT}
                        >
                          ✨ New Habit
                        </button>
                        <button
                          onClick={() => { setEditingRoutine(null); setShowRoutineModal(true); }}
                          style={{ flex: 1, padding: "10px 14px", borderRadius: "12px", border: "1px solid rgba(167, 139, 250, 0.15)", background: "rgba(167, 139, 250, 0.05)", color: "#a78bfa", cursor: "pointer", fontWeight: 700, fontSize: "13px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
                        >
                          ⚡ New Routine
                        </button>
                      </div>
                      <button
                        onClick={togglePause}
                        style={{ width: "100%", padding: "10px 14px", borderRadius: "12px", border: `1px solid ${isPaused ? "rgba(245, 158, 11, 0.15)" : "rgba(255,255,255,0.04)"}`, background: isPaused ? "rgba(245, 158, 11, 0.05)" : "transparent", color: isPaused ? "#fcd34d" : "#6b7280", cursor: "pointer", fontWeight: 600, fontSize: "12px", textAlign: "center" }}
                      >
                        {isPaused ? "⏸ Holiday Mode ON" : "⏸ Pause / Holiday Mode"}
                      </button>
                    </div>
                  </div>

                  {/* Right Column: Sidebar Stats & Circles */}
                  <div className="ht-dashboard-sidebar">



                    {/* TODAY'S TASKS — relocated to sidebar on desktop / stack on mobile */}
                    {(() => {
                      const todayTasks = visibleTodos.filter(t =>
                        !t.done && (t.due_date === selectedDate || (!t.due_date && !t.done) || (t.due_date && t.due_date <= selectedDate))
                      ).slice(0, 5);
                      const overdueCount = todos.filter(t => !t.done && t.due_date && t.due_date < selectedDate).length;
                      const headingText = selectedDate === today 
                        ? "Today's Tasks" 
                        : `Tasks for ${parseDateLocal(selectedDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`;
                      return (
                        <div className="ht-desktop-only" style={{ marginTop: "24px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                            <h3 style={{ margin: 0, fontSize: "10px", fontWeight: 700, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.1em", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                              <span>{headingText}</span>
                              {overdueCount > 0 && (
                                <span style={{ fontSize: "9px", background: "rgba(239, 68, 68, 0.1)", color: "#f87171", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: "999px", padding: "1px 6px", fontWeight: 700, textTransform: "none", letterSpacing: "normal" }}>
                                  {overdueCount} overdue
                                </span>
                              )}
                            </h3>
                            <button
                              onClick={() => setShowTodoModal(true)}
                              style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", fontWeight: 700, fontSize: "11px", padding: "2px 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}
                            >
                              Add task +
                            </button>
                          </div>
                          {todayTasks.length === 0 ? (
                            <div style={{ color: "#4b5563", fontSize: "12px", padding: "12px 0", fontStyle: "italic" }}>No pending tasks — all caught up! 🎉</div>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              {todayTasks.map(t => (
                                <TodoItem
                                  key={t.id}
                                  todo={t}
                                  onToggle={toggleTodo}
                                  onDelete={deleteTodo}
                                  onEdit={todo => { setEditingTodo(todo); setShowTodoModal(true); }}
                                />
                              ))}
                              {todos.filter(t => !t.done).length > 5 && (
                                <button
                                  onClick={() => setTab("tasks")}
                                  style={{ background: "none", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "10px", color: "#6b7280", cursor: "pointer", fontWeight: 600, fontSize: "11px", padding: "8px", textAlign: "center", marginTop: "4px" }}
                                >
                                  View all {todos.filter(t => !t.done).length} tasks →
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </>
            ) : tab === "tasks" ? (
              /* DEDICATED TASKS (TO-DO LIST) TAB */
              <section style={{ animation: "fadeUp 0.3s ease-out" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                  <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "24px", margin: 0, color: "#fff", letterSpacing: "-0.02em" }}>To-Do List</h2>
                  <button
                    onClick={() => setShowTodoModal(true)}
                    style={{ padding: "8px 16px", borderRadius: "10px", border: "none", background: "#2563eb", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: "13px", boxShadow: "0 4px 12px rgba(37,99,235,0.25)" }}
                  >
                    + Add Task
                  </button>
                </div>

                <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
                  <button onClick={() => setShowCompleted(p => !p)} style={{ padding: "7px 14px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)", background: showCompleted ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.02)", color: "#9ca3af", cursor: "pointer", fontWeight: 600, fontSize: "12px" }}>
                    {showCompleted ? "Hide Completed Tasks" : "Show Completed Tasks"}
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {visibleTodos.length === 0 && (
                    <div style={{ color: "#4b5563", fontSize: "14px", padding: "30px 0", textAlign: "center" }}>No active tasks. Good job!</div>
                  )}
                  {visibleTodos.map(t => (
                    <TodoItem
                      key={t.id}
                      todo={t}
                      onToggle={toggleTodo}
                      onDelete={deleteTodo}
                      onEdit={todo => { setEditingTodo(todo); setShowTodoModal(true); }}
                    />
                  ))}
                </div>
              </section>
            ) : tab === "analytics" ? (
              <AnalyticsTab 
                habits={habits} 
                todos={todos} 
                goals={goals}
                pausePeriods={pausePeriods} 
                isPremium={isPremium} 
                journalEntries={journalEntries} 
                profile={profile} 
                setProfile={setProfile}
                onRecommendHabit={(habitName) => { setEditingHabit({ name: habitName }); setShowHabitModal(true); }}
              />
            ) : tab === "goals" ? (
              <GoalsTab
                goals={goals}
                onAdd={() => { setEditingGoal(null); setShowGoalModal(true); }}
                onEdit={goal => { setEditingGoal(goal); setShowGoalModal(true); }}
                onToggle={toggleGoal}
                onDelete={deleteGoal}
              />
            ) : tab === "journal" ? (
              <JournalTab journalEntries={journalEntries} setJournalEntries={setJournalEntries} session={session} today={today} isPremium={isPremium} />
            ) : null}
          </main>


          <DragOverlay
            modifiers={[restrictToVerticalAxis]}
            dropAnimation={{
              sideEffects: defaultDropAnimationSideEffects({
                styles: {
                  active: {
                    opacity: '0.3',
                  },
                },
              }),
            }}
          >
            {activeId && draggedHabit ? (
              <div style={{
                width: draggedItemWidth ? `${draggedItemWidth}px` : "100%",
                boxSizing: "border-box",
                pointerEvents: "none",
                boxShadow: "0 12px 32px rgba(0,0,0,0.6)",
                borderRadius: "16px"
              }}>
                <HabitCard
                  habit={draggedHabit}
                  today={today}
                  activeDate={selectedDate}
                  onToggle={() => {}}
                  onDelete={() => {}}
                  onEdit={() => {}}
                  isPaused={isPaused}
                  pausePeriods={pausePeriods}
                  isPremium={isPremium}
                  shieldedDates={shieldedDates || []}
                />
              </div>
            ) : activeId && draggedRoutine ? (
              <div style={{
                width: draggedItemWidth ? `${draggedItemWidth}px` : "100%",
                boxSizing: "border-box",
                pointerEvents: "none",
                boxShadow: "0 12px 32px rgba(0,0,0,0.6)",
                borderRadius: "20px"
              }}>
                <RoutineCard
                  routine={draggedRoutine}
                  habits={todayHabits.filter(h => h.routine_id && String(h.routine_id) === String(draggedRoutine.id))}
                  today={today}
                  activeDate={selectedDate}
                  onToggle={() => {}}
                  onDelete={() => {}}
                  onDeleteRoutine={() => {}}
                  onEdit={() => {}}
                  isPaused={isPaused}
                  pausePeriods={pausePeriods}
                  isPremium={isPremium}
                  shieldedDates={shieldedDates || []}
                  isDraggingOverlay
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* MOBILE BOTTOM NAVIGATION — position:fixed so it's always at the viewport bottom */}
      <nav
        className="ht-bottom-nav"
        style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999 }}
      >
        {[
          ["today", "Today"],
          ["tasks", "Tasks"],
          ["journal", "Journal"],
          ["goals", "Goals"],
          ["analytics", "Stats"]
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`ht-bottom-nav-btn ${tab === key ? "active" : ""}`}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "none", background: "none", outline: "none" }}
          >
            {renderTabIcon(key, tab === key, 20)}
            <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.01em", marginTop: "4px" }}>{label}</span>
          </button>
        ))}
      </nav>

      {/* MODALS */}
      {showHabitModal && <HabitModal habit={editingHabit} profile={profile} habits={habits} onSave={saveHabit} onClose={() => { setShowHabitModal(false); setEditingHabit(null); }} />}
      {showTodoModal && <TodoModal todo={editingTodo} onSave={editingTodo && editingTodo.id ? saveTodo : addTodo} onClose={() => { setShowTodoModal(false); setEditingTodo(null); }} />}
      {showRoutineModal && (
        <RoutineModal
          routine={editingRoutine}
          habitsList={habits}
          profile={profile}
          onSave={saveRoutine}
          onDelete={routineId => { deleteRoutine(routineId); setShowRoutineModal(false); setEditingRoutine(null); }}
          onEject={habitId => moveHabitToRoutine(habitId, null)}
          onClose={() => { setShowRoutineModal(false); setEditingRoutine(null); }}
        />
      )}
      {showProfile && (
        <ProfileModal 
          initialTab={profileTab}
          session={session} 
          profile={profile} 
          habits={habits}
          todos={todos}
          goals={goals}
          journalEntries={journalEntries}
          showTodayOnly={showTodayOnly}
          onChangeShowTodayOnly={val => {
            localStorage.setItem("ht_showTodayOnly", String(val));
            setShowTodayOnly(val);
          }}
          hideEmptyRoutines={hideEmptyRoutines}
          onChangeHideEmptyRoutines={val => {
            localStorage.setItem("ht_hideEmptyRoutines", String(val));
            setHideEmptyRoutines(val);
          }}
          onUpdate={setProfile} 
          onClose={() => setShowProfile(false)}
          onUpgrade={handleUpgrade}
        />
      )}
      {showGoalModal && (
        <GoalModal
          goal={editingGoal}
          onSave={editingGoal && editingGoal.id ? (updates) => saveGoal(editingGoal.id, updates) : addGoal}
          onClose={() => { setShowGoalModal(false); setEditingGoal(null); }}
        />
      )}
      {showUpgradeModal && <UpgradeModal onUpgrade={handleUpgrade} onClose={() => setShowUpgradeModal(false)} reason={showUpgradeModal} />}
    </div>
  );
}
