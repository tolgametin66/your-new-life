import React, { useState, useMemo, useContext, createContext, useEffect, useRef } from 'react';
import {
 RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
 LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
 ResponsiveContainer,
} from 'recharts';
import {
 Home as HomeIcon, Target, Plus, Trash2, ChevronDown, ChevronRight,
 Search, X, Check, Menu, Flame, TrendingUp, Sparkles, CircleDot,
} from 'lucide-react';

/* =========================================================================
  1. CONSTANTS & THEMING
  ========================================================================= */

const QUOTES = [
 "Discipline is choosing between what you want now and what you want most. — Abraham Lincoln",
 "We are what we repeatedly do. Excellence, then, is not an act, but a habit. — Aristotle",
 "The person you will be in five years is based on the books you read and the people you spend time with today.",
 "Small daily improvements over time lead to stunning results. — Robin Sharma",
 "You do not rise to the level of your goals. You fall to the level of your systems. — James Clear",
 "The cave you fear to enter holds the treasure you seek. — Joseph Campbell",
 "Between stimulus and response there is a space. In that space is our power to choose. — Viktor Frankl",
];

// Each aspect has a signature color. Crimson leads for "Physical" as the primary accent.
const ASPECT_COLORS = {
 Physical: '#E11D48', // rose-600 (crimson)
 Wisdom:  '#F59E0B', // amber-500
 Network: '#10B981', // emerald-500
 Career:  '#6366F1', // indigo-500
};

// Fallback color generator for user-created aspects.
const EXTRA_COLORS = ['#F472B6', '#06B6D4', '#A78BFA', '#FB923C', '#84CC16'];
const getAspectColor = (aspect, index = 0) =>
 ASPECT_COLORS[aspect.name] || aspect.color || EXTRA_COLORS[index % EXTRA_COLORS.length];

/* =========================================================================
  2. DATE & PERIOD UTILITIES
  =========================================================================
  We support two period types:
   - 'weekly': identified by the Monday of the week, format 'YYYY-MM-DD'
   - 'monthly': identified by 'YYYY-MM'
  A weekly period "belongs" to the month of its Monday date — that is how
  weekly KPIs contribute to the Monthly Achievement Score (MAS).      */

const pad2 = (n) => String(n).padStart(2, '0');

const formatDate = (d) =>
 `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const formatYearMonth = (d) =>
 `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

// Returns the Monday of the ISO week that contains `date`.
function getMondayOf(date) {
 const d = new Date(date);
 const day = d.getDay(); // 0 (Sun) .. 6 (Sat)
 const diff = day === 0 ? -6 : 1 - day; // shift to Monday
 d.setDate(d.getDate() + diff);
 d.setHours(0, 0, 0, 0);
 return d;
}

// Derive the year-month that a weekly period belongs to (based on the Monday).
const weekIdToYearMonth = (weekId) => weekId.slice(0, 7);

// Produce the most recent `count` period IDs of a given type, ending with "now".
function getRecentPeriodIds(period, count, now = new Date()) {
 const ids = [];
 if (period === 'weekly') {
  const monday = getMondayOf(now);
  for (let i = count - 1; i >= 0; i--) {
   const d = new Date(monday);
   d.setDate(monday.getDate() - i * 7);
   ids.push(formatDate(d));
  }
 } else {
  for (let i = count - 1; i >= 0; i--) {
   const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
   ids.push(formatYearMonth(d));
  }
 }
 return ids;
}

// Produce an extended range that includes `pastCount` past periods, the current
// period, and `futureCount` upcoming periods — used by the Tracker Matrix so the
// user can set forward-looking goals on future weeks and months.
function getExtendedPeriodIds(period, pastCount, futureCount, now = new Date()) {
 const ids = [];
 if (period === 'weekly') {
  const monday = getMondayOf(now);
  // past (excluding current)
  for (let i = pastCount; i >= 1; i--) {
   const d = new Date(monday);
   d.setDate(monday.getDate() - i * 7);
   ids.push(formatDate(d));
  }
  // current
  ids.push(formatDate(monday));
  // future
  for (let i = 1; i <= futureCount; i++) {
   const d = new Date(monday);
   d.setDate(monday.getDate() + i * 7);
   ids.push(formatDate(d));
  }
 } else {
  for (let i = pastCount; i >= 1; i--) {
   const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
   ids.push(formatYearMonth(d));
  }
  ids.push(formatYearMonth(now));
  for (let i = 1; i <= futureCount; i++) {
   const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
   ids.push(formatYearMonth(d));
  }
 }
 return ids;
}

// Is this period ID strictly in the future relative to now?
function isFuturePeriod(periodId, period, now = new Date()) {
 if (period === 'weekly') {
  return new Date(periodId) > getMondayOf(now);
 }
 return periodId > formatYearMonth(now);
}

// Human labels for the matrix header.
function formatPeriodLabel(periodId, period) {
 if (period === 'monthly') {
  const [y, m] = periodId.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString('en-US', { month: 'short' }) + ` '${String(y).slice(2)}`;
 }
 const d = new Date(periodId);
 return `${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}`;
}

const getCurrentPeriodId = (period) =>
 period === 'weekly' ? formatDate(getMondayOf(new Date())) : formatYearMonth(new Date());

/* =========================================================================
  3. SCORING ENGINE
  =========================================================================
  The scoring system is the heart of the app. Three layered calculations:

   (a) KPI Monthly Achievement Score (MAS)
     MAS = (successful periods in that month / total periods in that month) × 10
     — For weekly KPIs: "periods" = Mondays whose month equals the target month
     — For monthly KPIs: "periods" = that single month (so MAS is 0 or 10)

   (b) Aspect Monthly MAS
     Simple arithmetic mean of the MAS of all active KPIs under the aspect.

   (c) Cumulative Aspect Score (what the Radar Chart displays)
     = current month MAS + Σ (MAS of every previous month since inception)

   (d) KPI Streak
     Consecutive 1s counted backward from the most recent period (inclusive).
  ========================================================================= */

// (a) KPI MAS for a target YYYY-MM.
function calculateKPIMonthlyMAS(kpi, entries, yearMonth) {
 // Find all periods belonging to this month for this KPI
 const relevant = entries.filter((e) => {
  if (e.kpiId !== kpi.id) return false;
  const periodMonth = kpi.period === 'weekly'
   ? weekIdToYearMonth(e.periodId)
   : e.periodId;
  return periodMonth === yearMonth;
 });

 if (relevant.length === 0) return 0;
 const successful = relevant.filter((e) => e.value === 1).length;
 return (successful / relevant.length) * 10;
}

// (b) Aspect MAS for a target YYYY-MM (mean of KPI MAS values).
function calculateAspectMonthlyMAS(aspectId, kpis, entries, yearMonth) {
 const aspectKPIs = kpis.filter((k) => k.aspectId === aspectId && k.status === 'active');
 if (aspectKPIs.length === 0) return 0;
 const total = aspectKPIs.reduce(
  (acc, k) => acc + calculateKPIMonthlyMAS(k, entries, yearMonth),
  0,
 );
 return total / aspectKPIs.length;
}

// Build a sorted list of every month that has at least one entry (for any KPI under an aspect).
function getMonthsForAspect(aspectId, kpis, entries) {
 const aspectKPIIds = new Set(
  kpis.filter((k) => k.aspectId === aspectId).map((k) => k.id),
 );
 const monthSet = new Set();
 entries.forEach((e) => {
  if (!aspectKPIIds.has(e.kpiId)) return;
  const ym = e.kpiId && kpis.find((k) => k.id === e.kpiId)?.period === 'weekly'
   ? weekIdToYearMonth(e.periodId)
   : e.periodId;
  monthSet.add(ym);
 });
 return [...monthSet].sort();
}

// (c) Cumulative aspect score: current month MAS + all previous months' MAS summed.
function calculateCumulativeAspectScore(aspectId, kpis, entries) {
 const months = getMonthsForAspect(aspectId, kpis, entries);
 const currentYM = formatYearMonth(new Date());
 // Ensure current month is included even if empty so we always reflect "now".
 if (!months.includes(currentYM)) months.push(currentYM);
 return months.reduce(
  (acc, ym) => acc + calculateAspectMonthlyMAS(aspectId, kpis, entries, ym),
  0,
 );
}

// (d) Streak: consecutive 1s from the most recent period backwards.
function calculateStreak(kpi, entries, periodsToScan = 26) {
 const periodIds = getRecentPeriodIds(kpi.period, periodsToScan);
 const entryByPeriod = new Map(
  entries.filter((e) => e.kpiId === kpi.id).map((e) => [e.periodId, e.value]),
 );
 let streak = 0;
 // walk backward from most recent period
 for (let i = periodIds.length - 1; i >= 0; i--) {
  const v = entryByPeriod.get(periodIds[i]);
  if (v === 1) streak += 1;
  else break;
 }
 return streak;
}

// Current-month KPI score, shown on the management page for quick reference.
function getKPICurrentScore(kpi, entries) {
 return calculateKPIMonthlyMAS(kpi, entries, formatYearMonth(new Date()));
}

// Historical line-chart series: for each month in the union of entry months, the
// cumulative score of each active aspect up to and including that month.
function buildHistoricalSeries(aspects, kpis, entries) {
 const activeAspects = aspects.filter((a) => a.status === 'active');
 const allMonths = new Set();
 entries.forEach((e) => {
  const kpi = kpis.find((k) => k.id === e.kpiId);
  if (!kpi) return;
  const ym = kpi.period === 'weekly' ? weekIdToYearMonth(e.periodId) : e.periodId;
  allMonths.add(ym);
 });
 const months = [...allMonths].sort();
 // cumulative per aspect, accumulated month by month
 const running = Object.fromEntries(activeAspects.map((a) => [a.id, 0]));
 return months.map((ym) => {
  const row = { month: ym };
  activeAspects.forEach((a) => {
   running[a.id] += calculateAspectMonthlyMAS(a.id, kpis, entries, ym);
   row[a.name] = Number(running[a.id].toFixed(2));
  });
  return row;
 });
}

/* =========================================================================
  4. SEED DATA
  ========================================================================= */

const SEED_ASPECTS = [
 { id: 'a1', name: 'Physical', description: 'Body, health, and sustained energy.', status: 'active', createdAt: '2025-10-01' },
 { id: 'a2', name: 'Wisdom',  description: 'Knowledge, reading, and deliberate reflection.', status: 'active', createdAt: '2025-10-01' },
 { id: 'a3', name: 'Network', description: 'Relationships, community, and connection.', status: 'active', createdAt: '2025-10-01' },
 { id: 'a4', name: 'Career',  description: 'Craft, impact, and professional growth.', status: 'active', createdAt: '2025-10-01' },
];

const SEED_KPIS = [
 { id: 'k1', aspectId: 'a1', name: 'Workout Session',   description: '45+ min training block',  period: 'weekly', status: 'active' },
 { id: 'k2', aspectId: 'a1', name: 'Sleep 7+ hours',   description: 'Full night\'s rest',    period: 'weekly', status: 'active' },
 { id: 'k3', aspectId: 'a1', name: 'Full Health Review', description: 'Monthly bloodwork check', period: 'monthly', status: 'active' },

 { id: 'k4', aspectId: 'a2', name: 'Read a Chapter',   description: 'Non-fiction reading',    period: 'weekly', status: 'active' },
 { id: 'k5', aspectId: 'a2', name: 'Journal Reflection', description: 'Weekly written entry',   period: 'weekly', status: 'active' },
 { id: 'k6', aspectId: 'a2', name: 'Finish a Course Module', description: 'Online learning',    period: 'monthly', status: 'active' },

 { id: 'k7', aspectId: 'a3', name: 'Reach Out to a Friend', description: 'Meaningful message or call', period: 'weekly', status: 'active' },
 { id: 'k8', aspectId: 'a3', name: 'Attend an Event',   description: 'Meetup, dinner, gathering', period: 'monthly', status: 'active' },

 { id: 'k9', aspectId: 'a4', name: 'Deep Work Block',   description: '4hr uninterrupted focus',  period: 'weekly', status: 'active' },
 { id: 'k10', aspectId: 'a4', name: 'Ship a Milestone',  description: 'Project deliverable',    period: 'monthly', status: 'active' },
];

/* =========================================================================
  5a. LOCAL STORAGE
  =========================================================================
  Single JSON blob under one key. Persistence is transparent to the rest
  of the app — load once on mount, save on every state change.              */

const STORAGE_KEY = 'your-new-life-os-v1';

function loadFromStorage() {
 try {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  // Minimal shape validation: all three arrays must be present.
  if (!parsed || !Array.isArray(parsed.aspects) ||
    !Array.isArray(parsed.kpis) || !Array.isArray(parsed.entries)) {
   return null;
  }
  return parsed;
 } catch {
  // Corrupted JSON, quota errors, or disabled storage — fall back to defaults.
  return null;
 }
}

function saveToStorage(snapshot) {
 try {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
 } catch {
  // Silently ignore quota or access errors — app still works in memory.
 }
}

/* =========================================================================
  5. APP CONTEXT — single source of truth for all mutations
  ========================================================================= */

const AppContext = createContext(null);
const useApp = () => useContext(AppContext);

function AppProvider({ children }) {
 // Load persisted snapshot (if any) on first render.
 const persisted = loadFromStorage();

 // Aspects & KPIs default to the seed scaffold so the user has something
 // meaningful to interact with on day one. Entries start EMPTY — the
 // aggregate score is 0 and rises only as checkboxes are toggled.
 const [aspects, setAspects] = useState(persisted?.aspects ?? SEED_ASPECTS);
 const [kpis, setKpis]    = useState(persisted?.kpis  ?? SEED_KPIS);
 const [entries, setEntries] = useState(persisted?.entries ?? []);

 // Save-on-change: every mutation to the three core arrays triggers a
 // debounced-free localStorage write. JSON is small (< 50KB even after
 // years of use), so synchronous writes are fine here.
 useEffect(() => {
  saveToStorage({ aspects, kpis, entries });
 }, [aspects, kpis, entries]);

 const [currentPage, setCurrentPage]  = useState('home');   // 'home' | 'aspects'
 const [aspectFilter, setAspectFilter] = useState(null);    // aspect id or null
 const [searchQuery, setSearchQuery]  = useState('');
 const [sidebarOpen, setSidebarOpen]  = useState(false);    // mobile drawer

 // ----- mutations -----
 const addAspect = (name, description) => {
  const id = `a_${Date.now()}`;
  setAspects((prev) => [...prev, {
   id, name, description, status: 'active', createdAt: new Date().toISOString(),
  }]);
 };

 const addKPI = (aspectId, name, description, period) => {
  const id = `k_${Date.now()}`;
  setKpis((prev) => [...prev, {
   id, aspectId, name, description, period, status: 'active',
  }]);
 };

 // Soft delete: flag as 'trash' — historical entries remain so scores stay intact.
 const softDeleteAspect = (aspectId) => {
  setAspects((prev) => prev.map((a) => a.id === aspectId ? { ...a, status: 'trash' } : a));
  setKpis((prev) => prev.map((k) => k.aspectId === aspectId ? { ...k, status: 'trash' } : k));
 };
 const softDeleteKPI = (kpiId) => {
  setKpis((prev) => prev.map((k) => k.id === kpiId ? { ...k, status: 'trash' } : k));
 };

 // Toggle a single cell (kpi × period) on the tracker matrix.
 const toggleEntry = (kpiId, periodId) => {
  setEntries((prev) => {
   const idx = prev.findIndex((e) => e.kpiId === kpiId && e.periodId === periodId);
   if (idx === -1) {
    return [...prev, { kpiId, periodId, value: 1 }];
   }
   const next = [...prev];
   next[idx] = { ...next[idx], value: next[idx].value === 1 ? 0 : 1 };
   return next;
  });
 };

 const activeAspects = aspects.filter((a) => a.status === 'active');
 const activeKPIs  = kpis.filter((k) => k.status === 'active');

 const value = {
  aspects, activeAspects, kpis, activeKPIs, entries,
  addAspect, addKPI, softDeleteAspect, softDeleteKPI, toggleEntry,
  currentPage, setCurrentPage,
  aspectFilter, setAspectFilter,
  searchQuery, setSearchQuery,
  sidebarOpen, setSidebarOpen,
 };

 return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/* =========================================================================
  6. LAYOUT — Banner, Sidebar, Header
  ========================================================================= */

// Rotates the quote deterministically based on day-of-year so every day the
// user sees the same quote, but it feels fresh tomorrow.
function useDailyQuote() {
 return useMemo(() => {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const doy = Math.floor((now - start) / 86400000);
  return QUOTES[doy % QUOTES.length];
 }, []);
}

function TopBanner() {
 const quote = useDailyQuote();
 return (
  <header
   className="sticky top-0 z-40 border-b border-neutral-800 backdrop-blur-xl"
   style={{ background: 'rgba(8, 8, 10, 0.85)' }}
  >
   {/* accent bar */}
   <div className="accent-bar w-full" style={{ background: 'linear-gradient(90deg, transparent, #E11D48, transparent)' }} />
   <div className="container-xl mx-auto px-6 py-5 flex items-center justify-between gap-6">
    <div className="flex items-center gap-4 min-w-0">
     <div
      className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
      style={{ background: 'linear-gradient(135deg, #E11D48 0%, #881337 100%)', boxShadow: '0 0 30px rgba(225,29,72,0.35)' }}
     >
      <CircleDot size={18} className="text-white" />
     </div>
     <div className="min-w-0">
      <h1 className="font-display text-3xl md:text-4xl tracking-tight text-neutral-50 leading-none">
       Your New Life<span className="text-rose-600">.</span>
      </h1>
      <p className="label-mini text-neutral-500 mt-1 font-mono-ui">
       Self-Development OS
      </p>
     </div>
    </div>
    <div className="hidden md:flex items-center gap-3 max-w-xl">
     <Sparkles size={14} className="text-rose-600 shrink-0" />
     <p className="font-display italic text-sm text-neutral-300 leading-snug truncate">
      {quote}
     </p>
    </div>
   </div>
  </header>
 );
}

function Sidebar() {
 const {
  currentPage, setCurrentPage,
  activeAspects, aspectFilter, setAspectFilter,
  sidebarOpen, setSidebarOpen,
 } = useApp();
 const [dashOpen, setDashOpen] = useState(true);

 const goto = (page, filter = null) => {
  setCurrentPage(page);
  setAspectFilter(filter);
  setSidebarOpen(false);
 };

 const SidebarInner = (
  <nav className="flex flex-col gap-1 p-5 h-full">
   <div className="label-micro text-neutral-500 mb-3 font-mono-ui px-2">
    Navigation
   </div>

   <button
    onClick={() => goto('home')}
    className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors
     ${currentPage === 'home' && !aspectFilter
      ? 'bg-rose-600/10 text-rose-400 border border-rose-600/30'
      : 'text-neutral-300 hover:bg-neutral-800/60 border border-transparent'}`}
   >
    <HomeIcon size={16} /> Home
   </button>

   <button
    onClick={() => goto('aspects')}
    className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors
     ${currentPage === 'aspects'
      ? 'bg-rose-600/10 text-rose-400 border border-rose-600/30'
      : 'text-neutral-300 hover:bg-neutral-800/60 border border-transparent'}`}
   >
    <Target size={16} /> Key Life Aspects & KPIs
   </button>

   {/* Dashboard dropdown */}
   <button
    onClick={() => setDashOpen((v) => !v)}
    className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-md text-sm text-neutral-300 hover:bg-neutral-800/60 mt-4 border border-transparent"
   >
    <span className="flex items-center gap-3">
     <TrendingUp size={16} /> Dashboard
    </span>
    <ChevronDown size={14} className={`transition-transform ${dashOpen ? '' : '-rotate-90'}`} />
   </button>
   {dashOpen && (
    <div className="ml-2 pl-3 border-l border-neutral-800 flex flex-col gap-0.5 mt-1">
     {activeAspects.map((a, i) => (
      <button
       key={a.id}
       onClick={() => goto('home', a.id)}
       className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-13 transition-colors text-left
        ${aspectFilter === a.id
         ? 'bg-neutral-800 text-neutral-100'
         : 'text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200'}`}
      >
       <span className="h-1.5 w-1.5 rounded-full" style={{ background: getAspectColor(a, i) }} />
       {a.name}
      </button>
     ))}
    </div>
   )}

   <div className="mt-auto label-micro text-neutral-600 p-2 font-mono-ui">
    v1.0 · Built with intent
   </div>
  </nav>
 );

 return (
  <>
   {/* Desktop */}
   <aside className="hidden lg:block w-64 shrink-0 border-r border-neutral-800 sticky sticky-under-banner self-start sidebar-h overflow-y-auto">
    {SidebarInner}
   </aside>

   {/* Mobile drawer */}
   {sidebarOpen && (
    <div className="lg:hidden fixed inset-0 z-50">
     <div className="absolute inset-0 bg-black/70" onClick={() => setSidebarOpen(false)} />
     <aside className="absolute left-0 top-0 h-full w-72 bg-neutral-950 border-r border-neutral-800 overflow-y-auto">
      <div className="flex justify-between items-center p-4 border-b border-neutral-800">
       <span className="font-display text-xl text-neutral-100">Menu</span>
       <button onClick={() => setSidebarOpen(false)} className="p-1 text-neutral-400">
        <X size={20} />
       </button>
      </div>
      {SidebarInner}
     </aside>
    </div>
   )}
  </>
 );
}

function Header() {
 const { searchQuery, setSearchQuery, setSidebarOpen, currentPage } = useApp();
 return (
  <div className="sticky sticky-under-banner z-30 border-b border-neutral-800 backdrop-blur-xl" style={{ background: 'rgba(8,8,10,0.8)' }}>
   <div className="container-xl mx-auto px-6 py-4 flex items-center gap-4">
    <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 text-neutral-300 hover:bg-neutral-800/60 rounded-md">
     <Menu size={18} />
    </button>
    <div className="relative flex-1 max-w-xl">
     <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
     <input
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      placeholder="Search aspects or KPIs…"
      className="w-full bg-neutral-900 border border-neutral-800 rounded-md pl-10 pr-4 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-rose-600/50 focus:ring-1 focus:ring-rose-600/30 transition"
     />
    </div>
    <div className="hidden sm:flex items-center gap-2 text-xs text-neutral-500 font-mono-ui">
     <span className="h-1.5 w-1.5 rounded-full bg-rose-600 animate-pulse" />
     {currentPage === 'home' ? 'DASHBOARD' : 'MANAGEMENT'}
    </div>
   </div>
  </div>
 );
}

/* =========================================================================
  7. HOME PAGE — Radar, Matrix, Line Chart
  ========================================================================= */

function HomePage() {
 const { activeAspects, activeKPIs, entries, aspectFilter, searchQuery } = useApp();

 // Filter logic drives both radar and matrix visibility.
 const aspectsToShow = aspectFilter
  ? activeAspects.filter((a) => a.id === aspectFilter)
  : activeAspects;

 const searchLower = searchQuery.trim().toLowerCase();
 const matchesSearch = (text) => !searchLower || text.toLowerCase().includes(searchLower);
 const kpisToShow = activeKPIs.filter((k) => {
  const aspect = activeAspects.find((a) => a.id === k.aspectId);
  if (!aspect) return false;
  if (!aspectsToShow.some((a) => a.id === aspect.id)) return false;
  if (!searchLower) return true;
  return matchesSearch(k.name) || matchesSearch(aspect.name);
 });

 return (
  <div className="container-xl mx-auto px-6 py-8">
   {/* Page header */}
   <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
    <div>
     <div className="label-mini text-rose-500 font-mono-ui mb-2">
      {aspectFilter ? 'Filtered View' : 'Overview'}
     </div>
     <h2 className="font-display text-4xl md:text-5xl text-neutral-50 tracking-tight">
      {aspectFilter
       ? activeAspects.find((a) => a.id === aspectFilter)?.name
       : 'Progress Dashboard'}
     </h2>
    </div>
    <StatStrip />
   </div>

   {/* Top row: Radar + Matrix */}
   <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 mb-6">
    <div className="xl:col-span-2">
     <RadarSection aspects={aspectsToShow} />
    </div>
    <div className="xl:col-span-3">
     <MatrixSection kpis={kpisToShow} aspects={aspectsToShow} />
    </div>
   </div>

   {/* Bottom row: historical line chart */}
   <HistoricalSection aspects={aspectsToShow} />
  </div>
 );
}

function StatStrip() {
 const { activeAspects, activeKPIs, kpis, entries } = useApp();
 const totalSuccesses = entries.filter((e) => e.value === 1).length;
 const streaks = activeKPIs.map((k) => calculateStreak(k, entries));
 const topStreak = Math.max(0, ...streaks);

 const items = [
  { label: 'Aspects', value: activeAspects.length },
  { label: 'KPIs',  value: activeKPIs.length },
  { label: 'Top Streak', value: topStreak, icon: <Flame size={12} className="text-rose-500" /> },
  { label: 'Total Wins', value: totalSuccesses },
 ];
 return (
  <div className="flex gap-3 flex-wrap">
   {items.map((s) => (
    <div key={s.label} className="bg-neutral-900/60 border border-neutral-800 rounded-md px-4 py-2.5 stat-min">
     <div className="label-micro text-neutral-500 font-mono-ui flex items-center gap-1.5">
      {s.icon}{s.label}
     </div>
     <div className="font-mono-ui text-xl text-neutral-100 mt-0.5">{s.value}</div>
    </div>
   ))}
  </div>
 );
}

/* ----- Radar ----- */
function RadarSection({ aspects }) {
 const { kpis, entries } = useApp();

 // Round to exactly 2 decimal places for every value surfaced to the UI.
 const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

 const radarData = aspects.map((a, i) => ({
  aspect: a.name,
  score: round2(calculateCumulativeAspectScore(a.id, kpis, entries)),
  color: getAspectColor(a, i),
 }));

 const total = round2(radarData.reduce((acc, r) => acc + r.score, 0));
 const max = Math.max(10, ...radarData.map((r) => r.score)) * 1.15;

 return (
  <div className="bg-neutral-900/40 border border-neutral-800 rounded-lg p-6 h-full relative overflow-hidden">
   {/* subtle radial glow */}
   <div
    className="absolute inset-0 opacity-30 pointer-events-none"
    style={{ background: 'radial-gradient(circle at 50% 50%, rgba(225,29,72,0.15), transparent 60%)' }}
   />
   <div className="relative">
    <div className="flex items-start justify-between mb-4 gap-4">
     <div>
      <div className="label-mini text-neutral-500 font-mono-ui">
       Life Balance
      </div>
      <h3 className="font-display text-xl text-neutral-100 mt-0.5">Aspect Radar</h3>
     </div>
     <div className="text-right shrink-0">
      <div className="label-micro text-neutral-500 font-mono-ui">
       Total Aggregate
      </div>
      <div className="font-display text-3xl text-rose-500 leading-none mt-1">
       {total.toFixed(2)}
      </div>
     </div>
    </div>

    <div className="relative radar-h">
     <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={radarData} outerRadius="75%">
       <PolarGrid stroke="#404040" strokeDasharray="2 3" />
       <PolarAngleAxis
        dataKey="aspect"
        tick={{ fill: '#d4d4d4', fontSize: 12, fontFamily: 'Fraunces, serif' }}
       />
       <PolarRadiusAxis
        domain={[0, max]}
        tick={{ fill: '#737373', fontSize: 10 }}
        axisLine={false}
        tickCount={5}
        tickFormatter={(v) => round2(v).toFixed(2)}
       />
       <Radar
        dataKey="score"
        stroke="#E11D48"
        fill="#E11D48"
        fillOpacity={0.35}
        strokeWidth={2}
        dot={{ fill: '#E11D48', r: 3 }}
       />
       <Tooltip
        contentStyle={{
         background: '#0a0a0a',
         border: '1px solid #262626',
         borderRadius: 6,
         color: '#fafafa',
         fontSize: 12,
        }}
        formatter={(v) => [round2(v).toFixed(2), 'Cumulative']}
       />
      </RadarChart>
     </ResponsiveContainer>
    </div>

    {/* legend */}
    <div className="flex flex-wrap gap-3 mt-5 pt-4 border-t border-neutral-800">
     {radarData.map((r) => (
      <div key={r.aspect} className="flex items-center gap-2 text-xs">
       <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
       <span className="text-neutral-400">{r.aspect}</span>
       <span className="text-neutral-100 font-mono-ui">{r.score.toFixed(2)}</span>
      </div>
     ))}
    </div>
   </div>
  </div>
 );
}

/* ----- Matrix ----- */
function MatrixSection({ kpis, aspects }) {
 const [periodType, setPeriodType] = useState('weekly');
 const { entries, toggleEntry } = useApp();
 const scrollRef = useRef(null);

 const filteredKPIs = kpis.filter((k) => k.period === periodType);
 const kpisByAspect = aspects
  .map((a) => ({
   aspect: a,
   kpis: filteredKPIs.filter((k) => k.aspectId === a.id),
  }))
  .filter((group) => group.kpis.length > 0);

 // Extended matrix: past + current + future for predictive entry & goal setting.
 // Weekly: 11 past + current + 4 future = 16 columns.
 // Monthly: 7 past + current + 3 future = 11 columns.
 const pastCount  = periodType === 'weekly' ? 11 : 7;
 const futureCount = periodType === 'weekly' ? 4 : 3;
 const periodIds = getExtendedPeriodIds(periodType, pastCount, futureCount);
 const currentPeriod = getCurrentPeriodId(periodType);
 const currentIndex = periodIds.indexOf(currentPeriod);

 // Anchor the initial scroll position to the current period so it appears as
 // the first visible column just after the sticky KPI-name column. Past periods
 // remain accessible by scrolling left; future periods sit to the right.
 // Each period column is w-16 (64px). Re-fires when periodType changes.
 useEffect(() => {
  if (scrollRef.current && currentIndex >= 0) {
   scrollRef.current.scrollLeft = currentIndex * 64;
  }
 }, [periodType, currentIndex]);

 return (
  <div className="bg-neutral-900/40 border border-neutral-800 rounded-lg h-full flex flex-col">
   <div className="flex flex-wrap items-center justify-between gap-3 p-6 border-b border-neutral-800">
    <div>
     <div className="label-mini text-neutral-500 font-mono-ui">
      Execution Grid · Past → Future
     </div>
     <h3 className="font-display text-xl text-neutral-100 mt-0.5">Tracker Matrix</h3>
    </div>
    <div className="flex bg-neutral-950 border border-neutral-800 rounded-md p-0.5">
     {['weekly', 'monthly'].map((p) => (
      <button
       key={p}
       onClick={() => setPeriodType(p)}
       className={`px-3.5 py-1.5 text-xs uppercase tracking-wider font-mono-ui rounded transition-colors
        ${periodType === p
         ? 'bg-rose-600 text-white'
         : 'text-neutral-400 hover:text-neutral-200'}`}
      >
       {p}
      </button>
     ))}
    </div>
   </div>

   {kpisByAspect.length === 0 ? (
    <div className="flex-1 flex items-center justify-center p-12 text-center">
     <div>
      <div className="font-display text-lg text-neutral-300">No {periodType} KPIs to show.</div>
      <div className="text-sm text-neutral-500 mt-1">Add some from the Key Life Aspects page.</div>
     </div>
    </div>
   ) : (
    <div ref={scrollRef} className="flex-1 overflow-x-auto">
     <div className="min-w-max">
      {/* Header row */}
      <div className="flex sticky top-0 bg-neutral-950/90 border-b border-neutral-800 z-10">
       <div className="w-64 shrink-0 p-3 label-micro text-neutral-500 font-mono-ui sticky left-0 bg-neutral-950/90 border-r border-neutral-800">
        KPI / {periodType}
       </div>
       {periodIds.map((pid) => {
        const isCurrent = pid === currentPeriod;
        const isFuture = isFuturePeriod(pid, periodType);
        return (
         <div
          key={pid}
          className={`w-16 shrink-0 p-2 text-center label-micro font-mono-ui
           ${isCurrent ? 'text-rose-500'
            : isFuture ? 'text-neutral-600 italic'
            : 'text-neutral-500'}`}
         >
          {formatPeriodLabel(pid, periodType)}
          {isCurrent && <div className="h-0.5 w-full bg-rose-600 mt-1.5 rounded-full" />}
          {isFuture && !isCurrent && (
           <div className="h-0.5 w-full mt-1.5 rounded-full" style={{ background: '#404040', backgroundImage: 'repeating-linear-gradient(90deg, #525252 0 3px, transparent 3px 6px)' }} />
          )}
         </div>
        );
       })}
      </div>

      {/* Body rows */}
      {kpisByAspect.map(({ aspect, kpis: aspectKPIs }, i) => (
       <div key={aspect.id}>
        <div className="flex bg-neutral-900/40 border-b border-neutral-800/50">
         <div
          className="w-64 shrink-0 p-2 pl-3 sticky left-0 bg-neutral-900/80 flex items-center gap-2 border-r border-neutral-800"
         >
          <span
           className="h-1.5 w-1.5 rounded-full"
           style={{ background: getAspectColor(aspect, i) }}
          />
          <span className="label-micro font-mono-ui text-neutral-400">
           {aspect.name}
          </span>
         </div>
        </div>
        {aspectKPIs.map((kpi) => {
         const streak = calculateStreak(kpi, entries);
         return (
          <div key={kpi.id} className="flex hover:bg-neutral-900/50 border-b border-neutral-800/50">
           <div className="w-64 shrink-0 p-3 sticky left-0 bg-neutral-950 border-r border-neutral-800">
            <div className="text-sm text-neutral-100 truncate">{kpi.name}</div>
            <div className="flex items-center gap-2 mt-0.5">
             <span className="label-micro text-neutral-500 font-mono-ui">
              MAS {getKPICurrentScore(kpi, entries).toFixed(2)}
             </span>
             {streak > 0 && (
              <span className="flex items-center gap-1 label-micro text-rose-500 font-mono-ui">
               <Flame size={10} /> {streak}
              </span>
             )}
            </div>
           </div>
           {periodIds.map((pid) => {
            const entry = entries.find((e) => e.kpiId === kpi.id && e.periodId === pid);
            const isChecked = entry?.value === 1;
            const isCurrent = pid === currentPeriod;
            const isFuture = isFuturePeriod(pid, periodType);
            return (
             <button
              key={pid}
              onClick={() => toggleEntry(kpi.id, pid)}
              className={`w-16 h-14 shrink-0 flex items-center justify-center border-r border-neutral-800/30 transition-all group
               ${isCurrent ? 'bg-rose-600/5' : ''}
               ${isFuture && !isCurrent ? 'bg-neutral-900/30' : ''}`}
              aria-label={`Toggle ${kpi.name} for ${pid}`}
              title={isFuture ? `Goal for ${formatPeriodLabel(pid, periodType)}` : undefined}
             >
              <span
               className={`h-7 w-7 rounded-md flex items-center justify-center transition-all
                ${isChecked
                 ? (isFuture
                  ? 'bg-rose-600/40 border border-rose-500/60 border-dashed'
                  : 'bg-rose-600 border border-rose-500')
                 : (isFuture
                  ? 'bg-transparent border border-dashed border-neutral-700 group-hover:border-rose-700'
                  : 'bg-neutral-800/40 border border-neutral-700 group-hover:border-rose-700')}`}
              >
               {isChecked && <Check size={14} className={isFuture ? 'text-rose-200' : 'text-white'} strokeWidth={3} />}
              </span>
             </button>
            );
           })}
          </div>
         );
        })}
       </div>
      ))}
     </div>
    </div>
   )}
  </div>
 );
}

/* ----- Historical Line Chart ----- */
function HistoricalSection({ aspects }) {
 const { kpis, entries } = useApp();
 const data = useMemo(
  () => buildHistoricalSeries(aspects, kpis, entries),
  [aspects, kpis, entries],
 );

 return (
  <div className="bg-neutral-900/40 border border-neutral-800 rounded-lg p-6">
   <div className="flex items-center justify-between mb-6">
    <div>
     <div className="label-mini text-neutral-500 font-mono-ui">
      Trajectory
     </div>
     <h3 className="font-display text-xl text-neutral-100 mt-0.5">
      Historical Cumulative Progress
     </h3>
    </div>
    <div className="text-xs text-neutral-500 font-mono-ui hidden sm:block">
     month-over-month
    </div>
   </div>

   <div className="line-h">
    <ResponsiveContainer width="100%" height="100%">
     <LineChart data={data} margin={{ top: 10, right: 20, bottom: 0, left: -10 }}>
      <CartesianGrid strokeDasharray="2 4" stroke="#262626" vertical={false} />
      <XAxis
       dataKey="month"
       stroke="#737373"
       tick={{ fill: '#a3a3a3', fontSize: 11 }}
       tickFormatter={(ym) => formatPeriodLabel(ym, 'monthly')}
       axisLine={{ stroke: '#404040' }}
      />
      <YAxis
       stroke="#737373"
       tick={{ fill: '#a3a3a3', fontSize: 11 }}
       axisLine={{ stroke: '#404040' }}
      />
      <Tooltip
       contentStyle={{
        background: '#0a0a0a',
        border: '1px solid #262626',
        borderRadius: 6,
        color: '#fafafa',
        fontSize: 12,
       }}
       labelFormatter={(ym) => formatPeriodLabel(ym, 'monthly')}
      />
      <Legend
       wrapperStyle={{ fontSize: 12, color: '#a3a3a3', paddingTop: 10 }}
       iconType="plainline"
      />
      {aspects.map((a, i) => (
       <Line
        key={a.id}
        type="monotone"
        dataKey={a.name}
        stroke={getAspectColor(a, i)}
        strokeWidth={2}
        dot={{ r: 3, strokeWidth: 0, fill: getAspectColor(a, i) }}
        activeDot={{ r: 5 }}
       />
      ))}
     </LineChart>
    </ResponsiveContainer>
   </div>
  </div>
 );
}

/* =========================================================================
  8. ASPECTS & KPIs MANAGEMENT PAGE
  ========================================================================= */

function AspectsKPIsPage() {
 const { activeAspects, activeKPIs, searchQuery } = useApp();
 const [addAspectOpen, setAddAspectOpen] = useState(false);

 // Multi-field search: an aspect is shown if either (a) its own name matches,
 // OR (b) it contains at least one KPI whose name or description matches.
 const searchLower = searchQuery.trim().toLowerCase();
 const kpiMatches = (k) =>
  k.name.toLowerCase().includes(searchLower) ||
  (k.description || '').toLowerCase().includes(searchLower);
 const displayedAspects = !searchLower
  ? activeAspects
  : activeAspects.filter((a) => {
    if (a.name.toLowerCase().includes(searchLower)) return true;
    return activeKPIs.some((k) => k.aspectId === a.id && kpiMatches(k));
   });

 return (
  <div className="container-xl mx-auto px-6 py-8">
   <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
    <div>
     <div className="label-mini text-rose-500 font-mono-ui mb-2">
      Architecture
     </div>
     <h2 className="font-display text-4xl md:text-5xl text-neutral-50 tracking-tight">
      Key Life Aspects & KPIs
     </h2>
     <p className="text-neutral-400 mt-2 max-w-2xl">
      Sculpt the categories of your life. Each aspect holds its own KPIs.
      Historical scores are preserved even after deletion.
     </p>
    </div>
    <button
     onClick={() => setAddAspectOpen(true)}
     className="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white px-4 py-2.5 rounded-md text-sm font-medium transition-colors"
     style={{ boxShadow: '0 4px 20px rgba(225,29,72,0.35)' }}
    >
     <Plus size={16} /> Add Aspect
    </button>
   </div>

   <div className="flex flex-col gap-3">
    {displayedAspects.length === 0 && (
     <div className="bg-neutral-900/40 border border-dashed border-neutral-800 rounded-lg p-12 text-center">
      <div className="font-display text-lg text-neutral-300">No aspects found.</div>
      <div className="text-sm text-neutral-500 mt-1">
       {searchLower ? 'Try a different search.' : 'Create your first Key Life Aspect to begin.'}
      </div>
     </div>
    )}
    {displayedAspects.map((aspect, i) => (
     <AspectRow key={aspect.id} aspect={aspect} colorIndex={i} />
    ))}
   </div>

   {addAspectOpen && <AddAspectFlow onClose={() => setAddAspectOpen(false)} />}
  </div>
 );
}

function AspectRow({ aspect, colorIndex }) {
 const { activeKPIs, entries, softDeleteAspect, softDeleteKPI, searchQuery } = useApp();
 const [open, setOpen] = useState(true);
 const [addKPIOpen, setAddKPIOpen] = useState(false);
 const [confirmDelete, setConfirmDelete] = useState(null); // {type, id, name} | null
 const [selectedKPIs, setSelectedKPIs] = useState(new Set());

 const color = getAspectColor(aspect, colorIndex);

 const searchLower = searchQuery.trim().toLowerCase();
 const aspectNameMatches = !searchLower || aspect.name.toLowerCase().includes(searchLower);
 const aspectKPIs = activeKPIs
  .filter((k) => k.aspectId === aspect.id)
  .filter((k) => {
   if (!searchLower) return true;
   // If the aspect name itself matched, show its full KPI list.
   if (aspectNameMatches) return true;
   // Otherwise, only show KPIs whose name or description matches the query.
   return (
    k.name.toLowerCase().includes(searchLower) ||
    (k.description || '').toLowerCase().includes(searchLower)
   );
  });

 const aspectMonthlyMAS = calculateAspectMonthlyMAS(
  aspect.id,
  activeKPIs,
  entries,
  formatYearMonth(new Date()),
 );

 const toggleSel = (id) => {
  setSelectedKPIs((prev) => {
   const next = new Set(prev);
   next.has(id) ? next.delete(id) : next.add(id);
   return next;
  });
 };

 const bulkDelete = () => {
  if (selectedKPIs.size === 0) return;
  setConfirmDelete({ type: 'kpi-bulk', ids: [...selectedKPIs] });
 };

 return (
  <div className="bg-neutral-900/40 border border-neutral-800 rounded-lg overflow-hidden">
   {/* Aspect header */}
   <div className="flex items-center gap-4 p-5">
    <div
     className="h-10 w-1 rounded-full"
     style={{ background: color, boxShadow: `0 0 20px ${color}55` }}
    />
    <button
     onClick={() => setOpen((v) => !v)}
     className="flex items-center gap-3 flex-1 min-w-0 text-left group"
    >
     {open
      ? <ChevronDown size={16} className="text-neutral-500 shrink-0" />
      : <ChevronRight size={16} className="text-neutral-500 shrink-0" />}
     <div className="min-w-0">
      <div className="font-display text-xl text-neutral-50 truncate group-hover:text-rose-400 transition-colors">
       {aspect.name}
      </div>
      <div className="text-sm text-neutral-500 truncate">{aspect.description}</div>
     </div>
    </button>
    <div className="hidden sm:flex items-center gap-6 shrink-0">
     <div className="text-right">
      <div className="label-micro text-neutral-500 font-mono-ui">
       This Month
      </div>
      <div className="font-mono-ui text-lg text-neutral-100">
       {aspectMonthlyMAS.toFixed(2)}<span className="text-neutral-600 text-sm">/10</span>
      </div>
     </div>
     <div className="text-right">
      <div className="label-micro text-neutral-500 font-mono-ui">
       KPIs
      </div>
      <div className="font-mono-ui text-lg text-neutral-100">{aspectKPIs.length}</div>
     </div>
    </div>
    <button
     onClick={() => setConfirmDelete({ type: 'aspect', id: aspect.id, name: aspect.name })}
     className="p-2 text-neutral-500 hover:text-rose-500 hover:bg-rose-600/10 rounded-md transition-colors"
     aria-label="Delete aspect"
    >
     <Trash2 size={16} />
    </button>
   </div>

   {open && (
    <div className="border-t border-neutral-800 bg-neutral-950/40">
     <div className="flex items-center justify-between p-4 border-b border-neutral-800">
      <div className="flex items-center gap-2">
       {selectedKPIs.size > 0 ? (
        <>
         <span className="text-xs text-neutral-400 font-mono-ui">
          {selectedKPIs.size} selected
         </span>
         <button
          onClick={bulkDelete}
          className="inline-flex items-center gap-1.5 text-xs text-rose-500 hover:text-rose-400 bg-rose-600/10 border border-rose-600/30 px-2.5 py-1 rounded"
         >
          <Trash2 size={12} /> Delete
         </button>
         <button
          onClick={() => setSelectedKPIs(new Set())}
          className="text-xs text-neutral-500 hover:text-neutral-300 px-2"
         >
          Clear
         </button>
        </>
       ) : (
        <span className="label-micro text-neutral-500 font-mono-ui">
         KPIs
        </span>
       )}
      </div>
      <button
       onClick={() => setAddKPIOpen(true)}
       className="inline-flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 border border-rose-600/40 hover:border-rose-600 px-3 py-1.5 rounded transition-colors"
      >
       <Plus size={12} /> Add KPI
      </button>
     </div>

     {aspectKPIs.length === 0 ? (
      <div className="p-8 text-center text-sm text-neutral-500">
       No KPIs yet. Add one to start tracking.
      </div>
     ) : (
      <div className="overflow-x-auto">
       <table className="w-full text-sm">
        <thead>
         <tr className="label-micro text-neutral-500 font-mono-ui border-b border-neutral-800">
          <th className="p-3 pl-4 w-10"></th>
          <th className="text-left p-3">Name</th>
          <th className="text-left p-3 hidden md:table-cell">Period</th>
          <th className="text-left p-3 hidden md:table-cell">Description</th>
          <th className="text-right p-3">Streak</th>
          <th className="text-right p-3">Score</th>
          <th className="p-3 w-10"></th>
         </tr>
        </thead>
        <tbody>
         {aspectKPIs.map((kpi) => {
          const score = getKPICurrentScore(kpi, entries);
          const streak = calculateStreak(kpi, entries);
          const isSel = selectedKPIs.has(kpi.id);
          return (
           <tr key={kpi.id} className="border-b border-neutral-800/50 hover:bg-neutral-900/40">
            <td className="p-3 pl-4">
             <button
              onClick={() => toggleSel(kpi.id)}
              className={`h-4 w-4 rounded border flex items-center justify-center transition-colors
               ${isSel
                ? 'bg-rose-600 border-rose-500'
                : 'border-neutral-600 hover:border-rose-600'}`}
              aria-label="Select KPI"
             >
              {isSel && <Check size={10} className="text-white" strokeWidth={3} />}
             </button>
            </td>
            <td className="p-3 text-neutral-100">{kpi.name}</td>
            <td className="p-3 hidden md:table-cell">
             <span className="inline-block label-micro uppercase tracking-wider font-mono-ui px-2 py-0.5 bg-neutral-800 text-neutral-300 rounded">
              {kpi.period}
             </span>
            </td>
            <td className="p-3 text-neutral-500 hidden md:table-cell max-w-xs truncate">
             {kpi.description}
            </td>
            <td className="p-3 text-right">
             {streak > 0 ? (
              <span className="inline-flex items-center gap-1 text-rose-500 font-mono-ui text-xs">
               <Flame size={11} /> {streak}
              </span>
             ) : (
              <span className="text-neutral-600 font-mono-ui text-xs">—</span>
             )}
            </td>
            <td className="p-3 text-right font-mono-ui text-neutral-100">
             {score.toFixed(2)}<span className="text-neutral-600">/10</span>
            </td>
            <td className="p-3">
             <button
              onClick={() =>
               setConfirmDelete({ type: 'kpi', id: kpi.id, name: kpi.name })
              }
              className="p-1.5 text-neutral-600 hover:text-rose-500 rounded transition-colors"
              aria-label="Delete KPI"
             >
              <Trash2 size={14} />
             </button>
            </td>
           </tr>
          );
         })}
        </tbody>
       </table>
      </div>
     )}
    </div>
   )}

   {addKPIOpen && <AddKPIModal aspectId={aspect.id} onClose={() => setAddKPIOpen(false)} />}

   {confirmDelete && (
    <ConfirmDeleteModal
     payload={confirmDelete}
     onCancel={() => setConfirmDelete(null)}
     onConfirm={() => {
      if (confirmDelete.type === 'aspect') softDeleteAspect(confirmDelete.id);
      else if (confirmDelete.type === 'kpi') softDeleteKPI(confirmDelete.id);
      else if (confirmDelete.type === 'kpi-bulk') {
       confirmDelete.ids.forEach((id) => softDeleteKPI(id));
       setSelectedKPIs(new Set());
      }
      setConfirmDelete(null);
     }}
    />
   )}
  </div>
 );
}

/* =========================================================================
  9. MODALS
  ========================================================================= */

function Modal({ title, onClose, children, size = 'md' }) {
 useEffect(() => {
  const handler = (e) => e.key === 'Escape' && onClose();
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
 }, [onClose]);

 const widthClass = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-md';

 return (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
   <div
    className="absolute inset-0 bg-black/70 backdrop-blur-sm"
    onClick={onClose}
   />
   <div
    className={`relative bg-neutral-950 border border-neutral-800 rounded-lg shadow-2xl w-full ${widthClass} overflow-hidden`}
   >
    <div className="h-0.5 w-full" style={{ background: 'linear-gradient(90deg, transparent, #E11D48, transparent)' }} />
    <div className="p-6">
     <div className="flex items-center justify-between mb-5">
      <h3 className="font-display text-2xl text-neutral-50 tracking-tight">{title}</h3>
      <button
       onClick={onClose}
       className="p-1.5 text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 rounded-md transition-colors"
      >
       <X size={16} />
      </button>
     </div>
     {children}
    </div>
   </div>
  </div>
 );
}

function AddAspectFlow({ onClose }) {
 const { addAspect } = useApp();
 const [step, setStep] = useState(1);    // 1 = gate, 2 = form
 const [name, setName] = useState('');
 const [description, setDescription] = useState('');
 const [error, setError] = useState('');

 const onYes = () => setStep(2);
 const onNo = () => onClose();

 const onSave = () => {
  if (!name.trim() || !description.trim()) {
   setError('Both name and description are required.');
   return;
  }
  addAspect(name.trim(), description.trim());
  onClose();
 };

 if (step === 1) {
  return (
   <Modal title="A Gentle Check" onClose={onClose}>
    <p className="text-neutral-300 text-base leading-relaxed mb-6">
     Is this genuinely an <span className="text-rose-400">important aspect of your life</span>?
     Adding aspects casually dilutes the system. Only add what you truly want to grow in.
    </p>
    <div className="flex gap-3 justify-end">
     <button
      onClick={onNo}
      className="px-4 py-2 text-sm text-neutral-300 hover:text-neutral-100 border border-neutral-800 hover:border-neutral-700 rounded-md transition-colors"
     >
      No, not yet
     </button>
     <button
      onClick={onYes}
      className="px-4 py-2 text-sm bg-rose-600 hover:bg-rose-500 text-white rounded-md transition-colors"
     >
      Yes, continue
     </button>
    </div>
   </Modal>
  );
 }

 return (
  <Modal title="Define the Aspect" onClose={onClose}>
   <div className="flex flex-col gap-4">
    <div>
     <label className="label-micro text-neutral-500 font-mono-ui block mb-1.5">
      Name
     </label>
     <input
      autoFocus
      value={name}
      onChange={(e) => { setName(e.target.value); setError(''); }}
      placeholder="e.g. Creative Practice"
      className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2.5 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-rose-600/50 focus:ring-1 focus:ring-rose-600/30"
     />
    </div>
    <div>
     <label className="label-micro text-neutral-500 font-mono-ui block mb-1.5">
      Description
     </label>
     <textarea
      rows={3}
      value={description}
      onChange={(e) => { setDescription(e.target.value); setError(''); }}
      placeholder="What does thriving in this area look like?"
      className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2.5 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-rose-600/50 focus:ring-1 focus:ring-rose-600/30 resize-none"
     />
    </div>
    {error && <div className="text-xs text-rose-500">{error}</div>}
    <div className="flex gap-3 justify-end mt-2">
     <button
      onClick={onClose}
      className="px-4 py-2 text-sm text-neutral-300 hover:text-neutral-100 border border-neutral-800 hover:border-neutral-700 rounded-md transition-colors"
     >
      Discard
     </button>
     <button
      onClick={onSave}
      className="px-4 py-2 text-sm bg-rose-600 hover:bg-rose-500 text-white rounded-md transition-colors"
     >
      Save Aspect
     </button>
    </div>
   </div>
  </Modal>
 );
}

function AddKPIModal({ aspectId, onClose }) {
 const { addKPI } = useApp();
 const [name, setName] = useState('');
 const [description, setDescription] = useState('');
 const [period, setPeriod] = useState('weekly');
 const [error, setError] = useState('');

 const onSave = () => {
  if (!name.trim() || !description.trim()) {
   setError('Both name and description are required.');
   return;
  }
  addKPI(aspectId, name.trim(), description.trim(), period);
  onClose();
 };

 return (
  <Modal title="New KPI" onClose={onClose}>
   <div className="flex flex-col gap-4">
    <div>
     <label className="label-micro text-neutral-500 font-mono-ui block mb-1.5">
      Name
     </label>
     <input
      autoFocus
      value={name}
      onChange={(e) => { setName(e.target.value); setError(''); }}
      placeholder="e.g. Morning Run"
      className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2.5 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-rose-600/50 focus:ring-1 focus:ring-rose-600/30"
     />
    </div>
    <div>
     <label className="label-micro text-neutral-500 font-mono-ui block mb-1.5">
      Description
     </label>
     <textarea
      rows={2}
      value={description}
      onChange={(e) => { setDescription(e.target.value); setError(''); }}
      placeholder="The precise behavior that counts as success."
      className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2.5 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-rose-600/50 focus:ring-1 focus:ring-rose-600/30 resize-none"
     />
    </div>
    <div>
     <label className="label-micro text-neutral-500 font-mono-ui block mb-1.5">
      Period
     </label>
     <div className="grid grid-cols-2 gap-2">
      {['weekly', 'monthly'].map((p) => (
       <button
        key={p}
        onClick={() => setPeriod(p)}
        className={`px-4 py-2.5 text-sm rounded-md border transition-colors capitalize
         ${period === p
          ? 'bg-rose-600/10 border-rose-600/50 text-rose-400'
          : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-700'}`}
       >
        {p}
       </button>
      ))}
     </div>
    </div>
    {error && <div className="text-xs text-rose-500">{error}</div>}
    <div className="flex gap-3 justify-end mt-2">
     <button
      onClick={onClose}
      className="px-4 py-2 text-sm text-neutral-300 hover:text-neutral-100 border border-neutral-800 hover:border-neutral-700 rounded-md transition-colors"
     >
      Discard
     </button>
     <button
      onClick={onSave}
      className="px-4 py-2 text-sm bg-rose-600 hover:bg-rose-500 text-white rounded-md transition-colors"
     >
      Save KPI
     </button>
    </div>
   </div>
  </Modal>
 );
}

function ConfirmDeleteModal({ payload, onCancel, onConfirm }) {
 const subject =
  payload.type === 'aspect'  ? 'a Key Life Aspect'
  : payload.type === 'kpi-bulk' ? `${payload.ids.length} KPIs`
  : 'a KPI';

 return (
  <Modal title="Confirm Deletion" onClose={onCancel} size="sm">
   <p className="text-neutral-300 leading-relaxed">
    You are about to delete <span className="text-rose-400">{subject}</span>.
    Are you sure?
   </p>
   <p className="text-xs text-neutral-500 mt-3">
    Historical scores will remain intact. The item will be moved to trash and
    no longer appear in active views.
   </p>
   <div className="flex gap-3 justify-end mt-6">
    <button
     onClick={onCancel}
     className="px-4 py-2 text-sm text-neutral-300 hover:text-neutral-100 border border-neutral-800 hover:border-neutral-700 rounded-md transition-colors"
    >
     Cancel
    </button>
    <button
     onClick={onConfirm}
     className="px-4 py-2 text-sm bg-rose-600 hover:bg-rose-500 text-white rounded-md transition-colors inline-flex items-center gap-2"
    >
     <Trash2 size={14} /> Delete
    </button>
   </div>
  </Modal>
 );
}

/* =========================================================================
  10. ROOT
  ========================================================================= */

export default function App() {
 return (
  <AppProvider>
   <AppShell />
  </AppProvider>
 );
}

function AppShell() {
 const { currentPage } = useApp();
 return (
  <>
   {/* Fonts + small utility styles. Scoped enough not to leak. */}
   <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,500;0,600;1,400&family=JetBrains+Mono:wght@400;500&display=swap');
    .font-display { font-family: 'Fraunces', Georgia, serif; font-feature-settings: 'ss01'; }
    .font-mono-ui { font-family: 'JetBrains Mono', ui-monospace, monospace; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; }

    /* Custom type-size utilities to avoid depending on Tailwind JIT arbitrary values */
    .label-micro { font-size: 10px; line-height: 1.3; text-transform: uppercase; letter-spacing: 0.2em; }
    .label-mini { font-size: 11px; line-height: 1.3; text-transform: uppercase; letter-spacing: 0.25em; }
    .text-13   { font-size: 13px; line-height: 1.4; }

    /* Layout sizing helpers */
    .container-xl { max-width: 1800px; margin-inline: auto; }
    .stat-min   { min-width: 110px; }
    .radar-h    { height: 340px; }
    .line-h    { height: 320px; }
    .accent-bar  { height: 2px; }
    .sidebar-h   { height: calc(100vh - 85px); }
    .sticky-under-banner { top: 85px; }

    /* Grainy noise overlay */
    .noise::before {
     content: '';
     position: fixed; inset: 0; pointer-events: none; z-index: 100;
     opacity: 0.025;
     background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
    }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: #0a0a0a; }
    ::-webkit-scrollbar-thumb { background: #262626; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #404040; }
   `}</style>

   <div className="min-h-screen bg-neutral-950 text-neutral-100 noise">
    <TopBanner />
    <div className="flex">
     <Sidebar />
     <div className="flex-1 min-w-0">
      <Header />
      {currentPage === 'home' ? <HomePage /> : <AspectsKPIsPage />}
     </div>
    </div>
   </div>
  </>
 );
}
