import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── Supabase ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function dbLoad(key) {
  const { data } = await supabase.from("bookings").select("data").eq("storage_key", key).single();
  return data?.data || {};
}

async function dbSave(key, data) {
  const { error } = await supabase.from("bookings")
    .upsert({ storage_key: key, data, updated_at: new Date().toISOString() }, { onConflict: "storage_key" });
  if (error) console.error("Save error:", error);
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

const LABS = {
  dt: { id: "dt", name: "DT Lab",  icon: "⚙️", color: "#e67e22", techEmail: "linh.thi.pham@vas.edu.vn",  techName: "Linh" },
  av: { id: "av", name: "AV Lab",  icon: "🎬", color: "#2980b9", techEmail: "vu.long.nguyen@vas.edu.vn", techName: "Vu Long" },
};

const SLOT_COLORS = [
  { id: "c0",  hex: "#3b82f6", label: "Blue"    },
  { id: "c1",  hex: "#10b981", label: "Green"   },
  { id: "c2",  hex: "#f59e0b", label: "Amber"   },
  { id: "c3",  hex: "#ef4444", label: "Red"     },
  { id: "c4",  hex: "#8b5cf6", label: "Purple"  },
  { id: "c5",  hex: "#ec4899", label: "Pink"    },
  { id: "c6",  hex: "#14b8a6", label: "Teal"    },
  { id: "c7",  hex: "#f97316", label: "Orange"  },
  { id: "c8",  hex: "#a3e635", label: "Lime"    },
  { id: "c9",  hex: "#94a3b8", label: "Slate"   },
  { id: "c10", hex: "#e879f9", label: "Fuchsia" },
  { id: "c11", hex: "#fb7185", label: "Rose"    },
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
function weekKey(monday) { return monday.toISOString().slice(0, 10); }
function slotKey(day, periodId) { return `${day}_${periodId}`; }
const inLabKey = (lab, wk) => `bookings_${lab}_${wk}`;
const loansKey = (lab, wk) => `loans_${lab}_${wk}`;

// ─── CSS ──────────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'DM Sans', sans-serif; background: #0f1117; color: #e2e8f0; min-height: 100vh; }
  .app { min-height: 100vh; display: flex; flex-direction: column; }

  /* Home */
  .home { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 48px; padding: 48px 24px; background: radial-gradient(ellipse at 30% 20%, #1a2040 0%, #0f1117 60%); }
  .home-title { text-align: center; }
  .home-title h1 { font-family: 'DM Mono', monospace; font-size: clamp(1.6rem, 4vw, 2.8rem); font-weight: 500; letter-spacing: -0.02em; color: #f0f4ff; }
  .home-title p { font-size: 0.95rem; color: #64748b; margin-top: 8px; font-weight: 300; letter-spacing: 0.05em; text-transform: uppercase; }
  .lab-cards { display: flex; gap: 24px; flex-wrap: wrap; justify-content: center; }
  .lab-card { background: #161b2e; border: 1px solid #1e2d4a; border-radius: 16px; padding: 40px 48px; display: flex; flex-direction: column; align-items: center; gap: 16px; cursor: pointer; transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s; min-width: 200px; }
  .lab-card:hover { transform: translateY(-4px); box-shadow: 0 20px 60px rgba(0,0,0,0.4); }
  .lab-card .icon { font-size: 3rem; }
  .lab-card .name { font-family: 'DM Mono', monospace; font-size: 1.1rem; font-weight: 500; color: #f0f4ff; }
  .lab-card .sub { font-size: 0.8rem; color: #475569; text-transform: uppercase; letter-spacing: 0.08em; }
  .home-admin-btn { background: none; border: 1px solid #2d3748; color: #475569; padding: 8px 18px; border-radius: 8px; cursor: pointer; font-family: 'DM Mono', monospace; font-size: 0.78rem; transition: all 0.15s; }
  .home-admin-btn:hover { border-color: #64748b; color: #94a3b8; }

  /* Header */
  .header { display: flex; align-items: center; gap: 16px; padding: 16px 24px; background: #0d111c; border-bottom: 1px solid #1e2d4a; flex-wrap: wrap; }
  .back-btn { background: none; border: 1px solid #2d3748; color: #94a3b8; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-family: 'DM Mono', monospace; font-size: 0.8rem; transition: all 0.15s; }
  .back-btn:hover { border-color: #64748b; color: #e2e8f0; }
  .header-title { font-family: 'DM Mono', monospace; font-size: 1.1rem; color: #f0f4ff; font-weight: 500; }
  .header-accent { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; }
  .admin-badge { display: flex; align-items: center; gap: 6px; background: #1e2d4a; border: 1px solid #2d4a6a; border-radius: 20px; padding: 4px 12px; font-family: 'DM Mono', monospace; font-size: 0.72rem; color: #7dd3fc; }
  .admin-logout { background: none; border: none; color: #475569; font-size: 0.75rem; cursor: pointer; margin-left: 4px; padding: 0; transition: color 0.15s; }
  .admin-logout:hover { color: #e74c3c; }
  .week-nav { margin-left: auto; display: flex; align-items: center; gap: 12px; }
  .week-nav button { background: #161b2e; border: 1px solid #2d3748; color: #94a3b8; width: 32px; height: 32px; border-radius: 6px; cursor: pointer; font-size: 1rem; transition: all 0.15s; }
  .week-nav button:hover { border-color: #64748b; color: #e2e8f0; }
  .week-label { font-family: 'DM Mono', monospace; font-size: 0.8rem; color: #64748b; min-width: 160px; text-align: center; }

  /* Tabs */
  .tabs { display: flex; padding: 0 24px; background: #0d111c; border-bottom: 1px solid #1e2d4a; }
  .tab-btn { background: none; border: none; border-bottom: 2px solid transparent; color: #64748b; padding: 12px 20px; cursor: pointer; font-family: 'DM Sans', sans-serif; font-size: 0.85rem; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; transition: all 0.15s; display: flex; align-items: center; gap: 7px; }
  .tab-btn:hover { color: #94a3b8; }
  .tab-btn.active { color: #f0f4ff; border-bottom-color: var(--accent); }
  .tab-conflict-badge { background: #7c2d12; color: #fca98d; font-size: 0.65rem; font-family: 'DM Mono', monospace; padding: 2px 6px; border-radius: 10px; line-height: 1.4; }
  .tab-pending-badge { background: #1e3a1e; color: #86efac; font-size: 0.65rem; font-family: 'DM Mono', monospace; padding: 2px 6px; border-radius: 10px; line-height: 1.4; }

  /* Grid */
  .grid-wrap { flex: 1; overflow: auto; padding: 24px; }
  .timetable { min-width: 700px; border-collapse: collapse; width: 100%; }
  .timetable th { font-family: 'DM Mono', monospace; font-size: 0.75rem; font-weight: 500; color: #475569; padding: 8px 12px; text-align: left; border-bottom: 1px solid #1e2d4a; white-space: nowrap; }
  .timetable th.day-header { text-align: center; color: #94a3b8; }
  .period-label { padding: 10px 14px; vertical-align: top; white-space: nowrap; }
  .period-label .pl-name { font-family: 'DM Mono', monospace; font-size: 0.78rem; font-weight: 500; color: #64748b; }
  .period-label .pl-time { font-family: 'DM Mono', monospace; font-size: 0.68rem; color: #334155; margin-top: 2px; }

  /* Slots */
  .slot-cell { padding: 5px; vertical-align: top; min-width: 120px; }
  .slot { height: 58px; border-radius: 8px; display: flex; flex-direction: column; justify-content: center; padding: 6px 10px; cursor: pointer; transition: all 0.15s; position: relative; overflow: hidden; }
  .slot.available { background: #12191f; border: 1px dashed #1e3a4a; }
  .slot.available:hover { background: #1a2736; border-color: #2d4f68; }
  .slot.booked { border-width: 1px; border-style: solid; }
  .slot.booked:hover { filter: brightness(1.2); }
  .slot.pending { background: #1a1f14; border: 1px dashed #3d5c1e; cursor: default; }
  .slot.pending:hover { background: #1e2418; }
  .slot-avail-text { font-family: 'DM Mono', monospace; font-size: 0.65rem; color: #1e3a4a; text-align: center; }
  .slot-teacher { font-size: 0.75rem; font-weight: 600; color: #f0f4ff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .slot-class { font-family: 'DM Mono', monospace; font-size: 0.68rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .slot-subject { font-size: 0.65rem; color: rgba(255,255,255,0.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .slot-badges { position: absolute; top: 4px; right: 5px; display: flex; align-items: center; gap: 3px; }
  .slot-recur { font-size: 0.6rem; opacity: 0.6; line-height: 1; }
  .slot-conflict { position: absolute; bottom: 0; left: 0; right: 0; height: 3px; background: #f97316; }
  .slot-conflict-icon { font-size: 0.62rem; line-height: 1; color: #f97316; }
  .pending-label { font-family: 'DM Mono', monospace; font-size: 0.6rem; color: #86efac; text-align: center; letter-spacing: 0.05em; }
  .pending-teacher { font-size: 0.7rem; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .conflict-avail-hint { display: flex; align-items: center; justify-content: center; gap: 5px; flex-direction: column; }
  .conflict-pill { display: inline-flex; align-items: center; gap: 4px; background: rgba(249,115,22,0.15); border: 1px solid rgba(249,115,22,0.35); border-radius: 4px; padding: 1px 6px; font-size: 0.6rem; color: #f97316; font-family: 'DM Mono', monospace; white-space: nowrap; margin-top: 2px; }

  /* Break slots */
  .break-row td { background: transparent; }
  .break-row .period-label .pl-name { color: #334155; }
  .break-slot { height: 36px; border-radius: 6px; background: #12191f; border: 1px dashed #1a2532; display: flex; align-items: center; padding: 0 10px; cursor: pointer; transition: all 0.15s; position: relative; overflow: hidden; gap: 6px; }
  .break-slot:hover { background: #1a2736; border-color: #2d4f68; }
  .break-slot.booked { border-style: solid; }
  .break-slot.pending { border-color: #3d5c1e; cursor: default; }
  .break-slot-icons { margin-left: auto; display: flex; align-items: center; gap: 4px; }
  .break-recur { font-size: 0.6rem; opacity: 0.6; }

  /* Legend */
  .legend { display: flex; gap: 20px; padding: 12px 24px; border-top: 1px solid #1e2d4a; background: #0d111c; flex-wrap: wrap; align-items: center; }
  .legend-item { display: flex; align-items: center; gap: 8px; font-size: 0.75rem; color: #475569; }
  .leg-dot { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
  .leg-conflict { width: 10px; height: 3px; border-radius: 2px; background: #f97316; flex-shrink: 0; }
  .leg-pending { width: 10px; height: 10px; border-radius: 3px; background: #1a1f14; border: 1px dashed #3d5c1e; flex-shrink: 0; }

  /* Saving */
  .saving-indicator { font-family: 'DM Mono', monospace; font-size: 0.72rem; color: #64748b; display: flex; align-items: center; gap: 6px; }
  .saving-dot { width: 6px; height: 6px; border-radius: 50%; background: #64748b; animation: pulse 1s infinite; }
  .saving-dot.saved { background: #10b981; animation: none; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }

  /* Loading */
  .loading-screen { flex: 1; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 16px; color: #475569; font-family: 'DM Mono', monospace; font-size: 0.85rem; }
  .loading-spinner { width: 32px; height: 32px; border: 2px solid #1e2d4a; border-top-color: var(--accent, #3b82f6); border-radius: 50%; animation: spin 0.7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Modal */
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.75); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 24px; backdrop-filter: blur(4px); animation: fadeIn 0.15s ease; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  .modal { background: #161b2e; border: 1px solid #2d3748; border-radius: 16px; width: 100%; max-width: 540px; max-height: 90vh; overflow-y: auto; animation: slideUp 0.2s ease; }
  @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  .modal-header { padding: 20px 24px 16px; border-bottom: 1px solid #1e2d4a; display: flex; align-items: flex-start; justify-content: space-between; }
  .modal-title { font-family: 'DM Mono', monospace; font-size: 1rem; color: #f0f4ff; font-weight: 500; }
  .modal-sub { font-size: 0.78rem; color: #475569; margin-top: 4px; }
  .modal-close { background: none; border: none; color: #475569; font-size: 1.4rem; cursor: pointer; line-height: 1; padding: 0 4px; transition: color 0.15s; }
  .modal-close:hover { color: #e2e8f0; }
  .modal-body { padding: 24px; display: flex; flex-direction: column; gap: 18px; }
  .modal-footer { padding: 16px 24px; border-top: 1px solid #1e2d4a; display: flex; gap: 10px; justify-content: flex-end; align-items: center; flex-wrap: wrap; }

  /* Pending detail modal */
  .pending-info-box { background: #0f1117; border: 1px solid #3d5c1e; border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
  .pending-info-row { display: flex; gap: 12px; font-size: 0.85rem; }
  .pending-info-label { color: #64748b; font-family: 'DM Mono', monospace; font-size: 0.72rem; min-width: 100px; }
  .pending-info-value { color: #e2e8f0; }
  .pending-status-badge { display: inline-flex; align-items: center; gap: 6px; background: #1a2d1a; border: 1px solid #3d5c1e; border-radius: 20px; padding: 4px 12px; font-family: 'DM Mono', monospace; font-size: 0.72rem; color: #86efac; margin-bottom: 4px; }

  /* Admin approve/reject in modal */
  .admin-actions { display: flex; gap: 10px; margin-top: 4px; }
  .btn-approve { background: #10b981; color: #fff; border: none; padding: 9px 20px; border-radius: 8px; cursor: pointer; font-size: 0.85rem; font-weight: 500; transition: filter 0.15s; }
  .btn-approve:hover { filter: brightness(1.15); }
  .btn-reject-action { background: none; border: 1px solid #3d1f1f; color: #e74c3c; padding: 9px 20px; border-radius: 8px; cursor: pointer; font-size: 0.85rem; transition: all 0.15s; }
  .btn-reject-action:hover { background: #3d1f1f; }

  /* Conflict warning */
  .conflict-warning { background: rgba(249,115,22,0.1); border: 1px solid rgba(249,115,22,0.3); border-radius: 8px; padding: 10px 14px; font-size: 0.8rem; color: #fdba74; line-height: 1.5; display: flex; gap: 10px; align-items: flex-start; }
  .conflict-warning-icon { font-size: 1rem; flex-shrink: 0; margin-top: 1px; }

  /* Fields */
  .field-group { display: flex; flex-direction: column; gap: 6px; }
  .field-label { font-family: 'DM Mono', monospace; font-size: 0.72rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; }
  .field-label .required { color: var(--accent); margin-left: 4px; }
  .field-input, .field-textarea { background: #0f1117; border: 1px solid #2d3748; color: #f0f4ff; border-radius: 8px; padding: 10px 14px; font-family: 'DM Sans', sans-serif; font-size: 0.9rem; width: 100%; transition: border-color 0.15s; outline: none; }
  .field-input:focus, .field-textarea:focus { border-color: var(--accent); }
  .field-textarea { resize: vertical; min-height: 72px; }
  .row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .divider { font-family: 'DM Mono', monospace; font-size: 0.7rem; color: #334155; text-transform: uppercase; letter-spacing: 0.1em; display: flex; align-items: center; gap: 12px; }
  .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: #1e2d4a; }

  /* Colour picker */
  .color-grid { display: flex; flex-wrap: wrap; gap: 8px; }
  .color-swatch { width: 28px; height: 28px; border-radius: 6px; cursor: pointer; border: 2px solid transparent; transition: transform 0.12s, border-color 0.12s, box-shadow 0.12s; flex-shrink: 0; }
  .color-swatch:hover { transform: scale(1.18); }
  .color-swatch.selected { border-color: #fff; transform: scale(1.18); box-shadow: 0 0 0 3px rgba(255,255,255,0.15); }

  /* Recurring */
  .recur-section { background: #0f1117; border: 1px solid #2d3748; border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
  .recur-toggle { display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; }
  .toggle-track { width: 38px; height: 20px; border-radius: 10px; background: #2d3748; position: relative; transition: background 0.2s; flex-shrink: 0; }
  .toggle-track.on { background: var(--accent); }
  .toggle-thumb { position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: left 0.2s; }
  .toggle-track.on .toggle-thumb { left: 21px; }
  .recur-label { font-size: 0.88rem; color: #94a3b8; }
  .recur-options { display: flex; flex-direction: column; gap: 8px; }
  .recur-row { display: flex; align-items: center; gap: 10px; }
  .recur-hint { font-size: 0.75rem; color: #475569; font-family: 'DM Mono', monospace; }
  .recur-weeks-input { background: #161b2e; border: 1px solid #2d3748; color: #f0f4ff; border-radius: 6px; padding: 6px 10px; width: 68px; font-size: 0.88rem; outline: none; transition: border-color 0.15s; font-family: 'DM Sans', sans-serif; text-align: center; }
  .recur-weeks-input:focus { border-color: var(--accent); }

  /* Buttons */
  .btn-cancel { background: none; border: 1px solid #2d3748; color: #94a3b8; padding: 9px 20px; border-radius: 8px; cursor: pointer; font-size: 0.85rem; transition: all 0.15s; }
  .btn-cancel:hover { border-color: #64748b; color: #e2e8f0; }
  .btn-delete { background: none; border: 1px solid #3d1f1f; color: #e74c3c; padding: 9px 20px; border-radius: 8px; cursor: pointer; font-size: 0.85rem; transition: all 0.15s; margin-right: auto; }
  .btn-delete:hover { background: #3d1f1f; }
  .btn-save { color: #fff; border: none; padding: 9px 24px; border-radius: 8px; cursor: pointer; font-size: 0.85rem; font-weight: 500; transition: filter 0.15s; font-family: 'DM Sans', sans-serif; }
  .btn-save:hover:not(:disabled) { filter: brightness(1.15); }
  .btn-save:disabled { opacity: 0.35; cursor: not-allowed; }
  .recur-del-wrap { margin-right: auto; display: flex; flex-direction: column; gap: 6px; width: 100%; }
  .recur-del-title { font-size: 0.78rem; color: #64748b; font-family: 'DM Mono', monospace; margin-bottom: 2px; }
  .recur-del-opts { display: flex; gap: 8px; flex-wrap: wrap; }
  .recur-del-opt { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 8px; border: 1px solid #2d3748; cursor: pointer; transition: all 0.15s; font-size: 0.82rem; color: #94a3b8; white-space: nowrap; }
  .recur-del-opt:hover { border-color: #e74c3c; color: #f0f4ff; background: #200f0f; }

  /* Admin login modal */
  .admin-login-modal { background: #161b2e; border: 1px solid #2d3748; border-radius: 16px; width: 100%; max-width: 380px; padding: 32px; animation: slideUp 0.2s ease; }
  .admin-login-title { font-family: 'DM Mono', monospace; font-size: 1rem; color: #f0f4ff; font-weight: 500; margin-bottom: 6px; }
  .admin-login-sub { font-size: 0.8rem; color: #475569; margin-bottom: 24px; }
  .admin-error { font-size: 0.8rem; color: #e74c3c; margin-top: 8px; font-family: 'DM Mono', monospace; }

  /* Change password */
  .change-pw-section { background: #0f1117; border: 1px solid #2d3748; border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .change-pw-title { font-family: 'DM Mono', monospace; font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; }

  /* Approval result screen */
  .approval-screen { flex: 1; display: flex; align-items: center; justify-content: center; padding: 48px 24px; }
  .approval-card { background: #161b2e; border: 1px solid #2d3748; border-radius: 16px; padding: 40px; max-width: 460px; width: 100%; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 16px; }
  .approval-icon { font-size: 3rem; }
  .approval-title { font-family: 'DM Mono', monospace; font-size: 1.1rem; color: #f0f4ff; }
  .approval-sub { font-size: 0.85rem; color: #64748b; line-height: 1.6; }
  .approval-go-btn { background: var(--accent); color: #fff; border: none; padding: 10px 24px; border-radius: 8px; cursor: pointer; font-size: 0.9rem; font-weight: 500; margin-top: 8px; transition: filter 0.15s; }
  .approval-go-btn:hover { filter: brightness(1.15); }

  /* Toast */
  .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: #1e2d4a; border: 1px solid #2d4a6a; color: #e2e8f0; padding: 12px 20px; border-radius: 10px; font-size: 0.85rem; z-index: 2000; animation: fadeIn 0.2s ease; white-space: nowrap; }
`;

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

function SlotModal({ accentColor, day, period, booking, conflictBooking, onSave, onClose, onDelete, onAdminApprove, onAdminReject, isLoans, isAdmin }) {
  const isNew       = !booking?.teacher;
  const isPending   = booking?.status === "pending";
  const isConfirmed = booking?.status === "confirmed";
  const isRecurring = !!booking?.recurId;

  const [form, setForm] = useState({
    teacher: "", class: "", subject: "",
    activityOverview: "", requiredEquipment: "",
    numStudents: "", numGroups: "",
    color: DEFAULT_COLOR, recurring: false, recurWeeks: 8,
    ...booking,
  });
  const [delMode, setDelMode] = useState(false);

  const upd = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const canSave = form.teacher.trim() && form.class.trim() && form.subject.trim();

  // Pending view (non-admin just sees info)
  if (isPending && !isAdmin) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" style={{ "--accent": accentColor }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div>
              <div className="modal-title">Pending Booking</div>
              <div className="modal-sub">{day} · {period.label} · {period.time}</div>
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
              <div className="modal-sub">{day} · {period.label} · {period.time}</div>
            </div>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
          <div className="modal-body">
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
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn-cancel" onClick={onClose}>Close</button>
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
              {isRecurring && <span style={{ marginLeft: 8, color: accentColor, fontSize: "0.72rem" }}>↻ Recurring</span>}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {conflictBooking && (
            <div className="conflict-warning">
              <span className="conflict-warning-icon">⚠</span>
              <span>
                <strong>{isLoans ? "In-lab conflict:" : "Equipment loan conflict:"}</strong>{" "}
                {conflictBooking.teacher} ({conflictBooking.class} · {conflictBooking.subject}) has a{" "}
                {isLoans ? "lab booking" : "loan booking"} during this slot.
              </span>
            </div>
          )}

          {isNew && (
            <div style={{ fontSize: "0.8rem", color: "#64748b", background: "#0f1117", border: "1px solid #2d3748", borderRadius: 8, padding: "10px 14px", lineHeight: 1.5 }}>
              📧 Your booking will be sent to the lab technician for approval. The slot will show as <strong style={{ color: "#86efac" }}>pending</strong> until confirmed.
            </div>
          )}

          <div className="field-group">
            <label className="field-label">Teacher Name <span className="required">*</span></label>
            <input className="field-input" value={form.teacher} onChange={upd("teacher")} placeholder="e.g. Ms. Nguyen" />
          </div>
          <div className="row-2">
            <div className="field-group">
              <label className="field-label">Class <span className="required">*</span></label>
              <input className="field-input" value={form.class} onChange={upd("class")} placeholder="e.g. 8A" />
            </div>
            <div className="field-group">
              <label className="field-label">Subject <span className="required">*</span></label>
              <input className="field-input" value={form.subject} onChange={upd("subject")} placeholder="e.g. Computing" />
            </div>
          </div>

          <ColorPicker value={form.color} onChange={(hex) => setForm((f) => ({ ...f, color: hex }))} />

          {isNew && (
            <div className="recur-section">
              <Toggle on={form.recurring} onToggle={() => setForm((f) => ({ ...f, recurring: !f.recurring }))} label="Repeat this booking weekly" />
              {form.recurring && (
                <div className="recur-options">
                  <div className="recur-row">
                    <span className="recur-hint">Repeat for</span>
                    <input className="recur-weeks-input" type="number" min="2" max="40" value={form.recurWeeks}
                      onChange={(e) => setForm((f) => ({ ...f, recurWeeks: Math.max(2, Math.min(40, +e.target.value || 2)) }))} />
                    <span className="recur-hint">weeks</span>
                  </div>
                  <div className="recur-hint" style={{ color: "#3b5268" }}>
                    Creates {form.recurWeeks} bookings from the current week (all require approval)
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
        </div>

        <div className="modal-footer">
          {!isNew && isAdmin && !delMode && (
            <button className="btn-delete" onClick={() => setDelMode(true)}>
              {isRecurring ? "Remove…" : "Remove Booking"}
            </button>
          )}
          {!isNew && isAdmin && delMode && (
            <div className="recur-del-wrap">
              <div className="recur-del-title">Remove which bookings?</div>
              <div className="recur-del-opts">
                <div className="recur-del-opt" onClick={() => onDelete("single")}>✕ This week only</div>
                {isRecurring && <div className="recur-del-opt" onClick={() => onDelete("all")}>✕✕ All recurring</div>}
              </div>
            </div>
          )}
          <button className="btn-cancel" onClick={delMode ? () => setDelMode(false) : onClose}>
            {delMode ? "Back" : "Cancel"}
          </button>
          {!delMode && (
            <button className="btn-save" style={{ background: form.color }} disabled={!canSave} onClick={() => onSave(form)}>
              {isNew ? "Submit for Approval" : "Save Changes"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Timetable Grid ───────────────────────────────────────────────────────────

function TimetableGrid({ accentColor, bookings, setBookings, crossBookings, monday, dbKeyFn, lab, isLoans, onSaveState, isAdmin, onToast }) {
  const [modal, setModal] = useState(null);
  const wk = weekKey(monday);

  const getBooking       = (day, pid) => bookings[wk]?.[slotKey(day, pid)] || null;
  const getCrossBooking  = (day, pid) => crossBookings?.[wk]?.[slotKey(day, pid)] || null;

  const persist = useCallback(async (wkk, data) => {
    onSaveState("saving");
    await dbSave(dbKeyFn(lab, wkk), data);
    onSaveState("saved");
    setTimeout(() => onSaveState("idle"), 2000);
  }, [lab, dbKeyFn, onSaveState]);

  // Submit new booking → pending state + email
  const handleSave = async (form) => {
    const { day, period } = modal;
    const key = slotKey(day, period.id);
    const nextAll = { ...bookings };
    const existing = { ...(nextAll[wk] || {}) };

    // Write pending slot immediately so slot is blocked
    const { recurring, recurWeeks, ...rest } = form;
    const pendingBooking = {
      ...rest, status: "pending",
      day, periodLabel: period.label, periodTime: period.time,
      recurring, recurWeeks,
    };
    existing[key] = pendingBooking;
    nextAll[wk] = existing;
    setBookings(nextAll);
    await persist(wk, existing);

    setModal(null);
    onToast("Booking submitted — sending approval email…");

    // Generate token, store it so approve/reject links work
    const token = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const pendingStorageKey = `pending_${lab}_${wk}_${key}_${isLoans ? "loans" : "inlab"}`;
    await dbSave(pendingStorageKey, {
      token, lab, weekKey: wk, slotKey: key,
      booking: pendingBooking,
      bookingType: isLoans ? "loans" : "inlab",
    });

    const siteUrl = window.location.origin;
    const approveUrl = `${siteUrl}/?approve=${token}&key=${encodeURIComponent(pendingStorageKey)}`;
    const rejectUrl  = `${siteUrl}/?reject=${token}&key=${encodeURIComponent(pendingStorageKey)}`;
    const labInfo = LABS[lab];

    sendApprovalEmail({
      toEmail:     labInfo.techEmail,
      labName:     labInfo.name,
      bookingType: isLoans ? "Equipment Loan" : "In-Lab Booking",
      booking:     pendingBooking,
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

    if (bk.recurring && bk.recurWeeks > 1) {
      const recurId = `recur_${Date.now()}_${key}`;
      for (let i = 0; i < bk.recurWeeks; i++) {
        const wkDate = addWeeks(getMondayOfWeek(new Date(wk)), i);
        const wkk = weekKey(wkDate);
        const { data: wkData } = await supabase.from("bookings").select("data").eq("storage_key", dbKeyFn(lab, wkk)).single();
        const wkSlots = wkData?.data || {};
        const { recurring, recurWeeks, status, pendingKey, ...rest } = bk;
        wkSlots[key] = { ...rest, recurId, status: "confirmed" };
        nextAll[wkk] = wkSlots;
        await persist(wkk, wkSlots);
      }
    } else {
      const existing = { ...(nextAll[wk] || {}) };
      const { recurring, recurWeeks, status, pendingKey, ...rest } = bk;
      existing[key] = { ...rest, status: "confirmed" };
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
    const nextAll = { ...bookings };
    const existing = { ...(nextAll[wk] || {}) };
    delete existing[key];
    nextAll[wk] = existing;
    setBookings(nextAll);
    await persist(wk, existing);
    setModal(null);
    onToast("Booking rejected and slot released");
  };

  // Admin: delete confirmed booking
  const handleDelete = async (mode) => {
    const { day, period } = modal;
    const key = slotKey(day, period.id);
    const bk = getBooking(day, period.id);
    const nextAll = { ...bookings };

    if (mode === "all" && bk?.recurId) {
      for (const [wkk, slots] of Object.entries(nextAll)) {
        if (slots[key]?.recurId === bk.recurId) {
          const updated = { ...slots };
          delete updated[key];
          nextAll[wkk] = updated;
          await persist(wkk, updated);
        }
      }
    } else {
      const existing = { ...(nextAll[wk] || {}) };
      delete existing[key];
      nextAll[wk] = existing;
      await persist(wk, existing);
    }
    setBookings(nextAll);
    setModal(null);
    onToast("Booking removed");
  };

  const pendingCount = Object.values(bookings[wk] || {}).filter((b) => b.status === "pending").length;

  return (
    <>
      {pendingCount > 0 && isAdmin && (
        <div style={{ background: "#1a2d1a", borderBottom: "1px solid #3d5c1e", padding: "8px 24px", fontSize: "0.8rem", color: "#86efac", fontFamily: "DM Mono, monospace" }}>
          ⏳ {pendingCount} pending booking{pendingCount > 1 ? "s" : ""} awaiting approval — click to review
        </div>
      )}
      <div className="grid-wrap">
        <table className="timetable">
          <thead>
            <tr>
              <th style={{ width: 110 }}></th>
              {DAYS.map((d, i) => (
                <th key={d} className="day-header">
                  {DAY_SHORT[i]}<br />
                  <span style={{ color: "#334155", fontWeight: 400 }}>{d}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERIODS.map((period) => (
              <tr key={period.id} className={period.type === "break" ? "break-row" : ""}>
                <td className="period-label">
                  <div className="pl-name">{period.label}</div>
                  <div className="pl-time">{period.time}</div>
                </td>
                {DAYS.map((day) => {
                  const bk     = getBooking(day, period.id);
                  const cross  = getCrossBooking(day, period.id);
                  const isPending = bk?.status === "pending";
                  const color  = isPending ? "#86efac" : (bk?.color || accentColor);

                  return (
                    <td key={day} className="slot-cell">
                      {period.type === "break" ? (
                        <div
                          className={`break-slot${bk ? (isPending ? " pending" : " booked") : ""}`}
                          style={bk && !isPending ? { borderColor: color, background: color + "22" } : {}}
                          onClick={() => bk || !isPending ? setModal({ day, period }) : null}
                        >
                          {bk ? (
                            isPending ? (
                              <span style={{ fontSize: "0.65rem", color: "#86efac", fontFamily: "DM Mono, monospace" }}>⏳ pending</span>
                            ) : (
                              <span style={{ fontSize: "0.72rem", color: "#f0f4ff", fontWeight: 600 }}>{bk.teacher} · {bk.class}</span>
                            )
                          ) : (
                            <span style={{ fontSize: "0.65rem", color: "#2d3748", fontFamily: "DM Mono, monospace" }}>+ book</span>
                          )}
                          <div className="break-slot-icons">
                            {bk?.recurId && <span className="break-recur">↻</span>}
                            {cross && <span style={{ fontSize: "0.7rem", color: "#f97316" }}>⚠</span>}
                          </div>
                        </div>
                      ) : (
                        <div
                          className={`slot${bk ? (isPending ? " pending" : " booked") : " available"}`}
                          style={bk && !isPending ? { background: color + "22", borderColor: color } : {}}
                          onClick={() => setModal({ day, period })}
                        >
                          {bk ? (
                            isPending ? (
                              <>
                                <div className="pending-label">⏳ PENDING</div>
                                <div className="pending-teacher">{bk.teacher} · {bk.class}</div>
                              </>
                            ) : (
                              <>
                                <div className="slot-badges">
                                  {cross && <span className="slot-conflict-icon">⚠</span>}
                                  {bk.recurId && <span className="slot-recur">↻</span>}
                                </div>
                                <div className="slot-teacher">{bk.teacher}</div>
                                <div className="slot-class" style={{ color }}>{bk.class}</div>
                                <div className="slot-subject">{bk.subject}</div>
                                {cross && <div className="slot-conflict" />}
                              </>
                            )
                          ) : (
                            <div className="conflict-avail-hint">
                              <div className="slot-avail-text">available</div>
                              {cross && <div className="conflict-pill">⚠ {isLoans ? "in-lab" : "loan"} booked</div>}
                            </div>
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
        <div className="legend-item"><div className="leg-dot" style={{ background: "#12191f", border: "1px dashed #1e3a4a" }} />Available</div>
        <div className="legend-item"><div className="leg-dot" style={{ background: accentColor + "33", border: `1px solid ${accentColor}` }} />Confirmed</div>
        <div className="legend-item"><div className="leg-pending" />Pending</div>
        <div className="legend-item"><span style={{ fontSize: "0.85rem" }}>↻</span> Recurring</div>
        <div className="legend-item"><div className="leg-conflict" />{isLoans ? "In-lab conflict" : "Loan conflict"}</div>
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
          onSave={handleSave}
          onClose={() => setModal(null)}
          onDelete={handleDelete}
          onAdminApprove={handleAdminApprove}
          onAdminReject={handleAdminReject}
          isLoans={isLoans}
          isAdmin={isAdmin}
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

// ─── Lab View ─────────────────────────────────────────────────────────────────

function LabView({ lab, onBack, isAdmin, onAdminLogin, onAdminLogout }) {
  const labInfo = LABS[lab];
  const [monday, setMonday]       = useState(() => getMondayOfWeek(new Date()));
  const [inLabBookings, setInLab] = useState({});
  const [loansBookings, setLoans] = useState({});
  const [tab, setTab]             = useState("inlab");
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
    ];
    if (lab === "dt") {
      fetches.push(dbLoad(loansKey(lab, wk)).then((d) => setLoans((p) => ({ ...p, [wk]: d }))));
    }
    Promise.all(fetches).then(() => setLoading(false));
  }, [lab, wk]);

  const prevWeek = () => setMonday((m) => addWeeks(m, -1));
  const nextWeek = () => setMonday((m) => addWeeks(m, 1));

  const fmtDate = (d) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  const fri = new Date(monday); fri.setDate(fri.getDate() + 4);
  const weekLabel = `${fmtDate(monday)} – ${fmtDate(fri)}`;
  const isCurrentWeek = weekKey(getMondayOfWeek(new Date())) === wk;

  const conflictCount = lab === "dt" ? (() => {
    const il = inLabBookings[wk] || {};
    const lo = loansBookings[wk] || {};
    return Object.keys(il).filter((k) => lo[k] && il[k].status !== "pending" && lo[k].status !== "pending").length;
  })() : 0;

  const pendingInLab  = Object.values(inLabBookings[wk]  || {}).filter((b) => b.status === "pending").length;
  const pendingLoans  = Object.values(loansBookings[wk]  || {}).filter((b) => b.status === "pending").length;
  const totalPending  = pendingInLab + pendingLoans;

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
        <button className={`tab-btn${tab === "inlab" ? " active" : ""}`} onClick={() => setTab("inlab")}>
          In-Lab Timetable
          {isAdmin && pendingInLab > 0 && <span className="tab-pending-badge">⏳ {pendingInLab}</span>}
          {conflictCount > 0 && tab !== "inlab" && <span className="tab-conflict-badge">⚠ {conflictCount}</span>}
        </button>
        {lab === "dt" && (
          <button className={`tab-btn${tab === "loans" ? " active" : ""}`} onClick={() => setTab("loans")}>
            Equipment Loans
            {isAdmin && pendingLoans > 0 && <span className="tab-pending-badge">⏳ {pendingLoans}</span>}
            {conflictCount > 0 && tab !== "loans" && <span className="tab-conflict-badge">⚠ {conflictCount}</span>}
          </button>
        )}
      </div>

      {loading ? (
        <div className="loading-screen"><div className="loading-spinner" />Loading schedule…</div>
      ) : tab === "inlab" ? (
        <TimetableGrid
          accentColor={labInfo.color} bookings={inLabBookings} setBookings={setInLab}
          crossBookings={lab === "dt" ? loansBookings : null}
          monday={monday} dbKeyFn={inLabKey} lab={lab} isLoans={false}
          onSaveState={setSaveState} isAdmin={isAdmin} onToast={showToast}
        />
      ) : (
        <TimetableGrid
          accentColor={labInfo.color} bookings={loansBookings} setBookings={setLoans}
          crossBookings={inLabBookings}
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
            <h1>Lab Booking</h1>
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
                <div className="sub">{lab.id === "dt" ? "Design & Technology" : "Audio-Visual"}</div>
              </div>
            ))}
          </div>
          <button className="home-admin-btn" onClick={() => setShowAdminLogin(true)}>🔑 Admin Login</button>
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
