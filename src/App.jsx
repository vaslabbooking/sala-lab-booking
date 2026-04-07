import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── Supabase ─────────────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function dbLoad(key) {
  const { data, error } = await supabase
    .from("bookings")
    .select("data")
    .eq("storage_key", key)
    .single();
  if (error || !data) return {};
  return data.data || {};
}

async function dbSave(key, data) {
  const { error } = await supabase
    .from("bookings")
    .upsert({ storage_key: key, data, updated_at: new Date().toISOString() },
             { onConflict: "storage_key" });
  if (error) console.error("Save error:", error);
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
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
  dt: { id: "dt", name: "DT Lab",  icon: "⚙️", color: "#e67e22" },
  av: { id: "av", name: "AV Lab",  icon: "🎬", color: "#2980b9" },
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
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addWeeks(monday, n) {
  const d = new Date(monday);
  d.setDate(d.getDate() + n * 7);
  return d;
}

function weekKey(monday) {
  return monday.toISOString().slice(0, 10);
}

function slotKey(day, periodId) {
  return `${day}_${periodId}`;
}

const inLabKey = (lab, wk) => `bookings_${lab}_${wk}`;
const loansKey = (lab, wk) => `loans_${lab}_${wk}`;

// ─── CSS ──────────────────────────────────────────────────────────────────────

const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'DM Sans', sans-serif; background: #0f1117; color: #e2e8f0; min-height: 100vh; }
  .app { min-height: 100vh; display: flex; flex-direction: column; }

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

  .header { display: flex; align-items: center; gap: 16px; padding: 16px 24px; background: #0d111c; border-bottom: 1px solid #1e2d4a; flex-wrap: wrap; }
  .back-btn { background: none; border: 1px solid #2d3748; color: #94a3b8; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-family: 'DM Mono', monospace; font-size: 0.8rem; transition: all 0.15s; }
  .back-btn:hover { border-color: #64748b; color: #e2e8f0; }
  .header-title { font-family: 'DM Mono', monospace; font-size: 1.1rem; color: #f0f4ff; font-weight: 500; }
  .header-accent { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; }
  .week-nav { margin-left: auto; display: flex; align-items: center; gap: 12px; }
  .week-nav button { background: #161b2e; border: 1px solid #2d3748; color: #94a3b8; width: 32px; height: 32px; border-radius: 6px; cursor: pointer; font-size: 1rem; transition: all 0.15s; }
  .week-nav button:hover { border-color: #64748b; color: #e2e8f0; }
  .week-label { font-family: 'DM Mono', monospace; font-size: 0.8rem; color: #64748b; min-width: 160px; text-align: center; }

  .tabs { display: flex; padding: 0 24px; background: #0d111c; border-bottom: 1px solid #1e2d4a; }
  .tab-btn { background: none; border: none; border-bottom: 2px solid transparent; color: #64748b; padding: 12px 20px; cursor: pointer; font-family: 'DM Sans', sans-serif; font-size: 0.85rem; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; transition: all 0.15s; display: flex; align-items: center; gap: 7px; }
  .tab-btn:hover { color: #94a3b8; }
  .tab-btn.active { color: #f0f4ff; border-bottom-color: var(--accent); }
  .tab-conflict-badge { background: #7c2d12; color: #fca98d; font-size: 0.65rem; font-family: 'DM Mono', monospace; padding: 2px 6px; border-radius: 10px; line-height: 1.4; }

  .grid-wrap { flex: 1; overflow: auto; padding: 24px; }
  .timetable { min-width: 700px; border-collapse: collapse; width: 100%; }
  .timetable th { font-family: 'DM Mono', monospace; font-size: 0.75rem; font-weight: 500; color: #475569; padding: 8px 12px; text-align: left; border-bottom: 1px solid #1e2d4a; white-space: nowrap; }
  .timetable th.day-header { text-align: center; color: #94a3b8; }
  .period-label { padding: 10px 14px; vertical-align: top; white-space: nowrap; }
  .period-label .pl-name { font-family: 'DM Mono', monospace; font-size: 0.78rem; font-weight: 500; color: #64748b; }
  .period-label .pl-time { font-family: 'DM Mono', monospace; font-size: 0.68rem; color: #334155; margin-top: 2px; }

  .slot-cell { padding: 5px; vertical-align: top; min-width: 120px; }
  .slot { height: 58px; border-radius: 8px; display: flex; flex-direction: column; justify-content: center; padding: 6px 10px; cursor: pointer; transition: all 0.15s; position: relative; overflow: hidden; }
  .slot.available { background: #12191f; border: 1px dashed #1e3a4a; }
  .slot.available:hover { background: #1a2736; border-color: #2d4f68; }
  .slot.booked { border-width: 1px; border-style: solid; }
  .slot.booked:hover { filter: brightness(1.2); }
  .slot-avail-text { font-family: 'DM Mono', monospace; font-size: 0.65rem; color: #1e3a4a; text-align: center; }
  .slot-teacher { font-size: 0.75rem; font-weight: 600; color: #f0f4ff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .slot-class { font-family: 'DM Mono', monospace; font-size: 0.68rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .slot-subject { font-size: 0.65rem; color: rgba(255,255,255,0.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .slot-badges { position: absolute; top: 4px; right: 5px; display: flex; align-items: center; gap: 3px; }
  .slot-recur { font-size: 0.6rem; opacity: 0.6; line-height: 1; }
  .slot-conflict { position: absolute; bottom: 0; left: 0; right: 0; height: 3px; background: #f97316; }
  .slot-conflict-icon { font-size: 0.62rem; line-height: 1; color: #f97316; }
  .conflict-avail-hint { display: flex; align-items: center; justify-content: center; gap: 5px; flex-direction: column; }
  .conflict-pill { display: inline-flex; align-items: center; gap: 4px; background: rgba(249,115,22,0.15); border: 1px solid rgba(249,115,22,0.35); border-radius: 4px; padding: 1px 6px; font-size: 0.6rem; color: #f97316; font-family: 'DM Mono', monospace; white-space: nowrap; margin-top: 2px; }

  .break-row td { background: transparent; }
  .break-row .period-label .pl-name { color: #334155; }
  .break-slot { height: 36px; border-radius: 6px; background: #12191f; border: 1px dashed #1a2532; display: flex; align-items: center; padding: 0 10px; cursor: pointer; transition: all 0.15s; position: relative; overflow: hidden; gap: 6px; }
  .break-slot:hover { background: #1a2736; border-color: #2d4f68; }
  .break-slot.booked { border-style: solid; }
  .break-slot-icons { margin-left: auto; display: flex; align-items: center; gap: 4px; }
  .break-recur { font-size: 0.6rem; opacity: 0.6; }

  .legend { display: flex; gap: 20px; padding: 12px 24px; border-top: 1px solid #1e2d4a; background: #0d111c; flex-wrap: wrap; align-items: center; }
  .legend-item { display: flex; align-items: center; gap: 8px; font-size: 0.75rem; color: #475569; }
  .leg-dot { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
  .leg-conflict { width: 10px; height: 3px; border-radius: 2px; background: #f97316; flex-shrink: 0; }

  .saving-indicator { font-family: 'DM Mono', monospace; font-size: 0.72rem; color: #64748b; display: flex; align-items: center; gap: 6px; }
  .saving-dot { width: 6px; height: 6px; border-radius: 50%; background: #64748b; animation: pulse 1s infinite; }
  .saving-dot.saved { background: #10b981; animation: none; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }

  .loading-screen { flex: 1; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 16px; color: #475569; font-family: 'DM Mono', monospace; font-size: 0.85rem; }
  .loading-spinner { width: 32px; height: 32px; border: 2px solid #1e2d4a; border-top-color: var(--accent, #3b82f6); border-radius: 50%; animation: spin 0.7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

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

  .conflict-warning { background: rgba(249,115,22,0.1); border: 1px solid rgba(249,115,22,0.3); border-radius: 8px; padding: 10px 14px; font-size: 0.8rem; color: #fdba74; line-height: 1.5; display: flex; gap: 10px; align-items: flex-start; }
  .conflict-warning-icon { font-size: 1rem; flex-shrink: 0; margin-top: 1px; }

  .field-group { display: flex; flex-direction: column; gap: 6px; }
  .field-label { font-family: 'DM Mono', monospace; font-size: 0.72rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; }
  .field-label .required { color: var(--accent); margin-left: 4px; }
  .field-input, .field-textarea { background: #0f1117; border: 1px solid #2d3748; color: #f0f4ff; border-radius: 8px; padding: 10px 14px; font-family: 'DM Sans', sans-serif; font-size: 0.9rem; width: 100%; transition: border-color 0.15s; outline: none; }
  .field-input:focus, .field-textarea:focus { border-color: var(--accent); }
  .field-textarea { resize: vertical; min-height: 72px; }
  .row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .divider { font-family: 'DM Mono', monospace; font-size: 0.7rem; color: #334155; text-transform: uppercase; letter-spacing: 0.1em; display: flex; align-items: center; gap: 12px; }
  .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: #1e2d4a; }

  .color-grid { display: flex; flex-wrap: wrap; gap: 8px; }
  .color-swatch { width: 28px; height: 28px; border-radius: 6px; cursor: pointer; border: 2px solid transparent; transition: transform 0.12s, border-color 0.12s, box-shadow 0.12s; flex-shrink: 0; }
  .color-swatch:hover { transform: scale(1.18); }
  .color-swatch.selected { border-color: #fff; transform: scale(1.18); box-shadow: 0 0 0 3px rgba(255,255,255,0.15); }

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
`;

// ─── Tiny sub-components ──────────────────────────────────────────────────────

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

// ─── Booking Modal ────────────────────────────────────────────────────────────

function SlotModal({ accentColor, day, period, booking, conflictBooking, onSave, onClose, onDelete, isLoans }) {
  const isNew = !booking?.teacher;
  const isRecurring = !!booking?.recurId;

  const [form, setForm] = useState({
    teacher: "", class: "", subject: "",
    activityOverview: "", requiredEquipment: "",
    numStudents: "", numGroups: "",
    color: DEFAULT_COLOR,
    recurring: false, recurWeeks: 8,
    ...booking,
  });
  const [delMode, setDelMode] = useState(false);

  const upd = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const canSave = form.teacher.trim() && form.class.trim() && form.subject.trim();

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
                    <input className="recur-weeks-input" type="number" min="2" max="40"
                      value={form.recurWeeks}
                      onChange={(e) => setForm((f) => ({ ...f, recurWeeks: Math.max(2, Math.min(40, +e.target.value || 2)) }))} />
                    <span className="recur-hint">weeks</span>
                  </div>
                  <div className="recur-hint" style={{ color: "#3b5268" }}>
                    Creates {form.recurWeeks} bookings on this day/period from the current week
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
          {!isNew && !delMode && (
            <button className="btn-delete" onClick={() => setDelMode(true)}>
              {isRecurring ? "Remove…" : "Remove Booking"}
            </button>
          )}
          {!isNew && delMode && (
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
              {isNew ? (isLoans ? "Log Loan" : "Confirm Booking") : "Save Changes"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Timetable Grid ───────────────────────────────────────────────────────────

function TimetableGrid({ accentColor, bookings, setBookings, crossBookings, monday, dbKeyFn, lab, isLoans, onSaveState }) {
  const [modal, setModal] = useState(null);
  const wk = weekKey(monday);

  const getBooking      = (day, pid) => bookings[wk]?.[slotKey(day, pid)] || null;
  const getCrossBooking = (day, pid) => crossBookings?.[wk]?.[slotKey(day, pid)] || null;

  const persist = useCallback(async (wkk, data) => {
    onSaveState("saving");
    await dbSave(dbKeyFn(lab, wkk), data);
    onSaveState("saved");
    setTimeout(() => onSaveState("idle"), 2000);
  }, [lab, dbKeyFn, onSaveState]);

  const handleSave = async (form) => {
    const { day, period } = modal;
    const key = slotKey(day, period.id);
    const weeksToWrite = form.recurring && form.recurWeeks > 1
      ? Array.from({ length: form.recurWeeks }, (_, i) => addWeeks(monday, i))
      : [monday];
    const recurId = form.recurring ? `recur_${Date.now()}_${key}` : undefined;
    const nextAll = { ...bookings };
    for (const wkDate of weeksToWrite) {
      const wkk = weekKey(wkDate);
      const existing = { ...(nextAll[wkk] || {}) };
      const { recurring, recurWeeks, ...rest } = form;
      existing[key] = { ...rest, ...(recurId ? { recurId } : {}) };
      nextAll[wkk] = existing;
      await persist(wkk, existing);
    }
    setBookings(nextAll);
    setModal(null);
  };

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
  };

  return (
    <>
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
                  const bk    = getBooking(day, period.id);
                  const cross = getCrossBooking(day, period.id);
                  const color = bk?.color || accentColor;
                  return (
                    <td key={day} className="slot-cell">
                      {period.type === "break" ? (
                        <div className={`break-slot${bk ? " booked" : ""}`}
                          style={bk ? { borderColor: color, background: color + "22" } : {}}
                          onClick={() => setModal({ day, period })}>
                          {bk
                            ? <span style={{ fontSize: "0.72rem", color: "#f0f4ff", fontWeight: 600 }}>{bk.teacher} · {bk.class}</span>
                            : <span style={{ fontSize: "0.65rem", color: "#2d3748", fontFamily: "DM Mono, monospace" }}>+ book</span>
                          }
                          <div className="break-slot-icons">
                            {bk?.recurId && <span className="break-recur">↻</span>}
                            {cross && <span style={{ fontSize: "0.7rem", color: "#f97316" }} title="Conflict on this slot">⚠</span>}
                          </div>
                        </div>
                      ) : (
                        <div className={`slot${bk ? " booked" : " available"}`}
                          style={bk ? { background: color + "22", borderColor: color } : {}}
                          onClick={() => setModal({ day, period })}>
                          {bk ? (
                            <>
                              <div className="slot-badges">
                                {cross && <span className="slot-conflict-icon" title="Conflict on this slot">⚠</span>}
                                {bk.recurId && <span className="slot-recur">↻</span>}
                              </div>
                              <div className="slot-teacher">{bk.teacher}</div>
                              <div className="slot-class" style={{ color }}>{bk.class}</div>
                              <div className="slot-subject">{bk.subject}</div>
                              {cross && <div className="slot-conflict" />}
                            </>
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
        <div className="legend-item"><div className="leg-dot" style={{ background: accentColor + "33", border: `1px solid ${accentColor}` }} />Booked</div>
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
          isLoans={isLoans}
        />
      )}
    </>
  );
}

// ─── Lab View ─────────────────────────────────────────────────────────────────

function LabView({ lab, onBack }) {
  const labInfo = LABS[lab];
  const [monday, setMonday]           = useState(() => getMondayOfWeek(new Date()));
  const [inLabBookings, setInLab]     = useState({});
  const [loansBookings, setLoans]     = useState({});
  const [tab, setTab]                 = useState("inlab");
  const [loading, setLoading]         = useState(true);
  const [saveState, setSaveState]     = useState("idle"); // "idle"|"saving"|"saved"
  const wk = weekKey(monday);

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
    return Object.keys(il).filter((k) => lo[k]).length;
  })() : 0;

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
        <div className="week-nav">
          <button onClick={prevWeek}>‹</button>
          <div className="week-label">{weekLabel}</div>
          <button onClick={nextWeek}>›</button>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab-btn${tab === "inlab" ? " active" : ""}`} onClick={() => setTab("inlab")}>
          In-Lab Timetable
          {lab === "dt" && conflictCount > 0 && tab !== "inlab" && (
            <span className="tab-conflict-badge">⚠ {conflictCount}</span>
          )}
        </button>
        {lab === "dt" && (
          <button className={`tab-btn${tab === "loans" ? " active" : ""}`} onClick={() => setTab("loans")}>
            Equipment Loans
            {conflictCount > 0 && tab !== "loans" && (
              <span className="tab-conflict-badge">⚠ {conflictCount}</span>
            )}
          </button>
        )}
      </div>

      {loading ? (
        <div className="loading-screen">
          <div className="loading-spinner" />
          Loading schedule…
        </div>
      ) : tab === "inlab" ? (
        <TimetableGrid
          accentColor={labInfo.color}
          bookings={inLabBookings}
          setBookings={setInLab}
          crossBookings={lab === "dt" ? loansBookings : null}
          monday={monday}
          dbKeyFn={inLabKey}
          lab={lab}
          isLoans={false}
          onSaveState={setSaveState}
        />
      ) : (
        <TimetableGrid
          accentColor={labInfo.color}
          bookings={loansBookings}
          setBookings={setLoans}
          crossBookings={inLabBookings}
          monday={monday}
          dbKeyFn={loansKey}
          lab={lab}
          isLoans={true}
          onSaveState={setSaveState}
        />
      )}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [activeLab, setActiveLab] = useState(null);
  return (
    <>
      <style>{css}</style>
      {activeLab ? (
        <LabView lab={activeLab} onBack={() => setActiveLab(null)} />
      ) : (
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
          </div>
        </div>
      )}
    </>
  );
}
