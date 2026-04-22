// netlify/functions/booking-action.js
// Handles:
//   POST ?action=approve        → approves a pending booking
//   POST ?action=reject         → rejects (deletes) a pending booking
//   POST ?action=change-password → updates admin password

const TURSO_URL   = process.env.TURSO_URL;
const TURSO_TOKEN = process.env.TURSO_TOKEN;

// ── Turso helpers ─────────────────────────────────────────────────────────────

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
  if (!row) return null;
  try { return JSON.parse(row[0]); } catch { return null; }
}

async function dbSave(key, data) {
  await tursoExec(
    "INSERT INTO bookings (storage_key, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(storage_key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
    [key, JSON.stringify(data), new Date().toISOString()]
  );
}

async function dbDelete(key) {
  await tursoExec("DELETE FROM bookings WHERE storage_key = ?", [key]);
}

// ── App helpers ───────────────────────────────────────────────────────────────

const RESEND_KEY = process.env.RESEND_API_KEY;
const SITE_URL   = process.env.URL || "http://localhost:8888";

const LAB_EMAILS = {
  dt: "linh.thi.pham@vas.edu.vn",
  av: "vu.long.nguyen@vas.edu.vn",
};

const LAB_NAMES = {
  dt: "DT Lab",
  av: "AV Lab",
};

async function getAdminPassword() {
  const data = await dbLoad("admin_config");
  return data?.password || "admin1234";
}

async function sendEmail({ to, subject, html }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "VAS Lab Booking <onboarding@resend.dev>",
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error: ${err}`);
  }
}

// ── handler ───────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { action } = body;

  // ── Change password ────────────────────────────────────────────────────────
  if (action === "change-password") {
    const { currentPassword, newPassword } = body;
    const stored = await getAdminPassword();
    if (currentPassword !== stored) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: "Current password incorrect" }) };
    }
    await dbSave("admin_config", { password: newPassword });
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  // ── Request approval (submit booking) ─────────────────────────────────────
  if (action === "request") {
    const { lab, weekKey, slotKey, booking, bookingType } = body;

    const token = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const pendingKey = `pending_${lab}_${weekKey}_${slotKey}_${bookingType}`;
    await dbSave(pendingKey, { token, lab, weekKey, slotKey, booking, bookingType });

    const approveUrl = `${SITE_URL}/?approve=${token}&key=${encodeURIComponent(pendingKey)}`;
    const rejectUrl  = `${SITE_URL}/?reject=${token}&key=${encodeURIComponent(pendingKey)}`;

    const labName   = LAB_NAMES[lab] || lab;
    const typeLabel = bookingType === "loans" ? "Equipment Loan" : "In-Lab Booking";

    await sendEmail({
      to: LAB_EMAILS[lab],
      subject: `[${labName}] Booking approval required — ${booking.teacher}`,
      html: `
        <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; color: #1e293b;">
          <div style="background: #0f1117; padding: 24px 32px; border-radius: 12px 12px 0 0;">
            <h2 style="color: #f0f4ff; margin: 0; font-size: 1.2rem;">📋 New ${typeLabel} Request</h2>
            <p style="color: #64748b; margin: 6px 0 0; font-size: 0.85rem;">${labName}</p>
          </div>
          <div style="background: #f8fafc; padding: 24px 32px; border: 1px solid #e2e8f0; border-top: none;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
              <tr><td style="padding: 6px 0; color: #64748b; width: 130px;">Teacher</td><td style="padding: 6px 0; font-weight: 600;">${booking.teacher}</td></tr>
              <tr><td style="padding: 6px 0; color: #64748b;">Class</td><td style="padding: 6px 0;">${booking.class}</td></tr>
              <tr><td style="padding: 6px 0; color: #64748b;">Subject</td><td style="padding: 6px 0;">${booking.subject}</td></tr>
              <tr><td style="padding: 6px 0; color: #64748b;">Day</td><td style="padding: 6px 0;">${booking.day || "—"}</td></tr>
              <tr><td style="padding: 6px 0; color: #64748b;">Period</td><td style="padding: 6px 0;">${booking.periodLabel || "—"} (${booking.periodTime || "—"})</td></tr>
              ${booking.activityOverview ? `<tr><td style="padding: 6px 0; color: #64748b; vertical-align: top;">Activity</td><td style="padding: 6px 0;">${booking.activityOverview}</td></tr>` : ""}
              ${booking.requiredEquipment ? `<tr><td style="padding: 6px 0; color: #64748b; vertical-align: top;">Equipment</td><td style="padding: 6px 0;">${booking.requiredEquipment}</td></tr>` : ""}
              ${booking.numStudents ? `<tr><td style="padding: 6px 0; color: #64748b;">Students</td><td style="padding: 6px 0;">${booking.numStudents}${booking.numGroups ? ` (${booking.numGroups} groups)` : ""}</td></tr>` : ""}
              ${booking.recurring ? `<tr><td style="padding: 6px 0; color: #64748b;">Recurring</td><td style="padding: 6px 0;">Yes — ${booking.recurWeeks} weeks</td></tr>` : ""}
            </table>
          </div>
          <div style="background: #f8fafc; padding: 0 32px 28px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
            <a href="${approveUrl}" style="display: inline-block; background: #10b981; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-right: 12px;">✓ Approve</a>
            <a href="${rejectUrl}"  style="display: inline-block; background: #ef4444; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">✕ Reject</a>
            <p style="margin: 16px 0 0; font-size: 0.75rem; color: #94a3b8;">Or log in as admin at <a href="${SITE_URL}" style="color: #94a3b8;">${SITE_URL}</a> to manage bookings directly.</p>
          </div>
        </div>
      `,
    });

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, pendingKey }) };
  }

  // ── Approve ────────────────────────────────────────────────────────────────
  if (action === "approve") {
    const { token, pendingKey, adminPassword } = body;

    const storedPw = await getAdminPassword();
    if (adminPassword !== storedPw) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: "Invalid admin password" }) };
    }

    const pendingData = await dbLoad(pendingKey);
    if (!pendingData || pendingData.token !== token) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: "Booking not found or already actioned" }) };
    }

    const { lab, weekKey, slotKey, booking, bookingType, doubleSlotKey } = pendingData;
    const slotKeys = [slotKey];
    if (doubleSlotKey) slotKeys.push(doubleSlotKey);

    const storageKeyFn = (wkk) => bookingType === "loans" ? `loans_${lab}_${wkk}` : `bookings_${lab}_${wkk}`;

    if (booking.recurring && booking.recurWeeks > 1) {
      const monday = new Date(weekKey);
      const recurId = `recur_${Date.now()}_${slotKey}`;
      for (let i = 0; i < booking.recurWeeks; i++) {
        const wkDate = new Date(monday);
        wkDate.setDate(wkDate.getDate() + i * 7);
        const wkk = wkDate.toISOString().slice(0, 10);
        const wkSlots = (await dbLoad(storageKeyFn(wkk))) || {};
        for (const sk of slotKeys) {
          const slotBk = wkSlots[sk];
          if (slotBk) {
            const { recurring, recurWeeks, status, pendingKey: _pk, ...rest } = slotBk;
            wkSlots[sk] = { ...rest, recurId, status: "confirmed" };
          }
        }
        await dbSave(storageKeyFn(wkk), wkSlots);
      }
    } else {
      const slots = (await dbLoad(storageKeyFn(weekKey))) || {};
      for (const sk of slotKeys) {
        const slotBk = slots[sk];
        if (slotBk) {
          const { recurring, recurWeeks, status: _s, pendingKey: _pk, ...rest } = slotBk;
          slots[sk] = { ...rest, status: "confirmed" };
        } else if (sk === slotKey) {
          const { recurring, recurWeeks, status: _s, pendingKey: _pk, ...rest } = booking;
          slots[sk] = { ...rest, status: "confirmed" };
        }
      }
      await dbSave(storageKeyFn(weekKey), slots);
    }

    await dbDelete(pendingKey);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, message: "Booking approved" }) };
  }

  // ── Reject ─────────────────────────────────────────────────────────────────
  if (action === "reject") {
    const { token, pendingKey, adminPassword } = body;

    const storedPw = await getAdminPassword();
    if (adminPassword !== storedPw) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: "Invalid admin password" }) };
    }

    const pendingData = await dbLoad(pendingKey);
    if (!pendingData || pendingData.token !== token) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: "Booking not found or already actioned" }) };
    }

    const { lab, weekKey, slotKey, booking, bookingType, doubleSlotKey } = pendingData;
    const slotKeys = [slotKey];
    if (doubleSlotKey) slotKeys.push(doubleSlotKey);

    const storageKeyFn = (wkk) => bookingType === "loans" ? `loans_${lab}_${wkk}` : `bookings_${lab}_${wkk}`;

    if (booking?.recurring && booking?.recurWeeks > 1) {
      const monday = new Date(weekKey);
      for (let i = 0; i < booking.recurWeeks; i++) {
        const wkDate = new Date(monday);
        wkDate.setDate(wkDate.getDate() + i * 7);
        const wkk = wkDate.toISOString().slice(0, 10);
        const wkSlots = (await dbLoad(storageKeyFn(wkk))) || {};
        for (const sk of slotKeys) delete wkSlots[sk];
        await dbSave(storageKeyFn(wkk), wkSlots);
      }
    } else {
      const slots = (await dbLoad(storageKeyFn(weekKey))) || {};
      for (const sk of slotKeys) delete slots[sk];
      await dbSave(storageKeyFn(weekKey), slots);
    }

    await dbDelete(pendingKey);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, message: "Booking rejected" }) };
  }

  return { statusCode: 400, headers, body: JSON.stringify({ error: "Unknown action" }) };
};
