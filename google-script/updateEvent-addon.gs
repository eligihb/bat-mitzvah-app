// הוסף את הבלוק הזה ל-doPost ב-Google Apps Script (לפני deleteEvent)

    // =====================
    // UPDATE EVENT
    // =====================

    if (action === "updateEvent") {

      const sheet = ss.getSheetByName(SHEET_EVENTS);
      const rows = sheet.getDataRange().getValues();

      for (let i = 1; i < rows.length; i++) {

        if (rows[i][0] === data.eventId) {

          sheet.getRange(i + 1, 5).setValue(data.date);
          sheet.getRange(i + 1, 6).setValue(data.time);
          sheet.getRange(i + 1, 7).setValue(data.location);
          sheet.getRange(i + 1, 8).setValue(data.address);
          sheet.getRange(i + 1, 9).setValue(data.menu);
          sheet.getRange(i + 1, 10).setValue(data.hideAttendees);

          if (data.image) {
            sheet.getRange(i + 1, 11).setValue(data.image);
          }

          break;
        }
      }

      return json({ success: true });
    }
