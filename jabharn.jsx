import React, { useState, useEffect, useCallback, useContext, createContext } from "react";
import {
  Plus, ArrowLeft, Trash2, Users, Receipt, Wallet, ArrowRight, X, RotateCcw,
  Check, MapPin, Bed, UtensilsCrossed, BarChart3, Search, Pencil,
  Lock, Unlock,
} from "lucide-react";

const STORAGE_KEY = "jabharn_v2";

// ---------- i18n (first pass: main navigation, headers, common actions) ----------
const translations = {
  th: {
    appTagline: "จดทริป แชร์บิล จบทุกเรื่องเงินในกลุ่มเพื่อน",
    resetData: "ล้างข้อมูล", refresh: "รีเฟรช", loading: "กำลังโหลดข้อมูล...",
    createTrip: "สร้างทริป", createTripHint: "วันไป-กลับ ที่พัก อาหารแยกรายมื้อ",
    createParty: "สร้างปาร์ตี้ / แชร์บิล", createPartyHint: "หารค่ากิน หารเท่า หารแยก\nกินอะไรจ่ายอันนั้น",
    searchPlaceholder: "ค้นหาทริป จังหวัด ร้าน หรือโรงแรม...",
    emptyHome: "ยังไม่มีทริปหรือปาร์ตี้ เริ่มสร้างรายการแรกของคุณได้เลย",
    trash: "ถังขยะ", storageUsed: "พื้นที่ใช้งาน",
    tabAccommodation: "ที่พัก", tabMeals: "อาหาร", tabReport: "รายงาน",
    finishTrip: "จบทริป", finishParty: "จบปาร์ตี้", reopen: "เปิดแก้ไข",
    deleteTrip: "ลบทริป", delete: "ลบ", edit: "แก้ไข", save: "บันทึก", cancel: "ยกเลิก",
    add: "เพิ่ม", close: "ปิด", manageMembers: "จัดการสมาชิก",
    settlementTitle: "ควรโอนเงินยังไง", settledStamp: "ลงตัวแล้ว ✓",
    householdHint: "คิดยอดรวมเป็นกลุ่ม/ครอบครัวแล้ว — โอนหากันแค่ระหว่างตัวแทนแต่ละกลุ่มพอ",
    trashTitle: "ถังขยะ", trashEmpty: "ถังขยะว่างเปล่า", restore: "กู้คืน", deleteForever: "ลบถาวรตอนนี้",
  },
  en: {
    appTagline: "Log trips, split bills, settle up with friends",
    resetData: "Clear data", refresh: "Refresh", loading: "Loading...",
    createTrip: "New Trip", createTripHint: "Dates, lodging, meals by course",
    createParty: "New Party / Split Bill", createPartyHint: "Split evenly or split exactly\nPay for exactly what you had",
    searchPlaceholder: "Search trips, province, restaurant, or hotel...",
    emptyHome: "No trips or parties yet. Create your first one now.",
    trash: "Trash", storageUsed: "Storage used",
    tabAccommodation: "Lodging", tabMeals: "Meals", tabReport: "Report",
    finishTrip: "Finish trip", finishParty: "Finish party", reopen: "Reopen",
    deleteTrip: "Delete trip", delete: "Delete", edit: "Edit", save: "Save", cancel: "Cancel",
    add: "Add", close: "Close", manageMembers: "Manage members",
    settlementTitle: "Who should pay whom", settledStamp: "All settled ✓",
    householdHint: "Totals are grouped by household — only representatives need to transfer money",
    trashTitle: "Trash", trashEmpty: "Trash is empty", restore: "Restore", deleteForever: "Delete forever",
  },
};
const LangContext = createContext({ lang: "th", t: (k) => k, setLang: () => {} });
function useT() {
  return useContext(LangContext);
}

const uid = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const fmt = (n) =>
  round2(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return d;
  }
};

function bytesOf(obj) {
  try { return new Blob([JSON.stringify(obj)]).size; } catch { return JSON.stringify(obj).length; }
}
function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024;

const MEAL_TYPES = [
  { v: "breakfast", l: "มื้อเช้า", en: "Breakfast" },
  { v: "lunch", l: "มื้อกลางวัน", en: "Lunch" },
  { v: "dinner", l: "มื้อเย็น", en: "Dinner" },
  { v: "snack", l: "ของว่าง/มื้อดึก", en: "Snack / late night" },
];
const mealTypeLabel = (v, lang) => {
  const m = MEAL_TYPES.find((m) => m.v === v);
  if (!m) return v;
  return lang === "en" ? m.en : m.l;
};
const CATS = [
  { v: "food", l: "อาหาร", en: "Food", cls: "cat-food" },
  { v: "beer", l: "เบียร์", en: "Beer", cls: "cat-beer" },
  { v: "liquor", l: "เหล้า", en: "Liquor", cls: "cat-liquor" },
  { v: "other", l: "อื่นๆ", en: "Other", cls: "cat-other" },
];
const catLabel = (v, lang) => {
  const c = CATS.find((c) => c.v === v);
  if (!c) return v;
  return lang === "en" ? c.en : c.l;
};
const catCls = (v) => (CATS.find((c) => c.v === v) || {}).cls || "cat-other";

// ---------- balance engine (generic) ----------
function computeBalancesFromEntries(members, entries) {
  const paid = {}, owed = {};
  members.forEach((m) => { paid[m] = 0; owed[m] = 0; });
  entries.forEach((e) => {
    if (!e.splitAmong || e.splitAmong.length === 0) return;
    paid[e.paidBy] = (paid[e.paidBy] || 0) + e.amount;
    const share = e.amount / e.splitAmong.length;
    e.splitAmong.forEach((m) => { owed[m] = (owed[m] || 0) + share; });
  });
  // Full precision here on purpose — this feeds household aggregation and
  // settlement math. Rounding happens only where a value is displayed
  // (via fmt()) or turned into an actual transfer amount (in simplifyDebts).
  const net = {};
  members.forEach((m) => { net[m] = (paid[m] || 0) - (owed[m] || 0); });
  return net;
}
function simplifyDebts(net) {
  const debtors = Object.entries(net).filter(([, v]) => v < -0.01).sort((a, b) => a[1] - b[1]).map(([k, v]) => [k, v]);
  const creditors = Object.entries(net).filter(([, v]) => v > 0.01).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v]);
  const tx = [];
  let i = 0, j = 0;
  let drift = 0; // accumulated rounding error from displaying each transfer to 2dp
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i], c = creditors[j];
    const amt = Math.min(-d[1], c[1]); // full-precision amount used for the running simulation
    if (amt > 0.005) {
      const rounded = round2(amt);
      drift += amt - rounded;
      tx.push({ from: d[0], to: c[0], amount: rounded });
    }
    d[1] += amt; c[1] -= amt;
    if (Math.abs(d[1]) < 0.01) i++;
    if (Math.abs(c[1]) < 0.01) j++;
  }
  // Fold any leftover satang from per-transfer rounding into the last
  // transaction, deterministically, so the set of transfers reconciles
  // exactly instead of leaving an unpaid rounding remainder floating around.
  if (tx.length > 0 && Math.abs(drift) >= 0.005) {
    const last = tx[tx.length - 1];
    last.amount = round2(last.amount + drift);
  }
  return tx;
}

// ---------- household / representative-payer support ----------
// A "household" groups several members under one representative. Everyone's
// share of each bill is still computed per individual (fair per-head
// splitting), but at settlement time all of a household's balance rolls up
// onto the representative — nobody else in that household ever appears in
// the "who transfers to whom" list.
function representativeOf(name, households) {
  const h = (households || []).find((h) => h.memberNames.includes(name));
  return h ? h.representative : name;
}
function computeHouseholdNet(members, households, entries) {
  const individualNet = computeBalancesFromEntries(members, entries);
  const householdNet = {};
  members.forEach((m) => {
    const rep = representativeOf(m, households);
    // Still full precision — summing already-rounded per-person values here
    // was exactly the source of the 0.01–0.02 THB drift being fixed.
    householdNet[rep] = (householdNet[rep] || 0) + (individualNet[m] || 0);
  });
  return householdNet;
}
/** Drop-in replacement for computeBalancesFromEntries wherever the result
 * feeds into simplifyDebts for the actual "who pays whom" list. Falls back
 * to plain individual balances when no households are defined. */
function settlementNet(members, households, entries) {
  return households && households.length > 0
    ? computeHouseholdNet(members, households, entries)
    : computeBalancesFromEntries(members, entries);
}
function isMemberReferenced(entity, name) {
  const isTrip = entity.kind === "trip";
  if (isTrip) {
    if (entity.accommodations.some((a) => a.paidBy === name || a.splitAmong.includes(name))) return true;
    if (entity.meals.some((m) => m.paidBy === name || m.items.some((it) => it.splitAmong.includes(name)))) return true;
  } else {
    if (entity.expenses.some((e) => e.paidBy === name || e.splitAmong.includes(name))) return true;
  }
  if ((entity.households || []).some((h) => h.memberNames.includes(name) || h.representative === name)) return true;
  return false;
}

// ---------- trip-specific helpers ----------
function tripEntries(trip) {
  const acc = trip.accommodations.map((a) => ({ amount: a.amount, paidBy: a.paidBy, splitAmong: a.splitAmong }));
  const meals = trip.meals.flatMap((m) =>
    m.items.map((it) => ({ amount: it.amount, paidBy: m.paidBy, splitAmong: it.splitAmong }))
  );
  return [...acc, ...meals];
}
function tripTotal(trip) {
  return round2(tripEntries(trip).reduce((s, e) => s + e.amount, 0));
}
function tripCategoryTotals(trip) {
  const t = { accommodation: 0, food: 0, beer: 0, liquor: 0, other: 0 };
  trip.accommodations.forEach((a) => (t.accommodation += a.amount));
  trip.meals.forEach((m) => m.items.forEach((it) => (t[it.category] = (t[it.category] || 0) + it.amount)));
  Object.keys(t).forEach((k) => (t[k] = round2(t[k])));
  return t;
}
function tripPersonItemBreakdown(trip) {
  const breakdown = {};
  trip.members.forEach((m) => (breakdown[m] = { paid: 0, items: [] }));

  trip.accommodations.forEach((a) => {
    breakdown[a.paidBy] && (breakdown[a.paidBy].paid += a.amount);
    if (!a.splitAmong || a.splitAmong.length === 0) return;
    const share = a.amount / a.splitAmong.length;
    a.splitAmong.forEach((m) => {
      breakdown[m] && breakdown[m].items.push({ desc: a.place, amount: share, category: "accommodation" });
    });
  });

  trip.meals.forEach((meal) => {
    meal.items.forEach((it) => {
      breakdown[meal.paidBy] && (breakdown[meal.paidBy].paid += it.amount);
      if (!it.splitAmong || it.splitAmong.length === 0) return;
      const share = it.amount / it.splitAmong.length;
      it.splitAmong.forEach((m) => {
        breakdown[m] && breakdown[m].items.push({ desc: it.desc, amount: share, category: it.category });
      });
    });
  });

  return breakdown;
}
function partyTotal(p) {
  return round2(p.expenses.reduce((s, e) => s + e.amount, 0));
}

const TRASH_RETENTION_DAYS = 30;
function daysSince(iso) {
  return (Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000);
}
function isExpiredTrash(entity) {
  return !!entity.deletedAt && daysSince(entity.deletedAt) > TRASH_RETENTION_DAYS;
}
function purgeExpired(data) {
  return {
    trips: data.trips.filter((t) => !isExpiredTrash(t)),
    parties: data.parties.filter((p) => !isExpiredTrash(p)),
  };
}

function matchesSearch(item, q) {
  if (!q) return true;
  const s = q.toLowerCase();
  if (item.kind === "trip") {
    if ((item.name || "").toLowerCase().includes(s)) return true;
    if ((item.province || "").toLowerCase().includes(s)) return true;
    if (item.accommodations.some((a) => (a.place || "").toLowerCase().includes(s))) return true;
    if (item.meals.some((m) => (m.place || "").toLowerCase().includes(s))) return true;
    return false;
  }
  return (item.name || "").toLowerCase().includes(s);
}

// ---------- example / demo content (never persisted unless the user copies it) ----------
const EXAMPLE_PARTY = {
  id: "example-party", kind: "party", name: "ชาบูกับเพื่อน", date: "",
  members: ["pax", "zine", "poon", "tae"], households: [],
  createdAt: "2026-01-01T00:00:00.000Z", closed: false, deletedAt: null,
  expenses: [
    { id: "ex-exp-1", desc: "ค่าอาหาร", amount: 1200, paidBy: "pax", splitAmong: ["pax", "zine", "poon", "tae"] },
    { id: "ex-exp-2", desc: "เครื่องดื่ม", amount: 320, paidBy: "poon", splitAmong: ["pax", "zine", "poon", "tae"] },
    { id: "ex-exp-3", desc: "ของหวาน", amount: 180, paidBy: "tae", splitAmong: ["pax", "zine", "poon"] },
  ],
};
const EXAMPLE_TRIP = {
  id: "example-trip", kind: "trip", name: "Pool Villa Bangsaen", province: "ชลบุรี",
  startDate: "2026-01-10", endDate: "2026-01-11",
  members: ["pax", "zine", "poon", "tae"],
  households: [{ id: "ex-hh-1", name: "pax & zine", memberNames: ["pax", "zine"], representative: "pax" }],
  createdAt: "2026-01-01T00:00:00.000Z", closed: false, deletedAt: null,
  accommodations: [
    { id: "ex-acc-1", night: "2026-01-10", place: "Pool Villa Bangsaen", amount: 3200, paidBy: "pax", splitAmong: ["pax", "zine", "poon", "tae"] },
  ],
  meals: [
    { id: "ex-meal-1", date: "2026-01-10", mealType: "dinner", place: "BBQ ในวิลล่า", paidBy: "zine", closed: false, items: [
      { id: "ex-mi-1", desc: "หมูกระทะชุดใหญ่", amount: 850, category: "food", splitAmong: ["pax", "zine", "poon", "tae"] },
      { id: "ex-mi-2", desc: "เบียร์ช้าง 6 ขวด", amount: 390, category: "beer", splitAmong: ["pax", "zine", "tae"] },
    ] },
    { id: "ex-meal-2", date: "2026-01-11", mealType: "breakfast", place: "ร้านกาแฟใกล้วิลล่า", paidBy: "poon", closed: false, items: [
      { id: "ex-mi-3", desc: "กาแฟ + ชา", amount: 280, category: "food", splitAmong: ["pax", "zine", "poon", "tae"] },
    ] },
    { id: "ex-meal-3", date: "2026-01-11", mealType: "lunch", place: "ซีฟู้ดริมทะเล", paidBy: "tae", closed: false, items: [
      { id: "ex-mi-4", desc: "ซีฟู้ดรวม", amount: 980, category: "food", splitAmong: ["pax", "zine", "poon", "tae"] },
    ] },
  ],
};
/** Deep-clones an example into a brand-new, fully independent, editable
 * record with fresh ids — the demo itself is never mutated, and this never
 * touches existing stored data unless the user explicitly triggers it. */
function cloneTripFromExample(example) {
  return {
    ...example, id: uid("trip"), createdAt: new Date().toISOString(), closed: false, deletedAt: null,
    accommodations: example.accommodations.map((a) => ({ ...a, id: uid("acc") })),
    meals: example.meals.map((m) => ({ ...m, id: uid("meal"), items: m.items.map((it) => ({ ...it, id: uid("item") })) })),
    households: (example.households || []).map((h) => ({ ...h, id: uid("hh") })),
  };
}
function clonePartyFromExample(example) {
  return {
    ...example, id: uid("pty"), createdAt: new Date().toISOString(), closed: false, deletedAt: null,
    expenses: example.expenses.map((e) => ({ ...e, id: uid("exp") })),
    households: (example.households || []).map((h) => ({ ...h, id: uid("hh") })),
  };
}

function TornCard({ children, className = "", onClick }) {
  return (
    <div className={`ps-card ${className}`} onClick={onClick}>
      <div className="ps-card-body">{children}</div>
      <div className="ps-torn" />
    </div>
  );
}

function ClosedBanner({ onReopen, label }) {
  const { t, lang } = useT();
  const defaultLabel = lang === "th" ? "ปิดรายการนี้แล้ว" : "This is closed";
  return (
    <div className="ps-closed-banner">
      <span><Lock size={13} /> {label || defaultLabel} — {lang === "th" ? "แก้ไขเพิ่มเติมไม่ได้จนกว่าจะเปิดอีกครั้ง" : "no further edits until reopened"}</span>
      <button className="ps-btn-ghost" onClick={onReopen}><Unlock size={13} /> {t("reopen")}</button>
    </div>
  );
}

// ================= APP ROOT =================
export default function App() {
  const [data, setData] = useState({ trips: [], parties: [] });
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [view, setView] = useState("home");
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState("");
  const [lang, setLang] = useState("th");
  const t = useCallback((key) => (translations[lang] && translations[lang][key]) || translations.th[key] || key, [lang]);
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          const cleaned = purgeExpired(parsed);
          setData(cleaned);
          // Silently persist the cleaned-up version if anything expired
          if (cleaned.trips.length !== parsed.trips.length || cleaned.parties.length !== parsed.parties.length) {
            window.storage.set(STORAGE_KEY, JSON.stringify(cleaned), false).catch(() => {});
          }
        }
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  const persist = useCallback(async (next) => {
    setData(next);
    try {
      const res = await window.storage.set(STORAGE_KEY, JSON.stringify(next), false);
      setSaveError(!res);
    } catch (e) {
      setSaveError(true);
    }
  }, []);

  const createTrip = (name, province, startDate, endDate, members, households) => {
    const trip = {
      id: uid("trip"), kind: "trip", name, province, startDate, endDate,
      createdAt: new Date().toISOString(), members, households: households || [], accommodations: [], meals: [],
      closed: false, deletedAt: null,
    };
    persist({ ...data, trips: [trip, ...data.trips] });
    setSelectedId(trip.id); setView("trip");
  };
  const updateTrip = (id, fn) => persist({ ...data, trips: data.trips.map((t) => (t.id === id ? fn(t) : t)) });
  const softDeleteTrip = (id) => { updateTrip(id, (t) => ({ ...t, deletedAt: new Date().toISOString() })); setView("home"); };
  const restoreTrip = (id) => updateTrip(id, (t) => ({ ...t, deletedAt: null }));
  const hardDeleteTrip = (id) => persist({ ...data, trips: data.trips.filter((t) => t.id !== id) });

  const createParty = (kindLabel, name, date, members, households) => {
    const party = {
      id: uid("pty"), kind: kindLabel, name, date, members, households: households || [],
      createdAt: new Date().toISOString(), expenses: [], closed: false, deletedAt: null,
    };
    persist({ ...data, parties: [party, ...data.parties] });
    setSelectedId(party.id); setView("party");
    return party;
  };
  const updateParty = (id, fn) => persist({ ...data, parties: data.parties.map((p) => (p.id === id ? fn(p) : p)) });
  const softDeleteParty = (id) => { updateParty(id, (p) => ({ ...p, deletedAt: new Date().toISOString() })); setView("home"); };
  const restoreParty = (id) => updateParty(id, (p) => ({ ...p, deletedAt: null }));
  const hardDeleteParty = (id) => persist({ ...data, parties: data.parties.filter((p) => p.id !== id) });

  const resetAll = () => {
    const msg = lang === "th"
      ? "ล้างข้อมูลทั้งหมด (ทริป/ปาร์ตี้/ประวัติ)? ทำแล้วกู้คืนไม่ได้นะ"
      : "Clear all data (trips/parties/history)? This can't be undone.";
    if (window.confirm(msg)) {
      persist({ trips: [], parties: [] });
      setView("home");
    }
  };

  const reloadData = async () => {
    try {
      const res = await window.storage.get(STORAGE_KEY, false);
      if (res && res.value) setData(JSON.parse(res.value));
    } catch (e) {}
  };

  const selectedTrip = data.trips.find((t) => t.id === selectedId);
  const selectedParty = data.parties.find((p) => p.id === selectedId);
  const hasAny = data.trips.length > 0 || data.parties.length > 0;

  const useTripExample = () => {
    const cloned = cloneTripFromExample(EXAMPLE_TRIP);
    persist({ ...data, trips: [cloned, ...data.trips] });
    setSelectedId(cloned.id); setView("trip");
  };
  const usePartyExample = () => {
    const cloned = clonePartyFromExample(EXAMPLE_PARTY);
    persist({ ...data, parties: [cloned, ...data.parties] });
    setSelectedId(cloned.id); setView("party");
  };

  return (
    <LangContext.Provider value={{ lang, t, setLang }}>
    <div className="ps-app">
      <GlobalStyle />
      <div className="ps-shell">
        <div className="ps-header">
          <div className="ps-brand">
            {!logoError ? (
              <img
                src="jabharn-logo.png"
                alt="Jabharn จับหาร"
                className="ps-logo"
                onError={() => setLogoError(true)}
              />
            ) : (
              <h1 className="ps-title">Jabharn <span className="ps-title-th">จับหาร</span></h1>
            )}
            <p className="ps-subtitle">{t("appTagline")}</p>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className="ps-reset-btn"
              onClick={() => setLang(lang === "th" ? "en" : "th")}
              title="Switch language"
            >
              {lang === "th" ? "EN" : "TH"}
            </button>
            {hasAny && (
              <>
                <button className="ps-reset-btn" onClick={reloadData} title="รีเฟรชข้อมูล">
                  <RotateCcw size={13} /> {t("refresh")}
                </button>
                <button className="ps-reset-btn" onClick={resetAll} title="ล้างข้อมูลทั้งหมด">
                  <Trash2 size={13} /> {t("resetData")}
                </button>
              </>
            )}
          </div>
        </div>

        {!loaded && <div className="ps-empty">{t("loading")}</div>}

        {loaded && view === "home" && (
          <Home
            data={data} query={query} setQuery={setQuery}
            onNewTrip={() => setView("newTrip")}
            onNewParty={() => setView("newParty")}
            onOpenTrip={(id) => { setSelectedId(id); setView("trip"); }}
            onOpenParty={(id) => { setSelectedId(id); setView("party"); }}
            onOpenTrash={() => setView("trash")}
            onViewDemoParty={() => setView("demoParty")}
            onViewDemoTrip={() => setView("demoTrip")}
          />
        )}

        {loaded && view === "trash" && (
          <TrashView
            data={data}
            onBack={() => setView("home")}
            onRestoreTrip={restoreTrip}
            onRestoreParty={restoreParty}
            onHardDeleteTrip={hardDeleteTrip}
            onHardDeleteParty={hardDeleteParty}
          />
        )}

        {loaded && view === "newTrip" && <NewTripForm onCancel={() => setView("home")} onCreate={createTrip} />}

        {loaded && view === "trip" && selectedTrip && (
          <TripDetail
            trip={selectedTrip}
            onBack={() => setView("home")}
            onUpdate={(fn) => updateTrip(selectedTrip.id, fn)}
            onDelete={() => softDeleteTrip(selectedTrip.id)}
          />
        )}

        {loaded && view === "demoTrip" && (
          <TripDetail
            trip={EXAMPLE_TRIP}
            isDemo
            onBack={() => setView("home")}
            onUpdate={() => {}}
            onDelete={() => {}}
            onUseAsMine={useTripExample}
          />
        )}

        {loaded && view === "newParty" && (
          <NewPartyForm
            title={lang === "th" ? "สร้างปาร์ตี้" : "New party"}
            hint={lang === "th" ? "เช่น ปาร์ตี้วันเกิดตูน, มื้อเย็นเพื่อน, หรือหารบิลด่วน" : "e.g. birthday party, dinner with friends, or a quick split"}
            onCancel={() => setView("home")}
            onCreate={(name, date, members, households) => createParty("party", name, date, members, households)}
          />
        )}

        {loaded && view === "party" && selectedParty && (
          <PartyDetail
            party={selectedParty}
            onBack={() => setView("home")}
            onUpdate={(fn) => updateParty(selectedParty.id, fn)}
            onDelete={() => softDeleteParty(selectedParty.id)}
          />
        )}

        {loaded && view === "demoParty" && (
          <PartyDetail
            party={EXAMPLE_PARTY}
            isDemo
            onBack={() => setView("home")}
            onUpdate={() => {}}
            onDelete={() => {}}
            onUseAsMine={usePartyExample}
          />
        )}

        {saveError && <p style={{ fontSize: 12, color: "var(--brick)", marginTop: 16 }}>{lang === "th" ? "บันทึกข้อมูลไม่สำเร็จ ลองอีกครั้ง" : "Failed to save — please try again"}</p>}
      </div>
    </div>
    </LangContext.Provider>
  );
}

function TrashView({ data, onBack, onRestoreTrip, onRestoreParty, onHardDeleteTrip, onHardDeleteParty }) {
  const { t, lang } = useT();
  const trashedTrips = data.trips.filter((t) => t.deletedAt).map((t) => ({ ...t, kind: "trip" }));
  const trashedParties = data.parties.filter((p) => p.deletedAt);
  const items = [...trashedTrips, ...trashedParties].sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));

  const hardDelete = (item) => {
    const msg = lang === "th"
      ? `ลบ "${item.name}" ถาวรเลยไหม? กู้คืนไม่ได้อีกแล้ว`
      : `Permanently delete "${item.name}"? This can't be undone.`;
    if (!window.confirm(msg)) return;
    if (item.kind === "trip") onHardDeleteTrip(item.id);
    else onHardDeleteParty(item.id);
  };
  const restore = (item) => {
    if (item.kind === "trip") onRestoreTrip(item.id);
    else onRestoreParty(item.id);
  };

  return (
    <div>
      <div className="ps-backrow">
        <button className="ps-iconbtn" onClick={onBack}><ArrowLeft size={20} /></button>
        <span style={{ fontWeight: 700 }}>{t("trashTitle")}</span>
      </div>
      <p className="ps-hint" style={{ marginBottom: 14 }}>
        {lang === "th"
          ? `รายการที่ลบจะถูกเก็บไว้ ${TRASH_RETENTION_DAYS} วัน ก่อนลบถาวรอัตโนมัติ`
          : `Deleted items are kept for ${TRASH_RETENTION_DAYS} days before being permanently removed.`}
      </p>
      {items.length === 0 ? (
        <div className="ps-empty">{t("trashEmpty")}</div>
      ) : (
        items.map((item) => {
          const daysLeft = Math.max(0, Math.ceil(TRASH_RETENTION_DAYS - daysSince(item.deletedAt)));
          const label =
            item.kind === "trip" ? (lang === "th" ? "ทริป" : "Trip")
            : item.kind === "quick" ? (lang === "th" ? "แชร์ด่วน" : "Quick split")
            : (lang === "th" ? "ปาร์ตี้" : "Party");
          return (
            <TornCard key={item.id}>
              <span className="ps-kind-badge kind-trip">{label}</span>
              <p className="ps-trip-name">{item.name}</p>
              <p className="ps-trip-meta">{lang === "th" ? `จะลบถาวรอีก ${daysLeft} วัน` : `Permanently deleted in ${daysLeft} day(s)`}</p>
              <div className="ps-form-actions" style={{ marginTop: 12 }}>
                <button className="ps-btn" onClick={() => restore(item)}><Unlock size={14} /> {t("restore")}</button>
                <button className="ps-btn-ghost ps-btn-danger" onClick={() => hardDelete(item)}><Trash2 size={13} /> {t("deleteForever")}</button>
              </div>
            </TornCard>
          );
        })
      )}
    </div>
  );
}

// ================= HOME =================
function Home({ data, query, setQuery, onNewTrip, onNewParty, onOpenTrip, onOpenParty, onOpenTrash, onViewDemoParty, onViewDemoTrip }) {
  const { t, lang } = useT();
  const combined = [...data.trips.map((t) => ({ ...t, kind: "trip" })), ...data.parties]
    .filter((item) => !item.deletedAt)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const filtered = combined.filter((item) => matchesSearch(item, query));
  const trashCount = data.trips.filter((t) => t.deletedAt).length + data.parties.filter((p) => p.deletedAt).length;

  const usedBytes = bytesOf(data);
  const pct = Math.min(100, (usedBytes / STORAGE_LIMIT_BYTES) * 100);
  const usageLevel = pct > 80 ? "danger" : pct > 50 ? "warn" : "ok";

  return (
    <div>
      <div className="ps-create-grid">
        <button className="ps-create-card create-party" onClick={onNewParty}>
          <div className="ps-cc-main">
            <div className="ps-cc-head">
              <span className="ps-cc-badge">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
                  <circle cx="9" cy="11" r="4.4" stroke="#B8860B" strokeWidth="1.6" />
                  <circle cx="15.5" cy="12.5" r="4.4" stroke="#B8860B" strokeWidth="1.6" />
                </svg>
              </span>
              <span className="ps-cc-title">{t("createParty")}</span>
            </div>
            <small className="ps-cc-sub">{t("createPartyHint")}</small>
          </div>
          <span className="ps-cc-arrow">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
        <button className="ps-create-card create-trip" onClick={onNewTrip}>
          <div className="ps-cc-main">
            <div className="ps-cc-head">
              <span className="ps-cc-badge">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
                  <path d="M12 20.5s6.2-6.7 6.2-11A6.2 6.2 0 1 0 5.8 9.5c0 4.3 6.2 11 6.2 11z" stroke="#1F6F54" strokeWidth="1.7" />
                  <circle cx="12" cy="9.3" r="2.1" fill="#1F6F54" />
                </svg>
              </span>
              <span className="ps-cc-title">{t("createTrip")}</span>
            </div>
            <small className="ps-cc-sub">{t("createTripHint")}</small>
          </div>
          <span className="ps-cc-arrow">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
      </div>

      <div className="ps-trash-entry-row">
        <button className="ps-btn-ghost ps-trash-btn" onClick={onOpenTrash}>
          <Trash2 size={13} /> {t("trash")}{trashCount > 0 ? ` (${trashCount})` : ""}
        </button>
      </div>

      {combined.length > 0 && (
        <div className="ps-storage-box">
          <div className="ps-storage-row">
            <span>{t("storageUsed")}: {formatBytes(usedBytes)} / ~5MB</span>
          </div>
          <div className="ps-storage-bar"><div className={`ps-storage-fill ${usageLevel}`} style={{ width: `${pct}%` }} /></div>
        </div>
      )}

      {combined.length > 0 && (
        <div className="ps-search-wrap">
          <Search size={15} className="ps-search-icon" />
          <input className="ps-input ps-search-input" placeholder={t("searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      )}

      {combined.length === 0 && <div className="ps-empty">{t("emptyHome")}</div>}
      {combined.length > 0 && filtered.length === 0 && (
        <div className="ps-empty">{lang === "th" ? `ไม่พบผลลัพธ์ที่ตรงกับ "${query}"` : `No results for "${query}"`}</div>
      )}

      <div className="ps-demo-row">
        <p className="ps-demo-label">{lang === "th" ? "หรือดูตัวอย่างก่อนใช้งาน" : "Or see an example first"}</p>
        <div className="ps-demo-buttons">
          <button type="button" className="ps-demo-btn" onClick={onViewDemoParty}>{lang === "th" ? "ตัวอย่างแชร์บิล" : "Example: split bill"}</button>
          <button type="button" className="ps-demo-btn" onClick={onViewDemoTrip}>{lang === "th" ? "ตัวอย่างทริป" : "Example: trip"}</button>
        </div>
      </div>

      <div className="ps-grid">
        {filtered.map((item) =>
          item.kind === "trip" ? (
            <TripCard key={item.id} trip={item} onClick={() => onOpenTrip(item.id)} />
          ) : (
            <PartyCard key={item.id} party={item} onClick={() => onOpenParty(item.id)} />
          )
        )}
      </div>
    </div>
  );
}

function StatusBadge({ closed, pending }) {
  const { lang } = useT();
  if (closed) return <span className="ps-badge closed">{lang === "th" ? "ปิดแล้ว ✓" : "Closed ✓"}</span>;
  return (
    <span className={`ps-badge ${pending === 0 ? "settled" : "pending"}`}>
      {pending === 0
        ? (lang === "th" ? "ลงตัวแล้ว" : "Settled")
        : (lang === "th" ? `ค้าง ${pending} รายการ` : `${pending} pending`)}
    </span>
  );
}

function TripCard({ trip, onClick }) {
  const { lang } = useT();
  const total = tripTotal(trip);
  const net = settlementNet(trip.members, trip.households, tripEntries(trip));
  const pending = simplifyDebts(net).length;
  return (
    <TornCard className="ps-trip-card" onClick={onClick}>
      <span className="ps-kind-badge kind-trip">{lang === "th" ? "ทริป" : "Trip"}</span>
      <p className="ps-trip-name">{trip.name}</p>
      <p className="ps-trip-meta">{trip.province ? `${trip.province} · ` : ""}{fmtDate(trip.startDate)}{trip.endDate ? ` - ${fmtDate(trip.endDate)}` : ""}</p>
      <p className="ps-trip-meta"><Users size={11} style={{ display: "inline", marginRight: 4, verticalAlign: -1 }} />{lang === "th" ? `${trip.members.length} คน` : `${trip.members.length} member(s)`}</p>
      <div className="ps-trip-total-row">
        <span className="ps-mono ps-trip-total">฿{fmt(total)}</span>
        <StatusBadge closed={trip.closed} pending={pending} />
      </div>
    </TornCard>
  );
}

function PartyCard({ party, onClick }) {
  const { lang } = useT();
  const total = partyTotal(party);
  const net = settlementNet(party.members, party.households, party.expenses);
  const pending = simplifyDebts(net).length;
  const label = party.kind === "quick" ? (lang === "th" ? "แชร์ด่วน" : "Quick split") : (lang === "th" ? "ปาร์ตี้" : "Party");
  return (
    <TornCard className="ps-trip-card" onClick={onClick}>
      <span className={`ps-kind-badge ${party.kind === "quick" ? "kind-quick" : "kind-party"}`}>{label}</span>
      <p className="ps-trip-name">{party.name}</p>
      <p className="ps-trip-meta">{party.date ? fmtDate(party.date) : ""}</p>
      <p className="ps-trip-meta"><Users size={11} style={{ display: "inline", marginRight: 4, verticalAlign: -1 }} />{lang === "th" ? `${party.members.length} คน · ${party.expenses.length} รายการ` : `${party.members.length} member(s) · ${party.expenses.length} item(s)`}</p>
      <div className="ps-trip-total-row">
        <span className="ps-mono ps-trip-total">฿{fmt(total)}</span>
        <StatusBadge closed={party.closed} pending={pending} />
      </div>
    </TornCard>
  );
}

// ================= SHARED INPUTS =================
function MemberChipInput({ members, setMembers }) {
  const { lang } = useT();
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim();
    if (v && !members.includes(v)) { setMembers([...members, v]); setInput(""); }
  };
  return (
    <>
      <div style={{ display: "flex", gap: 8 }}>
        <input className="ps-input" placeholder={lang === "th" ? "พิมพ์ชื่อเล่นแล้วกด Enter" : "Type a name and press Enter"} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} />
        <button className="ps-btn-ghost" type="button" onClick={add}><Plus size={14} /> {lang === "th" ? "เพิ่ม" : "Add"}</button>
      </div>
      {members.length > 0 && (
        <div className="ps-chip-row">
          {members.map((m) => (
            <span className="ps-chip" key={m}>{m}<button onClick={() => setMembers(members.filter((x) => x !== m))}><X size={12} /></button></span>
          ))}
        </div>
      )}
    </>
  );
}

function MemberCheckRow({ members, selected, toggle }) {
  return (
    <div className="ps-check-row">
      {members.map((m) => (
        <button key={m} type="button" className={`ps-check ${selected.includes(m) ? "on" : ""}`} onClick={() => toggle(m)}>
          {selected.includes(m) && <Check size={12} />}{m}
        </button>
      ))}
    </div>
  );
}

function SplitPicker({ members, selected, toggle, setSelected }) {
  const { lang } = useT();
  const allSelected = members.length > 0 && members.every((m) => selected.includes(m));
  return (
    <>
      <div className="ps-label-row">
        <label className="ps-label" style={{ margin: 0 }}>{lang === "th" ? "หารกับใคร" : "Split with"}</label>
        {setSelected && members.length > 1 && (
          <div className="ps-bulk-select">
            <button type="button" className="ps-bulk-btn" disabled={allSelected} onClick={() => setSelected([...members])}>
              {lang === "th" ? "เลือกทั้งหมด" : "Select all"}
            </button>
            <button type="button" className="ps-bulk-btn" disabled={selected.length === 0} onClick={() => setSelected([])}>
              {lang === "th" ? "ยกเลิกเลือกทั้งหมด" : "Deselect all"}
            </button>
          </div>
        )}
      </div>
      <p className="ps-hint">
        {lang === "th"
          ? "เลือกเฉพาะคนที่ต้องช่วยจ่ายรายการนี้ — ไม่จำเป็นต้องเป็นทุกคนที่กินหรือดื่ม เช่น มื้อครอบครัวที่บางคนเลี้ยง ก็เลือกหารแค่บางคนได้"
          : "Only pick who should actually pay this — not necessarily everyone who ate or drank. E.g. a family meal someone's treating, split with just a few."}
      </p>
      <MemberCheckRow members={members} selected={selected} toggle={toggle} />
    </>
  );
}

function MemberManagerPanel({ members, households, isReferenced, onAddMember, onRemoveMember, onCreateHousehold, onDissolveHousehold, onEditHousehold }) {
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  const [newMember, setNewMember] = useState("");

  const addMember = () => {
    const v = newMember.trim();
    if (v && !members.includes(v)) { onAddMember(v); setNewMember(""); }
  };
  const removeMember = (m) => {
    if (isReferenced(m)) {
      window.alert(lang === "th"
        ? `ลบไม่ได้ — "${m}" มีรายการอ้างอิงอยู่ในนี้แล้ว (ลบรายการที่เกี่ยวข้องก่อน)`
        : `Can't remove — "${m}" is referenced by an existing entry (remove those first).`);
      return;
    }
    const msg = lang === "th" ? `ลบสมาชิก "${m}" ออกจากลิสต์?` : `Remove "${m}" from the member list?`;
    if (window.confirm(msg)) onRemoveMember(m);
  };

  const memberCountText = lang === "th" ? `สมาชิกทั้งหมด ${members.length} คน` : `${members.length} member(s) total`;

  if (!open) {
    return (
      <div className="ps-member-mgr-row">
        <button className="ps-btn-ghost" onClick={() => setOpen(true)}>
          <Users size={13} /> {t("manageMembers")}
        </button>
        <span className="ps-member-count">{memberCountText}</span>
      </div>
    );
  }

  return (
    <TornCard>
      <p className="ps-section-title"><Users size={14} /> {t("manageMembers")}</p>
      <p className="ps-member-count" style={{ marginTop: -6, marginBottom: 10 }}>{memberCountText}</p>

      <label className="ps-label">{lang === "th" ? "เพิ่มสมาชิกใหม่" : "Add a new member"}</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="ps-input" placeholder={lang === "th" ? "พิมพ์ชื่อเล่นแล้วกด Enter" : "Type a name and press Enter"} value={newMember}
          onChange={(e) => setNewMember(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addMember())}
        />
        <button className="ps-btn-ghost" type="button" onClick={addMember}><Plus size={14} /> {t("add")}</button>
      </div>

      <label className="ps-label">{memberCountText}</label>
      <div className="ps-chip-row">
        {members.map((m) => (
          <span className="ps-chip" key={m}>
            {m}
            <button onClick={() => removeMember(m)}><X size={12} /></button>
          </span>
        ))}
      </div>

      <HouseholdGroupSection members={members} households={households} onCreateHousehold={onCreateHousehold} onDissolveHousehold={onDissolveHousehold} onEditHousehold={onEditHousehold} />

      <div className="ps-form-actions">
        <button className="ps-btn-ghost" onClick={() => setOpen(false)}>{t("close")}</button>
      </div>
    </TornCard>
  );
}

// ================= NEW TRIP FORM =================
function HouseholdGroupSection({ members, households, onCreateHousehold, onDissolveHousehold, onEditHousehold }) {
  const { lang } = useT();
  const [editingId, setEditingId] = useState(null); // null | "new" | an existing household's id
  const [groupName, setGroupName] = useState("");
  const [groupSelection, setGroupSelection] = useState([]);
  const [groupRep, setGroupRep] = useState("");

  // While editing a group, its own current members stay selectable (not
  // locked out as "already assigned elsewhere") — only OTHER groups' members
  // are excluded from the picker.
  const otherHouseholds = households.filter((h) => h.id !== editingId);
  const unassigned = members.filter((m) => !otherHouseholds.some((h) => h.memberNames.includes(m)));

  const toggleGroupMember = (m) => setGroupSelection((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]));
  const startCreate = () => { setEditingId("new"); setGroupName(""); setGroupSelection([]); setGroupRep(""); };
  const startEdit = (h) => { setEditingId(h.id); setGroupName(h.name || ""); setGroupSelection([...h.memberNames]); setGroupRep(h.representative); };
  const cancelForm = () => { setEditingId(null); setGroupName(""); setGroupSelection([]); setGroupRep(""); };
  const submitGroup = () => {
    if (groupSelection.length < 2 || !groupRep) return;
    const payload = { name: groupName.trim() || groupRep, memberNames: groupSelection, representative: groupRep };
    if (editingId === "new") onCreateHousehold({ id: uid("hh"), ...payload });
    else onEditHousehold(editingId, payload);
    cancelForm();
  };

  if (members.length < 3) return null;

  return (
    <div className="ps-group-section">
      <label className="ps-label" style={{ marginTop: 0 }}>{lang === "th" ? "จับคู่ / จัดกลุ่ม (ไม่บังคับ)" : "Pair up / group members (optional)"}</label>
      <p className="ps-hint">
        {lang === "th"
          ? "เช่น จับคู่สามีภรรยา หรือจัดกลุ่มครอบครัว แล้วเลือก 1 คนเป็นตัวแทนจ่าย — ทุกคนยังหารตามที่กินจริงเหมือนเดิม แต่ตอนโอนเงินจะเห็นแค่ชื่อตัวแทนของกลุ่มเท่านั้น ไม่ต้องเก็บเงินทีละคน"
          : "E.g. pair up a couple, or group a family, and pick one representative — everyone still splits by what they actually had, but at settlement time only the representative shows up in the transfer list."}
      </p>
      {households.map((h) => (
        editingId === h.id ? null : (
          <div key={h.id} className="ps-settle-item" style={{ marginBottom: 8 }}>
            <div>
              <b>{h.name}</b> — {lang === "th" ? "ตัวแทนจ่าย" : "Payer"} {h.representative}
              <div className="ps-ledger-meta">{lang === "th" ? "สมาชิก" : "Members"}: {h.memberNames.join(", ")}</div>
            </div>
            <div style={{ display: "flex", gap: 2, marginLeft: "auto" }}>
              <button type="button" className="ps-ledger-del" onClick={() => startEdit(h)}><Pencil size={14} /></button>
              <button type="button" className="ps-ledger-del" onClick={() => onDissolveHousehold(h.id)}><Trash2 size={14} /></button>
            </div>
          </div>
        )
      ))}
      {editingId === null ? (
        unassigned.length >= 2 && (
          <button type="button" className="ps-btn-ghost" onClick={startCreate}><Plus size={13} /> {lang === "th" ? "จับคู่ / สร้างกลุ่มใหม่" : "New pair / group"}</button>
        )
      ) : (
        <div style={{ borderTop: "1px dashed var(--line)", paddingTop: 12, marginTop: 8 }}>
          <p className="ps-section-title" style={{ fontSize: 13 }}>
            {editingId === "new" ? (lang === "th" ? "สร้างกลุ่มใหม่" : "New group") : (lang === "th" ? "แก้ไขกลุ่ม" : "Edit group")}
          </p>
          <label className="ps-label">{lang === "th" ? "ชื่อกลุ่ม (ไม่บังคับ)" : "Group name (optional)"}</label>
          <input className="ps-input" placeholder={lang === "th" ? "เช่น บ้าน 1, ครอบครัว A" : "e.g. Family A"} value={groupName} onChange={(e) => setGroupName(e.target.value)} />
          <label className="ps-label">{lang === "th" ? "เลือกสมาชิกในกลุ่มนี้" : "Select members for this group"}</label>
          <MemberCheckRow members={unassigned} selected={groupSelection} toggle={toggleGroupMember} />
          {groupSelection.length >= 2 && (
            <>
              <label className="ps-label">{lang === "th" ? "ใครเป็นตัวแทนจ่าย" : "Who is the representative"}</label>
              <select className="ps-select" value={groupRep} onChange={(e) => setGroupRep(e.target.value)}>
                <option value="">{lang === "th" ? "— เลือก —" : "— choose —"}</option>
                {groupSelection.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </>
          )}
          <div className="ps-form-actions">
            <button type="button" className="ps-btn" disabled={groupSelection.length < 2 || !groupRep} onClick={submitGroup}><Check size={14} /> {editingId === "new" ? (lang === "th" ? "สร้างกลุ่ม" : "Create group") : (lang === "th" ? "บันทึกการแก้ไข" : "Save changes")}</button>
            <button type="button" className="ps-btn-ghost" onClick={cancelForm}>{lang === "th" ? "ยกเลิก" : "Cancel"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function NewTripForm({ onCancel, onCreate }) {
  const { lang } = useT();
  const [name, setName] = useState("");
  const [province, setProvince] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [members, setMembers] = useState([]);
  const [households, setHouseholds] = useState([]);
  const canCreate = name.trim() && members.length >= 2;

  return (
    <div>
      <div className="ps-backrow">
        <button className="ps-iconbtn" onClick={onCancel}><ArrowLeft size={20} /></button>
        <span style={{ fontWeight: 700 }}>{lang === "th" ? "สร้างทริปใหม่" : "New trip"}</span>
      </div>
      <TornCard>
        <label className="ps-label">{lang === "th" ? "ชื่อทริป" : "Trip name"}</label>
        <input className="ps-input" placeholder={lang === "th" ? "เช่น ทริปเชียงใหม่ 3 วัน 2 คืน" : "e.g. Chiang Mai, 3 days 2 nights"} value={name} onChange={(e) => setName(e.target.value)} />
        <label className="ps-label">{lang === "th" ? "จังหวัด" : "Province"}</label>
        <input className="ps-input" placeholder={lang === "th" ? "เช่น เชียงใหม่" : "e.g. Chiang Mai"} value={province} onChange={(e) => setProvince(e.target.value)} />
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}><label className="ps-label">{lang === "th" ? "วันไป" : "Start date"}</label><input className="ps-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
          <div style={{ flex: 1 }}><label className="ps-label">{lang === "th" ? "วันกลับ" : "End date"}</label><input className="ps-input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
        </div>
        <label className="ps-label">{lang === "th" ? "สมาชิก (ชื่อเล่น อย่างน้อย 2 คน)" : "Members (at least 2)"}</label>
        <MemberChipInput members={members} setMembers={setMembers} />
        {members.length > 0 && (
          <p className="ps-member-count" style={{ marginTop: 6 }}>
            {lang === "th" ? `สมาชิกทั้งหมด ${members.length} คน` : `${members.length} member(s) total`}
          </p>
        )}
        <HouseholdGroupSection
          members={members}
          households={households}
          onCreateHousehold={(h) => setHouseholds([...households, h])}
          onDissolveHousehold={(id) => setHouseholds(households.filter((h) => h.id !== id))}
          onEditHousehold={(id, patch) => setHouseholds(households.map((h) => (h.id === id ? { ...h, ...patch } : h)))}
        />
        <div className="ps-form-actions">
          <button className="ps-btn" disabled={!canCreate} onClick={() => onCreate(name.trim(), province.trim(), startDate, endDate, members, households)}><Check size={15} /> {lang === "th" ? "สร้างทริป" : "Create trip"}</button>
          <button className="ps-btn-ghost" onClick={onCancel}>{lang === "th" ? "ยกเลิก" : "Cancel"}</button>
        </div>
      </TornCard>
    </div>
  );
}

// ================= TRIP DETAIL =================
function TripDetail({ trip, onBack, onUpdate, onDelete, isDemo, onUseAsMine }) {
  const { t, lang } = useT();
  const [tab, setTab] = useState("accom");
  const readOnly = isDemo || !!trip.closed;

  const addAccommodation = (a) => onUpdate((t) => ({ ...t, accommodations: [...t.accommodations, { id: uid("acc"), ...a }] }));
  const editAccommodation = (id, patch) => onUpdate((t) => ({ ...t, accommodations: t.accommodations.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  const deleteAccommodation = (id) => onUpdate((t) => ({ ...t, accommodations: t.accommodations.filter((a) => a.id !== id) }));

  const addMeal = (meal) => onUpdate((t) => ({ ...t, meals: [meal, ...t.meals] }));
  const editMeal = (mealId, patch) => onUpdate((t) => ({ ...t, meals: t.meals.map((m) => (m.id === mealId ? { ...m, ...patch } : m)) }));
  const deleteMeal = (mealId) => onUpdate((t) => ({ ...t, meals: t.meals.filter((m) => m.id !== mealId) }));
  const addMealItem = (mealId, item) => onUpdate((t) => ({ ...t, meals: t.meals.map((m) => (m.id === mealId ? { ...m, items: [...m.items, item] } : m)) }));
  const editMealItem = (mealId, itemId, patch) => onUpdate((t) => ({ ...t, meals: t.meals.map((m) => (m.id === mealId ? { ...m, items: m.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) } : m)) }));
  const deleteMealItem = (mealId, itemId) => onUpdate((t) => ({ ...t, meals: t.meals.map((m) => (m.id === mealId ? { ...m, items: m.items.filter((it) => it.id !== itemId) } : m)) }));

  return (
    <div>
      <div className="ps-backrow">
        <button className="ps-iconbtn" onClick={onBack}><ArrowLeft size={20} /></button>
        <span style={{ fontWeight: 700, flex: 1 }}>{trip.name}</span>
        {isDemo ? (
          <>
            <span className="ps-demo-badge">{lang === "th" ? "ตัวอย่าง" : "Example"}</span>
            <button className="ps-btn" onClick={onUseAsMine}>{lang === "th" ? "ใช้ตัวอย่างนี้เป็นรายการของฉัน" : "Use this as mine"}</button>
          </>
        ) : (
          <>
            <button className="ps-btn-ghost" onClick={() => onUpdate((t) => ({ ...t, closed: !t.closed, closedAt: !t.closed ? new Date().toISOString() : null }))}>
              {trip.closed ? <><Unlock size={13} /> {t("reopen")}</> : <><Lock size={13} /> {t("finishTrip")}</>}
            </button>
            <button className="ps-btn-ghost ps-btn-danger" onClick={onDelete}><Trash2 size={13} /> {t("deleteTrip")}</button>
          </>
        )}
      </div>
      <div className="ps-members-strip"><MapPin size={13} /> {trip.province || (lang === "th" ? "ไม่ระบุจังหวัด" : "No province set")} · {fmtDate(trip.startDate)}{trip.endDate ? ` - ${fmtDate(trip.endDate)}` : ""}</div>
      <div className="ps-members-strip"><Users size={13} /> {trip.members.join(" · ")}</div>

      {!readOnly && (
        <MemberManagerPanel
          members={trip.members}
          households={trip.households || []}
          isReferenced={(name) => isMemberReferenced(trip, name)}
          onAddMember={(name) => onUpdate((t) => ({ ...t, members: [...t.members, name] }))}
          onRemoveMember={(name) => onUpdate((t) => ({
            ...t,
            members: t.members.filter((m) => m !== name),
            households: (t.households || []).map((h) => ({ ...h, memberNames: h.memberNames.filter((m) => m !== name) })).filter((h) => h.memberNames.length >= 2),
          }))}
          onCreateHousehold={(h) => onUpdate((t) => ({ ...t, households: [...(t.households || []), h] }))}
          onDissolveHousehold={(id) => onUpdate((t) => ({ ...t, households: (t.households || []).filter((h) => h.id !== id) }))}
          onEditHousehold={(id, patch) => onUpdate((t) => ({ ...t, households: (t.households || []).map((h) => (h.id === id ? { ...h, ...patch } : h)) }))}
        />
      )}

      {readOnly && !isDemo && <ClosedBanner onReopen={() => onUpdate((t) => ({ ...t, closed: false, closedAt: null }))} />}

      <div className="ps-tabs">
        <button className={`ps-tab ${tab === "accom" ? "on" : ""}`} onClick={() => setTab("accom")}><Bed size={14} /> {t("tabAccommodation")}</button>
        <button className={`ps-tab ${tab === "meals" ? "on" : ""}`} onClick={() => setTab("meals")}><UtensilsCrossed size={14} /> {t("tabMeals")}</button>
        <button className={`ps-tab ${tab === "report" ? "on" : ""}`} onClick={() => setTab("report")}><BarChart3 size={14} /> {t("tabReport")}</button>
      </div>

      {tab === "accom" && <AccommodationTab trip={trip} readOnly={readOnly} onAdd={addAccommodation} onEdit={editAccommodation} onDelete={deleteAccommodation} />}
      {tab === "meals" && <MealsTab trip={trip} readOnly={readOnly} onAddMeal={addMeal} onEditMeal={editMeal} onDeleteMeal={deleteMeal} onAddItem={addMealItem} onEditItem={editMealItem} onDeleteItem={deleteMealItem} />}
      {tab === "report" && <ReportTab trip={trip} />}
    </div>
  );
}

function AccommodationTab({ trip, readOnly, onAdd, onEdit, onDelete }) {
  const { lang } = useT();
  const emptyForm = () => ({ night: trip.startDate || "", place: "", amount: "", paidBy: trip.members[0], splitAmong: trip.members });
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());

  const toggle = (m) => setForm((f) => ({ ...f, splitAmong: f.splitAmong.includes(m) ? f.splitAmong.filter((x) => x !== m) : [...f.splitAmong, m] }));
  const canSubmit = form.place.trim() && Number(form.amount) > 0 && form.splitAmong.length > 0;
  const total = round2(trip.accommodations.reduce((s, a) => s + a.amount, 0));

  const startEdit = (a) => { setEditingId(a.id); setForm({ night: a.night || "", place: a.place, amount: String(a.amount), paidBy: a.paidBy, splitAmong: a.splitAmong }); };
  const cancelEdit = () => { setEditingId(null); setForm(emptyForm()); };
  const submit = () => {
    const payload = { night: form.night, place: form.place.trim(), amount: round2(Number(form.amount)), paidBy: form.paidBy, splitAmong: form.splitAmong };
    if (editingId) onEdit(editingId, payload); else onAdd(payload);
    cancelEdit();
  };

  return (
    <div>
      {!readOnly && (
        <TornCard>
          <p className="ps-section-title"><Plus size={14} /> {editingId ? (lang === "th" ? "แก้ไขค่าที่พัก" : "Edit lodging") : (lang === "th" ? "เพิ่มค่าที่พัก" : "Add lodging")}</p>
          <label className="ps-label">{lang === "th" ? "คืนวันที่" : "Night of"}</label>
          <input className="ps-input" type="date" value={form.night} onChange={(e) => setForm((f) => ({ ...f, night: e.target.value }))} />
          <label className="ps-label">{lang === "th" ? "ชื่อที่พัก/โรงแรม" : "Hotel / lodging name"}</label>
          <input className="ps-input" placeholder={lang === "th" ? "เช่น บ้านสวนรีสอร์ท" : "e.g. Garden House Resort"} value={form.place} onChange={(e) => setForm((f) => ({ ...f, place: e.target.value }))} />
          <label className="ps-label">{lang === "th" ? "จำนวนเงิน (฿)" : "Amount (฿)"}</label>
          <input className="ps-input" type="number" min="0" placeholder="0.00" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
          <label className="ps-label">{lang === "th" ? "ใครจ่าย" : "Paid by"}</label>
          <p className="ps-hint">{lang === "th" ? "แต่ละคืนเลือกคนจ่ายแยกกันได้ เช่น คืนนี้ A จ่าย คืนหน้า B จ่ายก็ได้" : "Pick a different payer per night if needed — e.g. A pays tonight, B pays tomorrow."}</p>
          <select className="ps-select" value={form.paidBy} onChange={(e) => setForm((f) => ({ ...f, paidBy: e.target.value }))}>
            {trip.members.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <SplitPicker members={trip.members} selected={form.splitAmong} toggle={toggle} setSelected={(arr) => setForm((f) => ({ ...f, splitAmong: arr }))} />
          <div className="ps-form-actions">
            <button className="ps-btn" disabled={!canSubmit} onClick={submit}><Plus size={15} /> {editingId ? (lang === "th" ? "บันทึกการแก้ไข" : "Save changes") : (lang === "th" ? "เพิ่มที่พัก" : "Add")}</button>
            {editingId && <button className="ps-btn-ghost" onClick={cancelEdit}>{lang === "th" ? "ยกเลิก" : "Cancel"}</button>}
          </div>
        </TornCard>
      )}

      <TornCard>
        <p className="ps-section-title"><Bed size={14} /> {lang === "th" ? `รายการที่พัก (${trip.accommodations.length})` : `Lodging (${trip.accommodations.length})`}</p>
        {trip.accommodations.length === 0 ? (
          <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>{lang === "th" ? "ยังไม่มีรายการที่พัก" : "No lodging entries yet"}</p>
        ) : (
          <ul className="ps-ledger">
            {trip.accommodations.slice().sort((a, b) => (a.night || "").localeCompare(b.night || "")).map((a) => (
              <li key={a.id}>
                <div style={{ flex: 1 }}>
                  <div className="ps-ledger-desc">{a.place}</div>
                  <div className="ps-ledger-meta">{fmtDate(a.night)} · <strong className="ps-payer-name">{a.paidBy}</strong><span className="ps-payer-verb">{lang === "th" ? " จ่าย" : " paid"}</span><span className="ps-participant-count">{lang === "th" ? ` · หาร ${a.splitAmong.length} คน` : ` · split ${a.splitAmong.length}`}</span></div>
                </div>
                <span className="ps-mono ps-ledger-amt">฿{fmt(a.amount)}</span>
                {!readOnly && (
                  <>
                    <button className="ps-ledger-del" onClick={() => startEdit(a)}><Pencil size={15} /></button>
                    <button className="ps-ledger-del" onClick={() => onDelete(a.id)}><Trash2 size={15} /></button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="ps-total-row"><span className="ps-total-label">{lang === "th" ? "รวมค่าที่พัก" : "Total lodging"}</span><span className="ps-mono ps-total-amt">฿{fmt(total)}</span></div>
      </TornCard>
    </div>
  );
}

function MealsTab({ trip, readOnly, onAddMeal, onEditMeal, onDeleteMeal, onAddItem, onEditItem, onDeleteItem }) {
  const { lang } = useT();
  const [date, setDate] = useState(trip.startDate || "");
  const [mealType, setMealType] = useState("dinner");
  const [place, setPlace] = useState("");
  const [paidBy, setPaidBy] = useState(trip.members[0]);
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("food");
  const [splitAmong, setSplitAmong] = useState(trip.members);

  const toggle = (m) => setSplitAmong((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]));
  const canSubmit = place.trim() && desc.trim() && Number(amount) > 0 && splitAmong.length > 0;

  const submit = () => {
    onAddMeal({
      id: uid("meal"), date, mealType, place: place.trim(), paidBy, closed: false,
      items: [{ id: uid("item"), desc: desc.trim(), amount: round2(Number(amount)), category, splitAmong }],
    });
    setDesc(""); setAmount(""); setSplitAmong(trip.members);
  };

  return (
    <div>
      {!readOnly && (
        <TornCard>
          <p className="ps-section-title"><Plus size={14} /> {lang === "th" ? "เพิ่มมื้ออาหารใหม่" : "Add a new meal"}</p>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}><label className="ps-label">{lang === "th" ? "วันที่" : "Date"}</label><input className="ps-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div style={{ flex: 1 }}>
              <label className="ps-label">{lang === "th" ? "มื้อ" : "Meal"}</label>
              <select className="ps-select" value={mealType} onChange={(e) => setMealType(e.target.value)}>
                {MEAL_TYPES.map((m) => <option key={m.v} value={m.v}>{mealTypeLabel(m.v, lang)}</option>)}
              </select>
            </div>
          </div>
          <label className="ps-label">{lang === "th" ? "ชื่อร้าน" : "Restaurant name"}</label>
          <input className="ps-input" placeholder={lang === "th" ? "เช่น ร้านลาบเป็ดป้าแดง" : "e.g. Somtum Corner"} value={place} onChange={(e) => setPlace(e.target.value)} />
          <label className="ps-label">{lang === "th" ? "ใครจ่าย (บิลนี้)" : "Paid by (this bill)"}</label>
          <p className="ps-hint">{lang === "th" ? "แต่ละมื้อ/แต่ละบิลเลือกคนจ่ายแยกกันได้ เช่น มื้อนี้คุณจ่ายร้านอาหาร แต่บิลเซเว่นให้อีกคนจ่าย ก็สร้างเป็นอีกมื้อแล้วเลือกคนจ่ายต่างกันได้เลย" : "Pick a different payer per meal/bill — e.g. you pay this restaurant, someone else pays the 7-Eleven run, just add that as another meal with a different payer."}</p>
          <select className="ps-select" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
            {trip.members.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>

          <p className="ps-section-title" style={{ marginTop: 18 }}>{lang === "th" ? "รายการแรกของมื้อนี้" : "First item in this meal"}</p>
          <label className="ps-label">{lang === "th" ? "รายการ" : "Item"}</label>
          <input className="ps-input" placeholder={lang === "th" ? "เช่น ลาบเป็ด, เบียร์ช้าง 3 ขวด" : "e.g. Larb duck, 3 bottles of beer"} value={desc} onChange={(e) => setDesc(e.target.value)} />
          <label className="ps-label">{lang === "th" ? "จำนวนเงิน (฿)" : "Amount (฿)"}</label>
          <input className="ps-input" type="number" min="0" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <label className="ps-label">{lang === "th" ? "ประเภท" : "Category"}</label>
          <div className="ps-check-row">
            {CATS.map((c) => (
              <button key={c.v} type="button" className={`ps-check ${category === c.v ? "on" : ""}`} onClick={() => setCategory(c.v)}>{category === c.v && <Check size={12} />} {catLabel(c.v, lang)}</button>
            ))}
          </div>
          <SplitPicker members={trip.members} selected={splitAmong} toggle={toggle} setSelected={setSplitAmong} />
          <div className="ps-form-actions">
            <button className="ps-btn" disabled={!canSubmit} onClick={submit}><Plus size={15} /> {lang === "th" ? "เพิ่มมื้ออาหาร" : "Add meal"}</button>
          </div>
        </TornCard>
      )}

      <p className="ps-section-title"><UtensilsCrossed size={14} /> {lang === "th" ? `มื้ออาหารทั้งหมด (${trip.meals.length})` : `All meals (${trip.meals.length})`}</p>
      {trip.meals.length === 0 && <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>{lang === "th" ? "ยังไม่มีมื้ออาหาร" : "No meals yet"}</p>}
      {trip.meals.map((meal) => (
        <MealCard key={meal.id} trip={trip} meal={meal} tripReadOnly={readOnly} onEditMeal={onEditMeal} onAddItem={onAddItem} onEditItem={onEditItem} onDeleteMeal={onDeleteMeal} onDeleteItem={onDeleteItem} />
      ))}
    </div>
  );
}

function MealCard({ trip, meal, tripReadOnly, onEditMeal, onAddItem, onEditItem, onDeleteMeal, onDeleteItem }) {
  const { lang } = useT();
  const readOnly = tripReadOnly || !!meal.closed;
  const [mode, setMode] = useState(null); // null | 'addItem' | 'editItem' | 'editMeal'
  const [editingItemId, setEditingItemId] = useState(null);
  const emptyItem = () => ({ desc: "", amount: "", category: "food", splitAmong: trip.members });
  const [itemForm, setItemForm] = useState(emptyItem());
  const [mealForm, setMealForm] = useState({ date: meal.date, mealType: meal.mealType, place: meal.place, paidBy: meal.paidBy });

  const mealLabel = mealTypeLabel(meal.mealType, lang);
  const mealTotal = round2(meal.items.reduce((s, it) => s + it.amount, 0));
  const toggle = (m) => setItemForm((f) => ({ ...f, splitAmong: f.splitAmong.includes(m) ? f.splitAmong.filter((x) => x !== m) : [...f.splitAmong, m] }));

  const startAddItem = () => { setItemForm(emptyItem()); setEditingItemId(null); setMode("addItem"); };
  const startEditItem = (it) => { setItemForm({ desc: it.desc, amount: String(it.amount), category: it.category, splitAmong: it.splitAmong }); setEditingItemId(it.id); setMode("editItem"); };
  const cancelItemForm = () => { setMode(null); setEditingItemId(null); };
  const submitItem = () => {
    const payload = { desc: itemForm.desc.trim(), amount: round2(Number(itemForm.amount)), category: itemForm.category, splitAmong: itemForm.splitAmong };
    if (editingItemId) onEditItem(meal.id, editingItemId, payload);
    else onAddItem(meal.id, { id: uid("item"), ...payload });
    cancelItemForm();
  };
  const canSubmitItem = itemForm.desc.trim() && Number(itemForm.amount) > 0 && itemForm.splitAmong.length > 0;

  const submitMealEdit = () => { onEditMeal(meal.id, mealForm); setMode(null); };

  return (
    <TornCard>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          {mode === "editMeal" ? (
            <div>
              <label className="ps-label">{lang === "th" ? "ชื่อร้าน" : "Restaurant name"}</label>
              <input className="ps-input" value={mealForm.place} onChange={(e) => setMealForm((f) => ({ ...f, place: e.target.value }))} />
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}><label className="ps-label">{lang === "th" ? "วันที่" : "Date"}</label><input className="ps-input" type="date" value={mealForm.date} onChange={(e) => setMealForm((f) => ({ ...f, date: e.target.value }))} /></div>
                <div style={{ flex: 1 }}>
                  <label className="ps-label">{lang === "th" ? "มื้อ" : "Meal"}</label>
                  <select className="ps-select" value={mealForm.mealType} onChange={(e) => setMealForm((f) => ({ ...f, mealType: e.target.value }))}>
                    {MEAL_TYPES.map((m) => <option key={m.v} value={m.v}>{mealTypeLabel(m.v, lang)}</option>)}
                  </select>
                </div>
              </div>
              <label className="ps-label">{lang === "th" ? "ใครจ่าย" : "Paid by"}</label>
              <select className="ps-select" value={mealForm.paidBy} onChange={(e) => setMealForm((f) => ({ ...f, paidBy: e.target.value }))}>
                {trip.members.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <div className="ps-form-actions">
                <button className="ps-btn" onClick={submitMealEdit}><Check size={14} /> {lang === "th" ? "บันทึก" : "Save"}</button>
                <button className="ps-btn-ghost" onClick={() => setMode(null)}>{lang === "th" ? "ยกเลิก" : "Cancel"}</button>
              </div>
            </div>
          ) : (
            <>
              <p className="ps-trip-name" style={{ fontSize: 15 }}>{meal.place}</p>
              <p className="ps-ledger-meta">
                <span className="ps-meal-heading">{fmtDate(meal.date)} · {mealLabel}</span>
                {" · "}<strong className="ps-payer-name">{meal.paidBy}</strong><span className="ps-payer-verb">{lang === "th" ? " จ่าย" : " paid"}</span>
                {meal.closed ? (lang === "th" ? " · ปิดมื้อนี้แล้ว" : " · closed") : ""}
              </p>
            </>
          )}
        </div>
        {!readOnly && mode !== "editMeal" && (
          <div style={{ display: "flex", gap: 4 }}>
            <button className="ps-ledger-del" onClick={() => { setMode("editMeal"); setMealForm({ date: meal.date, mealType: meal.mealType, place: meal.place, paidBy: meal.paidBy }); }}><Pencil size={15} /></button>
            <button className="ps-ledger-del" onClick={() => onDeleteMeal(meal.id)}><Trash2 size={15} /></button>
          </div>
        )}
      </div>

      <ul className="ps-ledger">
        {meal.items.map((it) => (
          <li key={it.id}>
            <div style={{ flex: 1 }}>
              <div className="ps-ledger-desc">{it.desc} <span className={`ps-cat-tag ${catCls(it.category)}`}>{catLabel(it.category, lang)}</span></div>
              <div className="ps-ledger-meta">{lang === "th" ? "หารกับ" : "Split with"}: {it.splitAmong.join(", ")}</div>
            </div>
            <span className="ps-mono ps-ledger-amt">฿{fmt(it.amount)}</span>
            {!readOnly && (
              <>
                <button className="ps-ledger-del" onClick={() => startEditItem(it)}><Pencil size={15} /></button>
                <button className="ps-ledger-del" onClick={() => onDeleteItem(meal.id, it.id)}><Trash2 size={15} /></button>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="ps-total-row" style={{ marginTop: 10 }}>
        <span className="ps-total-label" style={{ fontSize: 13 }}>{lang === "th" ? "รวมมื้อนี้" : "Meal total"}</span>
        <span className="ps-mono" style={{ fontWeight: 700 }}>฿{fmt(mealTotal)}</span>
      </div>

      {!readOnly && (mode === "addItem" || mode === "editItem") && (
        <div style={{ marginTop: 12, borderTop: "1px dashed var(--line)", paddingTop: 12 }}>
          <label className="ps-label">{lang === "th" ? "รายการ" : "Item"}</label>
          <input className="ps-input" value={itemForm.desc} onChange={(e) => setItemForm((f) => ({ ...f, desc: e.target.value }))} placeholder={lang === "th" ? "เช่น เหล้าขาว 1 แบน" : "e.g. 1 bottle of whiskey"} />
          <label className="ps-label">{lang === "th" ? "จำนวนเงิน (฿)" : "Amount (฿)"}</label>
          <input className="ps-input" type="number" min="0" value={itemForm.amount} onChange={(e) => setItemForm((f) => ({ ...f, amount: e.target.value }))} />
          <label className="ps-label">{lang === "th" ? "ประเภท" : "Category"}</label>
          <div className="ps-check-row">
            {CATS.map((c) => (
              <button key={c.v} type="button" className={`ps-check ${itemForm.category === c.v ? "on" : ""}`} onClick={() => setItemForm((f) => ({ ...f, category: c.v }))}>{itemForm.category === c.v && <Check size={12} />} {catLabel(c.v, lang)}</button>
            ))}
          </div>
          <SplitPicker members={trip.members} selected={itemForm.splitAmong} toggle={toggle} setSelected={(arr) => setItemForm((f) => ({ ...f, splitAmong: arr }))} />
          <div className="ps-form-actions">
            <button className="ps-btn" disabled={!canSubmitItem} onClick={submitItem}><Plus size={14} /> {mode === "editItem" ? (lang === "th" ? "บันทึกการแก้ไข" : "Save changes") : (lang === "th" ? "เพิ่มรายการ" : "Add item")}</button>
            <button className="ps-btn-ghost" onClick={cancelItemForm}>{lang === "th" ? "ยกเลิก" : "Cancel"}</button>
          </div>
        </div>
      )}

      {!readOnly && mode === null && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button className="ps-btn-ghost" onClick={startAddItem}><Plus size={13} /> {lang === "th" ? "เพิ่มรายการในมื้อนี้" : "Add item to this meal"}</button>
          <button className="ps-btn-ghost" onClick={() => onEditMeal(meal.id, { closed: true })}><Lock size={13} /> {lang === "th" ? "จบมื้อนี้" : "Finish this meal"}</button>
        </div>
      )}
      {!tripReadOnly && meal.closed && (
        <button className="ps-btn-ghost" style={{ marginTop: 12 }} onClick={() => onEditMeal(meal.id, { closed: false })}><Unlock size={13} /> {lang === "th" ? "เปิดแก้ไขมื้อนี้" : "Reopen this meal"}</button>
      )}
    </TornCard>
  );
}

function ReportTab({ trip }) {
  const { t, lang } = useT();
  const cat = tripCategoryTotals(trip);
  const grand = round2(cat.accommodation + cat.food + cat.beer + cat.liquor + cat.other);
  const breakdown = tripPersonItemBreakdown(trip);
  const net = computeBalancesFromEntries(trip.members, tripEntries(trip));
  const households = trip.households || [];
  const settlements = simplifyDebts(settlementNet(trip.members, households, tripEntries(trip)));

  return (
    <div>
      <TornCard>
        <p className="ps-section-title"><BarChart3 size={14} /> {lang === "th" ? "สรุปยอดรวมทริป" : "Trip totals"}</p>
        <div className="ps-balance-row"><span><Bed size={12} style={{ verticalAlign: -1, marginRight: 4 }} />{lang === "th" ? "ค่าที่พัก" : "Lodging"}</span><span className="ps-mono">฿{fmt(cat.accommodation)}</span></div>
        <div className="ps-balance-row"><span><span className="ps-cat-dot cat-food" />{catLabel("food", lang)}</span><span className="ps-mono">฿{fmt(cat.food)}</span></div>
        <div className="ps-balance-row"><span><span className="ps-cat-dot cat-beer" />{catLabel("beer", lang)}</span><span className="ps-mono">฿{fmt(cat.beer)}</span></div>
        <div className="ps-balance-row"><span><span className="ps-cat-dot cat-liquor" />{catLabel("liquor", lang)}</span><span className="ps-mono">฿{fmt(cat.liquor)}</span></div>
        {cat.other > 0 && <div className="ps-balance-row"><span><span className="ps-cat-dot cat-other" />{catLabel("other", lang)}</span><span className="ps-mono">฿{fmt(cat.other)}</span></div>}
        <div className="ps-total-row"><span className="ps-total-label">{lang === "th" ? "รวมทั้งทริป" : "Trip total"}</span><span className="ps-mono ps-total-amt">฿{fmt(grand)}</span></div>
      </TornCard>

      <TornCard>
        <p className="ps-section-title"><Wallet size={14} /> {lang === "th" ? "สรุปคนที่จ่ายจริง" : "Who actually paid"}</p>
        {trip.members.filter((m) => breakdown[m].paid > 0.005).length === 0 ? (
          <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>{lang === "th" ? "ยังไม่มีใครจ่ายบิลเลย" : "Nobody has paid a bill yet"}</p>
        ) : (
          trip.members.filter((m) => breakdown[m].paid > 0.005).map((m) => (
            <div key={m} style={{ borderBottom: "1px dashed var(--line)", padding: "8px 0" }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{m}</div>
              <div className="ps-paid-verify">{lang === "th" ? `จ่ายไปจริงทั้งหมด ฿${fmt(breakdown[m].paid)}` : `Actually paid in total ฿${fmt(breakdown[m].paid)}`}</div>
            </div>
          ))
        )}
      </TornCard>

      <TornCard>
        <p className="ps-section-title"><Users size={14} /> {lang === "th" ? "รายงานแยกรายคน" : "Per-person report"}</p>
        {trip.members.map((m) => {
          const b = breakdown[m];
          const shareTotal = b.items.reduce((s, it) => s + it.amount, 0);
          const v = net[m] || 0;
          const cls = v > 0.01 ? "pos" : v < -0.01 ? "neg" : "zero";
          return (
            <div key={m} style={{ borderBottom: "1px dashed var(--line)", padding: "10px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 14 }}>
                <span>{m}</span>
                <span className={`ps-mono ps-balance-amt ${cls}`}>
                  {v > 0.01 ? (lang === "th" ? "ได้คืน " : "gets back ") : v < -0.01 ? (lang === "th" ? "ต้องจ่าย " : "owes ") : ""}฿{fmt(Math.abs(v))}
                </span>
              </div>
              <div className="ps-ledger-meta" style={{ marginTop: 4 }}>
                {lang === "th" ? `ใช้ไปทั้งหมด ฿${fmt(shareTotal)}` : `Total spent ฿${fmt(shareTotal)}`}
              </div>
              {b.items.length > 0 && (
                <ul className="ps-item-breakdown">
                  {b.items.map((it, i) => (
                    <li key={i}>
                      <span className="ps-item-desc">
                        {it.desc}
                        <span className={`ps-cat-tag ${catCls(it.category)}`}>{it.category === "accommodation" ? (lang === "th" ? "ที่พัก" : "Lodging") : catLabel(it.category, lang)}</span>
                      </span>
                      <span className="ps-mono ps-item-amt">฿{fmt(it.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </TornCard>

      <TornCard>
        <p className="ps-section-title">{t("settlementTitle")}</p>
        {households.length > 0 && (
          <p className="ps-hint">{t("householdHint")}</p>
        )}
        {settlements.length === 0 ? (
          <div className="ps-stamp"><b>{t("settledStamp")}</b></div>
        ) : (
          settlements.map((s, i) => (
            <div className="ps-settle-item" key={i}><b>{s.from}</b><ArrowRight size={14} color="var(--ink-soft)" /><b>{s.to}</b><span className="ps-mono ps-settle-amt">฿{fmt(s.amount)}</span></div>
          ))
        )}
      </TornCard>
    </div>
  );
}

// ================= PARTY (also used for saved quick-splits) =================
function NewPartyForm({ title, hint, onCancel, onCreate }) {
  const { lang } = useT();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [members, setMembers] = useState([]);
  const [households, setHouseholds] = useState([]);
  const canCreate = name.trim() && members.length >= 2;

  return (
    <div>
      <div className="ps-backrow"><button className="ps-iconbtn" onClick={onCancel}><ArrowLeft size={20} /></button><span style={{ fontWeight: 700 }}>{title}</span></div>
      <TornCard>
        <label className="ps-label">{lang === "th" ? "ชื่องาน" : "Name"}</label>
        <input className="ps-input" placeholder={hint} value={name} onChange={(e) => setName(e.target.value)} />
        <label className="ps-label">{lang === "th" ? "วันที่ (ไม่บังคับ)" : "Date (optional)"}</label>
        <input className="ps-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <label className="ps-label">{lang === "th" ? "สมาชิก (อย่างน้อย 2 คน)" : "Members (at least 2)"}</label>
        <MemberChipInput members={members} setMembers={setMembers} />
        {members.length > 0 && (
          <p className="ps-member-count" style={{ marginTop: 6 }}>
            {lang === "th" ? `สมาชิกทั้งหมด ${members.length} คน` : `${members.length} member(s) total`}
          </p>
        )}
        <HouseholdGroupSection
          members={members}
          households={households}
          onCreateHousehold={(h) => setHouseholds([...households, h])}
          onDissolveHousehold={(id) => setHouseholds(households.filter((h) => h.id !== id))}
          onEditHousehold={(id, patch) => setHouseholds(households.map((h) => (h.id === id ? { ...h, ...patch } : h)))}
        />
        <div className="ps-form-actions">
          <button className="ps-btn" disabled={!canCreate} onClick={() => onCreate(name.trim(), date, members, households)}><Check size={15} /> {lang === "th" ? "สร้าง" : "Create"}</button>
          <button className="ps-btn-ghost" onClick={onCancel}>{lang === "th" ? "ยกเลิก" : "Cancel"}</button>
        </div>
      </TornCard>
    </div>
  );
}

function PartyDetail({ party, onBack, onUpdate, onDelete, isDemo, onUseAsMine }) {
  const { t, lang } = useT();
  const readOnly = isDemo || !!party.closed;
  const emptyForm = () => ({ desc: "", amount: "", paidBy: party.members[0], splitAmong: party.members });
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());

  const total = partyTotal(party);
  const net = computeBalancesFromEntries(party.members, party.expenses);
  const households = party.households || [];
  const settlements = simplifyDebts(settlementNet(party.members, households, party.expenses));
  const toggle = (m) => setForm((f) => ({ ...f, splitAmong: f.splitAmong.includes(m) ? f.splitAmong.filter((x) => x !== m) : [...f.splitAmong, m] }));
  const canSubmit = form.desc.trim() && Number(form.amount) > 0 && form.splitAmong.length > 0;
  const label = party.kind === "quick" ? (lang === "th" ? "แชร์ด่วน" : "Quick split") : (lang === "th" ? "ปาร์ตี้" : "Party");

  const startEdit = (e) => { setEditingId(e.id); setForm({ desc: e.desc, amount: String(e.amount), paidBy: e.paidBy, splitAmong: e.splitAmong }); };
  const cancelEdit = () => { setEditingId(null); setForm(emptyForm()); };
  const submit = () => {
    const payload = { desc: form.desc.trim(), amount: round2(Number(form.amount)), paidBy: form.paidBy, splitAmong: form.splitAmong };
    if (editingId) onUpdate((p) => ({ ...p, expenses: p.expenses.map((e) => (e.id === editingId ? { ...e, ...payload } : e)) }));
    else onUpdate((p) => ({ ...p, expenses: [{ id: uid("exp"), ...payload }, ...p.expenses] }));
    cancelEdit();
  };
  const deleteExpense = (id) => onUpdate((p) => ({ ...p, expenses: p.expenses.filter((e) => e.id !== id) }));

  return (
    <div>
      <div className="ps-backrow">
        <button className="ps-iconbtn" onClick={onBack}><ArrowLeft size={20} /></button>
        <span style={{ fontWeight: 700, flex: 1 }}>{party.name} <span className="ps-kind-badge kind-party" style={{ marginLeft: 8 }}>{label}</span></span>
        {isDemo ? (
          <>
            <span className="ps-demo-badge">{lang === "th" ? "ตัวอย่าง" : "Example"}</span>
            <button className="ps-btn" onClick={onUseAsMine}>{lang === "th" ? "ใช้ตัวอย่างนี้เป็นรายการของฉัน" : "Use this as mine"}</button>
          </>
        ) : (
          <>
            <button className="ps-btn-ghost" onClick={() => onUpdate((p) => ({ ...p, closed: !p.closed }))}>{party.closed ? <><Unlock size={13} /> {t("reopen")}</> : <><Lock size={13} /> {t("finishParty")}</>}</button>
            <button className="ps-btn-ghost ps-btn-danger" onClick={onDelete}><Trash2 size={13} /> {t("delete")}</button>
          </>
        )}
      </div>
      <div className="ps-members-strip"><Users size={13} /> {party.members.join(" · ")}{party.date ? ` · ${fmtDate(party.date)}` : ""}</div>

      {!readOnly && (
        <MemberManagerPanel
          members={party.members}
          households={party.households || []}
          isReferenced={(name) => isMemberReferenced(party, name)}
          onAddMember={(name) => onUpdate((p) => ({ ...p, members: [...p.members, name] }))}
          onRemoveMember={(name) => onUpdate((p) => ({
            ...p,
            members: p.members.filter((m) => m !== name),
            households: (p.households || []).map((h) => ({ ...h, memberNames: h.memberNames.filter((m) => m !== name) })).filter((h) => h.memberNames.length >= 2),
          }))}
          onCreateHousehold={(h) => onUpdate((p) => ({ ...p, households: [...(p.households || []), h] }))}
          onDissolveHousehold={(id) => onUpdate((p) => ({ ...p, households: (p.households || []).filter((h) => h.id !== id) }))}
          onEditHousehold={(id, patch) => onUpdate((p) => ({ ...p, households: (p.households || []).map((h) => (h.id === id ? { ...h, ...patch } : h)) }))}
        />
      )}

      {readOnly && !isDemo && <ClosedBanner onReopen={() => onUpdate((p) => ({ ...p, closed: false }))} />}

      {!readOnly && (
        <TornCard>
          <p className="ps-section-title"><Plus size={14} /> {editingId ? (lang === "th" ? "แก้ไขรายการ" : "Edit item") : (lang === "th" ? "เพิ่มรายการค่าใช้จ่าย" : "Add an expense")}</p>
          <label className="ps-label">{lang === "th" ? "รายการ" : "Item"}</label>
          <input className="ps-input" placeholder={lang === "th" ? "เช่น ค่าอาหารเย็น, ค่าเซเว่น" : "e.g. Dinner, 7-Eleven run"} value={form.desc} onChange={(e) => setForm((f) => ({ ...f, desc: e.target.value }))} />
          <label className="ps-label">{lang === "th" ? "จำนวนเงิน (฿)" : "Amount (฿)"}</label>
          <input className="ps-input" type="number" min="0" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
          <label className="ps-label">{lang === "th" ? "ใครจ่าย" : "Paid by"}</label>
          <p className="ps-hint">{lang === "th" ? "แต่ละรายการเลือกคนจ่ายแยกกันได้ ไม่จำเป็นต้องเป็นคนเดียวกันทุกรายการ เช่น รายการนี้ A จ่ายร้านอาหาร แต่รายการค่าเซเว่นให้ B จ่ายก็เลือก B ได้เลย" : "Pick a different payer per item if you like — e.g. A pays for dinner, B pays for the 7-Eleven run."}</p>
          <select className="ps-select" value={form.paidBy} onChange={(e) => setForm((f) => ({ ...f, paidBy: e.target.value }))}>
            {party.members.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <SplitPicker members={party.members} selected={form.splitAmong} toggle={toggle} setSelected={(arr) => setForm((f) => ({ ...f, splitAmong: arr }))} />
          <div className="ps-form-actions">
            <button className="ps-btn" disabled={!canSubmit} onClick={submit}><Plus size={15} /> {editingId ? (lang === "th" ? "บันทึกการแก้ไข" : "Save changes") : (lang === "th" ? "เพิ่มรายการ" : "Add item")}</button>
            {editingId && <button className="ps-btn-ghost" onClick={cancelEdit}>{lang === "th" ? "ยกเลิก" : "Cancel"}</button>}
          </div>
        </TornCard>
      )}

      <TornCard>
        <p className="ps-section-title"><Receipt size={14} /> {lang === "th" ? `รายการทั้งหมด (${party.expenses.length})` : `All items (${party.expenses.length})`}</p>
        {party.expenses.length === 0 ? (
          <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>{lang === "th" ? "ยังไม่มีรายการ" : "No items yet"}</p>
        ) : (
          <ul className="ps-ledger">
            {party.expenses.map((e) => (
              <li key={e.id}>
                <div style={{ flex: 1 }}>
                  <div className="ps-ledger-desc">{e.desc}</div>
                  <div className="ps-ledger-meta">
                    <strong className="ps-payer-name">{e.paidBy}</strong><span className="ps-payer-verb">{lang === "th" ? " จ่าย" : " paid"}</span><span className="ps-participant-count">{lang === "th" ? ` · หาร ${e.splitAmong.length} คน` : ` · split ${e.splitAmong.length}`}</span>
                  </div>
                </div>
                <span className="ps-mono ps-ledger-amt">฿{fmt(e.amount)}</span>
                {!readOnly && (
                  <>
                    <button className="ps-ledger-del" onClick={() => startEdit(e)}><Pencil size={15} /></button>
                    <button className="ps-ledger-del" onClick={() => deleteExpense(e.id)}><Trash2 size={15} /></button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="ps-total-row"><span className="ps-total-label">{lang === "th" ? "รวมทั้งหมด" : "Total"}</span><span className="ps-mono ps-total-amt">฿{fmt(total)}</span></div>
      </TornCard>

      <TornCard>
        <p className="ps-section-title"><Wallet size={14} /> {lang === "th" ? "สรุปคนที่จ่ายจริง" : "Who actually paid"}</p>
        {(() => {
          const payers = party.members.filter((m) => party.expenses.filter((e) => e.paidBy === m).reduce((s, e) => s + e.amount, 0) > 0.005);
          if (payers.length === 0) {
            return <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>{lang === "th" ? "ยังไม่มีใครจ่ายบิลเลย" : "Nobody has paid a bill yet"}</p>;
          }
          return payers.map((m) => {
            const paidTotal = party.expenses.filter((e) => e.paidBy === m).reduce((s, e) => s + e.amount, 0);
            return (
              <div key={m} style={{ borderBottom: "1px dashed var(--line)", padding: "8px 0" }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{m}</div>
                <div className="ps-paid-verify">{lang === "th" ? `จ่ายไปจริงทั้งหมด ฿${fmt(paidTotal)}` : `Actually paid in total ฿${fmt(paidTotal)}`}</div>
              </div>
            );
          });
        })()}
      </TornCard>

      <TornCard>
        <p className="ps-section-title"><Wallet size={14} /> {lang === "th" ? "สรุปยอดแต่ละคน" : "Per-person balance"}</p>
        {party.members.map((m) => {
          const v = net[m] || 0;
          const cls = v > 0.01 ? "pos" : v < -0.01 ? "neg" : "zero";
          return (
            <div className="ps-balance-row" key={m}>
              <span>{m}</span>
              <span className={`ps-mono ps-balance-amt ${cls}`}>
                {v > 0.01 ? (lang === "th" ? "ได้คืน " : "gets back ") : v < -0.01 ? (lang === "th" ? "ต้องจ่าย " : "owes ") : ""}฿{fmt(Math.abs(v))}
              </span>
            </div>
          );
        })}
        <p className="ps-section-title" style={{ marginTop: 18 }}>{t("settlementTitle")}</p>
        {households.length > 0 && (
          <p className="ps-hint">{t("householdHint")}</p>
        )}
        {settlements.length === 0 ? (
          <div className="ps-stamp"><b>{t("settledStamp")}</b></div>
        ) : (
          settlements.map((s, i) => <div className="ps-settle-item" key={i}><b>{s.from}</b><ArrowRight size={14} color="var(--ink-soft)" /><b>{s.to}</b><span className="ps-mono ps-settle-amt">฿{fmt(s.amount)}</span></div>)
        )}
      </TornCard>
    </div>
  );
}

// ================= STYLE =================
function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap');

      .ps-app {
        --paper: #F1F3EE; --paper-dark: #E7EBDF; --ink: #1E2A26; --ink-soft: #5B685F;
        --jade: #1F6F54; --jade-dark: #164F3D; --jade-tint: #DCEAE2;
        --brick: #B8352E; --brick-tint: #F5DEDB; --gold: #A6791F; --gold-tint: #F0E4C6;
        --line: #C9D0BE;
        font-family: 'IBM Plex Sans Thai', 'Inter', system-ui, sans-serif;
        background: var(--paper); color: var(--ink); min-height: 100%;
        padding: 20px 16px 60px; box-sizing: border-box;
      }
      .ps-app * { box-sizing: border-box; }
      .ps-mono { font-family: 'JetBrains Mono', monospace; }
      .ps-shell { max-width: 680px; margin: 0 auto; }

      .ps-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom: 20px; gap: 10px; }
      .ps-brand { display:flex; flex-direction:column; align-items:flex-start; }
      .ps-logo { height: 40px; width: auto; max-width: 220px; object-fit: contain; display:block; }
      @media (max-width: 420px) { .ps-logo { height: 32px; } }
      .ps-title { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
      .ps-title-th { font-size: 15px; font-weight: 500; color: var(--ink-soft); margin-left: 6px; }
      .ps-subtitle { font-size: 13px; color: var(--ink-soft); margin: 4px 0 0; }
      .ps-reset-btn { background:none; border:1px solid var(--line); color: var(--ink-soft); border-radius: 10px; padding: 6px 10px; cursor:pointer; display:flex; align-items:center; gap:4px; font-size: 12px; white-space:nowrap; height: fit-content; }
      .ps-reset-btn:hover { border-color: var(--brick); color: var(--brick); }

      .ps-create-grid { display:grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 20px; }
      @media (max-width: 520px) { .ps-create-grid { grid-template-columns: 1fr; } }
      .ps-create-card {
        position: relative; border: 1px solid rgba(23,76,58,0.07); cursor: pointer; text-align: left;
        border-radius: 22px; padding: 18px 16px; min-height: 104px;
        display: flex; align-items: center; justify-content: space-between; gap: 12px;
        box-shadow: 0 3px 10px rgba(23,76,58,0.07);
        transition: transform .15s ease, box-shadow .15s ease;
      }
      .ps-create-card:hover { transform: translateY(-2px); box-shadow: 0 8px 18px rgba(23,76,58,0.11); }
      .ps-create-card:active { transform: translateY(0); box-shadow: 0 2px 6px rgba(23,76,58,0.09); }
      .ps-create-card.create-party { background: linear-gradient(155deg, #FDF4DC 0%, #F7E4B0 100%); }
      .ps-create-card.create-trip { background: linear-gradient(155deg, #E9F4EC 0%, #D3E9DC 100%); }
      .ps-cc-main { display: flex; flex-direction: column; gap: 5px; min-width: 0; flex: 1; }
      .ps-cc-head { display: flex; align-items: center; gap: 8px; }
      .ps-cc-badge { flex-shrink: 0; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
      .create-party .ps-cc-badge { background: #F2C55C; }
      .create-trip .ps-cc-badge { background: #CFE8D8; }
      .ps-cc-title { font-weight: 800; font-size: 16.5px; letter-spacing: -0.01em; line-height: 1.25; color: #174C3A; }
      .ps-cc-sub { font-size: 12px; font-weight: 500; line-height: 1.5; color: #66756D; white-space: pre-line; padding-left: 36px; }
      .ps-cc-arrow { flex-shrink: 0; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
      .create-party .ps-cc-arrow { background: #D9A72E; }
      .create-trip .ps-cc-arrow { background: #1F6F54; }
      @media (max-width: 380px) { .ps-cc-title { font-size: 15.5px; } .ps-cc-sub { padding-left: 0; } }

      .ps-storage-box { margin-bottom: 14px; }
      .ps-storage-row { display:flex; align-items:center; justify-content:space-between; gap: 8px; font-size: 11px; color: var(--ink-soft); margin-bottom: 5px; flex-wrap: wrap; }
      .ps-storage-bar { height: 5px; background: var(--paper-dark); border-radius: 999px; overflow:hidden; border: 1px solid var(--line); }
      .ps-storage-fill { height: 100%; background: var(--jade); border-radius: 999px; transition: width .2s ease; }
      .ps-storage-fill.warn { background: var(--gold); }
      .ps-storage-fill.danger { background: var(--brick); }

      .ps-search-wrap { position:relative; margin-bottom: 18px; }
      .ps-trash-entry-row { display:flex; justify-content:flex-end; margin-bottom: 14px; }
      .ps-trash-btn { border-radius: 999px; padding: 7px 14px; color: var(--ink-soft); }
      .ps-trash-btn:hover { border-color: var(--ink-soft); color: var(--ink); }
      .ps-search-icon { position:absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--ink-soft); }
      .ps-search-input { padding-left: 34px; }

      .ps-card { background: var(--paper-dark); border: 1px solid var(--line); border-bottom: none; border-radius: 10px 10px 0 0; position: relative; margin-bottom: 22px; }
      .ps-card-body { padding: 18px 18px 16px; }
      .ps-torn { height: 10px; background: linear-gradient(135deg, var(--paper) 50%, transparent 50%), linear-gradient(-135deg, var(--paper) 50%, transparent 50%); background-size: 14px 14px; background-repeat: repeat-x; background-position: bottom left; }

      .ps-grid { display:grid; grid-template-columns: 1fr; gap: 0; }
      @media (min-width: 560px) { .ps-grid { grid-template-columns: 1fr 1fr; gap: 16px; } }
      .ps-trip-card { cursor:pointer; transition: transform .12s ease; }
      .ps-trip-card:hover { transform: translateY(-2px); }
      .ps-kind-badge { display:inline-block; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 999px; margin-bottom: 6px; }
      .kind-trip { background: var(--jade-tint); color: var(--jade-dark); }
      .kind-party { background: var(--gold-tint); color: var(--gold); }
      .kind-quick { background: var(--brick-tint); color: var(--brick); }
      .ps-trip-name { font-size: 17px; font-weight: 700; margin: 0 0 2px; }
      .ps-trip-meta { font-size: 12px; color: var(--ink-soft); margin: 0 0 4px; }
      .ps-trip-total-row { display:flex; align-items:baseline; justify-content:space-between; margin-top: 10px; }
      .ps-trip-total { font-size: 20px; font-weight: 700; }
      .ps-badge { font-size: 11px; padding: 3px 8px; border-radius: 999px; font-weight: 600; }
      .ps-badge.settled { background: var(--jade-tint); color: var(--jade-dark); }
      .ps-badge.pending { background: var(--brick-tint); color: var(--brick); }
      .ps-badge.closed { background: var(--line); color: var(--ink-soft); }

      .ps-empty { text-align:center; padding: 30px 20px; color: var(--ink-soft); font-size: 13px; }

      .ps-btn { background: var(--jade); color: #fff; border:none; border-radius: 8px; padding: 10px 16px; font-weight: 600; font-size: 14px; cursor:pointer; display:inline-flex; align-items:center; gap: 6px; }
      .ps-btn:hover { background: var(--jade-dark); }
      .ps-btn:disabled { background: var(--line); color: var(--ink-soft); cursor:not-allowed; }
      .ps-btn-ghost { background:none; border:1px solid var(--line); color: var(--ink); border-radius: 8px; padding: 8px 12px; font-size:13px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; white-space:nowrap; }
      .ps-btn-ghost:hover { border-color: var(--ink); }
      .ps-btn-danger { color: var(--brick); border-color: var(--brick-tint); }
      .ps-btn-danger:hover { border-color: var(--brick); }

      .ps-backrow { display:flex; align-items:center; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
      .ps-iconbtn { background:none; border:none; cursor:pointer; color: var(--ink); padding:4px; display:flex; }

      .ps-label { font-size: 12px; font-weight:600; color: var(--ink-soft); display:block; margin: 14px 0 6px; }
      .ps-group-section { margin: 22px 0 4px; padding: 14px 14px 4px; background: var(--paper); border: 1px dashed var(--line); border-radius: 12px; }
      .ps-demo-badge { background: var(--gold-tint); color: var(--gold); font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px; white-space: nowrap; }
      .ps-demo-row { text-align: center; margin: 4px 0 20px; }
      .ps-demo-label { font-size: 12px; color: var(--ink-soft); margin: 0 0 8px; }
      .ps-demo-buttons { display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; }
      .ps-demo-btn { background: none; border: 1px dashed var(--line); color: var(--ink-soft); border-radius: 999px; padding: 7px 14px; font-size: 12px; font-weight: 600; cursor: pointer; }
      .ps-demo-btn:hover { border-color: var(--jade); color: var(--jade-dark); }
      .ps-payer-name { font-weight: 700; color: var(--ink); }
      .ps-payer-verb { color: var(--brick); font-weight: 600; }
      .ps-participant-count { color: var(--ink-soft); }
      .ps-meal-heading { display: inline-block; background: var(--paper-dark); border-radius: 999px; padding: 2px 9px; font-weight: 600; color: var(--ink); }
      .ps-member-count { font-size: 11.5px; color: var(--ink-soft); font-weight: 600; margin: 0; }
      .ps-member-mgr-row { display:flex; align-items:center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
      .ps-label-row { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; margin: 14px 0 6px; }
      .ps-bulk-select { display:flex; align-items:center; gap: 10px; }
      .ps-bulk-btn { background:none; border:none; padding:0; font-size:11.5px; font-weight:600; color: var(--jade-dark); cursor:pointer; text-decoration: underline; text-underline-offset: 2px; }
      .ps-bulk-btn:disabled { color: var(--line); cursor:default; text-decoration:none; }
      .ps-hint { font-size: 11px; color: var(--ink-soft); margin: -3px 0 6px; line-height: 1.5; }
      .ps-input, .ps-select { width:100%; border: 1px solid var(--line); background: var(--paper); border-radius: 8px; padding: 10px 12px; font-size: 14px; color: var(--ink); font-family: inherit; }
      .ps-input:focus, .ps-select:focus { outline: 2px solid var(--jade); outline-offset: 1px; }

      .ps-chip-row { display:flex; flex-wrap:wrap; gap: 8px; margin-top: 8px; }
      .ps-chip { background: var(--jade-tint); color: var(--jade-dark); border-radius: 999px; padding: 6px 10px 6px 12px; font-size: 13px; display:flex; align-items:center; gap:6px; }
      .ps-chip button { background:none; border:none; cursor:pointer; color: var(--jade-dark); display:flex; }

      .ps-check-row { display:flex; flex-wrap:wrap; gap: 8px; margin-top: 6px; }
      .ps-check { border: 1px solid var(--line); border-radius: 999px; padding: 6px 12px; font-size: 13px; cursor:pointer; display:flex; align-items:center; gap: 6px; background: var(--paper); }
      .ps-check.on { background: var(--jade); color:#fff; border-color: var(--jade); }

      .ps-members-strip { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom: 4px; color: var(--ink-soft); font-size: 13px; }

      .ps-closed-banner { display:flex; align-items:center; justify-content:space-between; gap: 10px; flex-wrap: wrap; background: var(--paper-dark); border: 1px dashed var(--line); border-radius: 8px; padding: 10px 12px; font-size: 12px; color: var(--ink-soft); margin: 10px 0 4px; }

      .ps-tabs { display:flex; gap: 6px; margin: 16px 0; }
      .ps-tab { flex:1; background: var(--paper-dark); border: 1px solid var(--line); border-radius: 8px; padding: 9px 8px; font-size: 12px; font-weight:600; color: var(--ink-soft); cursor:pointer; display:flex; align-items:center; justify-content:center; gap: 5px; }
      .ps-tab.on { background: var(--jade); color:#fff; border-color: var(--jade); }

      .ps-ledger { list-style:none; margin: 8px 0 0; padding: 0; }
      .ps-ledger li { display:flex; align-items:center; padding: 10px 0; border-bottom: 1px dashed var(--line); font-size: 14px; gap: 10px; }
      .ps-ledger li:last-child { border-bottom: none; }
      .ps-ledger-desc { font-weight: 600; }
      .ps-ledger-meta { font-size: 12px; color: var(--ink-soft); }
      .ps-ledger-amt { font-weight: 700; white-space:nowrap; }
      .ps-ledger-del { background:none; border:none; color: var(--ink-soft); cursor:pointer; padding:4px; display:flex; }
      .ps-ledger-del:hover { color: var(--brick); }

      .ps-paid-verify { font-size: 12px; color: var(--jade-dark); font-weight: 600; margin-top: 4px; }
      .ps-item-breakdown { list-style: none; margin: 8px 0 0; padding: 0; }
      .ps-item-breakdown li { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 5px 0; font-size: 12.5px; color: var(--ink-soft); }
      .ps-item-desc { display: flex; align-items: center; flex-wrap: wrap; gap: 2px; }
      .ps-item-amt { white-space: nowrap; font-weight: 600; color: var(--ink); }
      .ps-cat-tag { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 999px; margin-left: 6px; }
      .cat-food { background: var(--jade-tint); color: var(--jade-dark); }
      .cat-beer { background: var(--gold-tint); color: var(--gold); }
      .cat-liquor { background: var(--brick-tint); color: var(--brick); }
      .cat-other { background: var(--line); color: var(--ink-soft); }
      .ps-cat-dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; vertical-align:1px; }
      .ps-cat-dot.cat-food { background: var(--jade); }
      .ps-cat-dot.cat-beer { background: var(--gold); }
      .ps-cat-dot.cat-liquor { background: var(--brick); }
      .ps-cat-dot.cat-other { background: var(--ink-soft); }

      .ps-total-row { display:flex; justify-content:space-between; align-items:baseline; margin-top: 14px; padding-top: 12px; border-top: 2px solid var(--ink); }
      .ps-total-label { font-weight: 700; }
      .ps-total-amt { font-size: 22px; font-weight: 700; }

      .ps-balance-row { display:flex; justify-content:space-between; align-items:center; padding: 8px 0; font-size: 14px; }
      .ps-balance-amt.pos { color: var(--jade-dark); font-weight:700; }
      .ps-balance-amt.neg { color: var(--brick); font-weight:700; }
      .ps-balance-amt.zero { color: var(--ink-soft); font-weight:700; }

      .ps-settle-item { display:flex; align-items:center; gap: 10px; padding: 10px 12px; background: var(--paper); border: 1px solid var(--line); border-radius: 8px; margin-bottom: 8px; font-size: 14px; }
      .ps-settle-amt { margin-left:auto; font-weight:700; color: var(--gold); }

      .ps-section-title { font-size: 14px; font-weight: 700; margin: 0 0 10px; display:flex; align-items:center; gap:6px; }
      .ps-form-actions { display:flex; gap: 10px; margin-top: 16px; flex-wrap: wrap; }
      .ps-stamp { text-align:center; padding: 18px 0; color: var(--jade-dark); }
      .ps-stamp b { display:inline-block; font-size: 15px; border: 2px solid var(--jade); padding: 6px 16px; border-radius: 6px; transform: rotate(-2deg); }
    `}</style>
  );
}
