/**
 * תקשורת עם Google Apps Script / Google Sheets
 */

const Api = {
  async fetchAll() {
    const res = await fetch(APP_CONFIG.scriptUrl);
    if (!res.ok) throw new Error("שגיאה בטעינת נתונים מהשרת");
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "שגיאה בשרת");
    return data;
  },

  async post(payload) {
    const res = await fetch(APP_CONFIG.scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("שגיאה בשליחה לשרת");
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "שגיאה בשרת");
    return data;
  },

  createEvent(event) {
    return this.post({ action: "createEvent", ...event });
  },

  vote({ eventId, userId, userName, status }) {
    return this.post({ action: "vote", eventId, userId, userName, status });
  },

  createMessage({ id, userName, messageText }) {
    return this.post({ action: "createMessage", id, userName, messageText });
  },

  createCredit(payload) {
    return this.post({ action: "createCredit", ...payload });
  },

  rateCredit(payload) {
    return this.post({ action: "rateCredit", ...payload });
  },

  createExperience(payload) {
    return this.post({ action: "createExperience", ...payload });
  },

  uploadExperienceImage(payload) {
    return this.post({ action: "uploadExperienceImage", ...payload });
  },

  deleteMessage(messageId) {
    return this.post({ action: "deleteMessage", messageId });
  },

  deleteEvent(eventId) {
    return this.post({ action: "deleteEvent", eventId });
  },

  updateEvent(event) {
    return this.post({ action: "updateEvent", ...event });
  },

  /** המרת נתונים מהגיליון לפורמט האפליקציה */
  normalizePayload(eventsRaw, rsvpsRaw, messagesRaw, creditsRaw = [], experiencesRaw = []) {
    const rsvpByEvent = {};
    (rsvpsRaw || []).forEach((row) => {
      const eventId = String(row.eventId);
      if (!rsvpByEvent[eventId]) rsvpByEvent[eventId] = {};
      rsvpByEvent[eventId][String(row.userId)] = row.status;
    });

    const events = (eventsRaw || []).map((row) => ({
      id: String(row.id),
      ownerId: String(row.ownerId),
      ownerName: row.ownerName || "",
      girlName: row.girlName || "",
      familyName: row.familyName || "",
      date: sheetDate(row.date),
      time: sheetTime(row.time),
      location: row.location || "",
      address: row.address || "",
      menu: row.menu || "",
      image: row.image || "",
      hideGuests: toBool(row.hideAttendees),
      rsvp: rsvpByEvent[String(row.id)] || {},
    }));

    const messages = (messagesRaw || [])
      .map((row) => ({
        id: String(row.id),
        name: row.userName || "",
        text: row.messageText || "",
        date: formatTimestamp(row.timestamp),
        sortKey: new Date(row.timestamp).getTime() || 0,
      }))
      .sort((a, b) => b.sortKey - a.sortKey);

    const credits = (creditsRaw || []).map((row) => {
      let ratings = {};
      if (typeof row.ratings === "string" && row.ratings) {
        try {
          ratings = JSON.parse(row.ratings);
        } catch (_) {
          ratings = {};
        }
      } else {
        ratings = row.ratings || {};
      }

      return {
        id: String(row.id || crypto.randomUUID()),
        eventId: String(row.eventId || ""),
        category: row.category || "",
        professionalName: row.professionalName || "",
        contact: row.contact || "",
        phone: row.phone || "",
        link: row.link || "",
        note: row.note || "",
        tags: row.tags || "",
        sentiment: row.sentiment || "",
        ownerUserId: String(row.ownerUserId || ""),
        ownerName: row.ownerName || "",
        ratings,
      };
    });

    const experiences = (experiencesRaw || [])
      .map((row) => ({
        id: String(row.id || crypto.randomUUID()),
        eventId: String(row.eventId || ""),
        userId: String(row.userId || ""),
        userName: row.userName || "",
        text: row.text || "",
        imageUrl: row.imageUrl || "",
        createdAt: row.createdAt || row.timestamp || "",
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return { events, messages, credits, experiences };
  },
};

function toBool(value) {
  return value === true || value === "TRUE" || value === "true" || value === 1;
}

function sheetDate(value) {
  if (!value) return "";
  if (typeof value === "number") {
    const fromSerial = sheetSerialToDate(value);
    if (fromSerial) {
      const y = fromSerial.getFullYear();
      if (y < 2020 || y > 2100) return "";
      return toIsoDate(fromSerial);
    }
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const iso = value.slice(0, 10);
    const year = Number(iso.slice(0, 4));
    return year >= 2020 && year <= 2100 ? iso : "";
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (/^\d{1,2}:\d{2}/.test(text)) return "";
    const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(text);
    if (dmy) {
      const d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
      if (!Number.isNaN(d.getTime())) {
        const y = d.getFullYear();
        return y >= 2020 && y <= 2100 ? toIsoDate(d) : "";
      }
    }
    const ymdShort = /^(\d{2})-(\d{2})-(\d{2})$/.exec(text);
    if (ymdShort) {
      const d = new Date(2000 + Number(ymdShort[1]), Number(ymdShort[2]) - 1, Number(ymdShort[3]));
      if (!Number.isNaN(d.getTime())) {
        const y = d.getFullYear();
        return y >= 2020 && y <= 2100 ? toIsoDate(d) : "";
      }
    }
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  const y = d.getFullYear();
  if (y < 2020 || y > 2100) return "";
  return toIsoDate(d);
}

function sheetTime(value) {
  if (!value) return "";
  if (typeof value === "number" && value > 0 && value < 1) {
    const totalMinutes = Math.round(value * 24 * 60);
    const h = String(Math.floor(totalMinutes / 60) % 24).padStart(2, "0");
    const m = String(totalMinutes % 60).padStart(2, "0");
    return `${h}:${m}`;
  }
  if (typeof value === "string" && /^\d{1,2}:\d{2}/.test(value)) {
    const [h, m] = value.split(":");
    return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 5);
  return d.toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatTimestamp(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("he-IL");
}

function sheetSerialToDate(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n) || n <= 0) return null;
  const base = Date.UTC(1899, 11, 30);
  const ms = base + Math.round(n * 86400000);
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
