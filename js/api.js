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

  /** העלאה עם דיווח התקדמות אמיתי (אחוזים) דרך XHR */
  uploadExperienceImageWithProgress(payload, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", APP_CONFIG.scriptUrl, true);
      xhr.setRequestHeader("Content-Type", "text/plain;charset=utf-8");
      if (xhr.upload && typeof onProgress === "function") {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
      }
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText || "{}");
          if (!data.success) return reject(new Error(data.error || "שגיאה בשרת"));
          resolve(data);
        } catch (err) {
          reject(new Error("תשובת שרת לא תקינה"));
        }
      };
      xhr.onerror = () => reject(new Error("שגיאה בשליחה לשרת"));
      xhr.send(JSON.stringify({ action: "uploadExperienceImage", ...payload }));
    });
  },

  deleteMessage(messageId) {
    return this.post({ action: "deleteMessage", messageId });
  },

  deleteExperience(experienceId) {
    return this.post({ action: "deleteExperience", experienceId });
  },

  deleteCredit(creditId) {
    return this.post({ action: "deleteCredit", creditId });
  },

  clearSheet(target) {
    return this.post({ action: "clearSheet", target });
  },

  deleteAllData() {
    return this.post({ action: "deleteAllData" });
  },

  deleteEvent(eventId) {
    return this.post({ action: "deleteEvent", eventId });
  },

  registerUser(user) {
    return this.post({ action: "registerUser", ...user });
  },

  deleteUser(userId) {
    return this.post({ action: "deleteUser", userId });
  },

  updateEvent(event) {
    return this.post({ action: "updateEvent", ...event });
  },

  /** המרת נתונים מהגיליון לפורמט האפליקציה */
  normalizePayload(eventsRaw, rsvpsRaw, messagesRaw, creditsRaw = [], experiencesRaw = [], usersRaw = []) {
    const rsvpByEvent = {};
    (rsvpsRaw || []).forEach((row) => {
      const rr = normalizeRowKeys(row);
      const eventId = String(readField(rr, ["eventid"]) || "");
      if (!rsvpByEvent[eventId]) rsvpByEvent[eventId] = {};
      rsvpByEvent[eventId][String(readField(rr, ["userid"]) || "")] = readField(rr, ["status"]) || "";
    });

    const events = (eventsRaw || []).map((row) => {
      const rr = normalizeRowKeys(row);
      let familyName = readField(rr, ["familyname"]) || "";
      let date = sheetDate(readField(rr, ["date"]));
      let time = sheetTime(readField(rr, ["time"]));

      // Repair rows written by outdated Apps Script that shifted date/time columns.
      const familyDateCandidate = sheetDate(readField(rr, ["familyname"]));
      if (!date && familyDateCandidate) {
        date = familyDateCandidate;
        if (!time && /^\d{1,2}:\d{2}/.test(String(readField(rr, ["date"]) || ""))) {
          time = sheetTime(readField(rr, ["date"]));
        }
        familyName = "";
      }

      return {
        id: String(readField(rr, ["id"]) || ""),
        ownerId: String(readField(rr, ["ownerid"]) || ""),
        ownerName: readField(rr, ["ownername"]) || "",
        girlName: readField(rr, ["girlname"]) || "",
        familyName,
        date,
        time,
        location: readField(rr, ["location"]) || "",
        address: readField(rr, ["address"]) || "",
        menu: readField(rr, ["menu"]) || "",
        image: readField(rr, ["image"]) || "",
        hideGuests: toBool(readField(rr, ["hideattendees"])),
        rsvp: rsvpByEvent[String(readField(rr, ["id"]) || "")] || {},
      };
    });

    const messages = (messagesRaw || [])
      .map((row) => {
        const rr = normalizeRowKeys(row);
        const ts = readField(rr, ["timestamp", "createdat"]) || "";
        return {
          id: String(readField(rr, ["id"]) || ""),
          name: readField(rr, ["username"]) || "",
          text: readField(rr, ["messagetext"]) || "",
          date: formatTimestamp(ts),
          sortKey: new Date(ts).getTime() || 0,
        };
      })
      .sort((a, b) => b.sortKey - a.sortKey);

    const credits = (creditsRaw || []).map((row) => {
      const rr = normalizeRowKeys(row);
      let ratings = {};
      const ratingsRaw = readField(rr, ["ratings"]);
      if (typeof ratingsRaw === "string" && ratingsRaw) {
        try {
          ratings = JSON.parse(ratingsRaw);
        } catch (_) {
          ratings = {};
        }
      } else {
        ratings = ratingsRaw || {};
      }

      return {
        id: String(readField(rr, ["id"]) || crypto.randomUUID()),
        eventId: String(readField(rr, ["eventid"]) || ""),
        category: readField(rr, ["category"]) || "",
        professionalName: readField(rr, ["professionalname"]) || "",
        contact: readField(rr, ["contact"]) || "",
        phone: readField(rr, ["phone"]) || "",
        link: readField(rr, ["link"]) || "",
        note: readField(rr, ["note"]) || "",
        tags: readField(rr, ["tags"]) || "",
        sentiment: readField(rr, ["sentiment"]) || "",
        ownerUserId: String(readField(rr, ["owneruserid"]) || ""),
        ownerName: readField(rr, ["ownername"]) || "",
        ratings,
      };
    });

    const experiences = (experiencesRaw || [])
      .map((row) => {
        const rr = normalizeRowKeys(row);
        return {
          id: String(readField(rr, ["id"]) || crypto.randomUUID()),
          eventId: String(readField(rr, ["eventid"]) || ""),
          userId: String(readField(rr, ["userid"]) || ""),
          userName: readField(rr, ["username"]) || "",
          text: readField(rr, ["text"]) || "",
          imageUrl: readField(rr, ["imageurl"]) || "",
          createdAt: readField(rr, ["createdat", "timestamp"]) || "",
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const users = (usersRaw || [])
      .map((row) => {
        const rr = normalizeRowKeys(row);
        const ts = readField(rr, ["lastseen", "createdat"]) || "";
        return {
          id: String(readField(rr, ["id"]) || ""),
          parentName: readField(rr, ["parentname"]) || "",
          girlName: readField(rr, ["girlname"]) || "",
          familyName: readField(rr, ["familyname"]) || "",
          role: readField(rr, ["role"]) || "",
          phone: readField(rr, ["phone"]) || "",
          createdAt: readField(rr, ["createdat"]) || "",
          lastSeen: readField(rr, ["lastseen"]) || "",
          sortKey: new Date(ts).getTime() || 0,
        };
      })
      .filter((u) => u.id)
      .sort((a, b) => b.sortKey - a.sortKey);

    return { events, messages, credits, experiences, users };
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

function normalizeRowKeys(row) {
  const out = {};
  Object.keys(row || {}).forEach((key) => {
    const normalized = String(key || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
    out[normalized] = row[key];
  });
  return out;
}

function readField(row, keys) {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(row, k)) return row[k];
  }
  return undefined;
}
