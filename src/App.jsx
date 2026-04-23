import { useState, useEffect, useCallback } from "react";

// ─── Turso ────────────────────────────────────────────────────────────────────
const TURSO_URL   = import.meta.env.VITE_TURSO_URL;
const TURSO_TOKEN = import.meta.env.VITE_TURSO_TOKEN;

async function tursoExec(sql, args = []) {
  const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${TURSO_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        { type: "execute", stmt: { sql, args: args.map(v => ({ type: "text", value: String(v) })) } },
        { type: "close" },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Turso error: ${res.status}`);
  const json = await res.json();
  return json.results[0]?.response?.result;
}

async function dbLoad(key) {
  const result = await tursoExec("SELECT data FROM bookings WHERE storage_key = ?", [key]);
  const row = result?.rows?.[0];
  if (!row) return {};
  const raw = row[0]?.value ?? row[0];
  try { return JSON.parse(raw); } catch { return {}; }
}

async function dbSave(key, data) {
  await tursoExec(
    "INSERT INTO bookings (storage_key, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(storage_key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
    [key, JSON.stringify(data), new Date().toISOString()]
  );
}

// ─── Netlify function (used only for approve/reject/change-password) ──────────
async function callFunction(body) {
  const res = await fetch("/.netlify/functions/booking-action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ─── EmailJS ──────────────────────────────────────────────────────────────────
const EMAILJS_PUBLIC_KEY  = "UgQVS5byaadBrG2DK";
const EMAILJS_SERVICE_ID  = "service_txop20q";
const EMAILJS_TEMPLATE_ID = "template_gwdwf69";

async function sendApprovalEmail({ toEmail, labName, bookingType, booking, approveUrl, rejectUrl }) {
  const params = {
    to_email:     toEmail,
    lab_name:     labName,
    booking_type: bookingType,
    teacher:      booking.teacher,
    class:        booking.class,
    subject:      booking.subject,
    day:          booking.day || "—",
    period_label: booking.periodLabel || "—",
    period_time:  booking.periodTime  || "—",
    activity:     booking.activityOverview  || "—",
    equipment:    booking.requiredEquipment || "—",
    students:     booking.numStudents
                    ? `${booking.numStudents}${booking.numGroups ? ` (${booking.numGroups} groups)` : ""}`
                    : "—",
    recurring:    booking.recurring ? `Yes — ${booking.recurWeeks} weeks` : "No",
    approve_url:  approveUrl,
    reject_url:   rejectUrl,
  };

  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id:  EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id:     EMAILJS_PUBLIC_KEY,
      template_params: params,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`EmailJS error: ${err}`);
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────
const DAYS     = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const DAY_SHORT = ["MON", "TUE", "WED", "THU", "FRI"];

const PERIODS = [
  { id: "p1",     label: "Period 1", time: "07:30 – 08:15", type: "lesson" },
  { id: "p2",     label: "Period 2", time: "08:15 – 09:00", type: "lesson" },
  { id: "p3",     label: "Period 3", time: "09:00 – 09:45", type: "lesson" },
  { id: "break1", label: "Break",    time: "09:45 – 10:00", type: "break"  },
  { id: "p4",     label: "Period 4", time: "10:00 – 10:45", type: "lesson" },
  { id: "p5",     label: "Period 5", time: "10:45 – 11:30", type: "lesson" },
  { id: "lunch",  label: "Lunch",    time: "11:30 – 13:00", type: "break"  },
  { id: "p6",     label: "Period 6", time: "13:00 – 13:45", type: "lesson" },
  { id: "p7",     label: "Period 7", time: "13:45 – 14:30", type: "lesson" },
  { id: "break2", label: "Break",    time: "14:30 – 15:00", type: "break"  },
  { id: "p8",     label: "Period 8", time: "15:00 – 15:45", type: "lesson" },
  { id: "p9",     label: "ECA",      time: "15:45 – 16:30", type: "lesson" },
];

const PRIMARY_PERIODS = [
  { id: "pp1",    label: "Period 1", time: "07:45 – 08:20", type: "lesson" },
  { id: "pp2",    label: "Period 2", time: "08:20 – 08:55", type: "lesson" },
  { id: "pbreak1",label: "Break",   time: "08:55 – 09:15", type: "break"  },
  { id: "pp3",    label: "Period 3", time: "09:15 – 09:50", type: "lesson" },
  { id: "pp4",    label: "Period 4", time: "09:50 – 10:25", type: "lesson" },
  { id: "pp5",    label: "Period 5", time: "10:25 – 11:00", type: "lesson" },
  { id: "plunch", label: "Lunch",   time: "11:00 – 13:00", type: "break"  },
  { id: "pp6",    label: "Period 6", time: "13:00 – 13:35", type: "lesson" },
  { id: "pp7",    label: "Period 7", time: "13:35 – 14:10", type: "lesson" },
  { id: "pbreak2",label: "Break",   time: "14:10 – 14:30", type: "break"  },
  { id: "pp8",    label: "Period 8*",  time: "14:30 – 15:00", type: "lesson" },
  { id: "pp9",    label: "Period 9",  time: "15:05 – 15:40", type: "lesson" },
  { id: "pp10",   label: "Period 10*",time: "15:45 – 16:25", type: "lesson" },
];

const PRIMARY_UNAVAILABLE = new Set(["pp1", "pp5", "pp7"]);

// Which primary period maps to which secondary period (and vice versa)
// pp8 is omitted — it hits secondary afternoon break, no interplay needed
const PRIMARY_TO_SECONDARY = { pp2: "p2", pp3: "p3", pp4: "p4", pp6: "p6", pp9: "p8", pp10: "p9" };
const SECONDARY_TO_PRIMARY = { p2: "pp2", p3: "pp3", p4: "pp4", p6: "pp6", p8: "pp9",  p9: "pp10" };

const LABS = {
  dt: { id: "dt", name: "DT Lab",  icon: "⚙️", color: "#e67e22", techEmail: "linh.thi.pham@vas.edu.vn",  techName: "Linh" },
  av: { id: "av", name: "AV Lab",  icon: "🎬", color: "#2980b9", techEmail: "vu.long.nguyen@vas.edu.vn", techName: "Vu Long" },
};

const SLOT_COLORS = [
  { id: "c0",  hex: "#3b82f6", label: "Blue"    },
  { id: "c1",  hex: "#0ea5e9", label: "Sky"     },  // was Green — too close to pending
  { id: "c2",  hex: "#f59e0b", label: "Amber"   },
  { id: "c3",  hex: "#6366f1", label: "Indigo"  },  // was Red — too close to closed
  { id: "c4",  hex: "#8b5cf6", label: "Purple"  },
  { id: "c5",  hex: "#ec4899", label: "Pink"    },
  { id: "c6",  hex: "#14b8a6", label: "Teal"    },
  { id: "c7",  hex: "#f97316", label: "Orange"  },
  { id: "c8",  hex: "#a3e635", label: "Lime"    },
  { id: "c9",  hex: "#94a3b8", label: "Slate"   },
  { id: "c10", hex: "#e879f9", label: "Fuchsia" },
  { id: "c11", hex: "#06b6d4", label: "Cyan"    },  // was Rose — too close to closed
];

const DEFAULT_COLOR = SLOT_COLORS[0].hex;

// ─── Date helpers ─────────────────────────────────────────────────────────────
function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}
function addWeeks(monday, n) {
  const d = new Date(monday);
  d.setDate(d.getDate() + n * 7);
  return d;
}
function weekKey(monday) {
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const d = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function slotKey(day, periodId) { return `${day}_${periodId}`; }
const inLabKey     = (lab, wk) => `bookings_${lab}_${wk}`;
const loansKey     = (lab, wk) => `loans_${lab}_${wk}`;
const primaryKey   = (lab, wk) => `primary_${lab}_${wk}`;

function getNextLessonPeriod(periodId, periods = PERIODS) {
  const idx = periods.findIndex((p) => p.id === periodId);
  if (idx === -1) return null;
  for (let i = idx + 1; i < periods.length; i++) {
    if (periods[i].type === "lesson") return periods[i];
  }
  return null;
}

// Build a per-day map of which cells to skip (consumed by rowspan) or span
function buildMergeMap(day, weekSlots, isLoans = false, periods = PERIODS) {
  const map = {};
  let i = 0;
  while (i < periods.length) {
    const period = periods[i];
    const bk = weekSlots?.[slotKey(day, period.id)];

    // Merge consecutive closed slots with the same reason — only on the lab's own tab
    if (!isLoans && bk?.status === "closed") {
      let span = 1;
      for (let j = i + 1; j < periods.length; j++) {
        const nextBk = weekSlots?.[slotKey(day, periods[j].id)];
        if (nextBk?.status === "closed" && nextBk?.reason === bk.reason) {
          map[periods[j].id] = { skip: true };
          span++;
        } else { break; }
      }
      map[period.id] = { rowspan: span };
      i += span;
      continue;
    }

    // Merge double period only when the two lessons are immediately adjacent (no break row between)
    if (bk?.doubleId && !bk?.isDoubleSecond && period.type === "lesson") {
      const nextPeriod = periods[i + 1];
      if (nextPeriod && nextPeriod.type === "lesson") {
        const nextBk = weekSlots?.[slotKey(day, nextPeriod.id)];
        if (nextBk?.doubleId === bk.doubleId && nextBk?.isDoubleSecond) {
          map[period.id] = { rowspan: 2 };
          map[nextPeriod.id] = { skip: true };
          i += 2;
          continue;
        }
      }
    }

    map[period.id] = { rowspan: 1 };
    i++;
  }
  return map;
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  /* ── Theme tokens ── */
  :root, [data-theme="dark"] {
    --bg:          #0f1117;
    --bg2:         #161b2e;
    --bg3:         #0d111c;
    --bg4:         #0f1117;
    --border:      #1e2d4a;
    --border2:     #2d3748;
    --text:        #e2e8f0;
    --text2:       #f0f4ff;
    --text3:       #94a3b8;
    --text4:       #64748b;
    --text5:       #475569;
    --text6:       #334155;
    --slot-avail:  #12191f;
    --slot-avail-h:#1a2736;
    --slot-avail-b:#1e3a4a;
    --slot-avail-bh:#2d4f68;
    --slot-pend:   #1a1f14;
    --slot-pend-b: #3d5c1e;
    --slot-pend-h: #1e2418;
    --break-slot:  #12191f;
    --break-b:     #1a2532;
    --recur-bg:    #0f1117;
    --recur-weeks: #161b2e;
    --modal-bg:    #161b2e;
    --admin-bg:    #1e2d4a;
    --admin-border:#2d4a6a;
    --admin-color: #7dd3fc;
    --toast-bg:    #1e2d4a;
    --toast-border:#2d4a6a;
    --approval-bg: #161b2e;
    --home-grad:   radial-gradient(ellipse at 30% 20%, #1a2040 0%, #0f1117 60%);
    --shadow:      rgba(0,0,0,0.4);
    --pending-bar: #1a2d1a;
    --pending-bar-b:#3d5c1e;
    --pw-bg:       #0f1117;
    --conflict-del:#200f0f;
    --del-hover:   #3d1f1f;
    --infonote-bg: #0f1117;
    --closed-bg:   #1a1d24;
    --closed-b:    #3a3f4e;
    --closed-text: #94a3b8;
    --closed-sub:  #64748b;
    --admin-note-bg: #0d1f13;
    --admin-note-b:  #1e4a2a;
  }

  [data-theme="light"] {
    --bg:          #f1f5f9;
    --bg2:         #ffffff;
    --bg3:         #f8fafc;
    --bg4:         #f1f5f9;
    --border:      #e2e8f0;
    --border2:     #cbd5e1;
    --text:        #1e293b;
    --text2:       #0f172a;
    --text3:       #475569;
    --text4:       #64748b;
    --text5:       #94a3b8;
    --text6:       #cbd5e1;
    --slot-avail:  #f8fafc;
    --slot-avail-h:#f1f5f9;
    --slot-avail-b:#cbd5e1;
    --slot-avail-bh:#94a3b8;
    --slot-pend:   #f0fdf4;
    --slot-pend-b: #86efac;
    --slot-pend-h: #dcfce7;
    --break-slot:  #f8fafc;
    --break-b:     #e2e8f0;
    --recur-bg:    #f8fafc;
    --recur-weeks: #f1f5f9;
    --modal-bg:    #ffffff;
    --admin-bg:    #eff6ff;
    --admin-border:#bfdbfe;
    --admin-color: #2563eb;
    --toast-bg:    #1e293b;
    --toast-border:#334155;
    --approval-bg: #ffffff;
    --home-grad:   radial-gradient(ellipse at 30% 20%, #dbeafe 0%, #f1f5f9 60%);
    --shadow:      rgba(0,0,0,0.12);
    --pending-bar: #f0fdf4;
    --pending-bar-b:#86efac;
    --pw-bg:       #f8fafc;
    --conflict-del:#fef2f2;
    --del-hover:   #fee2e2;
    --infonote-bg: #f8fafc;
    --closed-bg:   #f1f5f9;
    --closed-b:    #94a3b8;
    --closed-text: #64748b;
    --closed-sub:  #475569;
    --admin-note-bg: #f0fdf4;
    --admin-note-b:  #86efac;
  }

  body { font-family: 'DM Sans', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; transition: background 0.2s, color 0.2s; }
  .app { min-height: 100vh; display: flex; flex-direction: column; }

  /* Home */
  .home { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 48px; padding: 48px 24px; background: var(--home-grad); }
  .home-title { text-align: center; }
  .home-title h1 { font-family: 'DM Mono', monospace; font-size: clamp(1.6rem, 4vw, 2.8rem); font-weight: 500; letter-spacing: -0.02em; color: var(--text2); }
  .home-title p { font-size: 0.95rem; color: var(--text4); margin-top: 8px; font-weight: 300; letter-spacing: 0.05em; text-transform: uppercase; }
  .lab-cards { display: flex; gap: 24px; flex-wrap: wrap; justify-content: center; }
  .lab-card { background: var(--bg2); border: 1px solid var(--border); border-radius: 16px; padding: 40px 48px; display: flex; flex-direction: column; align-items: center; gap: 16px; cursor: pointer; transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s; width: 220px; flex-shrink: 0; }
  .lab-card:hover { transform: translateY(-4px); box-shadow: 0 20px 60px var(--shadow); }
  .lab-card .icon { font-size: 3rem; }
  .lab-card .name { font-family: 'DM Mono', monospace; font-size: 1.1rem; font-weight: 500; color: var(--text2); }
  .lab-card .sub { font-size: 0.8rem; color: var(--text5); text-transform: uppercase; letter-spacing: 0.08em; }
  .home-admin-btn { background: none; border: 1px solid var(--border2); color: var(--text5); padding: 8px 18px; border-radius: 8px; cursor: pointer; font-family: 'DM Mono', monospace; font-size: 0.78rem; transition: all 0.15s; }
  .home-admin-btn:hover { border-color: var(--text3); color: var(--text3); }

  /* Theme toggle */
  .theme-toggle { background: none; border: 1px solid var(--border2); color: var(--text4); width: 34px; height: 34px; border-radius: 8px; cursor: pointer; font-size: 1rem; transition: all 0.15s; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .theme-toggle:hover { border-color: var(--text3); color: var(--text2); }

  /* Header */
  .header { display: flex; align-items: center; gap: 16px; padding: 16px 24px; background: var(--bg3); border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .back-btn { background: none; border: 1px solid var(--border2); color: var(--text3); padding: 6px 14px; border-radius: 6px; cursor: pointer; font-family: 'DM Mono', monospace; font-size: 0.8rem; transition: all 0.15s; }
  .back-btn:hover { border-color: var(--text4); color: var(--text); }
  .header-title { font-family: 'DM Mono', monospace; font-size: 1.1rem; color: var(--text2); font-weight: 500; }
  .header-accent { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; }
  .admin-badge { display: flex; align-items: center; gap: 6px; background: var(--admin-bg); border: 1px solid var(--admin-border); border-radius: 20px; padding: 4px 12px; font-family: 'DM Mono', monospace; font-size: 0.72rem; color: var(--admin-color); }
  .admin-logout { background: none; border: none; color: var(--text5); font-size: 0.75rem; cursor: pointer; margin-left: 4px; padding: 0; transition: color 0.15s; }
  .admin-logout:hover { color: #e74c3c; }
  .week-nav { margin-left: auto; display: flex; align-items: center; gap: 12px; }
  .week-nav button { background: var(--bg2); border: 1px solid var(--border2); color: var(--text3); width: 32px; height: 32px; border-radius: 6px; cursor: pointer; font-size: 1rem; transition: all 0.15s; }
  .week-nav button:hover { border-color: var(--text4); color: var(--text); }
  .week-label { font-family: 'DM Mono', monospace; font-size: 0.8rem; color: var(--text4); min-width: 160px; text-align: center; }

  /* Tabs */
  .tabs { display: flex; padding: 0 24px; background: var(--bg3); border-bottom: 1px solid var(--border); }
  .tab-btn { background: none; border: none; border-bottom: 2px solid transparent; color: var(--text4); padding: 12px 20px; cursor: pointer; font-family: 'DM Sans', sans-serif; font-size: 0.85rem; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; transition: all 0.15s; display: flex; align-items: center; gap: 7px; }
  .tab-btn:hover { color: var(--text3); }
  .tab-btn.active { border-bottom-color: currentColor; }
  .tab-conflict-badge { background: #7c2d12; color: #fca98d; font-size: 0.65rem; font-family: 'DM Mono', monospace; padding: 2px 6px; border-radius: 10px; line-height: 1.4; }
  .tab-pending-badge { background: #1e3a1e; color: #86efac; font-size: 0.65rem; font-family: 'DM Mono', monospace; padding: 2px 6px; border-radius: 10px; line-height: 1.4; }

  /* Grid */
  .grid-wrap { flex: 1; overflow: auto; padding: 24px; }
  .timetable { min-width: 700px; border-collapse: collapse; width: 100%; }
  .timetable th { font-family: 'DM Mono', monospace; font-size: 0.75rem; font-weight: 500; color: var(--text5); padding: 1px 12px; text-align: left; border-bottom: 1px solid var(--border); white-space: nowrap; }
  .timetable th.day-header { text-align: center; color: var(--text3); }
  .period-label { padding: 10px 14px; vertical-align: top; white-space: nowrap; }
  .period-label .pl-name { font-family: 'DM Mono', monospace; font-size: 0.78rem; font-weight: 500; color: var(--text4); }
  .period-label .pl-time { font-family: 'DM Mono', monospace; font-size: 0.68rem; color: var(--text6); margin-top: 2px; }

  /* Slots */
  .slot-cell { padding: 5px; vertical-align: top; min-width: 120px; }
  .slot { height: 58px; border-radius: 8px; display: flex; flex-direction: column; justify-content: center; padding: 6px 10px; cursor: pointer; transition: all 0.15s; position: relative; overflow: hidden; }
  .slot.available { background: var(--slot-avail); border: 1px dashed var(--slot-avail-b); }
  .slot.available:hover { background: var(--slot-avail-h); border-color: var(--slot-avail-bh); }
  .slot.booked { border-width: 1px; border-style: solid; }
  .slot.booked:hover { filter: brightness(1.08); }
  .slot.pending { background: var(--slot-pend); border: 1px dashed var(--slot-pend-b); cursor: default; }
  .slot.pending:hover { background: var(--slot-pend-h); }
  .slot-avail-text { font-family: 'DM Mono', monospace; font-size: 0.65rem; color: var(--slot-avail-b); text-align: center; }
  .slot-teacher { font-size: 0.75rem; font-weight: 600; color: var(--text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .slot-class { font-family: 'DM Mono', monospace; font-size: 0.68rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .slot-subject { font-size: 0.65rem; color: var(--text3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .slot-badges { position: absolute; top: 4px; right: 5px; display: flex; align-items: center; gap: 3px; }
  .slot-recur { font-size: 0.6rem; opacity: 0.6; line-height: 1; }
  .slot-conflict { position: absolute; bottom: 0; left: 0; right: 0; height: 3px; background: #f97316; }
  .slot-conflict-icon { font-size: 0.62rem; line-height: 1; color: #f97316; }
  .pending-label { font-family: 'DM Mono', monospace; font-size: 0.6rem; color: #16a34a; text-align: center; letter-spacing: 0.05em; }
  .pending-teacher { font-size: 0.7rem; color: var(--text3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .conflict-avail-hint { display: flex; align-items: center; justify-content: center; gap: 5px; flex-direction: column; }
  .conflict-pill { display: inline-flex; align-items: center; gap: 4px; background: rgba(249,115,22,0.15); border: 1px solid rgba(249,115,22,0.35); border-radius: 4px; padding: 1px 6px; font-size: 0.6rem; color: #f97316; font-family: 'DM Mono', monospace; white-space: nowrap; margin-top: 2px; }

  /* Break slots */
  .break-row td { background: transparent; }
  .break-row .period-label { padding-top: 4px; padding-bottom: 4px; }
  .break-row .slot-cell { padding-top: 4px; padding-bottom: 4px; }
  .break-row .period-label .pl-name { color: var(--text6); }
  .break-slot { height: 36px; border-radius: 6px; background: var(--break-slot); border: 1px dashed var(--break-b); display: flex; align-items: center; justify-content: center; padding: 0 10px; cursor: default; transition: all 0.15s; position: relative; overflow: hidden; gap: 6px; }
  .break-slot.admin-break { cursor: pointer; }
  .break-slot.admin-break:hover { background: var(--slot-avail-h); border-color: var(--slot-avail-bh); }
  .break-slot.booked { border-style: solid; }
  .break-slot.pending { border-color: var(--slot-pend-b); cursor: default; }
  .break-slot-icons { margin-left: auto; display: flex; align-items: center; gap: 4px; }
  .break-recur { font-size: 0.6rem; opacity: 0.6; }

  /* Legend */
  .legend { display: flex; gap: 20px; padding: 12px 24px; border-top: 1px solid var(--border); background: var(--bg3); flex-wrap: wrap; align-items: center; }
  .legend-item { display: flex; align-items: center; gap: 8px; font-size: 0.75rem; color: var(--text5); }
  .leg-dot { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
  .leg-conflict { width: 10px; height: 3px; border-radius: 2px; background: #f97316; flex-shrink: 0; }
  .leg-pending { width: 10px; height: 10px; border-radius: 3px; background: var(--slot-pend); border: 1px dashed var(--slot-pend-b); flex-shrink: 0; }
  .leg-closed { width: 10px; height: 10px; border-radius: 3px; background: repeating-linear-gradient(-45deg, var(--closed-bg), var(--closed-bg) 3px, var(--closed-b) 3px, var(--closed-b) 4px); border: 1px solid var(--closed-b); flex-shrink: 0; }

  /* Saving */
  .saving-indicator { font-family: 'DM Mono', monospace; font-size: 0.72rem; color: var(--text4); display: flex; align-items: center; gap: 6px; }
  .saving-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--text4); animation: pulse 1s infinite; }
  .saving-dot.saved { background: #10b981; animation: none; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }

  /* Loading */
  .loading-screen { flex: 1; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 16px; color: var(--text5); font-family: 'DM Mono', monospace; font-size: 0.85rem; }
  .loading-spinner { width: 32px; height: 32px; border: 2px solid var(--border); border-top-color: var(--accent, #3b82f6); border-radius: 50%; animation: spin 0.7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Modal */
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 24px; backdrop-filter: blur(4px); animation: fadeIn 0.15s ease; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  .modal { background: var(--modal-bg); border: 1px solid var(--border2); border-radius: 16px; width: 100%; max-width: 540px; max-height: 90vh; overflow-y: auto; animation: slideUp 0.2s ease; }
  @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  .modal-header { padding: 20px 24px 16px; border-bottom: 1px solid var(--border); display: flex; align-items: flex-start; justify-content: space-between; }
  .modal-title { font-family: 'DM Mono', monospace; font-size: 1rem; color: var(--text2); font-weight: 500; }
  .modal-sub { font-size: 0.78rem; color: var(--text5); margin-top: 4px; }
  .modal-close { background: none; border: none; color: var(--text5); font-size: 1.4rem; cursor: pointer; line-height: 1; padding: 0 4px; transition: color 0.15s; }
  .modal-close:hover { color: var(--text); }
  .modal-body { padding: 24px; display: flex; flex-direction: column; gap: 18px; }
  .modal-footer { padding: 16px 24px; border-top: 1px solid var(--border); display: flex; gap: 10px; justify-content: flex-end; align-items: center; flex-wrap: wrap; }

  /* Pending info */
  .pending-info-box { background: var(--bg4); border: 1px solid var(--slot-pend-b); border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
  .pending-info-row { display: flex; gap: 12px; font-size: 0.85rem; }
  .pending-info-label { color: var(--text4); font-family: 'DM Mono', monospace; font-size: 0.72rem; min-width: 100px; }
  .pending-info-value { color: var(--text); }
  .pending-status-badge { display: inline-flex; align-items: center; gap: 6px; background: var(--pending-bar); border: 1px solid var(--pending-bar-b); border-radius: 20px; padding: 4px 12px; font-family: 'DM Mono', monospace; font-size: 0.72rem; color: #16a34a; margin-bottom: 4px; }

  /* Admin approve/reject */
  .admin-actions { display: flex; gap: 10px; margin-top: 4px; }
  .btn-approve { background: #10b981; color: #fff; border: none; padding: 9px 20px; border-radius: 8px; cursor: pointer; font-size: 0.85rem; font-weight: 500; transition: filter 0.15s; }
  .btn-approve:hover { filter: brightness(1.15); }
  .btn-reject-action { background: none; border: 1px solid #fca5a5; color: #e74c3c; padding: 9px 20px; border-radius: 8px; cursor: pointer; font-size: 0.85rem; transition: all 0.15s; }
  .btn-reject-action:hover { background: var(--del-hover); }
  .btn-move { background: #6366f1; color: #fff; border: none; padding: 9px 20px; border-radius: 8px; cursor: pointer; font-size: 0.85rem; font-weight: 500; transition: filter 0.15s; }
  .btn-move:hover:not(:disabled) { filter: brightness(1.15); }
  .btn-move:disabled { opacity: 0.45; cursor: not-allowed; }
  .btn-move-toggle { background: none; border: 1px solid #6366f1; color: #6366f1; padding: 7px 14px; border-radius: 8px; cursor: pointer; font-size: 0.82rem; transition: all 0.15s; }
  .btn-move-toggle:hover { background: rgba(99,102,241,0.08); }
  .move-panel { background: var(--bg3); border: 1px solid var(--border2); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
  .move-panel-title { font-family: 'DM Mono', monospace; font-size: 0.72rem; color: var(--text4); text-transform: uppercase; letter-spacing: 0.06em; }
  .move-week-tabs { display: flex; gap: 6px; }
  .move-week-tab { flex: 1; padding: 7px 10px; border: 1px solid var(--border2); border-radius: 6px; background: none; color: var(--text3); cursor: pointer; font-size: 0.82rem; transition: all 0.15s; text-align: center; }
  .move-week-tab.active { border-color: #6366f1; color: #6366f1; }
  .move-selects { display: flex; gap: 8px; }
  .move-select { flex: 1; background: var(--bg4); border: 1px solid var(--border2); color: var(--text); border-radius: 8px; padding: 8px 10px; font-family: 'DM Sans', sans-serif; font-size: 0.85rem; outline: none; transition: border-color 0.15s; }
  .move-select:focus { border-color: #6366f1; }
  .move-recur-opts { display: flex; flex-direction: column; gap: 8px; }
  .move-recur-opt { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: var(--text3); cursor: pointer; user-select: none; }

  /* Conflict warning */
  .conflict-warning { background: rgba(249,115,22,0.08); border: 1px solid rgba(249,115,22,0.3); border-radius: 8px; padding: 10px 14px; font-size: 0.8rem; color: #c2410c; line-height: 1.5; display: flex; gap: 10px; align-items: flex-start; }
  .conflict-warning-icon { font-size: 1rem; flex-shrink: 0; margin-top: 1px; }

  /* Fields */
  .field-group { display: flex; flex-direction: column; gap: 6px; }
  .field-label { font-family: 'DM Mono', monospace; font-size: 0.72rem; color: var(--text4); text-transform: uppercase; letter-spacing: 0.06em; }
  .field-label .required { color: var(--accent); margin-left: 4px; }
  .field-input, .field-textarea { background: var(--bg4); border: 1px solid var(--border2); color: var(--text); border-radius: 8px; padding: 10px 14px; font-family: 'DM Sans', sans-serif; font-size: 0.9rem; width: 100%; transition: border-color 0.15s; outline: none; }
  .field-input:focus, .field-textarea:focus { border-color: var(--accent); }
  .field-textarea { resize: vertical; min-height: 72px; }
  .row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .divider { font-family: 'DM Mono', monospace; font-size: 0.7rem; color: var(--text6); text-transform: uppercase; letter-spacing: 0.1em; display: flex; align-items: center; gap: 12px; }
  .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: var(--border); }

  /* Colour picker */
  .color-grid { display: flex; flex-wrap: wrap; gap: 8px; }
  .color-swatch { width: 28px; height: 28px; border-radius: 6px; cursor: pointer; border: 2px solid transparent; transition: transform 0.12s, border-color 0.12s, box-shadow 0.12s; flex-shrink: 0; }
  .color-swatch:hover { transform: scale(1.18); }
  .color-swatch.selected { border-color: #334155; transform: scale(1.18); box-shadow: 0 0 0 3px rgba(0,0,0,0.15); }

  /* Recurring */
  .recur-section { background: var(--recur-bg); border: 1px solid var(--border2); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
  .recur-toggle { display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; }
  .toggle-track { width: 38px; height: 20px; border-radius: 10px; background: var(--border2); position: relative; transition: background 0.2s; flex-shrink: 0; }
  .toggle-track.on { background: var(--accent); }
  .toggle-thumb { position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: left 0.2s; }
  .toggle-track.on .toggle-thumb { left: 21px; }
  .recur-label { font-size: 0.88rem; color: var(--text3); }
  .recur-options { display: flex; flex-direction: column; gap: 8px; }
  .recur-row { display: flex; align-items: center; gap: 10px; }
  .recur-hint { font-size: 0.75rem; color: var(--text5); font-family: 'DM Mono', monospace; }
  .recur-weeks-input { background: var(--recur-weeks); border: 1px solid var(--border2); color: var(--text); border-radius: 6px; padding: 6px 10px; width: 68px; font-size: 0.88rem; outline: none; transition: border-color 0.15s; font-family: 'DM Sans', sans-serif; text-align: center; }
  .recur-weeks-input:focus { border-color: var(--accent); }

  /* Buttons */
  .btn-cancel { background: none; border: 1px solid var(--border2); color: var(--text3); padding: 9px 20px; border-radius: 8px; cursor: pointer; font-size: 0.85rem; transition: all 0.15s; }
  .btn-cancel:hover { border-color: var(--text4); color: var(--text); }
  .btn-delete { background: none; border: 1px solid #fca5a5; color: #e74c3c; padding: 9px 20px; border-radius: 8px; cursor: pointer; font-size: 0.85rem; transition: all 0.15s; margin-right: auto; }
  .btn-delete:hover { background: var(--del-hover); }
  .btn-save { color: #fff; border: none; padding: 9px 24px; border-radius: 8px; cursor: pointer; font-size: 0.85rem; font-weight: 500; transition: filter 0.15s; font-family: 'DM Sans', sans-serif; }
  .btn-save:hover:not(:disabled) { filter: brightness(1.1); }
  .btn-save:disabled { opacity: 0.35; cursor: not-allowed; }
  .recur-del-wrap { margin-right: auto; display: flex; flex-direction: column; gap: 6px; width: 100%; }
  .recur-del-title { font-size: 0.78rem; color: var(--text4); font-family: 'DM Mono', monospace; margin-bottom: 2px; }
  .recur-del-opts { display: flex; gap: 8px; flex-wrap: wrap; }
  .recur-del-opt { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border2); cursor: pointer; transition: all 0.15s; font-size: 0.82rem; color: var(--text3); white-space: nowrap; }
  .recur-del-opt:hover { border-color: #e74c3c; color: var(--text); background: var(--conflict-del); }

  /* Merged cells (rowspan) */
  .slot-cell.has-merged { padding: 0; position: relative; }
  .slot.merged { position: absolute; inset: 5px; height: auto; border-radius: 8px; }
  .break-slot.merged { position: absolute; inset: 4px 5px; height: auto; border-radius: 6px; }
  .slot.merged.closed, .break-slot.merged.closed { justify-content: center; align-items: center; text-align: center; }
  .slot.merged.booked { justify-content: flex-start; }

  /* Closed slots */
  .slot.primary-unavail { background: repeating-linear-gradient(-45deg, var(--bg2), var(--bg2) 6px, var(--border) 6px, var(--border) 7px); border: 1px solid var(--border); cursor: default; opacity: 0.55; }
  .slot.primary-unavail:hover { filter: none; }
  .slot.cross-tab-blocked { background: rgba(167,139,250,0.12); border: 1px solid rgba(167,139,250,0.4); cursor: default; }
  .slot.cross-tab-blocked:hover { filter: none; }
  .cross-tab-label { font-family: 'DM Mono', monospace; font-size: 0.6rem; color: #a78bfa; text-align: center; letter-spacing: 0.05em; line-height: 1.4; }
  .slot.closed { background: repeating-linear-gradient(-45deg, var(--closed-bg), var(--closed-bg) 5px, var(--closed-b) 5px, var(--closed-b) 6px); border: 1px solid var(--closed-b); cursor: pointer; }
  .slot.closed:hover { filter: brightness(1.06); }
  .break-slot.closed { background: repeating-linear-gradient(-45deg, var(--closed-bg), var(--closed-bg) 5px, var(--closed-b) 5px, var(--closed-b) 6px); border-color: var(--closed-b); cursor: pointer; }
  .closed-label { font-family: 'DM Mono', monospace; font-size: 0.6rem; color: var(--closed-text); text-align: center; letter-spacing: 0.05em; }
  .closed-reason { font-size: 0.65rem; color: var(--closed-sub); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: center; margin-top: 1px; }
  .closed-info-box { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 20px 16px; background: var(--closed-bg); border: 1px solid var(--closed-b); border-radius: 10px; }
  .closed-info-reason { font-size: 0.9rem; color: var(--closed-sub); text-align: center; }
  /* Admin booking note */
  .admin-book-note { background: var(--admin-note-bg); border: 1px solid var(--admin-note-b); border-radius: 8px; padding: 10px 14px; font-size: 0.8rem; color: #86efac; line-height: 1.5; }
  /* Booking/closure mode toggle */
  .mode-tabs { display: flex; gap: 0; border: 1px solid var(--border2); border-radius: 8px; overflow: hidden; }
  .mode-tab { flex: 1; background: none; border: none; padding: 8px 0; cursor: pointer; font-family: 'DM Mono', monospace; font-size: 0.75rem; color: var(--text4); transition: all 0.15s; }
  .mode-tab.active { background: var(--accent); color: #fff; }
  .mode-tab:not(.active):hover { background: var(--border); color: var(--text2); }

  /* Double period */
  .slot-double { font-size: 0.62rem; color: var(--text4); font-family: 'DM Mono', monospace; }
  .double-note { background: rgba(59,130,246,0.08); border: 1px solid rgba(59,130,246,0.25); border-radius: 8px; padding: 8px 12px; font-size: 0.78rem; color: #60a5fa; line-height: 1.5; }
  .double-conflict-note { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; padding: 8px 12px; font-size: 0.78rem; color: #f87171; line-height: 1.5; }

  /* Multi-select */
  .admin-toolbar { display: flex; align-items: center; gap: 12px; padding: 8px 24px; background: var(--pending-bar); border-bottom: 1px solid var(--pending-bar-b); flex-wrap: wrap; min-height: 38px; }
  .admin-toolbar-pending { font-family: 'DM Mono', monospace; font-size: 0.8rem; color: #86efac; }
  .select-toggle-btn { background: none; border: 1px solid var(--border2); color: var(--text4); padding: 4px 12px; border-radius: 6px; cursor: pointer; font-family: 'DM Mono', monospace; font-size: 0.72rem; transition: all 0.15s; margin-left: auto; }
  .select-toggle-btn:hover { border-color: var(--text3); color: var(--text2); }
  .select-toggle-btn.active { background: #3b82f622; border-color: #3b82f6; color: #60a5fa; }
  .bulk-delete-btn { background: #ef4444; color: #fff; border: none; padding: 4px 14px; border-radius: 6px; cursor: pointer; font-family: 'DM Mono', monospace; font-size: 0.72rem; transition: filter 0.15s; }
  .bulk-delete-btn:hover { filter: brightness(1.1); }
  .bulk-approve-btn { background: #10b981; color: #fff; border: none; padding: 4px 14px; border-radius: 6px; cursor: pointer; font-family: 'DM Mono', monospace; font-size: 0.72rem; transition: filter 0.15s; }
  .bulk-approve-btn:hover { filter: brightness(1.1); }
  .slot.selected { outline: 2px solid #3b82f6; outline-offset: -2px; }
  .slot.selected::after { content: '✓'; position: absolute; top: 4px; right: 4px; width: 15px; height: 15px; background: #3b82f6; border-radius: 50%; color: #fff; font-size: 0.58rem; line-height: 15px; text-align: center; font-weight: 700; }
  .break-slot.selected { outline: 2px solid #3b82f6; outline-offset: -2px; }
  .break-slot.selected::after { content: '✓'; position: absolute; top: 50%; right: 6px; transform: translateY(-50%); width: 13px; height: 13px; background: #3b82f6; border-radius: 50%; color: #fff; font-size: 0.55rem; line-height: 13px; text-align: center; font-weight: 700; }

  /* Admin login modal */
  .admin-login-modal { background: var(--modal-bg); border: 1px solid var(--border2); border-radius: 16px; width: 100%; max-width: 380px; padding: 32px; animation: slideUp 0.2s ease; }
  .admin-login-title { font-family: 'DM Mono', monospace; font-size: 1rem; color: var(--text2); font-weight: 500; margin-bottom: 6px; }
  .admin-login-sub { font-size: 0.8rem; color: var(--text5); margin-bottom: 24px; }
  .admin-error { font-size: 0.8rem; color: #e74c3c; margin-top: 8px; font-family: 'DM Mono', monospace; }

  /* Change password */
  .change-pw-section { background: var(--pw-bg); border: 1px solid var(--border2); border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .change-pw-title { font-family: 'DM Mono', monospace; font-size: 0.75rem; color: var(--text4); text-transform: uppercase; letter-spacing: 0.06em; }

  /* Approval screen */
  .approval-screen { flex: 1; display: flex; align-items: center; justify-content: center; padding: 48px 24px; }
  .approval-card { background: var(--approval-bg); border: 1px solid var(--border2); border-radius: 16px; padding: 40px; max-width: 460px; width: 100%; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 16px; }
  .approval-icon { font-size: 3rem; }
  .approval-title { font-family: 'DM Mono', monospace; font-size: 1.1rem; color: var(--text2); }
  .approval-sub { font-size: 0.85rem; color: var(--text4); line-height: 1.6; }
  .approval-go-btn { background: var(--accent); color: #fff; border: none; padding: 10px 24px; border-radius: 8px; cursor: pointer; font-size: 0.9rem; font-weight: 500; margin-top: 8px; transition: filter 0.15s; }
  .approval-go-btn:hover { filter: brightness(1.1); }

  /* Toast */
  .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: var(--toast-bg); border: 1px solid var(--toast-border); color: #f1f5f9; padding: 12px 20px; border-radius: 10px; font-size: 0.85rem; z-index: 2000; animation: fadeIn 0.2s ease; white-space: nowrap; }

  /* Week Overview */
  .overview-wrap { flex: 1; overflow: auto; padding: 24px; display: flex; flex-direction: column; }
  .overview-header { display: grid; grid-template-columns: 56px repeat(5, 1fr); min-width: 600px; position: sticky; top: 0; z-index: 2; background: var(--bg); padding-bottom: 6px; }
  .overview-axis-spacer { /* empty */ }
  .overview-day-header { text-align: center; font-family: 'DM Mono', monospace; font-size: 0.78rem; font-weight: 500; color: var(--text3); padding: 8px 4px; border-bottom: 1px solid var(--border); }
  .overview-main { position: relative; display: grid; grid-template-columns: 56px repeat(5, 1fr); height: 1080px; min-width: 600px; border-bottom: 1px solid var(--border); }
  .overview-axis { position: relative; border-right: 1px solid var(--border2); }
  .overview-time-label { position: absolute; right: 8px; transform: translateY(-50%); font-family: 'DM Mono', monospace; font-size: 0.62rem; color: var(--text5); white-space: nowrap; pointer-events: none; }
  .overview-day-col { position: relative; border-right: 1px solid var(--border); }
  .overview-gridline { position: absolute; left: 0; right: 0; height: 1px; background: var(--border); pointer-events: none; }
  .overview-gridline.hour { background: var(--border2); }
  .overview-block { position: absolute; left: 3px; right: 3px; border-radius: 5px; border: 1px solid; padding: 3px 7px; overflow: hidden; cursor: pointer; transition: filter 0.15s; }
  .overview-block:hover { filter: brightness(1.12); }
  .overview-block.pending { opacity: 0.65; border-style: dashed; }
  .overview-block-teacher { font-size: 0.72rem; font-weight: 600; color: var(--text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.3; }
  .overview-block-class { font-family: 'DM Mono', monospace; font-size: 0.62rem; color: var(--text3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .overview-block-source { font-family: 'DM Mono', monospace; font-size: 0.58rem; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 1px; }
  .overview-legend { display: flex; gap: 20px; padding: 12px 24px; border-top: 1px solid var(--border); background: var(--bg3); align-items: center; }
  .overview-legend-item { display: flex; align-items: center; gap: 7px; font-size: 0.75rem; color: var(--text5); }
  .overview-legend-dot { width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; }
`;


// ─── Theme ────────────────────────────────────────────────────────────────────
function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem("vas-theme") || "light");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("vas-theme", theme);
  }, [theme]);

  const toggle = () => setTheme((t) => t === "dark" ? "light" : "dark");
  return { theme, toggle };
}

// ─── Tiny shared components ───────────────────────────────────────────────────

function ColorPicker({ value, onChange }) {
  return (
    <div className="field-group">
      <label className="field-label">Colour</label>
      <div className="color-grid">
        {SLOT_COLORS.map((c) => (
          <div key={c.id} className={`color-swatch${value === c.hex ? " selected" : ""}`}
            style={{ background: c.hex }} title={c.label} onClick={() => onChange(c.hex)} />
        ))}
      </div>
    </div>
  );
}

function Toggle({ on, onToggle, label }) {
  return (
    <div className="recur-toggle" onClick={onToggle}>
      <div className={`toggle-track${on ? " on" : ""}`}><div className="toggle-thumb" /></div>
      <span className="recur-label">{label}</span>
    </div>
  );
}

function SavingIndicator({ state }) {
  if (state === "idle") return null;
  return (
    <div className="saving-indicator">
      <div className={`saving-dot${state === "saved" ? " saved" : ""}`} />
      {state === "saving" ? "Saving…" : "Saved"}
    </div>
  );
}

function Toast({ message }) {
  if (!message) return null;
  return <div className="toast">{message}</div>;
}

// ─── Admin Login Modal ────────────────────────────────────────────────────────

function AdminLoginModal({ onLogin, onClose }) {
  const [pw, setPw]     = useState("");
  const [err, setErr]   = useState("");
  const [loading, setLoading] = useState(false);

  const attempt = async () => {
    setLoading(true);
    setErr("");
    // Verify against server
    const res = await callFunction({ action: "approve", token: "__check__", pendingKey: "__check__", adminPassword: pw });
    // A 404 means password was accepted but booking not found — that's fine, just means pw is correct
    // A 403 means wrong password
    if (res.error === "Invalid admin password") {
      setErr("Incorrect password");
      setLoading(false);
      return;
    }
    onLogin(pw);
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="admin-login-modal" onClick={(e) => e.stopPropagation()}>
        <div className="admin-login-title">Admin Login</div>
        <div className="admin-login-sub">Enter the admin password to manage bookings</div>
        <div className="field-group">
          <label className="field-label">Password</label>
          <input className="field-input" type="password" value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && attempt()}
            placeholder="••••••••" autoFocus />
          {err && <div className="admin-error">{err}</div>}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-save" style={{ background: "#3b82f6" }} disabled={!pw || loading} onClick={attempt}>
            {loading ? "Checking…" : "Login"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Change Password Panel ────────────────────────────────────────────────────

function ChangePasswordPanel({ adminPassword, onToast }) {
  const [cur, setCur]   = useState("");
  const [next, setNext] = useState("");
  const [conf, setConf] = useState("");
  const [err, setErr]   = useState("");
  const [ok, setOk]     = useState(false);

  const save = async () => {
    setErr(""); setOk(false);
    if (next.length < 6) { setErr("New password must be at least 6 characters"); return; }
    if (next !== conf)   { setErr("Passwords don't match"); return; }
    const res = await callFunction({ action: "change-password", currentPassword: cur, newPassword: next });
    if (res.error) { setErr(res.error); return; }
    setOk(true); setCur(""); setNext(""); setConf("");
    onToast("Password updated successfully");
  };

  return (
    <div className="change-pw-section">
      <div className="change-pw-title">Change Admin Password</div>
      <div className="field-group">
        <label className="field-label">Current Password</label>
        <input className="field-input" type="password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder="••••••••" />
      </div>
      <div className="field-group">
        <label className="field-label">New Password</label>
        <input className="field-input" type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="••••••••" />
      </div>
      <div className="field-group">
        <label className="field-label">Confirm New Password</label>
        <input className="field-input" type="password" value={conf} onChange={(e) => setConf(e.target.value)} placeholder="••••••••" />
      </div>
      {err && <div className="admin-error">{err}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn-save" style={{ background: "#3b82f6" }} disabled={!cur || !next || !conf} onClick={save}>
          Update Password
        </button>
      </div>
    </div>
  );
}

// ─── Booking Modal ────────────────────────────────────────────────────────────

function SlotModal({ accentColor, day, period, booking, conflictBooking, conflictBooking2, conflictBooking2Name, onSave, onAdminSave, onClosure, onClose, onDelete, onAdminApprove, onAdminReject, onAdminMove, onCheckRecurConflicts, isLoans, isPrimary, isAdmin, weekBookings, allBookings, monday, allCrossTabBookings, crossTabPeriodMapForMove, allCross2Bookings, cross2PeriodMapForMove, periods = PERIODS }) {
  const isNew       = !booking?.teacher && booking?.status !== "closed";
  const isPending   = booking?.status === "pending";
  const isConfirmed = booking?.status === "confirmed";
  const isClosed    = booking?.status === "closed";
  const isRecurring = !!booking?.recurId;
  const isDoubleSecond = !!booking?.isDoubleSecond;
  const isDoubleFirst  = !isDoubleSecond && !!booking?.doubleId;

  const [form, setForm] = useState({
    teacher: "", class: "", subject: "",
    activityOverview: "", requiredEquipment: "",
    numStudents: "", numGroups: "",
    color: DEFAULT_COLOR, recurring: false, recurWeeks: 3,
    ...booking,
  });
  const [delMode, setDelMode]         = useState(false);
  const [doubleMode, setDoubleMode]   = useState(false);
  const [closureMode, setClosureMode] = useState(false);
  const [closureReason, setClosureReason]   = useState("");
  const [closureThrough, setClosureThrough] = useState("");

  // ── Move mode state ──────────────────────────────────────────────────────────
  const [moveMode, setMoveMode]             = useState(false);
  const [moveWeekOffset, setMoveWeekOffset] = useState(0);
  const [moveDay, setMoveDay]               = useState(day);
  const [movePeriodId, setMovePeriodId]     = useState("");
  const [moveRecurOption, setMoveRecurOption]   = useState("this");
  const [moveConflictCount, setMoveConflictCount] = useState(null); // null=unchecked, 0=clear, N=blocked
  const [moveConflictApprove, setMoveConflictApprove] = useState(false); // saved approve flag for retry

  const targetMoveMonday = monday && moveWeekOffset === 1 ? addWeeks(monday, 1) : monday;
  const targetMoveWk = targetMoveMonday ? weekKey(targetMoveMonday) : null;
  const targetMoveBks = (targetMoveWk && allBookings?.[targetMoveWk]) || {};
  const moveSrcKey  = slotKey(day, period.id);
  const moveSrcKey2 = booking?.doublePartnerKey || null;

  const isCrossTabTaken = (pid) => {
    // Check cross-tab booking (e.g. primary booking blocking secondary slot)
    if (allCrossTabBookings && crossTabPeriodMapForMove) {
      const crossPid = crossTabPeriodMapForMove[pid];
      if (crossPid && allCrossTabBookings[targetMoveWk]?.[slotKey(moveDay, crossPid)]) return true;
    }
    // Check second cross-tab (loans: primary bookings)
    if (allCross2Bookings && cross2PeriodMapForMove) {
      const cross2Pid = cross2PeriodMapForMove[pid];
      if (cross2Pid && allCross2Bookings[targetMoveWk]?.[slotKey(moveDay, cross2Pid)]) return true;
    }
    return false;
  };

  const movablePeriods = periods
    .filter(p => p.type === "lesson")
    .filter(p => {
      const k = slotKey(moveDay, p.id);
      const existing = targetMoveBks[k];
      const isSrc = moveWeekOffset === 0 && (k === moveSrcKey || k === moveSrcKey2);
      if (existing && !isSrc) return false;
      if (isCrossTabTaken(p.id)) return false;
      if (isDoubleFirst) {
        const nxt = getNextLessonPeriod(p.id, periods);
        if (!nxt) return false;
        const nxtK = slotKey(moveDay, nxt.id);
        const nxtExisting = targetMoveBks[nxtK];
        const nxtIsSrc = moveWeekOffset === 0 && (nxtK === moveSrcKey || nxtK === moveSrcKey2);
        if (nxtExisting && !nxtIsSrc) return false;
        if (isCrossTabTaken(nxt.id)) return false;
      }
      return true;
    });

  const doMove = async (approve) => {
    if (!movePeriodId || !onAdminMove) return;
    // For "move all" on a recurring booking, pre-check for conflicts in other weeks
    if (moveRecurOption === "all" && isRecurring && onCheckRecurConflicts) {
      const conflictCount = await onCheckRecurConflicts({ targetDay: moveDay, targetPeriodId: movePeriodId, targetWeekOffset: moveWeekOffset });
      if (conflictCount > 0) {
        setMoveConflictCount(conflictCount);
        setMoveConflictApprove(approve);
        return; // show warning — don't move yet
      }
    }
    onAdminMove({ targetDay: moveDay, targetPeriodId: movePeriodId, targetWeekOffset: moveWeekOffset, recurMode: moveRecurOption, approve });
  };

  const confirmMoveThisOnly = () => {
    setMoveConflictCount(null);
    onAdminMove({ targetDay: moveDay, targetPeriodId: movePeriodId, targetWeekOffset: moveWeekOffset, recurMode: "this", approve: moveConflictApprove });
  };

  const movePanelContent = (
    <div className="move-panel">
      <div className="move-panel-title">📦 Move booking to…</div>
      {isDoubleFirst && (
        <div style={{ fontSize: "0.78rem", color: "var(--text5)", fontFamily: "DM Mono, monospace" }}>
          Double period — both slots will move together
        </div>
      )}
      <div className="move-week-tabs">
        <button className={`move-week-tab${moveWeekOffset === 0 ? " active" : ""}`}
          onClick={() => { setMoveWeekOffset(0); setMovePeriodId(""); }}>This week</button>
        <button className={`move-week-tab${moveWeekOffset === 1 ? " active" : ""}`}
          onClick={() => { setMoveWeekOffset(1); setMovePeriodId(""); }}>Next week</button>
      </div>
      <div className="move-selects">
        <select className="move-select" value={moveDay}
          onChange={e => { setMoveDay(e.target.value); setMovePeriodId(""); }}>
          {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="move-select" value={movePeriodId}
          onChange={e => setMovePeriodId(e.target.value)}>
          <option value="">— Select period —</option>
          {movablePeriods.map(p => <option key={p.id} value={p.id}>{p.label} ({p.time})</option>)}
        </select>
      </div>
      {isRecurring && movePeriodId && moveConflictCount === null && (
        <div className="move-recur-opts">
          <label className="move-recur-opt">
            <input type="radio" name="moveRecur" checked={moveRecurOption === "this"} onChange={() => setMoveRecurOption("this")} />
            Move just this occurrence
          </label>
          <label className="move-recur-opt">
            <input type="radio" name="moveRecur" checked={moveRecurOption === "all"} onChange={() => setMoveRecurOption("all")} />
            Move all in series
          </label>
        </div>
      )}
      {moveConflictCount > 0 && (
        <div className="conflict-warning">
          <span className="conflict-warning-icon">⚠</span>
          <span>
            {moveConflictCount} week{moveConflictCount > 1 ? "s" : ""} in this series already have a booking in that slot and cannot be moved.
            Do you want to move just this week instead?
          </span>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn-move" style={{ fontSize: "0.8rem", padding: "7px 14px" }} onClick={confirmMoveThisOnly}>
              Move just this week
            </button>
            <button className="btn-cancel" style={{ fontSize: "0.8rem" }} onClick={() => setMoveConflictCount(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const nextPeriod        = isNew ? getNextLessonPeriod(period.id, periods) : null;
  const nextKey           = nextPeriod ? slotKey(day, nextPeriod.id) : null;
  const nextAlreadyBooked = nextKey && weekBookings?.[nextKey];

  // Periods after clicked one (for closure spread)
  const periodIdx    = periods.findIndex(p => p.id === period.id);
  const periodsAfter = periods.slice(periodIdx + 1);

  const upd = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const canSave = form.teacher.trim() && form.class.trim() && form.subject.trim()
    && !(doubleMode && nextAlreadyBooked);

  // Closed slot view
  if (isClosed) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" style={{ "--accent": "#ef4444" }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div>
              <div className="modal-title">Slot Closed</div>
              <div className="modal-sub">{day} · {period.label} · {period.time}</div>
            </div>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
          <div className="modal-body">
            <div className="closed-info-box">
              <span style={{ fontSize: "2rem" }}>🚫</span>
              <div className="closed-info-reason">{booking.reason || "Unavailable"}</div>
            </div>
            {!isAdmin && (
              <div style={{ fontSize: "0.78rem", color: "var(--text4)", textAlign: "center" }}>
                This slot has been marked unavailable by an administrator.
              </div>
            )}
          </div>
          <div className="modal-footer">
            {isAdmin && (
              <button className="btn-delete" onClick={() => onDelete("single")}>Remove Closure</button>
            )}
            <button className="btn-cancel" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  // Pending view (non-admin just sees info)
  if (isPending && !isAdmin) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" style={{ "--accent": accentColor }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div>
              <div className="modal-title">Pending Booking</div>
              <div className="modal-sub">
                {day} · {period.label} · {period.time}
                {isDoubleSecond && <span style={{ marginLeft: 8, color: accentColor, fontSize: "0.72rem" }}>↔ 2nd period</span>}
                {!isDoubleSecond && booking?.doublePeriodLabel && <span style={{ marginLeft: 8, color: accentColor, fontSize: "0.72rem" }}>↔ + {booking.doublePeriodLabel}</span>}
              </div>
            </div>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
          <div className="modal-body">
            <div className="pending-status-badge">⏳ Awaiting lab tech approval</div>
            <div className="pending-info-box">
              {[["Teacher", booking.teacher], ["Class", booking.class], ["Subject", booking.subject],
                booking.activityOverview && ["Activity", booking.activityOverview],
                booking.requiredEquipment && ["Equipment", booking.requiredEquipment],
                booking.numStudents && ["Students", `${booking.numStudents}${booking.numGroups ? ` (${booking.numGroups} groups)` : ""}`],
              ].filter(Boolean).map(([label, value]) => (
                <div key={label} className="pending-info-row">
                  <span className="pending-info-label">{label}</span>
                  <span className="pending-info-value">{value}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: "0.78rem", color: "#475569" }}>
              An approval email has been sent to the lab technician. This slot will be confirmed or released once they respond.
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn-cancel" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  // Pending view (admin can approve/reject)
  if (isPending && isAdmin) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" style={{ "--accent": accentColor }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div>
              <div className="modal-title">Pending — Admin Review</div>
              <div className="modal-sub">
                {day} · {period.label} · {period.time}
                {isDoubleSecond && <span style={{ marginLeft: 8, color: accentColor, fontSize: "0.72rem" }}>↔ 2nd period</span>}
                {!isDoubleSecond && booking?.doublePeriodLabel && <span style={{ marginLeft: 8, color: accentColor, fontSize: "0.72rem" }}>↔ + {booking.doublePeriodLabel}</span>}
              </div>
            </div>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
          <div className="modal-body">
            {moveMode ? movePanelContent : (
              <>
                <div className="pending-status-badge">⏳ Awaiting approval</div>
                <div className="pending-info-box">
                  {[["Teacher", booking.teacher], ["Class", booking.class], ["Subject", booking.subject],
                    booking.activityOverview && ["Activity", booking.activityOverview],
                    booking.requiredEquipment && ["Equipment", booking.requiredEquipment],
                    booking.numStudents && ["Students", `${booking.numStudents}${booking.numGroups ? ` (${booking.numGroups} groups)` : ""}`],
                    booking.recurring && ["Recurring", `${booking.recurWeeks} weeks`],
                  ].filter(Boolean).map(([label, value]) => (
                    <div key={label} className="pending-info-row">
                      <span className="pending-info-label">{label}</span>
                      <span className="pending-info-value">{value}</span>
                    </div>
                  ))}
                </div>
                <div className="admin-actions">
                  <button className="btn-approve" onClick={onAdminApprove}>✓ Approve Booking</button>
                  <button className="btn-reject-action" onClick={onAdminReject}>✕ Reject</button>
                  <button className="btn-move-toggle" onClick={() => setMoveMode(true)}>📦 Approve & Move…</button>
                </div>
              </>
            )}
          </div>
          <div className="modal-footer">
            {moveMode ? (
              <>
                <button className="btn-cancel" onClick={() => { setMoveMode(false); setMoveConflictCount(null); }}>← Back</button>
                {moveConflictCount === null && (
                  <button className="btn-move" disabled={!movePeriodId} onClick={() => doMove(true)}>
                    Approve &amp; Move
                  </button>
                )}
              </>
            ) : (
              <button className="btn-cancel" onClick={onClose}>Close</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Normal booking form (new or editing confirmed)
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ "--accent": accentColor }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">
              {isNew ? (isLoans ? "Log Equipment Loan" : "Book Slot") : "Edit Booking"}
            </div>
            <div className="modal-sub">
              {day} · {period.label} · {period.time}
              {isNew && doubleMode && nextPeriod && <span style={{ color: accentColor }}> → {nextPeriod.label} · {nextPeriod.time}</span>}
              {!isNew && isDoubleSecond && <span style={{ marginLeft: 8, color: accentColor, fontSize: "0.72rem" }}>↔ 2nd period</span>}
              {!isNew && !isDoubleSecond && booking?.doublePeriodLabel && <span style={{ marginLeft: 8, color: accentColor, fontSize: "0.72rem" }}>↔ + {booking.doublePeriodLabel}</span>}
              {isRecurring && <span style={{ marginLeft: 8, color: accentColor, fontSize: "0.72rem" }}>↻ Recurring</span>}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {!isNew && isAdmin && moveMode ? movePanelContent : (<>
          {conflictBooking && (
            <div className="conflict-warning">
              <span className="conflict-warning-icon">⚠</span>
              <span>
                {isLoans
                  ? conflictBooking.status === "closed"
                    ? "The lab is closed for this period. You may still be able to borrow equipment. Check with admin before booking."
                    : `${conflictBooking.teacher} (secondary) has booked the lab during this period. Check that they are not using the equipment you need before booking.`
                  : `${conflictBooking.teacher} has booked an equipment loan for this period. Check that they are not using the equipment you need before booking.`
                }
              </span>
            </div>
          )}

          {conflictBooking2 && (
            <div className="conflict-warning">
              <span className="conflict-warning-icon">⚠</span>
              <span>
                {isLoans
                  ? `${conflictBooking2.teacher} (${conflictBooking2Name?.toLowerCase() || "primary"}) has booked the lab during this period. Check that they are not using the equipment you need before booking.`
                  : `${conflictBooking2.teacher} has booked an equipment loan for this period. Check that they are not using the equipment you need before booking.`
                }
              </span>
            </div>
          )}

          {isNew && isPrimary && (period.id === "pp8" || period.id === "pp10") && (
            <div style={{ fontSize: "0.8rem", color: "#92400e", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, padding: "10px 14px", lineHeight: 1.5 }}>
              <strong>NOTE:</strong> {period.id === "pp8"
                ? "This slot is only 30 minutes and finishes at 3pm."
                : "This slot is only 30 minutes and starts at 3:45pm."}
            </div>
          )}

          {isNew && isAdmin && (
            <div className="mode-tabs">
              <button className={`mode-tab${!closureMode ? " active" : ""}`}
                style={{ "--accent": accentColor }}
                onClick={() => setClosureMode(false)}>📅 Add Booking</button>
              <button className={`mode-tab${closureMode ? " active" : ""}`}
                style={{ "--accent": "#ef4444" }}
                onClick={() => setClosureMode(true)}>🚫 Close Slot</button>
            </div>
          )}

          {isNew && !isAdmin && (
            <div style={{ fontSize: "0.8rem", color: "#64748b", background: "#0f1117", border: "1px solid #2d3748", borderRadius: 8, padding: "10px 14px", lineHeight: 1.5 }}>
              📧 Your booking will be sent to the lab technician for approval. The slot will show as <strong style={{ color: "#86efac" }}>pending</strong> until confirmed.
            </div>
          )}

          {isNew && isAdmin && !closureMode && (
            <div className="admin-book-note">
              🔑 Admin booking — saved immediately without approval.
            </div>
          )}

          {isNew && isAdmin && closureMode ? (
            <>
              <div className="field-group">
                <label className="field-label">Reason <span className="required">*</span></label>
                <input className="field-input" value={closureReason} onChange={(e) => setClosureReason(e.target.value)}
                  placeholder="e.g. Visitors in school, Lab maintenance, Staff event…" autoFocus />
              </div>
              <div className="field-group">
                <label className="field-label">Extend closure through</label>
                <select className="field-input" value={closureThrough} onChange={(e) => setClosureThrough(e.target.value)}>
                  <option value="">This slot only</option>
                  {periodsAfter.map((p) => (
                    <option key={p.id} value={p.id}>{p.label} ({p.time})</option>
                  ))}
                  <option value="wholeday">Whole day (all periods)</option>
                </select>
              </div>
            </>
          ) : (
            <>
            <div className="field-group">
            <label className="field-label">Teacher Name <span className="required">*</span></label>
            <input className="field-input" value={form.teacher} onChange={upd("teacher")} placeholder="e.g. Ms. Nguyen"
              readOnly={isConfirmed && !isAdmin}
              style={isConfirmed && !isAdmin ? { opacity: 0.5, cursor: "not-allowed" } : {}} />
          </div>
          <div className="row-2">
            <div className="field-group">
              <label className="field-label">Class <span className="required">*</span></label>
              <input className="field-input" value={form.class} onChange={upd("class")} placeholder="e.g. 8A"
                readOnly={isConfirmed && !isAdmin}
                style={isConfirmed && !isAdmin ? { opacity: 0.5, cursor: "not-allowed" } : {}} />
            </div>
            <div className="field-group">
              <label className="field-label">Subject <span className="required">*</span></label>
              <input className="field-input" value={form.subject} onChange={upd("subject")} placeholder="e.g. Computing"
                readOnly={isConfirmed && !isAdmin}
                style={isConfirmed && !isAdmin ? { opacity: 0.5, cursor: "not-allowed" } : {}} />
            </div>
          </div>

          <ColorPicker value={form.color} onChange={(hex) => setForm((f) => ({ ...f, color: hex }))} />

          {isNew && nextPeriod && (
            <div className="recur-section">
              <Toggle on={doubleMode} onToggle={() => setDoubleMode((v) => !v)}
                label={`Double period (continues into ${nextPeriod.label})`} />
              {doubleMode && nextAlreadyBooked && (
                <div className="double-conflict-note">
                  ⚠ {nextPeriod.label} is already booked and cannot be added as a double period.
                </div>
              )}
              {doubleMode && !nextAlreadyBooked && (
                <div className="double-note">
                  Both {period.label} and {nextPeriod.label} will be marked pending and confirmed together with a single approval email.
                </div>
              )}
            </div>
          )}

          {isNew && (
            <div className="recur-section">
              <Toggle on={form.recurring} onToggle={() => setForm((f) => ({ ...f, recurring: !f.recurring }))} label="Repeat this booking weekly" />
              {form.recurring && (
                <div className="recur-options">
                  <div className="recur-row">
                    <span className="recur-hint">Repeat for</span>
                    <input className="recur-weeks-input" type="number" min="2" max="3" value={form.recurWeeks}
                      onChange={(e) => setForm((f) => ({ ...f, recurWeeks: Math.max(2, Math.min(3, +e.target.value || 2)) }))} />
                    <span className="recur-hint">weeks</span>
                  </div>
                  <div className="recur-hint" style={{ color: "#3b5268" }}>
                    Creates {form.recurWeeks} bookings from the current week{isAdmin ? "" : " (all require approval)"}
                  </div>
                  <div className="recur-hint" style={{ color: "var(--text5)" }}>
                    To book for longer than 3 weeks, please contact admin.
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="divider">Optional Details</div>

          <div className="field-group">
            <label className="field-label">Activity Overview</label>
            <textarea className="field-textarea" value={form.activityOverview} onChange={upd("activityOverview")}
              placeholder={isLoans ? "What will the equipment be used for?" : "Brief description of what the class will be doing…"} />
          </div>
          <div className="field-group">
            <label className="field-label">Required Equipment</label>
            <textarea className="field-textarea" value={form.requiredEquipment} onChange={upd("requiredEquipment")}
              placeholder={isLoans ? "Specify items to be loaned out…" : "List any equipment or resources needed…"}
              style={{ minHeight: 56 }} />
          </div>
          <div className="row-2">
            <div className="field-group">
              <label className="field-label">No. of Students</label>
              <input className="field-input" type="number" min="1" value={form.numStudents} onChange={upd("numStudents")} placeholder="e.g. 24" />
            </div>
            <div className="field-group">
              <label className="field-label">No. of Groups</label>
              <input className="field-input" type="number" min="1" value={form.numGroups} onChange={upd("numGroups")} placeholder="e.g. 6" />
            </div>
          </div>
            </>
          )}
          </>)}
        </div>

        <div className="modal-footer">
          {!isNew && isAdmin && moveMode ? (
            <>
              <button className="btn-cancel" onClick={() => { setMoveMode(false); setMoveConflictCount(null); }}>← Back</button>
              {moveConflictCount === null && (
                <button className="btn-move" disabled={!movePeriodId} onClick={() => doMove(false)}>
                  Confirm Move
                </button>
              )}
            </>
          ) : (<>
          {!isNew && isAdmin && !delMode && (
            <button className="btn-delete" onClick={() => setDelMode(true)}>
              {isRecurring ? "Remove…" : "Remove Booking"}
            </button>
          )}
          {!isNew && isAdmin && !delMode && !closureMode && (
            <button className="btn-move-toggle" onClick={() => { setMoveMode(true); setDelMode(false); }}>📦 Move…</button>
          )}
          {!isNew && isAdmin && delMode && (
            <div className="recur-del-wrap">
              <div className="recur-del-title">Remove which bookings?</div>
              <div className="recur-del-opts">
                <div className="recur-del-opt" onClick={() => onDelete("single")}>✕ This week only</div>
                {(isRecurring || (booking?.recurring && booking?.recurWeeks > 1)) && <div className="recur-del-opt" onClick={() => onDelete("all")}>✕✕ All recurring</div>}
              </div>
            </div>
          )}
          <button className="btn-cancel" onClick={delMode ? () => setDelMode(false) : onClose}>
            {delMode ? "Back" : "Cancel"}
          </button>
          {!delMode && !closureMode && (
            <button className="btn-save" style={{ background: form.color }} disabled={!canSave}
              onClick={() => {
                const f = { ...form, double: doubleMode };
                isAdmin && isNew ? onAdminSave(f) : onSave(f);
              }}>
              {isNew ? (isAdmin ? "Save Booking" : "Submit for Approval") : "Save Changes"}
            </button>
          )}
          {!delMode && closureMode && (
            <button className="btn-save" style={{ background: "#ef4444" }}
              disabled={!closureReason.trim()}
              onClick={() => onClosure({ reason: closureReason, throughPeriodId: closureThrough || "" })}>
              Close {closureThrough === "wholeday" ? "Whole Day" : closureThrough ? "Slots" : "Slot"}
            </button>
          )}
          </>)}
        </div>
      </div>
    </div>
  );
}

// ─── Timetable Grid ───────────────────────────────────────────────────────────

function TimetableGrid({ accentColor, bookings, setBookings, crossBookings, crossBookingsPeriodMap, monday, dbKeyFn, lab, isLoans, isPrimary, crossTabBookings, periodMap, crossTabName, cross2Bookings, cross2BookingsPeriodMap, cross2Name, onSaveState, isAdmin, onToast, periods = PERIODS }) {
  const [modal, setModal]             = useState(null);
  const [selectMode, setSelectMode]   = useState(false);
  const [selectedSlots, setSelectedSlots] = useState(new Set());
  const wk = weekKey(monday);

  const getBooking      = (day, pid) => bookings[wk]?.[slotKey(day, pid)] || null;
  const getCrossBooking = (day, pid) => {
    const crossPid = crossBookingsPeriodMap ? (crossBookingsPeriodMap[pid] ?? null) : pid;
    return crossPid ? crossBookings?.[wk]?.[slotKey(day, crossPid)] || null : null;
  };
  const getCross2Booking = (day, pid) => {
    const crossPid = cross2BookingsPeriodMap ? (cross2BookingsPeriodMap[pid] ?? null) : pid;
    return crossPid ? cross2Bookings?.[wk]?.[slotKey(day, crossPid)] || null : null;
  };

  const persist = useCallback(async (wkk, data) => {
    onSaveState("saving");
    await dbSave(dbKeyFn(lab, wkk), data);
    onSaveState("saved");
    setTimeout(() => onSaveState("idle"), 2000);
  }, [lab, dbKeyFn, onSaveState]);

  // Admin: save a new booking directly as confirmed (no email)
  const handleAdminDirectSave = async (form) => {
    const { day, period } = modal;
    const { double, recurring, recurWeeks, ...rest } = form;
    const key = slotKey(day, period.id);

    const nextPeriod = double ? getNextLessonPeriod(period.id, periods) : null;
    const key2 = nextPeriod ? slotKey(day, nextPeriod.id) : null;
    const doubleId = double && nextPeriod ? `double_${Date.now()}_${key}` : undefined;

    const confirmed = {
      ...rest, status: "confirmed",
      day, periodLabel: period.label, periodTime: period.time,
      ...(doubleId ? { doubleId, doublePartnerKey: key2, doublePeriodLabel: nextPeriod.label, doublePeriodTime: nextPeriod.time } : {}),
    };
    const confirmed2 = key2 ? {
      ...rest, status: "confirmed",
      day, periodLabel: nextPeriod.label, periodTime: nextPeriod.time,
      doubleId, isDoubleSecond: true, doublePartnerKey: key,
    } : null;

    const nextAll = { ...bookings };
    if (recurring && recurWeeks > 1) {
      const recurId = `recur_${Date.now()}_${key}`;
      for (let i = 0; i < recurWeeks; i++) {
        const wkDate = addWeeks(getMondayOfWeek(new Date(wk)), i);
        const wkk = weekKey(wkDate);
        const wkSlots = { ...(await dbLoad(dbKeyFn(lab, wkk))) };
        wkSlots[key] = { ...confirmed, recurId };
        if (confirmed2) wkSlots[key2] = { ...confirmed2, recurId };
        nextAll[wkk] = wkSlots;
        await persist(wkk, wkSlots);
      }
    } else {
      const existing = { ...(nextAll[wk] || {}) };
      existing[key] = confirmed;
      if (confirmed2) existing[key2] = confirmed2;
      nextAll[wk] = existing;
      await persist(wk, existing);
    }
    setBookings(nextAll);
    setModal(null);
    onToast("Booking saved ✓");
  };

  // Admin: close a slot (optionally spanning multiple periods)
  const handleClosure = async ({ reason, throughPeriodId }) => {
    const { day, period } = modal;
    const existing = { ...(bookings[wk] || {}) };
    let startIdx, endIdx;
    if (throughPeriodId === "wholeday") {
      startIdx = 0;
      endIdx = periods.length - 1;
    } else {
      startIdx = periods.findIndex(p => p.id === period.id);
      endIdx = throughPeriodId ? periods.findIndex(p => p.id === throughPeriodId) : startIdx;
    }
    for (let i = startIdx; i <= endIdx; i++) {
      const p = periods[i];
      existing[slotKey(day, p.id)] = { status: "closed", reason, day, periodLabel: p.label, periodTime: p.time };
    }
    const nextAll = { ...bookings, [wk]: existing };
    setBookings(nextAll);
    await persist(wk, existing);
    setModal(null);
    const count = endIdx - startIdx + 1;
    onToast(`${count} slot${count !== 1 ? "s" : ""} closed`);
  };

  // Submit new booking → pending state + email
  const handleSave = async (form) => {
    const { day, period } = modal;
    const { double, recurring, recurWeeks, ...rest } = form;
    const key = slotKey(day, period.id);

    // For double period, find the next lesson period
    const nextPeriod = double ? getNextLessonPeriod(period.id, periods) : null;
    const key2 = nextPeriod ? slotKey(day, nextPeriod.id) : null;
    const doubleId = double && nextPeriod ? `double_${Date.now()}_${key}` : undefined;

    const pendingBooking = {
      ...rest, status: "pending",
      day, periodLabel: period.label, periodTime: period.time,
      recurring, recurWeeks,
      ...(doubleId ? { doubleId, doublePartnerKey: key2, doublePeriodLabel: nextPeriod.label, doublePeriodTime: nextPeriod.time } : {}),
    };

    const pendingBooking2 = key2 ? {
      ...rest, status: "pending",
      day, periodLabel: nextPeriod.label, periodTime: nextPeriod.time,
      recurring, recurWeeks,
      doubleId, isDoubleSecond: true, doublePartnerKey: key,
    } : null;

    const nextAll = { ...bookings };

    if (recurring && recurWeeks > 1) {
      // Write ALL recurring weeks as pending immediately
      for (let i = 0; i < recurWeeks; i++) {
        const wkDate = addWeeks(getMondayOfWeek(new Date(wk)), i);
        const wkk = weekKey(wkDate);
        const wkSlots = { ...(await dbLoad(dbKeyFn(lab, wkk))) };
        wkSlots[key] = pendingBooking;
        if (pendingBooking2) wkSlots[key2] = pendingBooking2;
        nextAll[wkk] = wkSlots;
        await persist(wkk, wkSlots);
      }
    } else {
      const existing = { ...(nextAll[wk] || {}) };
      existing[key] = pendingBooking;
      if (pendingBooking2) existing[key2] = pendingBooking2;
      nextAll[wk] = existing;
      await persist(wk, existing);
    }

    setBookings(nextAll);
    setModal(null);
    onToast("Booking submitted — sending approval email…");

    // Generate token, store it so approve/reject links work
    const token = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const bkType = isLoans ? "loans" : isPrimary ? "primary" : "inlab";
    const pendingStorageKey = `pending_${lab}_${wk}_${key}_${bkType}`;
    await dbSave(pendingStorageKey, {
      token, lab, weekKey: wk, slotKey: key,
      booking: pendingBooking,
      bookingType: bkType,
      ...(key2 ? { doubleSlotKey: key2 } : {}),
    });

    const siteUrl = window.location.origin;
    const approveUrl = `${siteUrl}/?approve=${token}&key=${encodeURIComponent(pendingStorageKey)}`;
    const rejectUrl  = `${siteUrl}/?reject=${token}&key=${encodeURIComponent(pendingStorageKey)}`;
    const labInfo = LABS[lab];

    // Build email booking — combine period labels for double
    const emailBooking = {
      ...pendingBooking,
      periodLabel: double && nextPeriod ? `${period.label} + ${nextPeriod.label}` : period.label,
      periodTime:  double && nextPeriod
        ? `${period.time.split("–")[0].trim()} – ${nextPeriod.time.split("–")[1].trim()}`
        : period.time,
    };

    const emailTypeLabel = isLoans ? "Equipment Loan" : isPrimary ? "Primary Lab Booking" : "Secondary Lab Booking";
    sendApprovalEmail({
      toEmail:     labInfo.techEmail,
      labName:     labInfo.name,
      bookingType: emailTypeLabel,
      booking:     emailBooking,
      approveUrl,
      rejectUrl,
    })
      .then(() => onToast("✓ Approval email sent to " + labInfo.techName))
      .catch((e) => { console.error(e); onToast("Booking saved — email failed, approve via admin login"); });
  };

  // Admin: approve pending booking directly in-app
  const handleAdminApprove = async () => {
    const { day, period } = modal;
    const key = slotKey(day, period.id);
    const bk = getBooking(day, period.id);
    const nextAll = { ...bookings };

    // Collect all slot keys to approve (include double partner if present)
    const keysToApprove = [key];
    if (bk.doublePartnerKey) keysToApprove.push(bk.doublePartnerKey);

    if (bk.recurring && bk.recurWeeks > 1) {
      const recurId = `recur_${Date.now()}_${key}`;
      for (let i = 0; i < bk.recurWeeks; i++) {
        const wkDate = addWeeks(getMondayOfWeek(new Date(wk)), i);
        const wkk = weekKey(wkDate);
        const wkSlots = { ...(await dbLoad(dbKeyFn(lab, wkk))) };
        for (const k of keysToApprove) {
          const slotBk = wkSlots[k];
          if (slotBk) {
            const { recurring, recurWeeks, status, pendingKey, ...rest } = slotBk;
            wkSlots[k] = { ...rest, recurId, status: "confirmed" };
          }
        }
        nextAll[wkk] = wkSlots;
        await persist(wkk, wkSlots);
      }
    } else {
      const existing = { ...(nextAll[wk] || {}) };
      for (const k of keysToApprove) {
        const slotBk = existing[k];
        if (slotBk) {
          const { recurring, recurWeeks, status, pendingKey, ...rest } = slotBk;
          existing[k] = { ...rest, status: "confirmed" };
        }
      }
      nextAll[wk] = existing;
      await persist(wk, existing);
    }

    setBookings(nextAll);
    setModal(null);
    onToast("Booking approved ✓");
  };

  // Admin: reject pending booking
  const handleAdminReject = async () => {
    const { day, period } = modal;
    const key = slotKey(day, period.id);
    const bk = getBooking(day, period.id);
    const nextAll = { ...bookings };

    const keysToDelete = [key];
    if (bk?.doublePartnerKey) keysToDelete.push(bk.doublePartnerKey);

    if (bk?.recurring && bk?.recurWeeks > 1) {
      for (let i = 0; i < bk.recurWeeks; i++) {
        const wkDate = addWeeks(getMondayOfWeek(new Date(wk)), i);
        const wkk = weekKey(wkDate);
        const wkSlots = { ...(await dbLoad(dbKeyFn(lab, wkk))) };
        for (const k of keysToDelete) delete wkSlots[k];
        nextAll[wkk] = wkSlots;
        await persist(wkk, wkSlots);
      }
    } else {
      const existing = { ...(nextAll[wk] || {}) };
      for (const k of keysToDelete) delete existing[k];
      nextAll[wk] = existing;
      await persist(wk, existing);
    }

    setBookings(nextAll);
    setModal(null);
    onToast("Booking rejected and slot released");
  };

  // Admin: delete confirmed booking
  const handleDelete = async (mode) => {
    const { day, period } = modal;
    const key = slotKey(day, period.id);
    const bk = getBooking(day, period.id);
    const nextAll = { ...bookings };

    const keysToDelete = [key];
    if (bk?.doublePartnerKey) keysToDelete.push(bk.doublePartnerKey);

    if (mode === "all") {
      if (bk?.recurId) {
        // Confirmed recurring: delete by recurId
        for (const [wkk, slots] of Object.entries(nextAll)) {
          const updated = { ...slots };
          let changed = false;
          for (const k of keysToDelete) {
            if (slots[k]?.recurId === bk.recurId) { delete updated[k]; changed = true; }
          }
          if (changed) { nextAll[wkk] = updated; await persist(wkk, updated); }
        }
      } else if (bk?.recurring && bk?.recurWeeks > 1) {
        // Pending recurring: delete all weeks
        for (let i = 0; i < bk.recurWeeks; i++) {
          const wkDate = addWeeks(getMondayOfWeek(new Date(wk)), i);
          const wkk = weekKey(wkDate);
          const wkSlots = { ...(await dbLoad(dbKeyFn(lab, wkk))) };
          for (const k of keysToDelete) delete wkSlots[k];
          nextAll[wkk] = wkSlots;
          await persist(wkk, wkSlots);
        }
      }
    } else {
      const existing = { ...(nextAll[wk] || {}) };
      for (const k of keysToDelete) delete existing[k];
      nextAll[wk] = existing;
      await persist(wk, existing);
    }
    setBookings(nextAll);
    setModal(null);
    onToast("Booking removed");
  };

  // Admin: pre-check how many recurring weeks would be blocked by moving to target
  const handleCheckRecurConflicts = async ({ targetDay, targetPeriodId, targetWeekOffset }) => {
    const { day, period } = modal;
    const srcKey = slotKey(day, period.id);
    const bk = getBooking(day, period.id);
    if (!bk?.recurId) return 0;
    const targetMondayDate = addWeeks(monday, targetWeekOffset);
    const targetKey = slotKey(targetDay, targetPeriodId);
    const isDoubleFirst = !bk.isDoubleSecond && !!bk.doubleId;
    const targetNextPeriod = isDoubleFirst ? getNextLessonPeriod(targetPeriodId, periods) : null;
    const targetDoubleKey = targetNextPeriod ? slotKey(targetDay, targetNextPeriod.id) : null;
    const weeksToCheck = new Set(Object.keys(bookings));
    for (let offset = -3; offset <= 3; offset++) {
      weeksToCheck.add(weekKey(addWeeks(monday, offset)));
    }
    let conflictCount = 0;
    for (const wkk of weeksToCheck) {
      const slots = bookings[wkk] || (await dbLoad(dbKeyFn(lab, wkk)));
      if (!slots) continue;
      const slotBk = slots[srcKey];
      if (!slotBk || slotBk.recurId !== bk.recurId) continue;
      const targetOccupant = slots[targetKey];
      const targetOccupant2 = targetDoubleKey ? slots[targetDoubleKey] : null;
      if (
        (targetOccupant && targetOccupant.recurId !== bk.recurId) ||
        (targetOccupant2 && targetOccupant2.recurId !== bk.recurId)
      ) conflictCount++;
    }
    return conflictCount;
  };

  // Admin: move a booking to a different slot/week
  const handleAdminMove = async ({ targetDay, targetPeriodId, targetWeekOffset, recurMode, approve }) => {
    const { day, period } = modal;
    const srcKey = slotKey(day, period.id);
    const bk = getBooking(day, period.id);
    if (!bk) return;

    const targetMondayDate = addWeeks(monday, targetWeekOffset);
    const targetWk = weekKey(targetMondayDate);
    const targetPeriod = periods.find(p => p.id === targetPeriodId);
    if (!targetPeriod) return;
    const targetKey = slotKey(targetDay, targetPeriodId);

    const isDoubleFirst = !bk.isDoubleSecond && !!bk.doubleId;
    const srcDoubleKey = isDoubleFirst ? bk.doublePartnerKey : null;
    const partnerBk = srcDoubleKey ? bookings[wk]?.[srcDoubleKey] : null;
    const targetNextPeriod = isDoubleFirst ? getNextLessonPeriod(targetPeriodId, periods) : null;
    const targetDoubleKey = targetNextPeriod ? slotKey(targetDay, targetNextPeriod.id) : null;

    const buildMoved = (srcBk, isSecond = false) => {
      const tgtPeriod = isSecond ? targetNextPeriod : targetPeriod;
      const { recurring, recurWeeks, pendingKey, ...rest } = srcBk;
      return {
        ...rest,
        day: targetDay,
        periodLabel: tgtPeriod.label,
        periodTime: tgtPeriod.time,
        status: approve ? "confirmed" : srcBk.status,
        ...(isDoubleFirst && !isSecond ? { doublePartnerKey: targetDoubleKey, doublePeriodLabel: targetNextPeriod?.label, doublePeriodTime: targetNextPeriod?.time } : {}),
        ...(isSecond ? { isDoubleSecond: true, doublePartnerKey: targetKey } : {}),
      };
    };

    const nextAll = { ...bookings };

    if (recurMode === "all" && bk.recurId) {
      // Build the set of weeks to check — loaded state + DB weeks surrounding current
      const weeksToCheck = new Set(Object.keys(nextAll));
      for (let offset = -3; offset <= 3; offset++) {
        weeksToCheck.add(weekKey(addWeeks(monday, offset)));
      }
      for (const wkk of weeksToCheck) {
        const slots = nextAll[wkk] || (await dbLoad(dbKeyFn(lab, wkk)));
        if (!slots) continue;
        const slotBk = slots[srcKey];
        if (!slotBk || slotBk.recurId !== bk.recurId) continue;
        // Safety: skip if target is taken by something outside this series (pre-check should have caught this)
        const targetOccupant = slots[targetKey];
        const targetOccupant2 = targetDoubleKey ? slots[targetDoubleKey] : null;
        const targetBlocked =
          (targetOccupant && targetOccupant.recurId !== bk.recurId) ||
          (targetOccupant2 && targetOccupant2.recurId !== bk.recurId);
        if (targetBlocked) continue;
        const slotPartner = srcDoubleKey ? slots[srcDoubleKey] : null;
        const updated = { ...slots };
        delete updated[srcKey];
        if (srcDoubleKey) delete updated[srcDoubleKey];
        updated[targetKey] = buildMoved({ ...slotBk });
        if (isDoubleFirst && targetDoubleKey && targetNextPeriod && slotPartner) {
          updated[targetDoubleKey] = buildMoved({ ...slotPartner }, true);
        }
        nextAll[wkk] = updated;
        await persist(wkk, updated);
      }
    } else {
      const srcSlots = { ...(nextAll[wk] || {}) };
      delete srcSlots[srcKey];
      if (srcDoubleKey) delete srcSlots[srcDoubleKey];
      nextAll[wk] = srcSlots;
      await persist(wk, srcSlots);

      const existingTarget = nextAll[targetWk] || (await dbLoad(dbKeyFn(lab, targetWk)));
      const tgtSlots = { ...existingTarget };
      tgtSlots[targetKey] = buildMoved({ ...bk });
      if (isDoubleFirst && targetDoubleKey && targetNextPeriod && partnerBk) {
        tgtSlots[targetDoubleKey] = buildMoved({ ...partnerBk }, true);
      }
      nextAll[targetWk] = tgtSlots;
      await persist(targetWk, tgtSlots);
    }

    setBookings(nextAll);
    setModal(null);
    onToast(approve ? "Booking approved & moved ✓" : "Booking moved ✓");
  };

  const toggleSelectMode = () => { setSelectMode((v) => !v); setSelectedSlots(new Set()); };

  const toggleSlotSelection = (day, periodId) => {
    const key = slotKey(day, periodId);
    setSelectedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    const existing = { ...(bookings[wk] || {}) };
    const keysToDelete = new Set(selectedSlots);
    for (const key of selectedSlots) {
      const bk = existing[key];
      if (bk?.doublePartnerKey) keysToDelete.add(bk.doublePartnerKey);
    }
    for (const key of keysToDelete) delete existing[key];
    const nextAll = { ...bookings, [wk]: existing };
    setBookings(nextAll);
    await persist(wk, existing);
    const n = keysToDelete.size;
    setSelectedSlots(new Set());
    setSelectMode(false);
    onToast(`${n} booking${n !== 1 ? "s" : ""} removed`);
  };

  const handleBulkApprove = async () => {
    const currentWeek = bookings[wk] || {};
    const nextAll = { ...bookings };

    // Only operate on pending slots; collect unique primary keys (skip double-second slots)
    const primaryKeys = [...selectedSlots].filter((key) => {
      const bk = currentWeek[key];
      return bk?.status === "pending" && !bk?.isDoubleSecond;
    });

    for (const key of primaryKeys) {
      const bk = currentWeek[key];
      const keysToApprove = [key];
      if (bk.doublePartnerKey) keysToApprove.push(bk.doublePartnerKey);

      if (bk.recurring && bk.recurWeeks > 1) {
        const recurId = `recur_${Date.now()}_${key}`;
        for (let i = 0; i < bk.recurWeeks; i++) {
          const wkDate = addWeeks(getMondayOfWeek(new Date(wk)), i);
          const wkk = weekKey(wkDate);
          const wkSlots = { ...(await dbLoad(dbKeyFn(lab, wkk))) };
          for (const k of keysToApprove) {
            const slotBk = wkSlots[k];
            if (slotBk) {
              const { recurring, recurWeeks, status, pendingKey, ...rest } = slotBk;
              wkSlots[k] = { ...rest, recurId, status: "confirmed" };
            }
          }
          nextAll[wkk] = wkSlots;
          await persist(wkk, wkSlots);
        }
      } else {
        const existing = { ...(nextAll[wk] || {}) };
        for (const k of keysToApprove) {
          const slotBk = existing[k];
          if (slotBk) {
            const { recurring, recurWeeks, status, pendingKey, ...rest } = slotBk;
            existing[k] = { ...rest, status: "confirmed" };
          }
        }
        nextAll[wk] = existing;
        await persist(wk, existing);
      }
    }

    setBookings(nextAll);
    setSelectedSlots(new Set());
    setSelectMode(false);
    onToast(`${primaryKeys.length} booking${primaryKeys.length !== 1 ? "s" : ""} approved ✓`);
  };

  const weekSlots = bookings[wk] || {};
  const mergeMaps = Object.fromEntries(DAYS.map((d) => [d, buildMergeMap(d, weekSlots, isLoans, periods)]));

  const pendingCount = Object.values(weekSlots).filter((b) => b.status === "pending").length;

  return (
    <>
      {isAdmin && (
        <div className="admin-toolbar">
          {pendingCount > 0 && (
            <span className="admin-toolbar-pending">
              ⏳ {pendingCount} pending booking{pendingCount > 1 ? "s" : ""} awaiting approval — click to review
            </span>
          )}
          {selectMode && selectedSlots.size > 0 && (() => {
            const currentWeek = bookings[wk] || {};
            const pendingCount = [...selectedSlots].filter(k => currentWeek[k]?.status === "pending" && !currentWeek[k]?.isDoubleSecond).length;
            return (<>
              {pendingCount > 0 && (
                <button className="bulk-approve-btn" onClick={handleBulkApprove}>
                  ✓ Approve {pendingCount} pending
                </button>
              )}
              <button className="bulk-delete-btn" onClick={handleBulkDelete}>
                Remove {selectedSlots.size} selected
              </button>
            </>);
          })()}
          <button className={`select-toggle-btn${selectMode ? " active" : ""}`} onClick={toggleSelectMode}>
            {selectMode ? "✕ Cancel" : "⊡ Select"}
          </button>
        </div>
      )}
      <div className="grid-wrap">
        <table className="timetable">
          <thead>
            <tr>
              <th style={{ width: 110 }}></th>
              {DAYS.map((d) => (
                <th key={d} className="day-header">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => (
              <tr key={period.id} className={period.type === "break" ? "break-row" : ""}>
                <td className="period-label">
                  <div className="pl-name">{period.label}</div>
                  <div className="pl-time">{period.time}</div>
                </td>
                {DAYS.map((day) => {
                  const mergeInfo = mergeMaps[day]?.[period.id];
                  if (mergeInfo?.skip) return null;
                  const rowspan  = mergeInfo?.rowspan || 1;
                  const isMerged = rowspan > 1;

                  const bk        = getBooking(day, period.id);
                  const cross     = getCrossBooking(day, period.id);
                  const isPending = bk?.status === "pending";
                  const isClosed  = bk?.status === "closed";
                  const color     = isClosed ? "#64748b" : isPending ? "#86efac" : (bk?.color || accentColor);
                  const isSelected = selectMode && isAdmin && bk && selectedSlots.has(slotKey(day, period.id));
                  const cross2     = getCross2Booking(day, period.id);
                  const isPrimaryUnavail = isPrimary && PRIMARY_UNAVAILABLE.has(period.id);
                  const crossTabPeriodId = periodMap?.[period.id];
                  const crossTabBk = !bk && crossTabPeriodId ? crossTabBookings?.[wk]?.[slotKey(day, crossTabPeriodId)] : null;
                  const isCrossTabPending   = !!crossTabBk && crossTabBk.status === "pending";
                  const isCrossTabConfirmed = !!crossTabBk && crossTabBk.status === "confirmed";

                  return (
                    <td key={day} className={`slot-cell${isMerged ? " has-merged" : ""}`} rowSpan={rowspan > 1 ? rowspan : undefined}>
                      {period.type === "break" ? (
                        <div
                          className={`break-slot${bk ? (isClosed ? " closed" : isPending ? " pending" : " booked") : ""}${isMerged ? " merged" : ""}${isSelected ? " selected" : ""}${isAdmin ? " admin-break" : ""}`}
                          style={bk && !isPending && !isClosed ? { borderColor: color, background: color + "22" } : {}}
                          onClick={() => {
                            if (!isAdmin) return;
                            if (selectMode && bk) { toggleSlotSelection(day, period.id); return; }
                            setModal({ day, period });
                          }}
                        >
                          {bk ? (
                            isClosed ? (
                              <span style={{ fontSize: "0.65rem", color: "var(--closed-text)", fontFamily: "DM Mono, monospace" }}>🚫 {bk.reason}</span>
                            ) : isPending ? (
                              <span style={{ fontSize: "0.65rem", color: "#86efac", fontFamily: "DM Mono, monospace" }}>⏳ pending</span>
                            ) : (
                              <span style={{ fontSize: "0.72rem", color: "#f0f4ff", fontWeight: 600 }}>{bk.teacher} · {bk.class}</span>
                            )
                          ) : (
                            <span style={{ fontSize: "0.65rem", color: "var(--text6)", fontFamily: "DM Mono, monospace", letterSpacing: "0.08em" }}>{period.label.toUpperCase()}</span>
                          )}
                        </div>
                      ) : (
                        <div
                          className={`slot${isPrimaryUnavail ? " primary-unavail" : isCrossTabConfirmed ? " cross-tab-blocked" : isCrossTabPending ? " pending" : bk ? (isClosed ? " closed" : isPending ? " pending" : " booked") : " available"}${isMerged ? " merged" : ""}${isSelected ? " selected" : ""}`}
                          style={!isPrimaryUnavail && !isCrossTabConfirmed && !isCrossTabPending && bk && !isPending && !isClosed ? { background: color + "22", borderColor: color } : {}}
                          onClick={() => {
                            if (isPrimaryUnavail || isCrossTabConfirmed || isCrossTabPending) return;
                            if (selectMode && isAdmin && bk) { toggleSlotSelection(day, period.id); return; }
                            setModal({ day, period });
                          }}
                        >
                          {isPrimaryUnavail ? null : isCrossTabConfirmed ? (
                            <div className="cross-tab-label">{crossTabName}<br/>USING</div>
                          ) : isCrossTabPending ? (
                            <div className="pending-label">{crossTabName}<br/>BOOKING PENDING</div>
                          ) : bk ? (
                            isClosed ? (
                              <>
                                <div className="closed-label">🚫 CLOSED</div>
                                <div className="closed-reason">{bk.reason}</div>
                              </>
                            ) : isPending ? (
                              <>
                                <div className="slot-badges">
                                  {cross && <span className="slot-conflict-icon" style={{ color: "#a3623a" }}>⚠</span>}
                                  {(bk.recurId || bk.recurring) && <span className="slot-recur" style={{ opacity: 0.5 }}>↻</span>}
                                  {bk.doubleId && <span className="slot-double" style={{ opacity: 0.5 }}>↔</span>}
                                </div>
                                <div className="pending-label">⏳ PENDING</div>
                                <div className="pending-teacher">{bk.teacher} · {bk.class}</div>
                              </>
                            ) : (
                              <>
                                <div className="slot-badges">
                                  {cross && <span className="slot-conflict-icon">⚠</span>}
                                  {bk.recurId && <span className="slot-recur">↻</span>}
                                  {bk.doubleId && !isMerged && <span className="slot-double">↔</span>}
                                </div>
                                <div className="slot-teacher">{bk.teacher}</div>
                                <div className="slot-class" style={{ color }}>{bk.class}</div>
                                <div className="slot-subject">{bk.subject}</div>
                                {isMerged && bk.doublePeriodLabel && (
                                  <div style={{ fontSize: "0.6rem", color, opacity: 0.7, marginTop: 2, fontFamily: "DM Mono, monospace" }}>
                                    {period.label} + {bk.doublePeriodLabel}
                                  </div>
                                )}
                              </>
                            )
                          ) : (
                            <>
                              <div className="slot-badges">
                                {cross && !isLoans && <span className="slot-conflict-icon">⚠</span>}
                                {cross && isLoans && cross.status === "closed" && <span style={{ fontSize: "0.62rem", lineHeight: 1 }}>🚫</span>}
                                {cross && isLoans && cross.status !== "closed" && <span className="slot-conflict-icon">⚠</span>}
                                {!cross && cross2 && isLoans && <span className="slot-conflict-icon">⚠</span>}
                              </div>
                              <div className="conflict-avail-hint">
                                <div className="slot-avail-text">available</div>
                                {cross && isLoans && <div className="slot-avail-text">{cross.status === "closed" ? "lab closed" : "secondary booking"}</div>}
                                {!cross && cross2 && isLoans && <div className="slot-avail-text">primary booking</div>}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="legend">
        <div className="legend-item"><div className="leg-dot" style={{ background: "var(--slot-avail)", border: "1px dashed var(--slot-avail-b)" }} />Available</div>
        <div className="legend-item"><div className="leg-pending" />Pending</div>
        <div className="legend-item"><div className="leg-dot" style={{ background: accentColor + "55", border: `1px solid ${accentColor}` }} />Confirmed</div>
        <div className="legend-item"><div className="leg-closed" />Closed</div>
        <div className="legend-item"><span style={{ fontSize: "0.85rem" }}>↻</span> Recurring</div>
        <div className="legend-item"><span style={{ fontSize: "0.85rem" }}>↔</span> Double period</div>
        <div className="legend-item"><span style={{ fontSize: "0.85rem", color: "#f97316" }}>⚠</span>{isLoans ? " Lab booked" : " Loan booked"}</div>
        <div style={{ marginLeft: "auto", color: "#334155", fontSize: "0.7rem", fontFamily: "DM Mono, monospace" }}>
          Click any slot to book or view details
        </div>
      </div>

      {modal && (
        <SlotModal
          accentColor={accentColor}
          day={modal.day}
          period={modal.period}
          booking={getBooking(modal.day, modal.period.id)}
          conflictBooking={getCrossBooking(modal.day, modal.period.id)}
          conflictBooking2={getCross2Booking(modal.day, modal.period.id)}
          conflictBooking2Name={cross2Name}
          onAdminMove={handleAdminMove}
          onCheckRecurConflicts={handleCheckRecurConflicts}
          allBookings={bookings}
          monday={monday}
          allCrossTabBookings={crossTabBookings}
          crossTabPeriodMapForMove={periodMap}
          allCross2Bookings={cross2Bookings}
          cross2PeriodMapForMove={cross2BookingsPeriodMap}
          onSave={handleSave}
          onAdminSave={handleAdminDirectSave}
          onClosure={handleClosure}
          onClose={() => setModal(null)}
          onDelete={handleDelete}
          onAdminApprove={handleAdminApprove}
          onAdminReject={handleAdminReject}
          isLoans={isLoans}
          isPrimary={isPrimary}
          isAdmin={isAdmin}
          weekBookings={bookings[wk] || {}}
          periods={periods}
        />
      )}
    </>
  );
}

// ─── Approval Result Screen (shown when opening approve/reject URL) ───────────

function ApprovalScreen({ action, token, pendingKey, accentColor }) {
  const [state, setState] = useState("loading"); // loading | success | error
  const [message, setMessage] = useState("");

  useEffect(() => {
    // Approval via email link requires admin password — show a small prompt
    setState("needs-password");
  }, []);

  const [pw, setPw] = useState("");
  const [working, setWorking] = useState(false);

  const confirm = async () => {
    setWorking(true);
    const res = await callFunction({ action, token, pendingKey, adminPassword: pw });
    if (res.ok) {
      setState("success");
      setMessage(action === "approve" ? "Booking approved successfully!" : "Booking has been rejected and the slot released.");
    } else {
      setState("error");
      setMessage(res.error || "Something went wrong.");
    }
    setWorking(false);
  };

  if (state === "needs-password") {
    return (
      <div className="approval-screen">
        <div className="approval-card">
          <div className="approval-icon">{action === "approve" ? "✅" : "❌"}</div>
          <div className="approval-title">{action === "approve" ? "Approve Booking" : "Reject Booking"}</div>
          <div className="approval-sub">Enter the admin password to confirm this action.</div>
          <div className="field-group" style={{ width: "100%", textAlign: "left" }}>
            <label className="field-label">Admin Password</label>
            <input className="field-input" type="password" value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirm()}
              placeholder="••••••••" autoFocus />
          </div>
          {state === "error" && <div style={{ color: "#e74c3c", fontSize: "0.8rem" }}>{message}</div>}
          <button className="approval-go-btn"
            style={{ background: action === "approve" ? "#10b981" : "#ef4444" }}
            disabled={!pw || working} onClick={confirm}>
            {working ? "Processing…" : (action === "approve" ? "Confirm Approval" : "Confirm Rejection")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="approval-screen">
      <div className="approval-card">
        <div className="approval-icon">{state === "success" ? (action === "approve" ? "✅" : "🗑️") : "⚠️"}</div>
        <div className="approval-title">{state === "success" ? "Done" : "Error"}</div>
        <div className="approval-sub">{message}</div>
        <button className="approval-go-btn" style={{ background: accentColor }}
          onClick={() => window.location.href = "/"}>
          Go to booking system
        </button>
      </div>
    </div>
  );
}

// ─── Week Overview ────────────────────────────────────────────────────────────

function parsePeriodRange(timeStr) {
  const parts = timeStr.split("–").map((s) => s.trim());
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  return { start: toMin(parts[0]), end: toMin(parts[1]) };
}

const OVERVIEW_START_MIN = 450; // 07:30
const OVERVIEW_END_MIN   = 990; // 16:30
const OVERVIEW_RANGE     = 540; // minutes

function WeekOverview({ monday, inLabBookings, primaryBookings }) {
  const wk = weekKey(monday);
  const secSlots = inLabBookings[wk] || {};
  const priSlots = primaryBookings[wk] || {};

  const [popup, setPopup] = useState(null);

  const toTopPct    = (min) => ((min - OVERVIEW_START_MIN) / OVERVIEW_RANGE) * 100;
  const toHeightPct = (s, e) => ((e - s) / OVERVIEW_RANGE) * 100;

  // Time labels every 30 min
  const timeLabels = [];
  for (let m = OVERVIEW_START_MIN; m <= OVERVIEW_END_MIN; m += 30) timeLabels.push(m);

  // Build blocks for a given day from both booking sources
  const buildBlocks = (day) => {
    const blocks = [];

    // Secondary bookings
    for (const period of PERIODS) {
      if (period.type !== "lesson") continue;
      const key = slotKey(day, period.id);
      const bk = secSlots[key];
      if (!bk || bk.status === "closed") continue;
      if (bk.isDoubleSecond) continue; // covered by the first slot's block

      const { start } = parsePeriodRange(period.time);
      let end = parsePeriodRange(period.time).end;
      if (bk.doubleId && !bk.isDoubleSecond) {
        for (const p2 of PERIODS) {
          const partner = secSlots[slotKey(day, p2.id)];
          if (partner?.doubleId === bk.doubleId && partner?.isDoubleSecond) {
            end = parsePeriodRange(p2.time).end;
            break;
          }
        }
      }
      blocks.push({ bk, start, end, source: "secondary", color: "#3b82f6", period });
    }

    // Primary bookings
    for (const period of PRIMARY_PERIODS) {
      if (period.type !== "lesson") continue;
      if (PRIMARY_UNAVAILABLE.has(period.id)) continue;
      const key = slotKey(day, period.id);
      const bk = priSlots[key];
      if (!bk || bk.status === "closed") continue;
      if (bk.isDoubleSecond) continue;

      const { start } = parsePeriodRange(period.time);
      let end = parsePeriodRange(period.time).end;
      if (bk.doubleId && !bk.isDoubleSecond) {
        for (const p2 of PRIMARY_PERIODS) {
          const partner = priSlots[slotKey(day, p2.id)];
          if (partner?.doubleId === bk.doubleId && partner?.isDoubleSecond) {
            end = parsePeriodRange(p2.time).end;
            break;
          }
        }
      }
      blocks.push({ bk, start, end, source: "primary", color: "#ec4899", period });
    }

    return blocks;
  };

  return (
    <div className="overview-wrap">
      {/* Day header row */}
      <div className="overview-header">
        <div className="overview-axis-spacer" />
        {DAYS.map((d) => <div key={d} className="overview-day-header">{d}</div>)}
      </div>

      {/* Main time grid */}
      <div className="overview-main">
        {/* Time axis */}
        <div className="overview-axis">
          {timeLabels.map((min) => (
            <div key={min} className="overview-time-label" style={{ top: `${toTopPct(min)}%` }}>
              {String(Math.floor(min / 60)).padStart(2, "0")}:{String(min % 60).padStart(2, "0")}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {DAYS.map((day) => {
          const blocks = buildBlocks(day);
          return (
            <div key={day} className="overview-day-col">
              {/* Horizontal gridlines */}
              {timeLabels.map((min) => (
                <div key={min} className={`overview-gridline${min % 60 === 0 ? " hour" : ""}`}
                  style={{ top: `${toTopPct(min)}%` }} />
              ))}
              {/* Booking blocks */}
              {blocks.map((block, i) => {
                const heightPct = toHeightPct(block.start, block.end);
                const tinyBlock = heightPct < 5; // < ~27px — hide detail text
                return (
                  <div key={i}
                    className={`overview-block${block.bk.status === "pending" ? " pending" : ""}`}
                    style={{
                      top:    `${toTopPct(block.start)}%`,
                      height: `${Math.max(heightPct, 2)}%`,
                      background: block.color + "22",
                      borderColor: block.color + "88",
                      borderLeftColor: block.color,
                      borderLeftWidth: "3px",
                    }}
                    onClick={() => setPopup({ ...block, day })}
                  >
                    {!tinyBlock && <>
                      <div className="overview-block-teacher">{block.bk.teacher}</div>
                      <div className="overview-block-class">{block.bk.class}</div>
                      <div className="overview-block-source" style={{ color: block.color }}>
                        {block.source}
                        {block.bk.status === "pending" ? " · pending" : ""}
                      </div>
                    </>}
                    {tinyBlock && (
                      <div className="overview-block-teacher" style={{ fontSize: "0.58rem" }}>{block.bk.teacher}</div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="overview-legend">
        <div className="overview-legend-item">
          <div className="overview-legend-dot" style={{ background: "#3b82f6" }} />
          Secondary Lab Booking
        </div>
        <div className="overview-legend-item">
          <div className="overview-legend-dot" style={{ background: "#ec4899" }} />
          Primary Lab Booking
        </div>
        <div className="overview-legend-item" style={{ marginLeft: "auto", fontFamily: "DM Mono, monospace", fontSize: "0.7rem" }}>
          Click any block to view details
        </div>
      </div>

      {/* Read-only detail popup */}
      {popup && (
        <div className="modal-overlay" onClick={() => setPopup(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">
                  {popup.day} — {popup.period.label}
                </div>
                <div className="modal-sub" style={{ color: popup.color }}>
                  {popup.source === "primary" ? "Primary Lab Booking" : "Secondary Lab Booking"}
                  {" · "}{popup.period.time}
                </div>
              </div>
              <button className="modal-close" onClick={() => setPopup(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="pending-info-box">
                {popup.bk.status === "pending" && (
                  <div className="pending-status-badge">⏳ Pending approval</div>
                )}
                {[
                  ["Teacher",   popup.bk.teacher],
                  ["Class",     popup.bk.class],
                  ["Subject",   popup.bk.subject],
                  ["Period",    popup.bk.periodLabel ? `${popup.bk.periodLabel} (${popup.bk.periodTime || ""})` : null],
                  ["Activity",  popup.bk.activityOverview],
                  ["Equipment", popup.bk.requiredEquipment],
                  ["Students",  popup.bk.numStudents
                    ? `${popup.bk.numStudents}${popup.bk.numGroups ? ` (${popup.bk.numGroups} groups)` : ""}`
                    : null],
                  ["Recurring", popup.bk.recurring ? `Yes — ${popup.bk.recurWeeks} weeks` : null],
                  ["Colour",    popup.bk.color ? null : null], // omit colour row
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} className="pending-info-row">
                    <span className="pending-info-label">{label}</span>
                    <span className="pending-info-value">{value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setPopup(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Lab View ─────────────────────────────────────────────────────────────────

function LabView({ lab, onBack, isAdmin, onAdminLogin, onAdminLogout, theme, onToggleTheme }) {
  const labInfo = LABS[lab];
  const [monday, setMonday]       = useState(() => getMondayOfWeek(new Date()));
  const [inLabBookings, setInLab]       = useState({});
  const [loansBookings, setLoans]       = useState({});
  const [primaryBookings, setPrimary]   = useState({});
  const [tab, setTab]                   = useState("inlab");
  const [loading, setLoading]     = useState(true);
  const [saveState, setSaveState] = useState("idle");
  const [toast, setToast]         = useState("");
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [showChangePw, setShowChangePw]     = useState(false);
  const wk = weekKey(monday);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  useEffect(() => {
    setLoading(true);
    const fetches = [
      dbLoad(inLabKey(lab, wk)).then((d) => setInLab((p) => ({ ...p, [wk]: d }))),
      dbLoad(loansKey(lab, wk)).then((d) => setLoans((p) => ({ ...p, [wk]: d }))),
      dbLoad(primaryKey(lab, wk)).then((d) => setPrimary((p) => ({ ...p, [wk]: d }))),
    ];
    Promise.all(fetches).then(() => setLoading(false));
  }, [lab, wk]);

  const prevWeek = () => setMonday((m) => addWeeks(m, -1));
  const nextWeek = () => setMonday((m) => addWeeks(m, 1));

  const fmtDate = (d) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  const fri = new Date(monday); fri.setDate(fri.getDate() + 4);
  const weekLabel = `${fmtDate(monday)} – ${fmtDate(fri)}`;
  const isCurrentWeek = weekKey(getMondayOfWeek(new Date())) === wk;

  const conflictCount = (() => {
    const il = inLabBookings[wk] || {};
    const lo = loansBookings[wk] || {};
    return Object.keys(il).filter((k) => lo[k] && il[k].status !== "pending" && lo[k].status !== "pending").length;
  })();

  const pendingInLab  = Object.values(inLabBookings[wk]   || {}).filter((b) => b.status === "pending").length;
  const pendingLoans  = Object.values(loansBookings[wk]   || {}).filter((b) => b.status === "pending").length;
  const pendingPrimary = Object.values(primaryBookings[wk] || {}).filter((b) => b.status === "pending").length;
  const totalPending  = pendingInLab + pendingLoans + pendingPrimary;

  return (
    <div className="app" style={{ "--accent": labInfo.color }}>
      <div className="header">
        <button className="back-btn" onClick={onBack}>← Labs</button>
        <div className="header-title">
          <span className="header-accent" style={{ background: labInfo.color }} />
          {labInfo.name}
        </div>
        {isCurrentWeek && (
          <span style={{ fontSize: "0.7rem", background: labInfo.color + "22", color: labInfo.color, padding: "3px 10px", borderRadius: "20px", fontFamily: "DM Mono, monospace", border: `1px solid ${labInfo.color}44` }}>
            Current Week
          </span>
        )}
        <SavingIndicator state={saveState} />
        <button className="theme-toggle" onClick={onToggleTheme} title="Toggle light/dark mode">
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
        {isAdmin ? (
          <div className="admin-badge">
            🔑 Admin
            <button className="admin-logout" onClick={() => setShowChangePw((v) => !v)} title="Change password">⚙</button>
            <button className="admin-logout" onClick={onAdminLogout} title="Log out">✕</button>
          </div>
        ) : (
          <button className="back-btn" style={{ marginLeft: 0 }} onClick={() => setShowAdminLogin(true)}>🔑 Admin</button>
        )}
        <div className="week-nav">
          <button onClick={prevWeek}>‹</button>
          <div className="week-label">{weekLabel}</div>
          <button onClick={nextWeek}>›</button>
        </div>
      </div>

      {isAdmin && showChangePw && (
        <div style={{ padding: "16px 24px", background: "#0d111c", borderBottom: "1px solid #1e2d4a" }}>
          <ChangePasswordPanel adminPassword="" onToast={(msg) => { showToast(msg); setShowChangePw(false); }} />
        </div>
      )}

      <div className="tabs">
        <button className={`tab-btn${tab === "inlab" ? " active" : ""}`} onClick={() => setTab("inlab")}
          style={tab === "inlab" ? { color: "#3b82f6", background: "rgba(59,130,246,0.08)" } : {}}>
          Secondary Lab Booking
          {isAdmin && pendingInLab > 0 && <span className="tab-pending-badge">⏳ {pendingInLab}</span>}
          {conflictCount > 0 && tab !== "inlab" && <span className="tab-conflict-badge">⚠ {conflictCount}</span>}
        </button>
        <button className={`tab-btn${tab === "primary" ? " active" : ""}`} onClick={() => setTab("primary")}
          style={tab === "primary" ? { color: "#ec4899", background: "rgba(236,72,153,0.08)" } : {}}>
          Primary Lab Booking
          {isAdmin && pendingPrimary > 0 && <span className="tab-pending-badge">⏳ {pendingPrimary}</span>}
        </button>
        <button className={`tab-btn${tab === "loans" ? " active" : ""}`} onClick={() => setTab("loans")}
          style={tab === "loans" ? { color: "#f97316", background: "rgba(249,115,22,0.08)" } : {}}>
          Equipment Loans
          {isAdmin && pendingLoans > 0 && <span className="tab-pending-badge">⏳ {pendingLoans}</span>}
          {conflictCount > 0 && tab !== "loans" && <span className="tab-conflict-badge">⚠ {conflictCount}</span>}
        </button>
        {isAdmin && (
          <button className={`tab-btn${tab === "overview" ? " active" : ""}`} onClick={() => setTab("overview")}
            style={tab === "overview" ? { color: "#94a3b8", background: "rgba(148,163,184,0.08)" } : {}}>
            Week Overview
          </button>
        )}
      </div>

      {loading ? (
        <div className="loading-screen"><div className="loading-spinner" />Loading schedule…</div>
      ) : tab === "inlab" ? (
        <TimetableGrid
          accentColor={labInfo.color} bookings={inLabBookings} setBookings={setInLab}
          crossBookings={loansBookings}
          crossTabBookings={primaryBookings} periodMap={SECONDARY_TO_PRIMARY} crossTabName="PRIMARY"
          monday={monday} dbKeyFn={inLabKey} lab={lab} isLoans={false}
          onSaveState={setSaveState} isAdmin={isAdmin} onToast={showToast}
        />
      ) : tab === "primary" ? (
        <TimetableGrid
          accentColor={labInfo.color} bookings={primaryBookings} setBookings={setPrimary}
          crossBookings={loansBookings} crossBookingsPeriodMap={PRIMARY_TO_SECONDARY}
          crossTabBookings={inLabBookings} periodMap={PRIMARY_TO_SECONDARY} crossTabName="SECONDARY"
          monday={monday} dbKeyFn={primaryKey} lab={lab} isLoans={false} isPrimary={true}
          onSaveState={setSaveState} isAdmin={isAdmin} onToast={showToast}
          periods={PRIMARY_PERIODS}
        />
      ) : tab === "overview" ? (
        <WeekOverview monday={monday} inLabBookings={inLabBookings} primaryBookings={primaryBookings} />
      ) : (
        <TimetableGrid
          accentColor={labInfo.color} bookings={loansBookings} setBookings={setLoans}
          crossBookings={inLabBookings}
          cross2Bookings={primaryBookings} cross2BookingsPeriodMap={SECONDARY_TO_PRIMARY} cross2Name="PRIMARY"
          monday={monday} dbKeyFn={loansKey} lab={lab} isLoans={true}
          onSaveState={setSaveState} isAdmin={isAdmin} onToast={showToast}
        />
      )}

      {showAdminLogin && (
        <AdminLoginModal
          onLogin={(pw) => { onAdminLogin(pw); setShowAdminLogin(false); showToast("Logged in as admin"); }}
          onClose={() => setShowAdminLogin(false)}
        />
      )}

      <Toast message={toast} />
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [activeLab, setActiveLab]   = useState(null);
  const [isAdmin, setIsAdmin]       = useState(false);
  const [adminPassword, setAdminPw] = useState("");
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const { theme, toggle } = useTheme();

  // Check for approval/reject URL params on load
  const params = new URLSearchParams(window.location.search);
  const approveToken = params.get("approve");
  const rejectToken  = params.get("reject");
  const pendingKey   = params.get("key");

  if (approveToken && pendingKey) {
    return (
      <>
        <style>{css}</style>
        <div className="app" style={{ "--accent": "#10b981" }}>
          <ApprovalScreen action="approve" token={approveToken} pendingKey={pendingKey} accentColor="#10b981" />
        </div>
      </>
    );
  }

  if (rejectToken && pendingKey) {
    return (
      <>
        <style>{css}</style>
        <div className="app" style={{ "--accent": "#ef4444" }}>
          <ApprovalScreen action="reject" token={rejectToken} pendingKey={pendingKey} accentColor="#ef4444" />
        </div>
      </>
    );
  }

  if (activeLab) {
    return (
      <>
        <style>{css}</style>
        <LabView
          lab={activeLab}
          onBack={() => setActiveLab(null)}
          isAdmin={isAdmin}
          onAdminLogin={(pw) => { setIsAdmin(true); setAdminPw(pw); }}
          onAdminLogout={() => { setIsAdmin(false); setAdminPw(""); }}
          theme={theme}
          onToggleTheme={toggle}
        />
      </>
    );
  }

  return (
    <>
      <style>{css}</style>
      <div className="app">
        <div className="home">
          <div className="home-title">
            <h1>SALA Lab Booking</h1>
            <p>VAS Secondary · Select a lab to view schedule</p>
          </div>
          <div className="lab-cards">
            {Object.values(LABS).map((lab) => (
              <div key={lab.id} className="lab-card"
                style={{ borderColor: lab.color + "44" }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = lab.color}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = lab.color + "44"}
                onClick={() => setActiveLab(lab.id)}>
                <div className="icon">{lab.icon}</div>
                <div className="name">{lab.name}</div>
                <div className="sub">{lab.id === "dt" ? "Design Thinking" : "Audio-Visual"}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button className="home-admin-btn" onClick={() => setShowAdminLogin(true)}>🔑 Admin Login</button>
            <button className="theme-toggle" onClick={toggle} title="Toggle light/dark mode">
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
          </div>
        </div>
        {showAdminLogin && (
          <AdminLoginModal
            onLogin={(pw) => { setIsAdmin(true); setAdminPw(pw); setShowAdminLogin(false); }}
            onClose={() => setShowAdminLogin(false)}
          />
        )}
      </div>
    </>
  );
}
