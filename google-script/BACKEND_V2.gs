/**
 * הדבק קובץ זה ל-Google Apps Script (מחליף/משלים doGet+doPost).
 * נדרש לעדכן FOLDER_EXPERIENCES עם מזהה תיקיית הדרייב שלך.
 */

const SHEET_EVENTS = "Events";
const SHEET_RSVP = "RSVP";
const SHEET_MESSAGES = "Messages";
const SHEET_CREDITS = "Credits";
const SHEET_EXPERIENCES = "Experiences";
const FOLDER_EXPERIENCES = "1MljLXWRmcrBJ3mWosLrliCyytmasy8ti";

function doGet() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const events = getSheetData(ss.getSheetByName(SHEET_EVENTS));
    const rsvps = getSheetData(ss.getSheetByName(SHEET_RSVP));
    const messages = getSheetData(ss.getSheetByName(SHEET_MESSAGES));
    const credits = getSheetData(ss.getSheetByName(SHEET_CREDITS));
    const experiences = getSheetData(ss.getSheetByName(SHEET_EXPERIENCES));

    return json({ success: true, events, rsvps, messages, credits, experiences });
  } catch (err) {
    return json({ success: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || "{}");
    const action = data.action;
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (action === "createEvent") {
      const sheet = ss.getSheetByName(SHEET_EVENTS);
      sheet.appendRow([
        data.id,
        data.ownerId,
        data.ownerName,
        data.girlName,
        data.familyName || "",
        data.date,
        data.time,
        data.location,
        data.address,
        data.menu,
        data.hideAttendees,
        data.image,
        new Date(),
        data.phone,
        data.role,
      ]);
      return json({ success: true });
    }

    if (action === "updateEvent") {
      const sheet = ss.getSheetByName(SHEET_EVENTS);
      const rows = sheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]) === String(data.eventId)) {
          // date,time,location,address,menu,hide,image
          sheet.getRange(i + 1, 6).setValue(data.date);
          sheet.getRange(i + 1, 7).setValue(data.time);
          sheet.getRange(i + 1, 8).setValue(data.location);
          sheet.getRange(i + 1, 9).setValue(data.address);
          sheet.getRange(i + 1, 10).setValue(data.menu);
          sheet.getRange(i + 1, 11).setValue(data.hideAttendees);
          if (data.image) sheet.getRange(i + 1, 12).setValue(data.image);
          break;
        }
      }
      return json({ success: true });
    }

    if (action === "deleteEvent") {
      const sheet = ss.getSheetByName(SHEET_EVENTS);
      const rows = sheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]) === String(data.eventId)) {
          sheet.deleteRow(i + 1);
          break;
        }
      }
      return json({ success: true });
    }

    if (action === "vote") {
      const sheet = ss.getSheetByName(SHEET_RSVP);
      const rows = sheet.getDataRange().getValues();
      let updated = false;
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]) === String(data.eventId) && String(rows[i][1]) === String(data.userId)) {
          sheet.getRange(i + 1, 4).setValue(data.status);
          sheet.getRange(i + 1, 5).setValue(new Date());
          updated = true;
        }
      }
      if (!updated) {
        sheet.appendRow([data.eventId, data.userId, data.userName, data.status, new Date()]);
      }
      return json({ success: true });
    }

    if (action === "createMessage") {
      const sheet = ss.getSheetByName(SHEET_MESSAGES);
      sheet.appendRow([data.id, data.userName, data.messageText, new Date()]);
      return json({ success: true });
    }

    if (action === "deleteMessage") {
      const sheet = ss.getSheetByName(SHEET_MESSAGES);
      const rows = sheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]) === String(data.messageId)) {
          sheet.deleteRow(i + 1);
          break;
        }
      }
      return json({ success: true });
    }

    if (action === "createCredit") {
      const sheet = ss.getSheetByName(SHEET_CREDITS);
      sheet.appendRow([
        data.id,
        data.eventId,
        data.category,
        data.professionalName,
        data.contact || "",
        data.phone || "",
        data.link || "",
        data.note || "",
        data.tags || "",
        data.sentiment || "",
        data.ownerUserId,
        data.ownerName,
        data.ratings || "{}",
        data.createdAt || new Date().toISOString(),
      ]);
      return json({ success: true });
    }

    if (action === "rateCredit") {
      const sheet = ss.getSheetByName(SHEET_CREDITS);
      const rows = sheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]) === String(data.creditId)) {
          // ratings=13, sentiment=10 לפי הסדר החדש
          sheet.getRange(i + 1, 13).setValue(data.ratings || "{}");
          if (data.sentiment !== undefined) {
            sheet.getRange(i + 1, 10).setValue(data.sentiment || "");
          }
          break;
        }
      }
      return json({ success: true });
    }

    if (action === "uploadExperienceImage") {
      const folder = DriveApp.getFolderById(FOLDER_EXPERIENCES);
      const bytes = Utilities.base64Decode(data.base64Data || "");
      const blob = Utilities.newBlob(bytes, data.mimeType || "image/jpeg", data.fileName || ("exp_" + Date.now() + ".jpg"));
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      const url = "https://drive.google.com/uc?export=view&id=" + file.getId();
      return json({ success: true, imageUrl: url, fileId: file.getId() });
    }

    if (action === "createExperience") {
      const sheet = ss.getSheetByName(SHEET_EXPERIENCES);
      sheet.appendRow([
        data.id,
        data.eventId || "",
        data.userId,
        data.userName,
        data.text || "",
        data.imageUrl || "",
        data.createdAt || new Date().toISOString(),
      ]);
      return json({ success: true });
    }

    return json({ success: false, error: "Unknown action" });
  } catch (err) {
    return json({ success: false, error: String(err) });
  }
}

function getSheetData(sheet) {
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values.shift();
  return values.map((row) => {
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = row[i];
    });
    return obj;
  });
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
