# התקנת Google Sheets + Apps Script

## שלב 1 — גיליון (Sheets)

1. פתח את הגיליון המקושר ל-Apps Script.
2. ב-Apps Script בחר פונקציה: **`setupBatMitzvahSheets`** → **Run** (הרשאות בפעם הראשונה).
3. הפונקציה:
   - יוצרת טאבים חסרים: `Events`, `RSVP`, `Messages`, `Credits`, `Experiences`
   - מוסיפה **עמודות חסרות** (לא מוחקת נתונים קיימים)

### עמודות נדרשות (אם מוסיפים ידנית)

| גיליון | כותרות שורה 1 |
|--------|----------------|
| **Events** | id, ownerId, ownerName, girlName, **familyName**, date, time, location, address, menu, hideAttendees, image, timestamp, phone, role |
| **RSVP** | eventId, userId, userName, status, timestamp |
| **Messages** | id, userName, messageText, timestamp |
| **Credits** | id, eventId, category, professionalName, contact, phone, link, note, tags, sentiment, ownerUserId, ownerName, ratings, createdAt |
| **Experiences** | id, eventId, userId, userName, text, imageUrl, createdAt |

> **מחיקת הודעות/תמונות** — לא צריך עמודה חדשה. מספיק ש-`id` בעמודה הראשונה (או בעמודת `id` לפי כותרת).

אם חסרה **familyName** ב-Events — זו הסיבה הנפוצה לתאריכים שבורים. הרץ `setupBatMitzvahSheets` או הוסף את העמודה אחרי `girlName`.

---

## שלב 2 — סקריפט

1. העתק את כל התוכן מ-`BACKEND_V2.gs` לעורך Apps Script (החלף את `doGet` / `doPost` הישנים).
2. מחק קבצים ישנים כמו `updateEvent-addon.gs` אם קיימים — הם עלולים לדרוס עדכוני תאריך.
3. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
4. אם נוצר URL חדש — עדכן ב-`js/config.js` בשדה `apiUrl`.

---

## פעולות שנתמכות

`createEvent`, `updateEvent`, `deleteEvent`, `vote`, `createMessage`, **`deleteMessage`**, `createCredit`, `rateCredit`, `uploadExperienceImage`, `createExperience`, **`deleteExperience`**
