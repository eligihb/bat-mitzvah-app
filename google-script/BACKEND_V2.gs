const SHEET_EVENTS = "Events";
const SHEET_RSVP = "RSVP";
const SHEET_MESSAGES = "Messages";
const SHEET_CREDITS = "Credits";
const SHEET_EXPERIENCES = "Experiences";
const SHEET_USERS = "Users";

// תיקיית דרייב לתמונות/סרטונים של האלבום
const FOLDER_EXPERIENCES = "1MljLXWRmcrBJ3mWosLrliCyytmasy8ti";

// כותרות נדרשות לכל גיליון (שורה 1)
const SHEET_HEADERS = {
  Events: [
    "id", "ownerId", "ownerName", "girlName", "familyName",
    "date", "time", "location", "address", "menu",
    "hideAttendees", "image", "timestamp", "phone", "role",
  ],
  RSVP: ["eventId", "userId", "userName", "status", "timestamp"],
  Messages: ["id", "userName", "messageText", "timestamp"],
  Credits: [
    "id", "eventId", "category", "professionalName", "contact",
    "phone", "link", "note", "tags", "sentiment",
    "ownerUserId", "ownerName", "ratings", "createdAt",
  ],
  Experiences: ["id", "eventId", "userId", "userName", "text", "imageUrl", "createdAt"],
  Users: ["id", "parentName", "girlName", "familyName", "role", "phone", "createdAt", "lastSeen"],
};

/**
 * הרץ פעם אחת מהעורך (בחר setupBatMitzvahSheets ולחץ Run).
 * יוצר גיליונות חסרים ומוסיף עמודות חסרות — בלי למחוק נתונים.
 * הקריאה ל-DriveApp מאלצת אישור הרשאת Drive (חובה להעלאת תמונות).
 */
function setupBatMitzvahSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureAllSheets_(ss);
  var driveStatus = "";
  try {
    var folder = DriveApp.getFolderById(FOLDER_EXPERIENCES);
    driveStatus = "תיקיית התמונות נגישה: " + folder.getName();
  } catch (e) {
    driveStatus = "שגיאת Drive: " + e;
  }
  SpreadsheetApp.getUi().alert(
    "ההתקנה הושלמה.\nכל הגיליונות והעמודות קיימים.\n" +
      driveStatus +
      "\n\nכעת: Deploy → Manage deployments → New version"
  );
}

/**
 * הרץ פעם אחת מהעורך (בחר authorizeDrive ולחץ Run) כדי לאשר הרשאת Drive.
 * זה פותר את השגיאה "אין לך הרשאה להתקשר אל DriveApp.getFolderById".
 */
function authorizeDrive() {
  var folder = DriveApp.getFolderById(FOLDER_EXPERIENCES);
  Logger.log("OK: " + folder.getName());
  return folder.getName();
}

// =========================
// GET
// =========================
function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    if (params.driveTest === "1") {
      return json(testDriveAccess_());
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureAllSheets_(ss);
    return json({
      success: true,
      events: getSheetData(ss.getSheetByName(SHEET_EVENTS)),
      rsvps: getSheetData(ss.getSheetByName(SHEET_RSVP)),
      messages: getSheetData(ss.getSheetByName(SHEET_MESSAGES)),
      credits: getSheetData(ss.getSheetByName(SHEET_CREDITS)),
      experiences: getSheetData(ss.getSheetByName(SHEET_EXPERIENCES)),
      users: getSheetData(ss.getSheetByName(SHEET_USERS)),
    });
  } catch (err) {
    return json({ success: false, error: String(err) });
  }
}

/** בדיקת הרשאת Drive דרך ה-Web App (לא דרך העורך!) — פתחו: .../exec?driveTest=1 */
function testDriveAccess_() {
  try {
    var folder = DriveApp.getFolderById(FOLDER_EXPERIENCES);
    return {
      success: true,
      driveOk: true,
      folderName: folder.getName(),
      hint: "ה-Web App מורשה ל-Drive. אפשר להעלות תמונות.",
    };
  } catch (err) {
    return {
      success: false,
      driveOk: false,
      error: String(err),
      hint:
        "ה-Web App עדיין לא מורשה ל-Drive. Deploy → Manage deployments → עיפרון → Execute as: Me → New version → Deploy. ואז הריצו authorizeDrive שוב.",
    };
  }
}

// =========================
// POST
// =========================
function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const action = data.action;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureAllSheets_(ss);

    if (action === "createEvent") {
      const sheet = ss.getSheetByName(SHEET_EVENTS);
      appendByHeaders(sheet, {
        id: data.id || "",
        ownerId: data.ownerId || "",
        ownerName: data.ownerName || "",
        girlName: data.girlName || "",
        familyName: data.familyName || "",
        date: data.date || "",
        time: data.time || "",
        location: data.location || "",
        address: data.address || "",
        menu: data.menu || "",
        hideAttendees: data.hideAttendees === undefined ? false : data.hideAttendees,
        image: data.image || "",
        timestamp: new Date(),
        phone: data.phone || "",
        role: data.role || "",
      });
      // שמירת תאריך/שעה כטקסט כדי שגיליון לא יזיז אזור זמן
      const newRow = sheet.getLastRow();
      setTextCell_(sheet, newRow, "date", data.date || "");
      setTextCell_(sheet, newRow, "time", data.time || "");
      return json({ success: true });
    }

    if (action === "updateEvent") {
      const sheet = ss.getSheetByName(SHEET_EVENTS);
      const row = findRowById(sheet, "id", data.eventId);
      if (row < 2) return json({ success: false, error: "Event not found" });

      if (data.date !== undefined) setTextCell_(sheet, row, "date", data.date);
      if (data.time !== undefined) setTextCell_(sheet, row, "time", data.time);
      setIfProvided(sheet, row, "location", data.location);
      setIfProvided(sheet, row, "address", data.address);
      setIfProvided(sheet, row, "menu", data.menu);
      setIfProvided(sheet, row, "hideAttendees", data.hideAttendees);
      if (data.removeImage === true) {
        setIfProvided(sheet, row, "image", data.image || "");
      } else if (data.image !== undefined && data.image !== "") {
        setIfProvided(sheet, row, "image", data.image);
      }

      return json({ success: true, date: data.date, time: data.time });
    }

    if (action === "deleteEvent") {
      const sheet = ss.getSheetByName(SHEET_EVENTS);
      const row = findRowById(sheet, "id", data.eventId);
      if (row >= 2) sheet.deleteRow(row);
      return json({ success: true });
    }

    if (action === "vote") {
      const sheet = ss.getSheetByName(SHEET_RSVP);
      const rows = sheet.getDataRange().getValues();
      const hm = headerMap(sheet);
      let updated = false;

      for (let i = 1; i < rows.length; i++) {
        const eventId = String(rows[i][hm.eventId - 1] || "");
        const userId = String(rows[i][hm.userId - 1] || "");
        if (eventId === String(data.eventId) && userId === String(data.userId)) {
          sheet.getRange(i + 1, hm.status).setValue(data.status || "");
          if (hm.timestamp) sheet.getRange(i + 1, hm.timestamp).setValue(new Date());
          updated = true;
          break;
        }
      }

      if (!updated) {
        appendByHeaders(sheet, {
          eventId: data.eventId || "",
          userId: data.userId || "",
          userName: data.userName || "",
          status: data.status || "",
          timestamp: new Date(),
        });
      }

      return json({ success: true });
    }

    if (action === "createMessage") {
      const sheet = ss.getSheetByName(SHEET_MESSAGES);
      appendByHeaders(sheet, {
        id: data.id || "",
        userName: data.userName || "",
        messageText: data.messageText || "",
        timestamp: new Date(),
      });
      return json({ success: true });
    }

    if (action === "deleteMessage") {
      const sheet = ss.getSheetByName(SHEET_MESSAGES);
      const row = findRowById(sheet, "id", data.messageId);
      if (row >= 2) sheet.deleteRow(row);
      return json({ success: true });
    }

    if (action === "createCredit") {
      const sheet = ss.getSheetByName(SHEET_CREDITS);
      appendByHeaders(sheet, {
        id: data.id || "",
        eventId: data.eventId || "",
        category: data.category || "",
        professionalName: data.professionalName || "",
        contact: data.contact || "",
        phone: data.phone || "",
        link: data.link || "",
        note: data.note || "",
        tags: data.tags || "",
        sentiment: data.sentiment || "",
        ownerUserId: data.ownerUserId || "",
        ownerName: data.ownerName || "",
        ratings: data.ratings || "{}",
        createdAt: data.createdAt || new Date().toISOString(),
      });
      return json({ success: true });
    }

    if (action === "rateCredit") {
      const sheet = ss.getSheetByName(SHEET_CREDITS);
      const row = findRowById(sheet, "id", data.creditId);
      if (row < 2) return json({ success: false, error: "Credit not found" });

      setIfProvided(sheet, row, "ratings", data.ratings || "{}");
      if (data.sentiment !== undefined) {
        setIfProvided(sheet, row, "sentiment", data.sentiment || "");
      }

      return json({ success: true });
    }

    if (action === "uploadExperienceImage") {
      if (!FOLDER_EXPERIENCES || FOLDER_EXPERIENCES === "PUT_YOUR_DRIVE_FOLDER_ID_HERE") {
        return json({ success: false, error: "FOLDER_EXPERIENCES לא מוגדר" });
      }

      if (!data.base64Data) {
        return json({ success: false, error: "base64Data חסר" });
      }

      const folder = DriveApp.getFolderById(FOLDER_EXPERIENCES);
      const bytes = Utilities.base64Decode(data.base64Data);
      const blob = Utilities.newBlob(
        bytes,
        data.mimeType || "image/jpeg",
        data.fileName || ("exp_" + Date.now() + ".jpg")
      );

      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      return json({
        success: true,
        imageUrl: "https://drive.google.com/uc?export=view&id=" + file.getId(),
        fileId: file.getId(),
      });
    }

    if (action === "createExperience") {
      const sheet = ss.getSheetByName(SHEET_EXPERIENCES);

      if (!data.eventId) return json({ success: false, error: "eventId חסר" });
      if (!data.userId) return json({ success: false, error: "userId חסר" });
      if (!data.imageUrl) return json({ success: false, error: "imageUrl חסר" });

      appendByHeaders(sheet, {
        id: data.id || "",
        eventId: data.eventId || "",
        userId: data.userId || "",
        userName: data.userName || "",
        text: data.text || "",
        imageUrl: data.imageUrl || "",
        createdAt: data.createdAt || new Date().toISOString(),
      });

      return json({ success: true });
    }

    if (action === "deleteExperience") {
      const sheet = ss.getSheetByName(SHEET_EXPERIENCES);
      const row = findRowById(sheet, "id", data.experienceId);
      if (row >= 2) sheet.deleteRow(row);
      return json({ success: true });
    }

    if (action === "deleteCredit") {
      const sheet = ss.getSheetByName(SHEET_CREDITS);
      const row = findRowById(sheet, "id", data.creditId);
      if (row >= 2) sheet.deleteRow(row);
      return json({ success: true });
    }

    // רישום/עדכון משתמש (upsert לפי id, ואם אין — לפי טלפון או שם הורה+ילדה)
    if (action === "registerUser") {
      const sheet = ss.getSheetByName(SHEET_USERS);
      let row = data.id ? findRowById(sheet, "id", data.id) : -1;
      if (row < 2) row = findUserRowByNaturalKey_(sheet, data);
      if (row >= 2) {
        setIfProvided(sheet, row, "id", data.id);
        setIfProvided(sheet, row, "parentName", data.parentName);
        setIfProvided(sheet, row, "girlName", data.girlName);
        setIfProvided(sheet, row, "familyName", data.familyName);
        setIfProvided(sheet, row, "role", data.role);
        setIfProvided(sheet, row, "phone", data.phone);
        setIfProvided(sheet, row, "lastSeen", new Date());
      } else {
        appendByHeaders(sheet, {
          id: data.id || "",
          parentName: data.parentName || "",
          girlName: data.girlName || "",
          familyName: data.familyName || "",
          role: data.role || "",
          phone: data.phone || "",
          createdAt: new Date(),
          lastSeen: new Date(),
        });
      }
      return json({ success: true });
    }

    if (action === "deleteUser") {
      const sheet = ss.getSheetByName(SHEET_USERS);
      const row = findRowById(sheet, "id", data.userId);
      if (row >= 2) sheet.deleteRow(row);
      return json({ success: true });
    }

    // מחיקת כל השורות בגיליון (משאיר את שורת הכותרת)
    if (action === "clearSheet") {
      const map = {
        events: SHEET_EVENTS,
        rsvps: SHEET_RSVP,
        rsvp: SHEET_RSVP,
        messages: SHEET_MESSAGES,
        credits: SHEET_CREDITS,
        experiences: SHEET_EXPERIENCES,
        users: SHEET_USERS,
      };
      const name = map[String(data.target || "").toLowerCase()];
      if (!name) return json({ success: false, error: "Unknown target: " + data.target });
      clearSheetRows_(ss.getSheetByName(name));
      return json({ success: true });
    }

    // מחיקת כל הנתונים מכל הגיליונות
    if (action === "deleteAllData") {
      [SHEET_EVENTS, SHEET_RSVP, SHEET_MESSAGES, SHEET_CREDITS, SHEET_EXPERIENCES, SHEET_USERS].forEach(function (n) {
        clearSheetRows_(ss.getSheetByName(n));
      });
      return json({ success: true });
    }

    return json({ success: false, error: "Unknown action: " + action });
  } catch (err) {
    return json({ success: false, error: String(err) });
  }
}

// =========================
// התקנת גיליונות / עמודות
// =========================
function ensureAllSheets_(ss) {
  Object.keys(SHEET_HEADERS).forEach(function (name) {
    ensureSheetHeaders_(ss, name, SHEET_HEADERS[name]);
  });
}

function ensureSheetHeaders_(ss, sheetName, requiredHeaders) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    sheet.setFrozenRows(1);
    return;
  }

  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var normalized = headers.map(function (h) {
    return String(h || "").trim();
  });

  var isEmptyHeader = !normalized[0] || normalized.every(function (h) {
    return !h;
  });
  if (isEmptyHeader) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    sheet.setFrozenRows(1);
    return;
  }

  var present = {};
  normalized.forEach(function (h) {
    if (h) present[h] = true;
  });

  var missing = requiredHeaders.filter(function (h) {
    return !present[h];
  });

  if (missing.length) {
    sheet.getRange(1, normalized.length + 1, 1, missing.length).setValues([missing]);
  }
  sheet.setFrozenRows(1);
}

// מוחק את כל שורות הנתונים ומשאיר את שורת הכותרת
function clearSheetRows_(sheet) {
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }
}

// =========================
// HELPERS
// =========================
function getSheetData(sheet) {
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values.shift().map(function (h) {
    return String(h || "").trim();
  });

  return values
    .filter(function (row) {
      return row.some(function (cell) {
        return cell !== "" && cell !== null;
      });
    })
    .map(function (row) {
      const obj = {};
      headers.forEach(function (header, index) {
        if (header) obj[header] = formatSheetCell_(header, row[index]);
      });
      return obj;
    });
}

// מחזיר תאריך/שעה כטקסט קבוע (מונע הזזות אזור זמן ב-JSON)
function formatSheetCell_(header, value) {
  if (value === "" || value === null || value === undefined) return "";
  const tz = Session.getScriptTimeZone() || "Asia/Jerusalem";
  if (header === "date") {
    if (value instanceof Date) {
      return Utilities.formatDate(value, tz, "yyyy-MM-dd");
    }
    if (typeof value === "number" && value > 30000) {
      var d = new Date(Math.round((value - 25569) * 86400000));
      return Utilities.formatDate(d, tz, "yyyy-MM-dd");
    }
    var s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return s;
  }
  if (header === "time") {
    if (value instanceof Date) {
      return Utilities.formatDate(value, tz, "HH:mm");
    }
    if (typeof value === "number" && value > 0 && value < 1) {
      var totalMinutes = Math.round(value * 24 * 60);
      var h = Math.floor(totalMinutes / 60) % 24;
      var m = totalMinutes % 60;
      return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
    }
    var t = String(value).trim();
    if (/^\d{1,2}:\d{2}/.test(t)) return t.slice(0, 5);
    return t;
  }
  return value;
}

function headerMap(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach(function (h, idx) {
    map[String(h || "").trim()] = idx + 1; // 1-based
  });
  return map;
}

function appendByHeaders(sheet, obj) {
  const maxCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, maxCol).getValues()[0];
  const row = headers.map(function (h) {
    const key = String(h || "").trim();
    return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : "";
  });
  sheet.appendRow(row);
}

function findRowById(sheet, idHeader, idValue) {
  const hm = headerMap(sheet);
  const idCol = hm[idHeader];
  if (!idCol) return -1;

  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idCol - 1]) === String(idValue)) {
      return i + 1; // sheet row number
    }
  }
  return -1;
}

function setIfProvided(sheet, rowNumber, headerName, value) {
  if (value === undefined) return;
  const hm = headerMap(sheet);
  const col = hm[headerName];
  if (!col) return;
  sheet.getRange(rowNumber, col).setValue(value);
}

// מאתר שורת משתמש לפי טלפון, ואם אין — לפי שם הורה+ילדה+משפחה (מונע כפילויות)
function findUserRowByNaturalKey_(sheet, data) {
  const hm = headerMap(sheet);
  const values = sheet.getDataRange().getValues();
  const norm = function (v) {
    return String(v || "").trim().toLowerCase();
  };
  const phone = norm(data.phone);
  const parent = norm(data.parentName);
  const girl = norm(data.girlName);
  const family = norm(data.familyName);
  for (let i = 1; i < values.length; i++) {
    const rowPhone = norm(values[i][hm.phone - 1]);
    if (phone && rowPhone && rowPhone === phone) return i + 1;
    const rowParent = norm(values[i][hm.parentName - 1]);
    const rowGirl = norm(values[i][hm.girlName - 1]);
    const rowFamily = norm(values[i][hm.familyName - 1]);
    if (parent && girl && rowParent === parent && rowGirl === girl && rowFamily === family) {
      return i + 1;
    }
  }
  return -1;
}

// כותב ערך כטקסט בלבד (מונע המרת תאריך/שעה אוטומטית עם הזזת אזור זמן)
function setTextCell_(sheet, rowNumber, headerName, value) {
  const hm = headerMap(sheet);
  const col = hm[headerName];
  if (!col) return;
  const range = sheet.getRange(rowNumber, col);
  range.clearContent();
  range.setNumberFormat("@");
  range.setValue(value === undefined || value === null ? "" : String(value));
}

function json(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
