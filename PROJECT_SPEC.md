# איפיון מימוש מלא — ישומון אירועי בת מצווה (גרסה 113.0)

מסמך זה מתאר את היישומון ברמת מימוש מדויקת. מתכנת שמקבל מסמך זה אמור לבנות את אותו מוצר אחד-לאחד: אותו DOM, אותו state, אותם זרימות, אותו חוזה API, ואותם כללים עסקיים.

---

## חלק א׳ — סטאק וארכיטקטורה

- **Frontend**: HTML יחיד + CSS + JavaScript "vanilla" (ללא build, ללא framework). Tailwind נטען מ-CDN (`https://cdn.tailwindcss.com`), Font Awesome 6.5.2 מ-CDN. שפה עברית, `dir="rtl"`.
- **Backend**: Google Apps Script Web App מעל Google Sheets. תיקיית Google Drive לקבצי מדיה.
- **אירוח**: GitHub Pages, ריפו `eligihb/bat-mitzvah-app`, ענף `main`.
- **תקשורת**: בקשה אחת `GET` (משיכת הכל) ובקשות `POST` עם גוף JSON. אין אימות שרת — ההרשאות הן בצד הלקוח בלבד.
- **PWA**: `manifest.json` + אייקונים → ניתן להוספה למסך הבית כאפליקציה במסך מלא.

### עץ קבצים
```
index.html                    — כל ה-DOM
manifest.json                 — הגדרות PWA
css/styles.css                — כל העיצוב
js/config.js                  — APP_CONFIG
js/api.js                     — אובייקט Api + נורמליזציה + פענוח תאריכים
js/app.js                     — כל הלוגיקה (state + render + handlers)
assets/icon-192.png           — אייקון 192
assets/icon-512.png           — אייקון 512
google-script/BACKEND_V2.gs   — קוד Apps Script מלא
google-script/SETUP.md        — מדריך פריסה
PROJECT_SPEC.md               — מסמך זה
```

---

## חלק ב׳ — APP_CONFIG (`js/config.js`)

אובייקט גלובלי `APP_CONFIG`:
```
title: "ישומון אירועי בת מצווה"
classInfo: "כנפי רוח ו׳-4 • תשפ״ו"
scriptUrl: "<כתובת ה-Web App של Apps Script /exec>"
storage: { user: "bm_user" }
phonePrefixes: ["051".."059"]
menuOptions: [{"",""}, {"חלבי 🥛"}, {"בשרי 🥩"}]
defaultRole: "אמא"
placeholderImage: "<data:image/svg+xml ... ילדה מצוירת על רקע ורוד-סגול>"
syncIntervalMs: 60000
adminPassword: "1234"
adminPhone: "054-2452100"
```
הערה: ב-`api.js` נעשה שימוש ב-`APP_CONFIG.scriptUrl`. ודא ששם השדה תואם.

---

## חלק ג׳ — מבנה ה-DOM (`index.html`)

סדר האלמנטים בגוף:
1. `#splashScreen.splash-screen` → `.splash-inner` ובו: `img.splash-logo` (icon-512), `.splash-title` ("אירועי בת מצווה"), `.splash-sub` (classInfo), `.splash-dots` (3 ספאנים).
2. `#appShell` ובו:
   - **`#loginScreen.login-screen`**: רקע דקורטיבי (`.login-bg` עם "12" וספרקלים), כרטיס `.login-card`:
     - כותרת "ברוכים הבאים לישומון אירועי בת מצווה" + `.login-class-badge`.
     - `form#loginForm`:
       - `.role-switch` עם שני כפתורים `.roleBtn` (`data-role="אמא"`, `data-role="אבא"`).
       - `grid grid-cols-2`:
         - שורה 1: `#parentName` (label "שם ההורה *") | `#familyName` (label "שם משפחה *").
         - שורה 2: `#girlName` (label "שם הילדה *") | `div.twin-col` ובו `.twin-row` (label "אחות תאומה" + `button#toggleTwin.twin-add-btn` עם אייקון +) ו-`#twinFieldWrap.twin-field-wrap.is-hidden` עם `#twinName`.
       - טלפון: `#phonePrefix` (select 051–059) + 7 שדות `.phoneCell` (`maxlength=1`, `inputmode=numeric`), ב-`dir=ltr`.
       - `#adminPassWrap.hidden` עם `#adminPass` (password).
       - `button[type=submit].login-submit` ("כניסה לישומון").
       - `.login-footer-inline` ("יישומון זה נבנה על ידי YE ©") + `.login-version` ("גרסה X.X").
   - **`#appScreen.hidden.app-main`**:
     - `header` sticky: `#headerGreeting`, כפתורים `#callBtn`,`#waBtn`,`#editProfileBtn`, `#headerRole`, `#logoutBtn`.
     - `#syncStatus.hidden`.
     - `#upcomingBar` (סרגל אירועים קרובים).
     - טאבים (כל אחד `div.tab`): `#eventsTab`, `#calendarTab`, `#adminTab`, `#creditsTab`, `#experiencesTab`, `#messagesTab` (ל-messages יש תיבת כתיבה `#messageInput` + `#publishMessageBtn` + `#messagesContainer`).
   - `button#addBtn.hidden.fixed` ("הוסף אירוע", צף תחתון-ימין).
   - **`#eventModal.hidden.fixed`** (מודל): `#modalTitle`, `#closeModal`, `form#eventForm`:
     - `#eventDate` (date), `#eventTime` (time), `#eventLocation`, `#eventAddress`.
     - תפריט: `.menu-row` עם שני כפתורים `.menu-choice-btn` (`data-menu-choice="חלבי 🥛"`, `"בשרי 🥩"`) + `#eventMenuOther` (input "אחר").
     - `#girlImage` (file image) + `#currentImageHint.hidden`.
     - `#shabbatWarning.hidden` (קיים ב-markup, ללא לוגיקה פעילה — אינרטי).
     - `#eventSubmitBtn` + `#eventProgressWrap.hidden` (פס התקדמות `#eventProgressBar` + `#eventProgressText`).
   - **`#bottomNav.hidden.fixed`**: כפתורי `.nav-tab` עם `data-tab`: events, calendar, messages, credits, experiences, `#navAdmin[data-tab=admin].hidden`, ו-`#navAdd` (לא data-tab — מטופל בנפרד).
3. `#toastMsg.toast.hidden`.
4. סקריפטים בסוף: `config.js`, `api.js`, `app.js` (כל אחד עם `?v=NN` ל-cache busting).

מטא-תגיות ב-`<head>`: `theme-color #a855f7`, `link rel=icon` (icon-192), `apple-touch-icon` (icon-192), `link rel=manifest`, `apple-mobile-web-app-capable=yes`, status-bar-style `black-translucent`, `apple-mobile-web-app-title "בת מצווה"`.

---

## חלק ד׳ — מודל נתונים (Google Sheets + Drive)

חמישה גיליונות. שורה 1 = כותרות מדויקות (case/spaces מנורמלים בקריאה).

- **Events**: `id, ownerId, ownerName, girlName, familyName, date, time, location, address, menu, hideAttendees, image, timestamp, phone, role`
  - `date` בפורמט `YYYY-MM-DD`, `time` בפורמט `HH:MM`. `hideAttendees` בוליאני. `image` = data-URI או URL או ריק.
- **RSVP**: `eventId, userId, userName, status, timestamp` — `status ∈ {yes, maybe, no}`. ייחודי לפי (eventId,userId).
- **Messages**: `id, userName, messageText, timestamp`.
- **Credits**: `id, eventId, category, professionalName, contact, phone, link, note, tags, sentiment, ownerUserId, ownerName, ratings, createdAt`
  - `ratings`: מחרוזת JSON. `{ "<userId>": <1..5>, "<userId>_event": <1..5> }` (השני = דירוג כללי לאירוע).
  - `tags`: מופרד `|`, מכיל מרקרים: `__provider__` (ספק שנוסף ידנית, ללא דירוג), `__guest__` (פרגון אורח), `__owner__` (המלצת בעל אירוע).
  - `sentiment`: בד"כ `"like"`.
- **Experiences**: `id, eventId, userId, userName, text, imageUrl, createdAt`
  - `text` = סוג מדיה: `"image"` או `"video"`.
  - `imageUrl` = `https://drive.google.com/uc?export=view&id=<id>` או data-URI (גיבוי מקומי).
  - `eventId` עשוי להיות `manual:<שם>` לאירוע חיצוני.
- **Drive**: תיקייה `FOLDER_EXPERIENCES = "1MljLXWRmcrBJ3mWosLrliCyytmasy8ti"`. כל קובץ מוגדר ANYONE_WITH_LINK / VIEW.

---

## חלק ה׳ — חוזה ה-API (Apps Script, `BACKEND_V2.gs`)

`doGet()` → `{ success:true, events[], rsvps[], messages[], credits[], experiences[] }` (כל אחד מערך אובייקטים לפי כותרות). מריץ `ensureAllSheets_`.

`doPost(e)` → קורא `JSON.parse(e.postData.contents)`, מנתב לפי `action`, מריץ `ensureAllSheets_`. כל התגובות `{success:true}` או `{success:false,error}`.

| action | שדות נכנסים | אפקט |
|--------|--------------|------|
| createEvent | id, ownerId, ownerName, girlName, familyName, date, time, location, address, menu, hideAttendees, image, phone, role | appendByHeaders ל-Events (+timestamp=now) |
| updateEvent | eventId + (date,time,location,address,menu,hideAttendees,image) | מאתר לפי id ומעדכן רק שדות שסופקו; image רק אם לא ריק |
| deleteEvent | eventId | מוחק שורה |
| vote | eventId, userId, userName, status | מעדכן שורת RSVP קיימת או מוסיף חדשה (+timestamp) |
| createMessage | id, userName, messageText | appendByHeaders ל-Messages (+timestamp) |
| deleteMessage | messageId | מוחק שורה לפי id |
| createCredit | id, eventId, category, professionalName, contact, phone, link, note, tags, sentiment, ownerUserId, ownerName, ratings, createdAt | appendByHeaders ל-Credits |
| rateCredit | creditId, ratings, sentiment? | מעדכן ratings (ו-sentiment אם סופק) |
| uploadExperienceImage | fileName, mimeType, base64Data | יוצר קובץ ב-Drive, מחזיר `{imageUrl, fileId}` |
| createExperience | id, eventId, userId, userName, text, imageUrl, createdAt | appendByHeaders ל-Experiences (דורש eventId, userId, imageUrl) |
| deleteExperience | experienceId | מוחק שורה לפי id |

פונקציות עזר בסקריפט: `headerMap` (שם עמודה→אינדקס 1-based), `appendByHeaders` (כותב רק לעמודות קיימות), `findRowById`, `setIfProvided`, `getSheetData` (מסנן שורות ריקות), `ensureSheetHeaders_`/`ensureAllSheets_` (יוצר טאבים/עמודות חסרים מתוך `SHEET_HEADERS`), `setupBatMitzvahSheets` (הרצה ידנית חד-פעמית), `json`.

**`js/api.js`** — אובייקט `Api`:
- `fetchAll()`: `GET scriptUrl`, זורק שגיאה אם `!success`.
- `post(payload)`: `POST` עם `Content-Type: text/plain;charset=utf-8`, גוף JSON, זורק `Error(data.error)` אם `!success`.
- מתודות: `createEvent, vote, createMessage, createCredit, rateCredit, createExperience, uploadExperienceImage, deleteMessage, deleteExperience, deleteEvent, updateEvent` — כולן עוטפות `post({action,...})`.
- `normalizePayload(events, rsvps, messages, credits, experiences)` מחזיר אובייקטים נקיים ללקוח:
  - RSVP מקובץ למפה `rsvpByEvent[eventId][userId]=status`.
  - אירוע → `{id, ownerId, ownerName, girlName, familyName, date, time, location, address, menu, image, hideGuests(bool), rsvp{}}`.
  - **תיקון הסטת עמודות**: אם `date` ריק אך `familyName` מכיל תאריך תקין → משתמשים בו כתאריך, ואם `date` הכיל שעה — היא הופכת ל-time, ו-familyName מתאפס.
  - הודעה → `{id, name, text, date(formatTimestamp), sortKey}` ממוין יורד.
  - קרדיט → `{id, eventId, category, professionalName, contact, phone, link, note, tags, sentiment, ownerUserId, ownerName, ratings(object)}`.
  - חוויה → `{id, eventId, userId, userName, text, imageUrl, createdAt}` ממוין יורד לפי createdAt.

### אלגוריתמים של תאריך (api.js)
- `sheetDate(value)`: תומך מספר סריאלי של Sheets (`sheetSerialToDate`, בסיס 1899-12-30), מחרוזת ISO, `d.m.yyyy`, `yy-mm-dd`. מסנן שנים מחוץ ל-2020..2100 (מחזיר ריק). מחזיר `YYYY-MM-DD`.
- `sheetTime(value)`: תומך שבר יממה (0..1)→HH:MM, מחרוזת HH:MM, או תאריך מלא.
- `normalizeRowKeys`/`readField(row,[keys])`: קריאה ללא תלות ברישיות/רווחים בכותרות.

---

## חלק ו׳ — State ואחסון (`js/app.js`)

משתנים גלובליים: `currentUser, events[], messages[], credits[], experiences[], pendingCredits[], pendingExperiences[], pendingCreditEventId, creditScreen("home"), creditBoardExpandedProvider, guestEventScoreSelected(0), ownerEventScoreSelected(0), experiencesSelectedEventId, experiencesFilterEventId, calendarCursor(תחילת החודש הנוכחי), guestProviderState{}, ownerProviderState{}, guestCreditSelectedEventId, guestCreditManualEventName, guestCreditNoteDraft, guestCreditTagsSelected[], guestCreditFreshLoad(true), CREDIT_SERVICE_TYPES=["צילום","מקום אירוע","מצגת/סרטון","אוכל","עיצוב","הפעלה"], selectedRole, hideGuests, syncTimer, isSyncing, activeTab(מ-sessionStorage או "events"), editingEventId, editingEventImage, isSavingEvent, selectedEventMenuChoice, toastTimer`.

**localStorage**: `bm_user` (משתמש), `bm_credits`, `bm_experiences`, `bm_pending_credits`, `bm_pending_experiences`. **sessionStorage**: `bm_active_tab`.

`loadJson(key)`/`saveJson(key,data)` — עטיפות JSON ל-localStorage.

---

## חלק ז׳ — אתחול

ב-`DOMContentLoaded`: קריאה לכל ה-bind:
`bindPhoneCells, bindRoleButtons, bindTwinToggle, bindAdminAccessGate, bindLogin, bindModal, bindEventMenuControls, bindEventForm, bindNavigation, bindMessages, bindCredits, bindExperiences, bindFloatingAdd, bindLogout, bindProfileEdit`. אם קיים `currentUser` → `showApp()`. בכל מקרה `hideSplashAfterDelay()` (מסיר `#splashScreen` אחרי 2000ms עם fade של 600ms).

`renderAll()` = `renderHeader, renderUpcoming, renderEvents, renderCalendar, renderMessages, renderCredits, renderExperiences, renderAdminPanel, updateAddButton`.

`syncFromServer({silent})`: מונע ריצה כפולה (`isSyncing`). מושך `Api.fetchAll`, מנרמל, מציב `events/messages`, ממזג pending (`mergePendingCredits/Experiences`), שומר מטמון, `renderAll`. שגיאה → `setSyncStatus(...,true)` רק אם לא silent.
`startAutoSync` = `setInterval(syncFromServer silent, 60000)`. `stopAutoSync` מנקה.
`setSyncStatus(text,isError)`: מסתיר הכל אם לא שגיאה (הודעות מערכת לא מוצגות למשתמש); שגיאות מוצגות באדום.
`showToast(text)`: מציג `#toastMsg` 2600ms.

---

## חלק ח׳ — התחברות ופרופיל

- **תפקיד**: `bindRoleButtons` → לחיצה מעדכנת `selectedRole` ו-`updateRoleButtonStyles` (מחליף מחלקות role-mom/dad-active/idle).
- **תאומה**: `bindTwinToggle`/`setTwinFieldOpen(open)` — מציג/מסתיר `#twinFieldWrap`, מסובב את ה-+ (`is-active`), פוקוס/ניקוי.
- **תאי טלפון**: `bindPhoneCells` — מסנן לא-ספרות, קופץ לתא הבא, ומפעיל `updateAdminFieldVisibility`.
- **שער אדמין**: `updateAdminFieldVisibility` — חושף `#adminPassWrap` רק אם הטלפון שהוקלד שווה (מנורמל) ל-`adminPhone`. `getEnteredPhone` בונה `prefix-7ספרות`.
- **submit (`bindLogin`)**: ולידציה (parentName, girlName, familyName חובה). בונה `phone` רק אם 7 ספרות. בודק אם המשתמש זהה לשמור (parentName+girlName+familyName) → שומר id קיים, אחרת `crypto.randomUUID()`. `isAdmin = isAdminByPhoneAndPass(phone,adminPass)`. שומר ל-localStorage, `showApp()`.
- `currentUser` = `{id, role, parentName, girlName, familyName, twinName, phone, isAdmin}`.
- **showApp**: מסתיר login, מציג app+nav, מציג `#navAdmin` רק לאדמין, `guestCreditFreshLoad=true`, `switchTab(activeTab,false)`, sync שקט, `maybeNotifyOtherParentEvent`, `startAutoSync`.
- **logout**: confirm "להתנתק מהישומון?", מנקה state ו-storage, מאפס טופס, חוזר ל-login.
- **renderHeader**: ברכה לפי שעה (בוקר/צהריים/ערב טוב). אדמין → "מנהל מערכת". אחרת `"<role> של <girl[ ו<twin>]> <familyName>"`. `setContactActions`: כפתורי טלפון/וואטסאפ פעילים אם `normalizePhone(phone).length>=10` (tel: / wa.me/972...).
- **bindProfileEdit**: שלושה `prompt` (הורה/ילדה/משפחה); מעדכן `currentUser`, מעדכן אירועים בבעלותו עם השם הישן→חדש, `renderAll`, toast "הפרופיל עודכן".

---

## חלק ט׳ — אירועים

- **כפתור הוספה**: `bindFloatingAdd` — `#addBtn`→`openModalForCreate`. `#navAdd`→ אם קיים אירוע משפחתי (girlName+familyName תואמים) פותח עריכה שלו, אחרת יצירה. `updateAddButton` מסתיר את `#addBtn` אם כבר קיים אירוע למשתמש.
- **תפריט**: `bindEventMenuControls` — כפתור בורר קובע `selectedEventMenuChoice` ומאפס "אחר"; הקלדה ב"אחר" מאפסת בחירה. `getEventMenuValue` מעדיף "אחר". `setEventMenuValue` משחזר בעריכה.
- **openModalForEdit(id)**: רק אם `canManageEvent`. ממלא שדות, `editingEventId`, `editingEventImage`, `hideGuests`, מציג רמז תמונה קיימת, כותרת "עריכת אירוע", כפתור "שמירת שינויים ✓".
- **resetEventForm**: מאפס הכול, כותרת "הוספת אירוע", כפתור "פרסום אירוע 🚀".
- **bindEventForm (submit)**:
  - ולידציה: date,time,location,address,menu חובה.
  - **כלל ייחודיות**: לא ניתן ליצור/לשמור אם קיים אירוע אחר עם אותו `girlName` מנורמל (`trim+lowercase+single-space`) — חוץ מהאירוע הנערך. שגיאה: "כבר קיים אירוע לילדה הזו במערכת...".
  - תמונה: אם נבחר קובץ → `toBase64`; אחרת editingEventImage; אחרת placeholder.
  - עריכה → `Api.updateEvent`; יצירה → `Api.createEvent` (id חדש, owner=currentUser). `closeModal`, `syncFromServer`. כשל → alert.
  - `setEventSubmitLoading` מציג פס התקדמות וטקסט "שומר...".
- **deleteEventById**: רק `canManageEvent`, confirm "למחוק את האירוע של <girl>?", `Api.deleteEvent`, sync.
- **canManageEvent(event)**: true אם אדמין, או ownerId==currentUser.id, או (girlName==currentUser.girlName וגם familyName תואם).

### renderEvents (כרטיס לכל אירוע)
חישובים: `parseEventDateTime`, dayDiff מעוגל מתחילת היום, `isPastEvent=dayDiff<0`, `isTomorrowEvent=dayDiff===1`. `countdownLabel`: "האירוע התקיים"/"האירוע היום"/"עוד N ימים"/"תאריך לא זמין". תאריך ושעה ב-`he-IL`. תמונה דרך `sanitizeEventImage`.
מבנה כרטיס: `.event-card.event-card-shell.glass` + מחלקות `my-event-card`(אם בעלים), `past-event-card`(עבר). תוויות: "האירוע מתקיים בעוד יום", "האירוע שלי". אם `isFamily` → כפתורי עריכה (`data-edit-id`) ומחיקה (`data-delete-id`) בפינה שמאלית-עליונה. תמונה עגולה + שם "בת מצווה ל<girl> ✨" + תאריך/שעה + ספירה + תפריט. בלוק מיקום: 📍location, 🗺️address + כפתור Waze (`data-waze-address`). אם `!isFamily && !isPastEvent` → 3 כפתורי RSVP (`rsvp-btn`, `data-event-id`, `data-vote`). אם `!isPastEvent` → סיכום RSVP (מגיעים/אולי/לא) — מוסתר אם `hideGuests && !isFamily`; ל-isFamily כפתור הסתרה (`data-toggle-hide-id`). אם עבר ו-`!isOwnerEvent` → כפתור "הוספת קרדיט לאירוע זה" (`data-quick-credit-event`). אם עבר → בלוק "קרדיטים לאירוע שהתקיים" (עד 4 לא-providers).
- `rsvpClass(myVote,status)` קובע צבעי כפתור פעיל/לא.
- `vote(eventId,status)`: עדכון אופטימי ל-`event.rsvp[currentUser.id]`, `renderEvents`, `Api.vote`, sync; כשל → rollback + alert.
- `toggleEventGuestsVisibility(eventId)`: מתחלף `hideGuests`, אופטימי, `Api.updateEvent({eventId,hideAttendees})`; כשל → rollback + הודעה (טיפול נפרד ל-Unknown action).

### renderUpcoming (סרגל עליון)
- מסנן עתידיים (`dt>=now`), ממיין עולה, לוקח 3 הראשונים.
- אם ריק → "אין אירועים קרובים".
- מחשב `weekCount` (עד +7 ימים) ו-`monthCount` (עד +חודש).
- לכל אירוע שורה: `🎉 האירוע של <girl> <relativeDaysLabel>`.
- `relativeDaysLabel(date,now)`: <0→"התקיים", 0→"היום", 1→"בעוד יום", 2→"בעוד יומיים", 7→"בעוד שבוע", 14→"בעוד שבועיים", אחרת `"בעוד N ימים"`.
- שורת תחתית "לשבוע הקרוב: X | לחודש הקרוב: Y". לחיצה על הסרגל → טאב events.

### לוח שנה (renderCalendar)
- `calendarCursor` קובע חודש/שנה. כותרת ניווט: `data-cal-nav ∈ {year-prev,month-prev,month-next,year-next}`. שמות חודשים בעברית, ימים א..ש.
- תאים לכל יום בחודש; אירועים מסוננים לפי `e.date===YYYY-MM-DD`; כפתור צבעוני לכל אירוע (`calendarGirlColorClass` — hash של שם לפלטת ורוד/סגול). לחיצה (`data-calendar-event-id`) → טאב events + גלילה והדגשת הכרטיס.

### הודעות
- `bindMessages` → `#publishMessageBtn`→`publishMessage`. `publishMessage`: טקסט לא ריק, `Api.createMessage({id,userName,messageText})`, מנקה, sync.
- `renderMessages`: כרטיס לכל הודעה (שם, תאריך, טקסט) או "עדיין אין הודעות".
- מחיקת הודעה בודדת (אדמין) דרך פאנל ניהול.

---

## חלק י׳ — קרדיטים (`creditScreen`: home/guest/owner/board)

`bindCredits` מאזין ל-`#creditsTab` (delegation):
- `data-credit-screen` → מחליף מסך.
- `data-credit-provider-toggle` → toggle בחירת כרטיס ספק (`data-selected`, `is-selected`, ring), מעדכן `guestProviderState`/`ownerProviderState[key].selected`.
- `data-provider-star` → קובע ניקוד; מאיר כוכבים; **מסמן את הכרטיס אוטומטית כנבחר** (selected=true) ומעדכן score ב-state.
- `data-credit-tag` → toggle תגית ב-`guestCreditTagsSelected` (קיים בקוד אך לא בשימוש במסך הנוכחי).
- `data-open-provider-modal` → toggle טופס ספק inline (`#ownerInlineProviderForm`).
- `data-save-provider` → `addProviderFromModal`.
- `data-credit-board-provider` → הרחבת ספק בלוח.

`renderCredits` מנתב: home (3 כפתורים) / board / owner / guest.

### מסך guest (`renderGuestCreditsForm`)
- `select#creditEventId`: אופציה ריקה + **כל** האירועים מ-`allEventsSortedForCredit()` (עבר תחילה ואז עתיד) עם `eventOptionLabel` + אופציה `__external__`. שדה `#creditManualEvent` (חיצוני).
- כפתור "+ הוספת נותן שירות ידני" → טופס inline (קטגוריה מתוך `CREDIT_SERVICE_TYPES`+"אחר", שם, טלפון, אימייל).
- `#guestProvidersWrap`: כרטיס לכל שירות ב-`CREDIT_SERVICE_TYPES` (`refreshGuestProviders`): אייקון (`serviceIcon`), 5 כוכבים (`data-provider-star`, `data-provider-score-id`), `input[type=hidden]` עם `data-provider-name`/`data-provider-category`, `input` הערה.
- **פרגון כללי**: כותרת "✨ פרגון כללי על האירוע ✨" + `renderGlowStarRating("guestEventScoreWrap", guestEventScoreSelected)` (ללא תוויות). textarea הערה.
- כפתור פרסום `#publishGuestCreditBtn`.
- בחירת אירוע: לוגיקת `guestCreditFreshLoad` (ברענון מלא מתחילים ריק), `pendingCreditEventId` (מגיע מ"הוספת קרדיט לאירוע" בכרטיס), `onchange`→`refreshGuestProviders`.

### דירוג זוהר (`renderGlowStarRating`/`updateGlowStarRating`)
- `.glow-rating` (מלבן) ובו `.glow-rating-fill` (width=score*20%) ו-`.glow-rating-stars` (5 `.glow-star` עם `data-credit-score`).
- לחיצה על כוכב מעדכנת `guestEventScoreSelected` (toggle לאותו ערך מאפס), `updateGlowStarRating` מעדכן width/`has-score`/`is-on`.

### מסך owner (`renderOwnerCreditsForm`)
- `detectMyEventForOwnerCredit()`: מעדיף אירוע עבר בבעלות; אחרת כל אירוע בבעלות; אחרת כל אירוע שניתן לנהל; אחרת null.
- null → הודעה "לא נמצא אירוע שיצרת...".
- אירוע **שטרם התקיים** → מציג כרטיס אירוע + הודעה צהובה "האירוע טרם התקיים, הנך מוזמן/ת להמליץ לאחר האירוע 🌟" (ללא טופס).
- אירוע שהתקיים → `#ownerProvidersWrap` (`refreshOwnerProviders`: בסיס `CREDIT_SERVICE_TYPES` + ספקים קיימים לאירוע), כפתור הוספת ספק inline (כולל הערה), textarea, פרסום `#publishOwnerCreditBtn`.

### לוח (`renderCreditsBoard`)
- מקבץ קרדיטים שאינם providers לפי eventId; לכל אירוע מציג ספקים מ-`aggregateProviderScores` (שם, count, ממוצע, likes). הרחבה בלחיצה.

### פרסום
- `publishGuestCredits`: דורש אירוע ושאירוע עבר ("אפשר לפרגן רק אחרי שהאירוע התקיים") ולפחות כרטיס ספק נבחר עם דירוג>0. לכל כרטיס נבחר → `Api.createCredit` עם `tags=["__guest__",...tags]`, `ratings={userId:score, [userId_event]:eventScore?}`. הצלחה→מאפס state, עובר ל-board. כשל `Unknown action`→שמירה ל-`pendingCredits`+toast "נשמר מקומית".
- `publishOwnerCredits`: דורש אירוע שניתן לנהל; ספקים נבחרים עם דירוג; `tags="__owner__"`; דומה עם fallback מקומי.
- `addProviderFromModal`: דורש eventId+שם+קטגוריה; `Api.createCredit` עם `tags="__provider__"`, contact=טלפון|אימייל; sync; toast.
- עזר: `retryApiCall(fn,retries=1)` (ניסיון חוזר אחד עם השהיה 450ms), `mergePendingCredits` (איחוד לפי id), `aggregateProviderScores`, `collectProvidersForEvent`, `collectOwnerRecommendationTargets`, `isProviderEntry/isOwnerRecommendation/extractUserTags`, `serviceIcon`, `escapeHtmlAttr`, `manualEventLabelFromCredit`.
- `eventOptionLabel(event)`: `"האירוע של <girl> • <date he-IL> • (<status>)"` כאשר status = "התקיים" או `relativeDaysLabel`.
- `allEventsSortedForCredit()`: עבר (יורד) + עתיד (עולה). `pastEventsSortedDesc()`: עבר ממוין יורד. `isEventPastByDate`: התאריך ≤ היום.

---

## חלק י"א — חוויות (אלבום)

`bindExperiences`: delegation על `#experiencesTab` — `data-delete-experience-id` (אדמין) → `deleteExperienceById`.

`renderExperiences`:
- אזור העלאה: `#expEventId` (כל האירועים + `__external__`), `#expEventManual`, `#expImageFile` (`accept="image/*,video/*" multiple`), כיתוב "אפשר להעלות תמונות, מצגת או סרטון", `#addExperienceBtn`.
- אזור צפייה: `#expFilterEventId` ("כל האירועים" + אירועים שיש להם מדיה), `#expSelectAllBtn` ("סמן הכל"/"נקה בחירה"), `#expDownloadBtn` ("הורדה").
- רשימה (`#experiencesList`): media = `experiences.filter(imageUrl)`; מסונן לפי `experiencesFilterEventId`; מקובץ לפי eventId. לכל פריט: `.exp-check-wrap` עם `input.exp-select[data-url,data-name]`, כפתור מחיקה (אדמין), תג 🎬 לוידאו, `<video controls>` או `<img>`, כיתוב משתמש+תאריך. כותרת קבוצה: "האירוע של <girl> (N)".
- `experienceMediaType(exp)`: "video" אם `text=="video"` או סיומת וידאו ב-URL; אחרת "image".
- `toggleSelectAllExperiences`: מסמן/מנקה את כל `.exp-select` ומחליף תווית כפתור.
- `toDownloadUrl(url)`: ממיר קישור Drive `view`→`export=download&id=`.
- `downloadSelectedExperiences`: לכל מסומן יוצר `<a download>` ולוחץ בהשהיית 350ms*index; toast "מוריד N פריטים".
- `addExperienceFromForm`: דורש eventId+קבצים; גבול 45MB לקובץ; לכל קובץ: זיהוי וידאו (mime/סיומת), `toBase64`+`splitDataUrl`, `Api.uploadExperienceImage`→imageUrl, `Api.createExperience({...,text:isVideo?"video":"image"})`. כשל `Unknown action`→שמירה מקומית ל-`pendingExperiences` (data-URI). toast לפי כמות.
- `deleteExperienceById(id)`: אדמין, confirm, `Api.deleteExperience`, מסיר ממערכים+מטמון, sync.
- `mergePendingExperiences`: איחוד לפי id, מיון יורד לפי createdAt.

---

## חלק י"ב — פאנל ניהול (`renderAdminPanel`, אדמין בלבד)

- כותרת + ספירות (אירועים/הודעות/תמונות).
- כפתורים: `#adminRefreshBtn` (sync), `#adminDeleteAllEventsBtn`, `#adminDeleteAllMessagesBtn`, `#adminDeleteAllExperiencesBtn`.
- רשימת אירועים (כל אחד עם `data-admin-delete-id`) ורשימת הודעות (כל אחת עם `data-admin-delete-message-id`).
- `adminDeleteAllEvents/Messages/Experiences`: לולאה על הפריטים, סיכום הצלחות/כשלים, טיפול ב-Unknown action.

---

## חלק י"ג — ניווט

`bindNavigation`: `#bottomNav` (`data-tab`→`switchTab`). מאזיני delegation על `#eventsTab` (edit/delete/toggle-hide/quick-credit/rsvp/waze), `#calendarTab` (ניווט+מעבר לאירוע), `#adminTab` (כל כפתורי הניהול).
`switchTab(tab,shouldSync=true)`: אדמין-only מוגן; ממפה לטאב DOM; מעדכן `activeTab`+sessionStorage; מחליף `.active` ומחלקות nav; גלילה למעלה; sync שקט עבור events/messages/credits/experiences.

עזר כללי: `toBase64`, `splitDataUrl(dataUrl)→{mimeType,base64}`.

---

## חלק י"ד — כללים עסקיים (סיכום)

1. אירוע אחד לכל ילדה (לפי שם ילדה מנורמל). שני ההורים מזוהים לאותו אירוע לפי girlName+familyName.
2. אישורי הגעה מוצגים רק לאירועים עתידיים; ניתנים להסתרה ע"י בעל האירוע.
3. פרגון אורח אפשרי רק לאירוע שהתקיים; כפתור "הוספת קרדיט" בכרטיס מופיע רק לאחרים (לא לבעלים) ולאירועי עבר.
4. המלצת בעל אירוע מוצגת לבעל האירוע בלבד; פעילה רק אחרי שהאירוע התקיים.
5. אדמין (טלפון+סיסמה) מקבל טאב ניהול ופעולות מחיקה גורפות/בודדות.
6. עמידות: כשל שרת מסוג Unknown action → שמירה מקומית (pending) והצגה רציפה.

---

## חלק ט"ו — עיצוב (`css/styles.css`) — נקודות מפתח

- מסך כניסה בהיר (ורוד/סגול), כרטיס `.login-card`, `.login-input`, תאי טלפון `.phoneCell`, `.twin-col`(flex column, justify-center), `.twin-row`, `.twin-add-btn`(עיגול ורוד, +).
- אפליקציה כהה: `.glass` (זכוכית), `.event-card-shell`, `.event-action-btn(.compact/.delete/.edit)`, `.event-actions-top-left`, `.rsvp-summary-row`, `.hide-rsvp-btn`, `.event-countdown`, `.my-event-card/.my-event-title`, `.past-event-card`.
- קרדיטים: `.credit-main-btn`, `.credit-provider-card(.is-selected)`, `.credit-provider-toggle`, `.credit-provider-icon`, כוכבים `.provider-star`, דירוג זוהר `.glow-rating/.glow-rating-fill/.glow-rating-stars/.glow-star(.is-on)` עם אנימציות `glow-pulse`.
- חוויות: `.exp-check-wrap`, `.exp-select`(accent ורוד), `.exp-video-badge`.
- מסך פתיחה: `.splash-screen(.is-hidden)`, `.splash-logo`(float), `.splash-title/sub`, `.splash-dots`(blink), אנימציות `splash-pop/float/blink`.
- ניווט תחתון `#bottomNav` ממורכז ל-`max-width 430px`, `#addBtn` צף, `.toast`.

---

## חלק ט"ז — גרסאות ופריסה

- כל עדכון: העלאת מספר גרסה ב-0.1 (`.login-version`) + עדכון `?v=NN` בכל ה-JS/CSS ב-`index.html`.
- Frontend: דחיפה ל-`main` → GitHub Pages.
- Backend: הדבקת `BACKEND_V2.gs` → הרצת `setupBatMitzvahSheets` פעם אחת → Deploy → New deployment → Web app (Execute as: Me, Anyone). אם ה-URL השתנה → עדכון `scriptUrl` ב-`config.js`.
- מצב נוכחי: גרסה 113.0, cache-bust v=38.

## חלק י"ז — פריטים אינרטיים/לא בשימוש
- `#shabbatWarning` קיים ב-HTML ללא לוגיקה.
- `renderCreditTagsInputs`, `updateCreditTagButtonsUI`, `renderStarRating`, `updateCreditScoreChips`, `ownerEventScoreSelected`, `guestCreditTagsSelected` — נשארו בקוד אך אינם משפיעים על המסך הנוכחי.
- קבצים לא מקושרים (מועמדים למחיקה): `assets/icon.png`, `assets/default-girl12.svg`, `google-script/updateEvent-addon.gs`.
