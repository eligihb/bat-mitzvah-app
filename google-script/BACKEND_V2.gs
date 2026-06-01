const SHEET_EVENTS = "Events";
const SHEET_RSVP = "RSVP";
const SHEET_MESSAGES = "Messages";
const SHEET_CREDITS = "Credits";
const SHEET_EXPERIENCES = "Experiences";

// תיקיית דרייב לתמונות אלבום
const FOLDER_EXPERIENCES = "1MljLXWRmcrBJ3mWosLrliCyytmasy8ti";

// =========================
// GET
// =========================
function doGet() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    return json({
      success: true,
      events: getSheetData(ss.getSheetByName(SHEET_EVENTS)),
      rsvps: getSheetData(ss.getSheetByName(SHEET_RSVP)),
      messages: getSheetData(ss.getSheetByName(SHEET_MESSAGES)),
      credits: getSheetData(ss.getSheetByName(SHEET_CREDITS)),
      experiences: getSheetData(ss.getSheetByName(SHEET_EXPERIENCES)),
    });
  } catch (err) {
    return json({ success: false, error: String(err) });
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
      return json({ success: true });
    }

    if (action === "updateEvent") {
      const sheet = ss.getSheetByName(SHEET_EVENTS);
      const row = findRowById(sheet, "id", data.eventId);
      if (row < 2) return json({ success: false, error: "Event not found" });

      setIfProvided(sheet, row, "date", data.date);
      setIfProvided(sheet, row, "time", data.time);
      setIfProvided(sheet, row, "location", data.location);
      setIfProvided(sheet, row, "address", data.address);
      setIfProvided(sheet, row, "menu", data.menu);
      setIfProvided(sheet, row, "hideAttendees", data.hideAttendees);
      if (data.image !== undefined && data.image !== "") {
        setIfProvided(sheet, row, "image", data.image);
      }

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

    if (action === "deleteEvent") {
      const sheet = ss.getSheetByName(SHEET_EVENTS);
      const row = findRowById(sheet, "id", data.eventId);
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

    return json({ success: false, error: "Unknown action: " + action });
  } catch (err) {
    return json({ success: false, error: String(err) });
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

  return values.map(function (row) {
    const obj = {};
    headers.forEach(function (header, index) {
      obj[header] = row[index];
    });
    return obj;
  });
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
  const hm = headerMap(sheet);
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

function json(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
