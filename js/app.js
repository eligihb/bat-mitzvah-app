/**
 * ישומון אירועי בת מצווה — לוגיקת האפליקציה
 */

// ─── מצב ───────────────────────────────────────────────────
let currentUser = loadJson(APP_CONFIG.storage.user);
let events = [];
let messages = [];
let users = [];
let credits = loadJson("bm_credits") || [];
let experiences = loadJson("bm_experiences") || [];
let pendingCredits = loadJson("bm_pending_credits") || [];
let pendingExperiences = loadJson("bm_pending_experiences") || [];
let pendingCreditEventId = "";
let creditScreen = "home";
let creditBoardExpandedProvider = "";
let guestEventScoreSelected = 0;
let ownerEventScoreSelected = 0;
let experiencesSelectedEventId = "";
let experiencesFilterEventId = "";
let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const guestProviderState = {};
const ownerProviderState = {};
let guestCreditSelectedEventId = "";
let guestCreditManualEventName = "";
let guestCreditNoteDraft = "";
let guestCreditTagsSelected = [];
let guestCreditFreshLoad = true;
const CREDIT_SERVICE_TYPES = ["צילום", "מקום אירוע", "מצגת/סרטון", "אוכל", "עיצוב", "הפעלה"];
let selectedRole = APP_CONFIG.defaultRole;
let hideGuests = false;
let syncTimer = null;
let isSyncing = false;
let activeTab = sessionStorage.getItem("bm_active_tab") || "events";
let editingEventId = null;
let editingEventImage = "";
let isSavingEvent = false;
let selectedEventMenuChoice = "";
let toastTimer = null;

function normalizePhone(phone) {
  return (phone || "").replace(/[^0-9]/g, "");
}

function isAdminByPhoneAndPass(phone, pass) {
  const normalized = normalizePhone(phone);
  return normalized === normalizePhone(APP_CONFIG.adminPhone) && pass === APP_CONFIG.adminPassword;
}

// ─── הפעלה ─────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  bindPhoneCells();
  bindRoleButtons();
  bindTwinToggle();
  bindAdminAccessGate();
  bindLogin();
  bindModal();
  bindEventMenuControls();
  bindEventForm();
  bindNavigation();
  bindMessages();
  bindCredits();
  bindExperiences();
  bindFloatingAdd();
  bindLogout();
  bindProfileEdit();

  if (currentUser) {
    showApp();
  }

  hideSplashAfterDelay();
});

function hideSplashAfterDelay() {
  const splash = document.getElementById("splashScreen");
  if (!splash) return;
  setTimeout(() => {
    splash.classList.add("is-hidden");
    setTimeout(() => splash.remove(), 600);
  }, 2000);
}

// ─── אחסון (משתמש בלבד) ────────────────────────────────────
function loadJson(key) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}

function saveJson(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

// ─── סנכרון עם Google Sheets ───────────────────────────────
function setSyncStatus(text, isError = false) {
  const el = document.getElementById("syncStatus");
  if (!isError) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  if (!text) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  el.textContent = text;
  el.className = isError
    ? "mx-4 mt-3 text-center text-xs text-red-300"
    : "mx-4 mt-3 text-center text-xs text-purple-200/80";
  el.classList.remove("hidden");
}

async function syncFromServer({ silent = false } = {}) {
  if (isSyncing) return;
  isSyncing = true;
  if (!silent) setSyncStatus("מסנכרן נתונים...");

  try {
    const data = await Api.fetchAll();
    const normalized = Api.normalizePayload(
      data.events,
      data.rsvps,
      data.messages,
      data.credits || [],
      data.experiences || [],
      data.users || []
    );
    events = normalized.events;
    messages = normalized.messages;
    users = normalized.users || [];
    credits = mergePendingCredits(normalized.credits || [], pendingCredits);
    experiences = mergePendingExperiences(normalized.experiences || [], pendingExperiences);
    saveJson("bm_credits", credits);
    saveJson("bm_experiences", experiences);
    renderAll();
    if (!silent) setSyncStatus("");
  } catch (err) {
    console.error(err);
    if (!silent) setSyncStatus("לא הצלחנו לטעון מהשרת — נסו שוב", true);
  } finally {
    isSyncing = false;
  }
}

function startAutoSync() {
  stopAutoSync();
  syncTimer = setInterval(() => syncFromServer({ silent: true }), APP_CONFIG.syncIntervalMs);
}

function stopAutoSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

function renderAll() {
  renderHeader();
  renderUpcoming();
  renderEvents();
  renderCalendar();
  renderMessages();
  renderCredits();
  renderExperiences();
  renderAdminPanel();
  updateAddButton();
}

function showToast(text) {
  const el = document.getElementById("toastMsg");
  el.textContent = text;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 2600);
}

function maybeNotifyOtherParentEvent() {
  const hasOtherParentEvent = events.some(
    (e) =>
      e.girlName === currentUser.girlName &&
      (e.familyName || "") === (currentUser.familyName || "") &&
      e.ownerId !== currentUser.id
  );
  if (hasOtherParentEvent) {
    setTimeout(() => {
      showToast("האירוע כבר הוזן על ידי ההורה האחר");
    }, 500);
  }
}

// ─── התחברות ───────────────────────────────────────────────
function bindLogin() {
  document.getElementById("loginForm").addEventListener("submit", (e) => {
    e.preventDefault();

    const parentName = document.getElementById("parentName").value.trim();
    const girlName = document.getElementById("girlName").value.trim();
    const familyName = document.getElementById("familyName").value.trim();
    const twinName = document.getElementById("twinName").value.trim();
    const adminPass = document.getElementById("adminPass").value.trim();

    if (!parentName || !girlName || !familyName) {
      alert("יש למלא את כל שדות החובה");
      return;
    }

    const digits = [...document.querySelectorAll(".phoneCell")]
      .map((c) => c.value)
      .join("");

    let phone = "";
    if (digits.length === 7) {
      phone = `${document.getElementById("phonePrefix").value}-${digits}`;
    }

    const saved = loadJson(APP_CONFIG.storage.user);
    const sameUser =
      saved &&
      saved.parentName === parentName &&
      saved.girlName === girlName &&
      saved.familyName === familyName;

    currentUser = {
      id: sameUser ? saved.id : crypto.randomUUID(),
      role: selectedRole,
      parentName,
      girlName,
      familyName,
      twinName: twinName || "",
      phone,
      isAdmin: isAdminByPhoneAndPass(phone, adminPass),
    };

    saveJson(APP_CONFIG.storage.user, currentUser);
    registerCurrentUser();
    showApp();
  });
}

// רישום/עדכון המשתמש בשרת (לא חוסם את הכניסה אם נכשל)
function registerCurrentUser() {
  if (!currentUser?.id) return;
  Api.registerUser({
    id: currentUser.id,
    parentName: currentUser.parentName || "",
    girlName: currentUser.girlName || "",
    familyName: currentUser.familyName || "",
    role: currentUser.role || "",
    phone: currentUser.phone || "",
  }).catch(() => {});
}

function bindRoleButtons() {
  document.querySelectorAll(".roleBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedRole = btn.dataset.role;
      updateRoleButtonStyles(selectedRole);
    });
  });
}

function updateRoleButtonStyles(role) {
  const mom = document.querySelector('.roleBtn[data-role="אמא"]');
  const dad = document.querySelector('.roleBtn[data-role="אבא"]');
  if (!mom || !dad) return;

  mom.className = `roleBtn role-btn-base rounded-2xl p-3 font-bold ${role === "אמא" ? "role-mom-active" : "role-mom-idle"}`;
  dad.className = `roleBtn role-btn-base rounded-2xl p-3 font-bold ${role === "אבא" ? "role-dad-active" : "role-dad-idle"}`;
}

function bindTwinToggle() {
  const btn = document.getElementById("toggleTwin");
  const wrap = document.getElementById("twinFieldWrap");
  const input = document.getElementById("twinName");
  if (!btn || !wrap || !input) return;

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    setTwinFieldOpen(wrap.classList.contains("is-hidden"));
  });
}

function setTwinFieldOpen(open) {
  const btn = document.getElementById("toggleTwin");
  const wrap = document.getElementById("twinFieldWrap");
  const input = document.getElementById("twinName");
  if (!btn || !wrap || !input) return;

  wrap.classList.toggle("is-hidden", !open);
  btn.classList.toggle("is-active", open);
  btn.setAttribute("aria-expanded", open ? "true" : "false");

  if (open) {
    input.focus();
  } else {
    input.value = "";
  }
}

function bindPhoneCells() {
  document.querySelectorAll(".phoneCell").forEach((cell, index) => {
    cell.addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/[^0-9]/g, "");
      if (e.target.value.length === 1) {
        document.querySelectorAll(".phoneCell")[index + 1]?.focus();
      }
      updateAdminFieldVisibility();
    });
  });
}

function bindAdminAccessGate() {
  document.getElementById("phonePrefix").addEventListener("change", updateAdminFieldVisibility);
  updateAdminFieldVisibility();
}

function getEnteredPhone() {
  let digits = "";
  document.querySelectorAll(".phoneCell").forEach((c) => {
    digits += c.value;
  });
  if (digits.length !== 7) return "";
  return `${document.getElementById("phonePrefix").value}-${digits}`;
}

function updateAdminFieldVisibility() {
  const wrap = document.getElementById("adminPassWrap");
  const input = document.getElementById("adminPass");
  const isAdminPhone = normalizePhone(getEnteredPhone()) === normalizePhone(APP_CONFIG.adminPhone);
  wrap.classList.toggle("hidden", !isAdminPhone);
  if (!isAdminPhone) {
    input.value = "";
  }
}

// ─── מסכים ──────────────────────────────────────────────────
async function showApp() {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("appScreen").classList.remove("hidden");
  document.getElementById("bottomNav").classList.remove("hidden");
  document.getElementById("navAdmin").classList.toggle("hidden", !currentUser?.isAdmin);
  guestCreditFreshLoad = true;

  switchTab(activeTab, false);
  await syncFromServer({ silent: true });
  maybeNotifyOtherParentEvent();
  startAutoSync();
}

function bindLogout() {
  document.getElementById("logoutBtn").addEventListener("click", () => {
    if (!confirm("להתנתק מהישומון?")) return;
    logout();
  });
}

function logout() {
  stopAutoSync();
  localStorage.removeItem(APP_CONFIG.storage.user);
  sessionStorage.removeItem("bm_active_tab");
  currentUser = null;
  events = [];
  messages = [];
  activeTab = "events";
  closeModal();
  setSyncStatus("");

  document.getElementById("appScreen").classList.add("hidden");
  document.getElementById("bottomNav").classList.add("hidden");
  document.getElementById("loginScreen").classList.remove("hidden");
  document.getElementById("loginForm").reset();
  selectedRole = APP_CONFIG.defaultRole;
  updateRoleButtonStyles(selectedRole);

  document.getElementById("twinName").value = "";
  setTwinFieldOpen(false);
  document.getElementById("familyName").value = "";
  document.getElementById("adminPass").value = "";
  updateAdminFieldVisibility();

  document.getElementById("addBtn").classList.add("hidden");
  document.getElementById("navAdmin").classList.add("hidden");

  switchTab("events", false);
}

// ─── כותרת ─────────────────────────────────────────────────
function renderHeader() {
  const hour = new Date().getHours();
  const greet = hour < 12 ? "בוקר טוב" : hour < 18 ? "צהריים טובים" : "ערב טוב";
  document.getElementById("headerGreeting").textContent = greet;
  if (currentUser.isAdmin) {
    document.getElementById("headerRole").textContent = "מנהל מערכת";
    setContactActions();
    return;
  }
  const girls = currentUser.twinName
    ? `${currentUser.girlName} ו${currentUser.twinName}`
    : currentUser.girlName;
  document.getElementById("headerRole").textContent =
    `${currentUser.role} של ${girls} ${currentUser.familyName || ""}`.trim();
  setContactActions();
}

function setContactActions() {
  const callBtn = document.getElementById("callBtn");
  const waBtn = document.getElementById("waBtn");
  const phone = normalizePhone(currentUser.phone);
  const enabled = phone.length >= 10;

  callBtn.classList.toggle("opacity-40", !enabled);
  waBtn.classList.toggle("opacity-40", !enabled);
  callBtn.classList.toggle("text-emerald-300", enabled);
  waBtn.classList.toggle("text-green-400", enabled);
  waBtn.classList.toggle("bg-green-500/20", enabled);
  callBtn.disabled = !enabled;
  waBtn.disabled = !enabled;

  callBtn.onclick = enabled ? () => window.open(`tel:${phone}`, "_self") : null;
  waBtn.onclick = enabled ? () => window.open(`https://wa.me/972${phone.replace(/^0/, "")}`, "_blank") : null;
}

function bindProfileEdit() {
  document.getElementById("editProfileBtn").addEventListener("click", () => {
    if (!currentUser) return;
    const nextParent = prompt("עדכון שם הורה:", currentUser.parentName);
    if (!nextParent) return;
    const nextGirl = prompt("עדכון שם ילדה:", currentUser.girlName);
    if (!nextGirl) return;
    const nextFamily = prompt("עדכון שם משפחה:", currentUser.familyName || "");
    if (!nextFamily) return;

    const oldGirl = currentUser.girlName;
    const oldFamily = currentUser.familyName || "";

    currentUser.parentName = nextParent.trim();
    currentUser.girlName = nextGirl.trim();
    currentUser.familyName = nextFamily.trim();
    saveJson(APP_CONFIG.storage.user, currentUser);

    events.forEach((e) => {
      if (e.girlName === oldGirl && (e.familyName || "") === oldFamily && e.ownerId === currentUser.id) {
        e.girlName = currentUser.girlName;
        e.familyName = currentUser.familyName;
        e.ownerName = currentUser.parentName;
      }
    });

    renderAll();
    showToast("הפרופיל עודכן");
  });
}

// ─── אירועים קרובים ────────────────────────────────────────
function renderUpcoming() {
  const bar = document.getElementById("upcomingBar");
  const now = new Date();
  const upcoming = events
    .filter((e) => {
      const dt = parseEventDateTime(e.date, e.time);
      return !!dt && dt >= now;
    })
    .sort((a, b) => {
      const ad = parseEventDateTime(a.date, a.time);
      const bd = parseEventDateTime(b.date, b.time);
      if (!ad || !bd) return 0;
      return ad - bd;
    })
    .slice(0, 3);

  if (!upcoming.length) {
    bar.innerHTML = "אין אירועים קרובים";
    bar.onclick = null;
    return;
  }

  const weekAhead = new Date(now);
  weekAhead.setDate(weekAhead.getDate() + 7);
  const monthAhead = new Date(now);
  monthAhead.setMonth(monthAhead.getMonth() + 1);
  const weekCount = events.filter((e) => {
    const d = parseEventDateTime(e.date, e.time);
    if (!d) return false;
    return d >= now && d <= weekAhead;
  }).length;
  const monthCount = events.filter((e) => {
    const d = parseEventDateTime(e.date, e.time);
    if (!d) return false;
    return d >= now && d <= monthAhead;
  }).length;

  bar.innerHTML = `
    <div class="space-y-1.5">
      <div class="text-xs opacity-90 mb-1">אירועים קרובים</div>
      ${upcoming
        .map((e) => {
          const d = parseEventDateTime(e.date, e.time);
          const rel = d ? relativeDaysLabel(d, now) : "בקרוב";
          return `<div>🎉 האירוע של <span class="font-black">${e.girlName}</span> ${rel}</div>`;
        })
        .join("")}
      <div class="text-xs opacity-90 pt-1">לשבוע הקרוב: ${weekCount} | לחודש הקרוב: ${monthCount}</div>
    </div>
  `;

  bar.onclick = () => {
    switchTab("events", false);
    document.getElementById("eventsTab").scrollIntoView({ behavior: "smooth", block: "start" });
  };
}

// ─── הוספת / עריכת אירוע ───────────────────────────────────
function bindFloatingAdd() {
  document.getElementById("addBtn").addEventListener("click", openModalForCreate);
  document.getElementById("navAdd").addEventListener("click", () => {
    const familyEvent = events.find(
      (e) =>
        e.girlName === currentUser.girlName &&
        (e.familyName || "") === (currentUser.familyName || "")
    );
    if (familyEvent) {
      openModalForEdit(familyEvent.id);
    } else {
      openModalForCreate();
    }
  });
}

function bindModal() {
  document.getElementById("closeModal").addEventListener("click", closeModal);
}

function bindEventMenuControls() {
  document.querySelectorAll(".menu-choice-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedEventMenuChoice = btn.dataset.menuChoice || "";
      document.getElementById("eventMenuOther").value = "";
      renderMenuChoiceState();
    });
  });

  document.getElementById("eventMenuOther").addEventListener("input", (e) => {
    if (e.target.value.trim()) {
      selectedEventMenuChoice = "";
    }
    renderMenuChoiceState();
  });
}

function renderMenuChoiceState() {
  document.querySelectorAll(".menu-choice-btn").forEach((btn) => {
    const isActive = selectedEventMenuChoice === (btn.dataset.menuChoice || "");
    btn.classList.toggle("active", isActive);
  });
}

function getEventMenuValue() {
  const other = document.getElementById("eventMenuOther").value.trim();
  if (other) return other;
  return selectedEventMenuChoice;
}

function setEventMenuValue(value) {
  const normalized = (value || "").trim();
  const preset = ["חלבי 🥛", "בשרי 🥩"].includes(normalized) ? normalized : "";
  selectedEventMenuChoice = preset;
  document.getElementById("eventMenuOther").value = preset ? "" : normalized;
  renderMenuChoiceState();
}

function canManageEvent(event) {
  if (currentUser?.isAdmin) return true;
  if (event.ownerId && currentUser?.id && String(event.ownerId) === String(currentUser.id)) return true;
  return (
    event.girlName === currentUser.girlName &&
    (event.familyName || "") === (currentUser.familyName || "")
  );
}

// האם זה האירוע של המשתמש עצמו (בלי חריגת מנהל)
function isOwnEvent(event) {
  if (!event || !currentUser) return false;
  if (event.ownerId && String(event.ownerId) === String(currentUser.id)) return true;
  return (
    event.girlName === currentUser.girlName &&
    (event.familyName || "") === (currentUser.familyName || "")
  );
}

function creditBlockMessage(icon, text) {
  return `
    <div class="credit-block-msg rounded-2xl border border-pink-400/30 bg-pink-500/10 p-4 text-center">
      <div class="text-3xl mb-2">${icon}</div>
      <div class="text-sm leading-6 text-white/90">${text}</div>
    </div>`;
}

function resetEventForm() {
  document.getElementById("eventForm").reset();
  editingEventId = null;
  editingEventImage = "";
  hideGuests = false;
  setEventMenuValue("");
  document.getElementById("currentImageHint").classList.add("hidden");
  document.getElementById("modalTitle").textContent = "הוספת אירוע";
  document.getElementById("eventSubmitBtn").textContent = "פרסום אירוע 🚀";
  setEventSubmitLoading(false);
}

function openModalForCreate() {
  resetEventForm();
  const modal = document.getElementById("eventModal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function openModalForEdit(eventId) {
  const event = events.find((e) => e.id === eventId);
  if (!event || !canManageEvent(event)) return;

  resetEventForm();
  editingEventId = event.id;
  editingEventImage = event.image || "";

  document.getElementById("eventDate").value = event.date;
  document.getElementById("eventTime").value = event.time;
  document.getElementById("eventLocation").value = event.location;
  document.getElementById("eventAddress").value = event.address;
  setEventMenuValue(event.menu);

  hideGuests = event.hideGuests;

  if (editingEventImage) {
    document.getElementById("currentImageHint").classList.remove("hidden");
  }

  document.getElementById("modalTitle").textContent = "עריכת אירוע";
  document.getElementById("eventSubmitBtn").textContent = "שמירת שינויים ✓";

  const modal = document.getElementById("eventModal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function closeModal() {
  const modal = document.getElementById("eventModal");
  modal.classList.add("hidden");
  modal.classList.remove("flex");
  resetEventForm();
}

function setEventSubmitLoading(loading) {
  const btn = document.getElementById("eventSubmitBtn");
  const progress = document.getElementById("eventProgressWrap");
  const progressText = document.getElementById("eventProgressText");
  btn.disabled = loading;
  progress.classList.toggle("hidden", !loading);

  if (loading) {
    btn.dataset.originalText = btn.textContent;
    btn.textContent = "שומר...";
    progressText.textContent = editingEventId ? "מעדכן אירוע..." : "יוצר אירוע...";
  } else if (btn.dataset.originalText) {
    btn.textContent = btn.dataset.originalText;
    delete btn.dataset.originalText;
  }
}

function updateAddButton() {
  const exists = events.some(
    (e) =>
      e.girlName === currentUser.girlName &&
      (e.familyName || "") === (currentUser.familyName || "")
  );
  document.getElementById("addBtn").classList.toggle("hidden", exists);
}

function bindEventForm() {
  document.getElementById("eventForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isSavingEvent) return;

    const date = document.getElementById("eventDate").value;
    const time = document.getElementById("eventTime").value;
    const location = document.getElementById("eventLocation").value.trim();
    const address = document.getElementById("eventAddress").value.trim();
    const menu = getEventMenuValue();

    if (!date || !time || !location || !address || !menu) {
      alert("יש למלא את כל השדות");
      return;
    }

    const normalizeGirl = (v) => String(v || "").trim().replace(/\s+/g, " ").toLowerCase();
    const targetGirl = normalizeGirl(currentUser.girlName);
    const duplicateEvents = events.filter(
      (ev) => normalizeGirl(ev.girlName) === targetGirl && (!editingEventId || ev.id !== editingEventId)
    );
    if (duplicateEvents.length) {
      alert("כבר קיים אירוע לילדה הזו במערכת. לא ניתן ליצור אירוע נוסף.");
      return;
    }

    isSavingEvent = true;
    setEventSubmitLoading(true);

    // העלאת תמונת אירוע ל-Drive (לא שומרים base64 בתא — חורג מ-50,000 תווים)
    let newImageUrl = "";
    const file = document.getElementById("girlImage").files[0];
    if (file) {
      try {
        const dataUrl = await toBase64(file);
        const parts = splitDataUrl(dataUrl);
        const up = await retryApiCall(() =>
          Api.uploadExperienceImage({
            fileName: file.name || `event_${Date.now()}.jpg`,
            mimeType: file.type || parts.mimeType,
            base64Data: parts.base64,
          })
        );
        newImageUrl = up.imageUrl || "";
        if (!newImageUrl) throw new Error("לא התקבל קישור לתמונה");
      } catch (imgErr) {
        console.error(imgErr);
        alert("לא הצלחנו להעלות את התמונה. נסו תמונה אחרת או שמרו בלי תמונה.");
        isSavingEvent = false;
        setEventSubmitLoading(false);
        setSyncStatus("");
        return;
      }
    }

    try {
      setSyncStatus(editingEventId ? "מעדכן אירוע..." : "שומר אירוע...");

      if (editingEventId) {
        const payload = {
          eventId: editingEventId,
          date,
          time,
          location,
          address,
          menu,
          hideAttendees: hideGuests,
        };
        // מעדכנים תמונה רק אם נבחרה תמונה חדשה
        if (newImageUrl) payload.image = newImageUrl;
        await Api.updateEvent(payload);
      } else {
        await Api.createEvent({
          id: crypto.randomUUID(),
          ownerId: currentUser.id,
          ownerName: currentUser.parentName,
          girlName: currentUser.girlName,
          familyName: currentUser.familyName || "",
          date,
          time,
          location,
          address,
          menu,
          hideAttendees: hideGuests,
          image: newImageUrl || APP_CONFIG.placeholderImage,
          phone: currentUser.phone || "",
          role: currentUser.role,
        });
      }

      closeModal();
      await syncFromServer();
    } catch (err) {
      console.error(err);
      alert(editingEventId ? "לא הצלחנו לעדכן את האירוע." : "לא הצלחנו לשמור את האירוע.");
      setSyncStatus("");
    } finally {
      isSavingEvent = false;
      setEventSubmitLoading(false);
    }
  });
}

async function deleteEventById(eventId) {
  const event = events.find((e) => e.id === eventId);
  if (!event || !canManageEvent(event)) return;
  if (!confirm(`למחוק את האירוע של ${event.girlName}?`)) return;

  try {
    setSyncStatus("מוחק אירוע...");
    await Api.deleteEvent(eventId);
    await syncFromServer();
  } catch (err) {
    console.error(err);
    alert("לא הצלחנו למחוק את האירוע.");
    setSyncStatus("");
  }
}

async function deleteMessageById(messageId) {
  if (!currentUser?.isAdmin) return;
  if (!confirm("למחוק את ההודעה הזו?")) return;
  try {
    await Api.deleteMessage(messageId);
    messages = messages.filter((m) => m.id !== messageId);
    await syncFromServer({ silent: true });
    showToast("ההודעה נמחקה");
  } catch (err) {
    console.error(err);
    const msg = String(err?.message || "");
    if (msg.includes("Unknown action")) {
      alert("מחיקת הודעות דורשת עדכון Apps Script (פעולת deleteMessage). עדכן ופרוס מחדש את הסקריפט.");
    } else {
      alert("לא הצלחנו למחוק הודעה.");
    }
  }
}

// הודעה אחידה כשנדרשת פריסה מחדש של הסקריפט
const REDEPLOY_MSG =
  "השרת עדיין מריץ גרסה ישנה של הסקריפט.\n\nכדי לתקן: Apps Script → Deploy → Manage deployments → לחצו על העיפרון (עריכה) → Version: New version → Deploy.\n(אל תיצרו פריסה חדשה — זה יוצר כתובת חדשה.)";

function isUnknownActionError(err) {
  const msg = String(err?.message || "");
  return msg.includes("Unknown action") || msg.includes("לא נתמך");
}

// ניקוי מטמון מקומי (פריטים "ממתינים" שנשמרו כשהשרת לא תמך) לפי קטגוריה
function clearLocalCaches(scope) {
  if (scope === "credits" || scope === "all") {
    pendingCredits = [];
    saveJson("bm_pending_credits", pendingCredits);
  }
  if (scope === "experiences" || scope === "all") {
    pendingExperiences = [];
    saveJson("bm_pending_experiences", pendingExperiences);
  }
}

// כפתור "ניקוי מטמן ורענון" — מוחק רפאים מקומיים ומסנכרן מחדש מהשרת
async function adminClearLocalAndResync() {
  if (!currentUser?.isAdmin) return;
  clearLocalCaches("all");
  saveJson("bm_credits", []);
  saveJson("bm_experiences", []);
  await syncFromServer({ silent: true });
  showToast("המטמון נוקה והנתונים סונכרנו מהשרת");
}

// מחיקה מהירה של גיליון שלם עם נפילה חזרה למחיקה פר-פריט
async function adminClearTarget(target, label, localScope, perItemFallback) {
  if (!currentUser?.isAdmin) return;
  if (!confirm(`למחוק ${label}?`)) return;
  try {
    await Api.clearSheet(target);
    if (localScope) clearLocalCaches(localScope);
    await syncFromServer({ silent: true });
    showToast(`${label} נמחקו`);
    return;
  } catch (err) {
    if (!isUnknownActionError(err)) {
      console.error(err);
    }
  }
  // נפילה חזרה: מחיקה פר-פריט (אם השרת לא תומך ב-clearSheet)
  if (typeof perItemFallback === "function") {
    await perItemFallback();
  } else {
    alert(REDEPLOY_MSG);
  }
}

async function deletePerItem(list, deleteFn, label, afterPurge) {
  if (!list.length) {
    showToast(`אין ${label} למחיקה`);
    return;
  }
  let ok = 0;
  let unknownAction = false;
  for (const item of list) {
    try {
      await deleteFn(item);
      ok += 1;
    } catch (err) {
      if (isUnknownActionError(err)) unknownAction = true;
    }
  }
  if (typeof afterPurge === "function") afterPurge();
  await syncFromServer({ silent: true });
  if (ok) {
    showToast(`${label} נמחקו`);
  } else if (unknownAction) {
    alert(REDEPLOY_MSG);
  } else {
    alert(`לא הצלחנו למחוק ${label}.`);
  }
}

async function adminDeleteAllEvents() {
  await adminClearTarget("events", "כל האירועים", null, () =>
    deletePerItem([...events], (ev) => Api.deleteEvent(ev.id), "אירועים")
  );
}

async function adminDeleteAllMessages() {
  await adminClearTarget("messages", "כל ההודעות", null, () =>
    deletePerItem([...messages], (m) => Api.deleteMessage(m.id), "הודעות")
  );
}

async function adminDeleteAllRsvps() {
  await adminClearTarget("rsvps", "כל אישורי ההגעה");
}

async function adminDeleteAllCredits() {
  // קרדיטים = פרגונים ונותני שירות (לא המלצות בעלי אירוע)
  if (!currentUser?.isAdmin) return;
  if (!confirm("למחוק את כל הקרדיטים?")) return;
  const list = (credits || []).filter((c) => !isOwnerRecommendation(c));
  await deletePerItem(
    list,
    (c) => Api.deleteCredit(c.id),
    "קרדיטים",
    () => list.forEach((c) => purgeCreditLocally(c.id))
  );
}

async function adminDeleteAllRecommendations() {
  if (!currentUser?.isAdmin) return;
  if (!confirm("למחוק את כל ההמלצות?")) return;
  const list = (credits || []).filter((c) => isOwnerRecommendation(c));
  await deletePerItem(
    list,
    (c) => Api.deleteCredit(c.id),
    "המלצות",
    () => list.forEach((c) => purgeCreditLocally(c.id))
  );
}

async function adminDeleteAllExperiences() {
  await adminClearTarget("experiences", "כל התמונות", "experiences", () =>
    deletePerItem(
      experiences.filter((e) => e.imageUrl),
      (e) => Api.deleteExperience(e.id),
      "תמונות",
      () => {
        pendingExperiences = [];
        saveJson("bm_pending_experiences", pendingExperiences);
      }
    )
  );
}

async function adminDeleteAllUsers() {
  await adminClearTarget("users", "כל המשתמשים");
}

async function adminDeleteEverything() {
  if (!currentUser?.isAdmin) return;
  if (!confirm("⚠️ פעולה זו תמחק את כל הנתונים: משתמשים, אירועים, אישורי הגעה, קרדיטים, המלצות, תמונות והודעות. להמשיך?")) return;
  try {
    await Api.deleteAllData();
    clearLocalCaches("all");
    saveJson("bm_credits", []);
    saveJson("bm_experiences", []);
    await syncFromServer({ silent: true });
    showToast("כל הנתונים נמחקו");
  } catch (err) {
    if (isUnknownActionError(err)) {
      alert(REDEPLOY_MSG);
    } else {
      console.error(err);
      alert("לא הצלחנו למחוק את כל הנתונים.");
    }
  }
}

async function deleteUserById(userId) {
  if (!currentUser?.isAdmin) return;
  if (!confirm("למחוק משתמש זה?")) return;
  try {
    await Api.deleteUser(userId);
    users = users.filter((u) => u.id !== userId);
    await syncFromServer({ silent: true });
    showToast("המשתמש נמחק");
  } catch (err) {
    if (isUnknownActionError(err)) {
      alert(REDEPLOY_MSG);
    } else {
      console.error(err);
      alert("לא הצלחנו למחוק את המשתמש.");
    }
  }
}

function purgeCreditLocally(creditId) {
  credits = credits.filter((c) => c.id !== creditId);
  pendingCredits = pendingCredits.filter((c) => c.id !== creditId);
  saveJson("bm_credits", credits);
  saveJson("bm_pending_credits", pendingCredits);
}

async function deleteCreditById(creditId) {
  if (!currentUser?.isAdmin) return;
  if (!confirm("למחוק פריט זה?")) return;
  try {
    await Api.deleteCredit(creditId);
  } catch (err) {
    if (isUnknownActionError(err)) {
      alert(REDEPLOY_MSG);
      return;
    }
    console.error(err);
  }
  // מנקה מקומית בכל מקרה כדי שלא יחזור אחרי סנכרון
  purgeCreditLocally(creditId);
  await syncFromServer({ silent: true });
  showToast("נמחק");
}

async function deleteExperienceById(experienceId) {
  const exp = experiences.find((e) => e.id === experienceId);
  if (!exp || !canDeleteExperience(exp)) return;
  if (!confirm("למחוק את התמונה?")) return;
  try {
    await Api.deleteExperience(experienceId);
    experiences = experiences.filter((e) => e.id !== experienceId);
    pendingExperiences = pendingExperiences.filter((e) => e.id !== experienceId);
    saveJson("bm_pending_experiences", pendingExperiences);
    saveJson("bm_experiences", experiences);
    await syncFromServer({ silent: true });
    showToast("התמונה נמחקה");
  } catch (err) {
    if (isUnknownActionError(err)) {
      alert(REDEPLOY_MSG);
    } else {
      console.error(err);
      alert("לא הצלחנו למחוק את התמונה.");
    }
  }
}

async function toggleEventGuestsVisibility(eventId) {
  const event = events.find((e) => e.id === eventId);
  if (!event || !canManageEvent(event)) return;

  const nextHide = !event.hideGuests;
  event.hideGuests = nextHide;
  renderEvents();
  showToast(nextHide ? "משתמשים אחרים לא יראו תוכן זה" : "החשיפה למשתמשים אחרים חזרה");

  try {
    await Api.updateEvent({
      eventId: event.id,
      hideAttendees: nextHide,
    });
    await syncFromServer();
  } catch (err) {
    console.error(err);
    event.hideGuests = !nextHide;
    renderEvents();
    const msg = String(err?.message || "");
    if (msg.includes("Unknown action")) {
      alert("לא הצלחנו לעדכן את מצב ההסתרה כרגע. נסו שוב בעוד רגע.");
    } else {
      alert("לא הצלחנו לעדכן את מצב ההסתרה.");
    }
  }
}

function renderAdminPanel() {
  const tab = document.getElementById("adminTab");
  if (!tab) return;
  if (!currentUser?.isAdmin) {
    tab.innerHTML = "";
    return;
  }

  const sortedEvents = [...events].sort((a, b) =>
    `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)
  );
  const rsvpCount = events.reduce((sum, e) => sum + Object.keys(e.rsvp || {}).length, 0);
  const creditList = (credits || []).filter((c) => !isOwnerRecommendation(c));
  const recList = (credits || []).filter((c) => isOwnerRecommendation(c));
  const photoList = experiences.filter((e) => e.imageUrl);

  const itemRow = (title, sub, attr) => `
    <div class="glass rounded-2xl p-3">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="font-bold text-sm truncate">${title}</div>
          ${sub ? `<div class="text-xs text-white/50 mt-1 truncate">${sub}</div>` : ""}
        </div>
        <div class="flex items-center gap-2 shrink-0">${attr}</div>
      </div>
    </div>`;

  const emptyRow = (txt) => `<div class="text-[11px] text-white/40">${txt}</div>`;

  tab.innerHTML = `
    <div class="glass rounded-[28px] p-4 mb-4">
      <div class="font-black mb-2">פאנל ניהול</div>
      <div class="text-xs text-white/60 mb-3 leading-5">משתמשים: ${users.length} • אירועים: ${events.length} • אישורי הגעה: ${rsvpCount} • קרדיטים: ${creditList.length} • המלצות: ${recList.length} • תמונות: ${photoList.length} • הודעות: ${messages.length}</div>
      <div class="grid grid-cols-2 gap-2">
        <button type="button" id="adminRefreshBtn" class="rounded-xl bg-white/10 p-2 text-xs font-bold">רענון</button>
        <button type="button" id="adminClearLocalBtn" class="rounded-xl bg-white/10 p-2 text-xs font-bold">ניקוי מטמן ורענון</button>
        <button type="button" id="adminDeleteAllUsersBtn" class="rounded-xl bg-red-500/20 p-2 text-xs font-bold">מחיקת משתמשים</button>
        <button type="button" id="adminDeleteAllEventsBtn" class="rounded-xl bg-red-500/20 p-2 text-xs font-bold">מחיקת אירועים</button>
        <button type="button" id="adminDeleteAllRsvpsBtn" class="rounded-xl bg-red-500/20 p-2 text-xs font-bold">מחיקת אישורי הגעה</button>
        <button type="button" id="adminDeleteAllCreditsBtn" class="rounded-xl bg-red-500/20 p-2 text-xs font-bold">מחיקת קרדיטים</button>
        <button type="button" id="adminDeleteAllRecommendationsBtn" class="rounded-xl bg-red-500/20 p-2 text-xs font-bold">מחיקת המלצות</button>
        <button type="button" id="adminDeleteAllExperiencesBtn" class="rounded-xl bg-red-500/20 p-2 text-xs font-bold">מחיקת תמונות</button>
        <button type="button" id="adminDeleteAllMessagesBtn" class="rounded-xl bg-red-500/20 p-2 text-xs font-bold">מחיקת הודעות</button>
        <button type="button" id="adminDeleteEverythingBtn" class="col-span-2 rounded-xl bg-red-600/40 border border-red-400/40 p-2 text-xs font-black">⚠️ מחיקת הכל</button>
      </div>
    </div>

    <div class="space-y-3">
      <div class="text-xs text-white/50">משתמשים רשומים (${users.length})</div>
      ${users.length
        ? users
            .map((u) =>
              itemRow(
                `${u.parentName || "—"}${u.familyName ? " " + u.familyName : ""}`,
                `${u.role || ""}${u.girlName ? " • בת: " + u.girlName : ""}${u.phone ? " • " + u.phone : ""}`,
                `<button type="button" class="event-action-btn delete" data-admin-delete-user-id="${u.id}" aria-label="מחיקת משתמש"><i class="fa-solid fa-trash"></i></button>`
              )
            )
            .join("")
        : emptyRow("אין משתמשים רשומים (יירשמו אוטומטית בכניסה הבאה)")}

      <div class="text-xs text-white/50 mt-4">אירועים (${events.length})</div>
      ${sortedEvents.length
        ? sortedEvents
            .map((event) =>
              itemRow(
                `בת מצווה ל${event.girlName}`,
                `${event.date} • ${event.time}${event.ownerName ? " • " + event.ownerName : ""}`,
                `<button type="button" class="event-action-btn edit" data-admin-edit-id="${event.id}" aria-label="עריכת אירוע"><i class="fa-solid fa-pen"></i></button>
                 <button type="button" class="event-action-btn delete" data-admin-delete-id="${event.id}" aria-label="מחיקת אירוע"><i class="fa-solid fa-trash"></i></button>`
              )
            )
            .join("")
        : emptyRow("אין אירועים")}

      <div class="text-xs text-white/50 mt-4">קרדיטים (${creditList.length})</div>
      ${creditList.length
        ? creditList
            .map((c) =>
              itemRow(
                adminCreditLabel(c),
                "",
                `<button type="button" class="event-action-btn delete" data-admin-delete-credit-id="${c.id}" aria-label="מחיקת קרדיט"><i class="fa-solid fa-trash"></i></button>`
              )
            )
            .join("")
        : emptyRow("אין קרדיטים")}

      <div class="text-xs text-white/50 mt-4">המלצות בעלי אירוע (${recList.length})</div>
      ${recList.length
        ? recList
            .map((c) =>
              itemRow(
                adminCreditLabel(c),
                "",
                `<button type="button" class="event-action-btn delete" data-admin-delete-credit-id="${c.id}" aria-label="מחיקת המלצה"><i class="fa-solid fa-trash"></i></button>`
              )
            )
            .join("")
        : emptyRow("אין המלצות")}

      <div class="text-xs text-white/50 mt-4">תמונות / סרטונים (${photoList.length})</div>
      ${photoList.length
        ? photoList
            .map((exp) => {
              const ev = events.find((e) => e.id === exp.eventId);
              return itemRow(
                `${experienceMediaType(exp) === "video" ? "🎬 סרטון" : "🖼️ תמונה"} — ${ev ? ev.girlName : "כללי"}`,
                exp.userName || "",
                `<button type="button" class="event-action-btn delete" data-admin-delete-experience-id="${exp.id}" aria-label="מחיקת תמונה"><i class="fa-solid fa-trash"></i></button>`
              );
            })
            .join("")
        : emptyRow("אין תמונות")}

      <div class="text-xs text-white/50 mt-4">הודעות (${messages.length})</div>
      ${messages.length
        ? messages
            .map((msg) =>
              itemRow(
                msg.text,
                msg.name,
                `<button type="button" class="event-action-btn delete" data-admin-delete-message-id="${msg.id}" aria-label="מחיקת הודעה"><i class="fa-solid fa-trash"></i></button>`
              )
            )
            .join("")
        : emptyRow("אין הודעות")}
    </div>
  `;
}

function adminCreditLabel(c) {
  const event = events.find((e) => e.id === c.eventId);
  const eventName = event ? `האירוע של ${event.girlName}` : "אירוע חיצוני";
  const who = c.professionalName || c.category || (c.note ? c.note.slice(0, 30) : "פרגון");
  return `${who} • ${eventName}`;
}

// ─── רשימת אירועים ─────────────────────────────────────────
function renderEvents() {
  const container = document.getElementById("eventsTab");
  container.innerHTML = "";

  if (!events.length) {
    container.innerHTML =
      '<div class="glass rounded-[28px] p-6 text-center text-white/50 text-sm">עדיין אין אירועים — הוסיפו את הראשון 🎉</div>';
    return;
  }

  events.forEach((event) => {
    const isFamily = canManageEvent(event);
    const isOwnerEvent = String(event.ownerId || "") === String(currentUser?.id || "");
    const myVote = event.rsvp[currentUser.id];
    const yes = Object.values(event.rsvp).filter((v) => v === "yes").length;
    const maybe = Object.values(event.rsvp).filter((v) => v === "maybe").length;
    const no = Object.values(event.rsvp).filter((v) => v === "no").length;

    const d = parseEventDateTime(event.date, event.time);
    const now = new Date();
    const dayStartNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayStartEvent = d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : null;
    const dayDiff = dayStartEvent ? Math.ceil((dayStartEvent - dayStartNow) / 86400000) : null;
    const isPastEvent = typeof dayDiff === "number" ? dayDiff < 0 : false;
    const isTomorrowEvent = dayDiff === 1;
    const countdownLabel = isPastEvent
      ? "האירוע התקיים"
      : dayDiff === 0
        ? "האירוע היום"
        : typeof dayDiff === "number"
          ? `עוד ${dayDiff} ימים`
          : "תאריך לא זמין";
    const formattedDate = d ? d.toLocaleDateString("he-IL") : event.date || "—";
    const formattedTime =
      d && event.time
        ? d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
        : event.time || "—";

    const img = sanitizeEventImage(event.image);
    const eventRecommendations = credits
      .filter((c) => !isProviderEntry(c) && String(c.eventId || "") === String(event.id))
      .slice(0, 4);

    container.insertAdjacentHTML(
      "beforeend",
      `
      <div class="event-card event-card-shell glass rounded-[34px] p-5 ${isOwnerEvent ? "my-event-card" : ""} ${isPastEvent ? "past-event-card" : ""}">
        ${isTomorrowEvent ? '<div class="my-event-title" style="background:rgba(244,63,94,.22);border-color:rgba(251,113,133,.7);color:#ffe4e6;">האירוע מתקיים בעוד יום</div>' : ""}
        ${isOwnerEvent ? '<div class="my-event-title">האירוע שלי</div>' : ""}
        ${
          isFamily
            ? `
        <div class="event-actions event-actions-top-left">
          <button type="button" class="event-action-btn compact edit" data-edit-id="${event.id}" aria-label="עריכה">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button type="button" class="event-action-btn compact delete" data-delete-id="${event.id}" aria-label="מחיקה">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>`
            : ""
        }
        <div class="flex gap-3 items-start">
          <div class="flex gap-4 flex-1 min-w-0">
            <img src="${img}" class="w-20 h-20 shrink-0 rounded-full object-cover border-4 border-white/10" alt="">
            <div class="flex-1 min-w-0">
              <h3 class="font-black text-lg">בת מצווה ל${event.girlName} ✨</h3>
              <div class="text-white/50 text-sm mt-1">תאריך: ${formattedDate} • שעה: ${formattedTime}</div>
              <div class="event-countdown mt-2"><i class="fa-regular fa-clock"></i> ${countdownLabel}</div>
              <div class="bg-white/10 px-3 py-1 rounded-full text-xs inline-block mt-2">${event.menu}</div>
            </div>
          </div>
        </div>
        <div class="bg-white/5 rounded-2xl p-4 mt-4 text-sm space-y-2">
          <div>📍 ${event.location}</div>
          <div class="flex items-center justify-between gap-2">
            <span>🗺️ ${event.address}</span>
            <button type="button" class="event-action-btn" data-waze-address="${encodeURIComponent(event.address)}" aria-label="ניווט">
              <i class="fa-brands fa-waze"></i>
            </button>
          </div>
        </div>
        ${
          !isFamily && !isPastEvent
            ? `
        <div class="grid grid-cols-3 gap-2 mt-4">
          <button type="button" class="rsvp-btn ${rsvpClass(myVote, "yes")} rounded-2xl p-3 font-bold" data-event-id="${event.id}" data-vote="yes">מגיע 👍</button>
          <button type="button" class="rsvp-btn ${rsvpClass(myVote, "maybe")} rounded-2xl p-3 font-bold" data-event-id="${event.id}" data-vote="maybe">אולי 🤔</button>
          <button type="button" class="rsvp-btn ${rsvpClass(myVote, "no")} rounded-2xl p-3 font-bold" data-event-id="${event.id}" data-vote="no">לא מגיע 👎</button>
        </div>`
            : ""
        }
        ${
          !isPastEvent
            ? `<div class="mt-4 pt-4 border-t border-white/10">
          ${
            event.hideGuests && !isFamily
              ? `<div class="text-white/40 text-sm">אישורי ההגעה מוסתרים 🔒</div>`
              : `
          <div class="rsvp-summary-row text-sm">
            <div class="flex gap-4 flex-wrap rsvp-summary-counts">
            <div class="text-green-300">מגיעים: ${yes}</div>
            <div class="text-yellow-300">אולי: ${maybe}</div>
            <div class="text-red-300">לא מגיעים: ${no}</div>
            </div>
            ${
              isFamily
                ? `<button type="button" class="hide-rsvp-btn" data-toggle-hide-id="${event.id}" title="הסתר ממשתמשים אחרים" aria-label="הסתר תוכן ממשתמשים אחרים">
                    <i class="fa-solid fa-eye-slash"></i>
                  </button>`
                : ""
            }
          </div>`
          }
          ${
            isFamily && event.hideGuests
              ? `<div class="text-[12px] text-purple-200/85 mt-2">תוכן זה יוסתר ממשתמשים אחרים</div>`
              : ""
          }
        </div>`
            : ""
        }
        ${
          !isOwnerEvent && isPastEvent
            ? `<button type="button" class="w-full mt-3 rounded-xl bg-white/10 p-2 text-sm font-bold" data-quick-credit-event="${event.id}">הוספת קרדיט לאירוע זה</button>`
            : ""
        }
        ${
          isPastEvent
            ? `<div class="mt-3 rounded-xl bg-white/5 border border-white/10 p-2">
                <div class="text-xs text-white/70 mb-1">קרדיטים לאירוע שהתקיים</div>
                ${
                  eventRecommendations.length
                    ? eventRecommendations
                        .map((c) => `<div class="text-xs text-white/85">${c.professionalName || "ספק"} • ${c.note || "ללא הערה"}</div>`)
                        .join("")
                    : '<div class="text-xs text-white/50">עדיין אין קרדיטים לאירוע זה</div>'
                }
              </div>`
            : ""
        }
      </div>`
    );
  });
}

function rsvpClass(myVote, status) {
  const map = {
    yes: { active: "bg-green-500 active-rsvp", idle: "bg-green-500/15 text-green-300" },
    maybe: { active: "bg-yellow-500 text-black active-rsvp", idle: "bg-yellow-500/15 text-yellow-300" },
    no: { active: "bg-red-500 active-rsvp", idle: "bg-red-500/15 text-red-300" },
  };
  return myVote === status ? map[status].active : map[status].idle;
}

async function vote(eventId, status) {
  const event = events.find((e) => e.id === eventId);
  if (!event) return;

  event.rsvp[currentUser.id] = status;
  renderEvents();

  try {
    await Api.vote({
      eventId,
      userId: currentUser.id,
      userName: currentUser.parentName,
      status,
    });
    await syncFromServer();
  } catch (err) {
    console.error(err);
    delete event.rsvp[currentUser.id];
    renderEvents();
    alert("לא הצלחנו לשמור את התשובה. נסו שוב.");
  }
}

// ─── לוח שנה ───────────────────────────────────────────────
function renderCalendar() {
  const now = new Date();
  const month = calendarCursor.getMonth();
  const year = calendarCursor.getFullYear();
  const todayDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const monthNames = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
  const days = new Date(year, month + 1, 0).getDate();
  const weekdays = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

  const cells = Array.from({ length: days }, (_, i) => {
    const day = i + 1;
    const currentDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayEvents = events.filter((e) => e.date === currentDate);
    return `
      <div class="calendar-day glass rounded-2xl p-2 text-xs ${currentDate === todayDate ? "today" : ""}" data-calendar-date="${currentDate}">
        <div class="font-bold mb-1">${day}</div>
        ${
          dayEvents.length
            ? dayEvents
                .map(
                  (e) =>
                    `<button type="button" class="rounded-xl p-1 text-[9px] mb-1 w-full text-right whitespace-normal break-words leading-tight ${calendarGirlColorClass(
                      e.girlName
                    )}" data-calendar-event-id="${e.id}">${e.girlName}</button>`
                )
                .join("")
            : `<div class="calendar-no-event">אין אירועים</div>`
        }
      </div>`;
  }).join("");

  document.getElementById("calendarTab").innerHTML = `
    <div class="glass rounded-2xl p-2 mb-3">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-1">
          <button type="button" class="rounded-xl bg-white/10 border border-white/10 px-2 py-1 text-xs" data-cal-nav="year-prev">שנה -</button>
          <button type="button" class="rounded-xl bg-white/10 border border-white/10 px-2 py-1 text-xs" data-cal-nav="month-prev">חודש -</button>
        </div>
        <div class="text-sm font-black">${monthNames[month]} ${year}</div>
        <div class="flex items-center gap-1">
          <button type="button" class="rounded-xl bg-white/10 border border-white/10 px-2 py-1 text-xs" data-cal-nav="month-next">חודש +</button>
          <button type="button" class="rounded-xl bg-white/10 border border-white/10 px-2 py-1 text-xs" data-cal-nav="year-next">שנה +</button>
        </div>
      </div>
    </div>
    <div class="grid grid-cols-7 gap-2 text-center text-xs mb-3">
      ${weekdays.map((d) => `<div>${d}</div>`).join("")}
    </div>
    <div class="grid grid-cols-7 gap-2">${cells}</div>`;
}

function calendarGirlColorClass(girlName) {
  const palette = ["bg-pink-500", "bg-purple-500", "bg-fuchsia-500", "bg-rose-500", "bg-indigo-500", "bg-violet-500"];
  const str = String(girlName || "");
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i);
  return `${palette[Math.abs(hash) % palette.length]} text-white`;
}

// ─── הודעות ────────────────────────────────────────────────
function bindMessages() {
  document.getElementById("publishMessageBtn").addEventListener("click", publishMessage);
}

async function publishMessage() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!text) return;

  const msgId = crypto.randomUUID();

  try {
    setSyncStatus("שולח הודעה...");
    await Api.createMessage({
      id: msgId,
      userName: currentUser.parentName,
      messageText: text,
    });
    input.value = "";
    await syncFromServer();
  } catch (err) {
    console.error(err);
    alert("לא הצלחנו לפרסם את ההודעה. נסו שוב.");
    setSyncStatus("");
  }
}

function renderMessages() {
  const container = document.getElementById("messagesContainer");
  container.innerHTML = messages.length
    ? messages
        .map(
          (msg) => `
    <div class="glass rounded-[28px] p-4">
      <div class="flex justify-between items-center mb-2">
        <div class="font-black">${msg.name}</div>
        <div class="text-xs text-white/40">${msg.date}</div>
      </div>
      <div class="text-sm leading-7">${msg.text}</div>
    </div>`
        )
        .join("")
    : '<div class="text-center text-white/40 text-sm">עדיין אין הודעות</div>';
}

// ─── קרדיטים ───────────────────────────────────────────────
function bindCredits() {
  document.getElementById("creditsTab").addEventListener("click", async (e) => {
    const boardDelBtn = e.target.closest("[data-board-delete-credit-id]");
    if (boardDelBtn) {
      await deleteCreditById(boardDelBtn.dataset.boardDeleteCreditId);
      return;
    }
    if (e.target.closest("#boardSelectAllBtn")) {
      toggleSelectAllCreditsBoard();
      return;
    }
    if (e.target.closest("#boardDeleteSelectedBtn")) {
      await deleteSelectedCreditsBoard();
      return;
    }

    const screenBtn = e.target.closest("[data-credit-screen]");
    if (screenBtn) {
      creditScreen = screenBtn.dataset.creditScreen;
      renderCredits();
      return;
    }
    const toggleBtn = e.target.closest("[data-credit-provider-toggle]");
    if (toggleBtn) {
      const card = toggleBtn.closest("[data-provider-card]");
      if (card) {
        card.classList.toggle("ring-2");
        card.classList.toggle("ring-pink-400");
        card.dataset.selected = card.dataset.selected === "1" ? "0" : "1";
        card.classList.toggle("is-selected", card.dataset.selected === "1");
        const providerKey = card.dataset.providerKey || "";
        if (providerKey) {
          if (creditScreen === "guest") {
            guestProviderState[providerKey] = {
              ...(guestProviderState[providerKey] || { selected: false, score: 0, note: "" }),
              selected: card.dataset.selected === "1",
            };
          } else if (creditScreen === "owner") {
            ownerProviderState[providerKey] = {
              ...(ownerProviderState[providerKey] || { selected: false, score: 0 }),
              selected: card.dataset.selected === "1",
            };
          }
        }
      }
      return;
    }
    const providerStarBtn = e.target.closest("[data-provider-star]");
    if (providerStarBtn) {
      const score = Number(providerStarBtn.dataset.providerStar || 0);
      const scoreInputId = providerStarBtn.dataset.providerScoreId || "";
      const scoreInput = document.getElementById(scoreInputId);
      if (scoreInput && score >= 1 && score <= 5) {
        scoreInput.value = String(score);
        const starWrap = providerStarBtn.closest(".credit-stars-wrap");
        if (starWrap) {
          starWrap.querySelectorAll("[data-provider-star]").forEach((starEl) => {
            const starScore = Number(starEl.dataset.providerStar || 0);
            starEl.classList.toggle("text-yellow-300", starScore <= score);
            starEl.classList.toggle("text-white/35", starScore > score);
          });
        }
        const card = providerStarBtn.closest("[data-provider-card]");
        if (card) {
          card.dataset.selected = "1";
          card.classList.add("is-selected", "ring-2", "ring-pink-400");
        }
        const providerKey = card?.dataset.providerKey || "";
        if (providerKey) {
          if (creditScreen === "guest") {
            guestProviderState[providerKey] = {
              ...(guestProviderState[providerKey] || { selected: false, score: 0, note: "" }),
              selected: true,
              score,
            };
          } else if (creditScreen === "owner") {
            ownerProviderState[providerKey] = {
              ...(ownerProviderState[providerKey] || { selected: false, score: 0 }),
              selected: true,
              score,
            };
          }
        }
      }
      return;
    }
    const tagBtn = e.target.closest("[data-credit-tag]");
    if (tagBtn) {
      const tag = tagBtn.dataset.creditTag || "";
      if (guestCreditTagsSelected.includes(tag)) {
        guestCreditTagsSelected = guestCreditTagsSelected.filter((t) => t !== tag);
      } else {
        guestCreditTagsSelected.push(tag);
      }
      updateCreditTagButtonsUI();
      return;
    }
    const openProviderBtn = e.target.closest("[data-open-provider-modal]");
    if (openProviderBtn) {
      const inline = document.getElementById("ownerInlineProviderForm");
      if (inline) {
        inline.classList.toggle("hidden");
      } else {
        document.getElementById("providerModal").classList.remove("hidden");
      }
      return;
    }
    const closeProviderBtn = e.target.closest("[data-close-provider-modal]");
    if (closeProviderBtn) {
      document.getElementById("providerModal").classList.add("hidden");
      return;
    }
    const saveProviderBtn = e.target.closest("[data-save-provider]");
    if (saveProviderBtn) {
      addProviderFromModal();
      return;
    }
    const boardProviderBtn = e.target.closest("[data-credit-board-provider]");
    if (boardProviderBtn) {
      const name = boardProviderBtn.dataset.creditBoardProvider || "";
      creditBoardExpandedProvider = creditBoardExpandedProvider === name ? "" : name;
      renderCredits();
      return;
    }
  });
}

function renderCredits() {
  const tab = document.getElementById("creditsTab");
  if (creditScreen === "home") {
    tab.innerHTML = `
      <div class="glass rounded-[28px] p-4">
        <div class="grid grid-cols-2 gap-2 mb-2">
          <button type="button" data-credit-screen="guest" class="credit-main-btn rounded-2xl p-3 font-black text-white text-sm">פרגן לאירוע של...</button>
          <button type="button" data-credit-screen="owner" class="credit-main-btn rounded-2xl p-3 font-black text-white text-sm">תן המלצה (לבעלי האירוע)</button>
        </div>
        <button type="button" data-credit-screen="board" class="credit-main-btn w-full rounded-2xl p-3 font-black text-white text-sm">לוח קרדיטים</button>
      </div>
    `;
    return;
  }
  if (creditScreen === "board") {
    renderCreditsBoard();
    return;
  }
  if (creditScreen === "owner") {
    renderOwnerCreditsForm();
    return;
  }
  renderGuestCreditsForm();
}

function renderGuestCreditsForm() {
  const tab = document.getElementById("creditsTab");
  const options = allEventsSortedForCredit()
    .map((e) => `<option value="${e.id}">${eventOptionLabel(e)}</option>`)
    .join("");
  tab.innerHTML = `
    ${creditsTopNav("guest")}
    <div class="glass rounded-[28px] p-4 space-y-2">
      <select id="creditEventId" class="w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm text-white">
        <option value="">בחר אירוע</option>
        ${options}
        <option value="__external__">אירוע אחר / הוספה ידנית</option>
      </select>
      <input id="creditManualEvent" class="hidden w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm" placeholder="שם אירוע חיצוני" />
      <div class="text-xs text-white/70">פרגון לנותני שירות (אפשר לבחור כמה)</div>
      <button type="button" data-open-provider-modal class="w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm">+ הוספת נותן שירות ידני</button>
      <div id="ownerInlineProviderForm" class="hidden space-y-2 rounded-xl border border-white/10 bg-white/5 p-2">
        <select id="providerCategoryInput" class="w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm text-white">
          ${CREDIT_SERVICE_TYPES.map((t) => `<option value="${t}">${t}</option>`).join("")}
          <option value="אחר">אחר</option>
        </select>
        <input id="providerCategoryOtherInput" class="hidden w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm" placeholder="סוג אחר" />
        <input id="providerNameInput" class="w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm" placeholder="שם נותן השירות" />
        <input id="providerPhoneInput" class="w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm" placeholder="טלפון" />
        <input id="providerEmailInput" class="w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm" placeholder="אימייל" />
        <button type="button" data-save-provider class="w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm font-bold">אישור הוספה</button>
      </div>
      <div id="guestProvidersWrap" class="space-y-2"></div>
      <div class="border-t border-white/10 pt-3 mt-2">
        <div class="text-sm font-black text-center mb-2">✨ פרגון כללי על האירוע ✨</div>
        ${renderGlowStarRating("guestEventScoreWrap", guestEventScoreSelected)}
      </div>
      <textarea id="guestCreditNote" class="w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm min-h-[72px]" placeholder="הערה (אופציונלי)">${escapeHtmlAttr(guestCreditNoteDraft)}</textarea>
      <button type="button" id="publishGuestCreditBtn" class="w-full rounded-2xl bg-gradient-to-r from-pink-500 to-purple-600 p-3 font-black">פרסום</button>
    </div>
  `;
  const creditEventSelect = document.getElementById("creditEventId");
  if (pendingCreditEventId && Array.from(creditEventSelect.options).some((o) => o.value === pendingCreditEventId)) {
    creditEventSelect.value = pendingCreditEventId;
    guestCreditSelectedEventId = pendingCreditEventId;
    pendingCreditEventId = "";
  } else if (guestCreditFreshLoad) {
    // On full page refresh we always start with empty event selection.
    creditEventSelect.value = "";
    guestCreditSelectedEventId = "";
    guestCreditManualEventName = "";
  } else if (guestCreditSelectedEventId && Array.from(creditEventSelect.options).some((o) => o.value === guestCreditSelectedEventId)) {
    creditEventSelect.value = guestCreditSelectedEventId;
  } else if (guestCreditSelectedEventId === "__external__") {
    creditEventSelect.value = "__external__";
  }
  guestCreditFreshLoad = false;
  const manualInput = document.getElementById("creditManualEvent");
  if (guestCreditManualEventName) manualInput.value = guestCreditManualEventName;
  creditEventSelect.onchange = () => {
    guestCreditSelectedEventId = creditEventSelect.value;
    refreshGuestProviders();
  };
  manualInput.oninput = () => {
    guestCreditManualEventName = manualInput.value || "";
  };
  document.getElementById("guestCreditNote").oninput = (e) => {
    guestCreditNoteDraft = e.target.value || "";
  };
  document.getElementById("providerCategoryInput").onchange = (e) => {
    document.getElementById("providerCategoryOtherInput").classList.toggle("hidden", e.target.value !== "אחר");
  };
  document.querySelectorAll("[data-credit-score]").forEach((btn) => {
    btn.onclick = () => {
      const score = Number(btn.dataset.creditScore || 0);
      if (guestEventScoreSelected === score) {
        guestEventScoreSelected = 0;
      } else {
        guestEventScoreSelected = score;
      }
      updateGlowStarRating("guestEventScoreWrap", guestEventScoreSelected);
    };
  });
  updateGlowStarRating("guestEventScoreWrap", guestEventScoreSelected);
  document.getElementById("publishGuestCreditBtn").onclick = publishGuestCredits;
  refreshGuestProviders();
}

function renderOwnerCreditsForm() {
  const tab = document.getElementById("creditsTab");
  const myEvent = detectMyEventForOwnerCredit();
  if (!myEvent) {
    tab.innerHTML = `
      ${creditsTopNav("owner")}
      <div class="glass rounded-[28px] p-4 text-center text-sm text-white/70">
        לא נמצא אירוע שיצרת. צרי קודם אירוע כדי להמליץ על נותני השירות שלך.
      </div>
    `;
    return;
  }
  if (!isEventPastByDate(myEvent.date)) {
    const d = parseEventDateTime(myEvent.date, myEvent.time || "00:00");
    const dateText = d ? d.toLocaleDateString("he-IL") : "";
    tab.innerHTML = `
      ${creditsTopNav("owner")}
      <div class="glass rounded-[28px] p-4 space-y-3">
        <div class="rounded-xl bg-white/10 border border-white/10 p-2 text-sm text-white">האירוע של ${myEvent.girlName}${dateText ? ` • ${dateText}` : ""}</div>
        <div class="rounded-xl bg-yellow-500/10 border border-yellow-400/30 p-3 text-sm text-yellow-100 text-center">
          האירוע טרם התקיים, הנך מוזמן/ת להמליץ לאחר האירוע 🌟
        </div>
      </div>
    `;
    return;
  }
  tab.innerHTML = `
    ${creditsTopNav("owner")}
    <div class="glass rounded-[28px] p-4 space-y-2">
      <div class="rounded-xl bg-white/10 border border-white/10 p-2 text-sm text-white">האירוע של ${myEvent ? myEvent.girlName : "—"}</div>
      <input id="creditEventId" type="hidden" value="${myEvent ? myEvent.id : ""}" />
      <div class="text-xs text-white/70">המלצה על ספקים ונותני שירות מהאירוע שלך</div>
      <div id="ownerProvidersWrap" class="space-y-2"></div>
      <div class="flex items-center justify-end">
        <button type="button" data-open-provider-modal class="event-action-btn compact" aria-label="הוספת נותן שירות">
          <i class="fa-solid fa-plus"></i>
        </button>
      </div>
      <div id="ownerInlineProviderForm" class="hidden space-y-2 rounded-xl border border-white/10 bg-white/5 p-2">
        <select id="providerCategoryInput" class="w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm text-white">
          ${CREDIT_SERVICE_TYPES.map((t) => `<option value="${t}">${t}</option>`).join("")}
          <option value="אחר">אחר</option>
        </select>
        <input id="providerCategoryOtherInput" class="hidden w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm" placeholder="סוג אחר" />
        <input id="providerNameInput" class="w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm" placeholder="שם נותן השירות" />
        <input id="providerPhoneInput" class="w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm" placeholder="טלפון" />
        <input id="providerEmailInput" class="w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm" placeholder="אימייל" />
        <input id="providerNoteInput" class="w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm" placeholder="הערה קצרה על נותן השירות" />
        <button type="button" data-save-provider class="w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm font-bold">אישור הוספה</button>
      </div>
      <textarea id="ownerCreditNote" class="w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm min-h-[110px]" placeholder="המלצה מפורטת"></textarea>
      <button type="button" id="publishOwnerCreditBtn" class="w-full rounded-2xl bg-gradient-to-r from-pink-500 to-purple-600 p-3 font-black">פרסום</button>
    </div>
  `;
  document.getElementById("publishOwnerCreditBtn").onclick = publishOwnerCredits;
  document.getElementById("providerCategoryInput").onchange = (e) => {
    document.getElementById("providerCategoryOtherInput").classList.toggle("hidden", e.target.value !== "אחר");
  };
  refreshOwnerProviders();
}

function detectMyPastEventForOwnerCredit() {
  const sortedPast = pastEventsSortedDesc();
  const strict = sortedPast.find((e) => String(e.ownerId || "") === String(currentUser?.id || ""));
  if (strict) return strict;
  return sortedPast.find((e) => canManageEvent(e));
}

function detectMyEventForOwnerCredit() {
  const past = detectMyPastEventForOwnerCredit();
  if (past) return past;
  const ownStrict = events.find((e) => String(e.ownerId || "") === String(currentUser?.id || ""));
  if (ownStrict) return ownStrict;
  return events.find((e) => canManageEvent(e)) || null;
}

function renderCreditsBoard() {
  const tab = document.getElementById("creditsTab");
  const byEvent = new Map();
  credits.filter((c) => !isProviderEntry(c)).forEach((c) => {
    if (!byEvent.has(c.eventId)) byEvent.set(c.eventId, []);
    byEvent.get(c.eventId).push(c);
  });
  const blocks = Array.from(byEvent.entries())
    .map(([eventId, list]) => {
      const event = events.find((e) => e.id === eventId);
      const title = event ? `האירוע של ${event.girlName}` : manualEventLabelFromCredit({ eventId });
      const providers = aggregateProviderScores(list);
      return `
        <div class="glass rounded-2xl p-3">
          <div class="font-black text-sm mb-2">${title}</div>
          ${providers
            .map((p) => {
              const open = creditBoardExpandedProvider === p.name;
              return `
                <button type="button" data-credit-board-provider="${escapeHtmlAttr(p.name)}" class="w-full text-right rounded-xl bg-white/5 border border-white/10 p-2 text-sm mb-1">${p.name} • ${p.count} דירוגים</button>
                ${open ? `<div class="text-xs text-white/70 mb-2">ממוצע: ${p.avg} • אהבו: ${p.likes}</div>` : ""}
              `;
            })
            .join("")}
        </div>
      `;
    })
    .join("");
  tab.innerHTML = `
    ${creditsTopNav("board")}
    <div class="space-y-3">${blocks || '<div class="text-center text-white/40 text-sm">עדיין אין נתוני קרדיטים</div>'}</div>
    ${renderCreditsAdminManager()}
  `;
}

// פאנל ניהול קרדיטים/המלצות בתוך לוח הקרדיטים (למנהל בלבד)
function renderCreditsAdminManager() {
  if (!currentUser?.isAdmin) return "";
  const all = credits || [];
  if (!all.length) return "";

  const row = (c) => {
    const kind = isOwnerRecommendation(c) ? "המלצה" : isProviderEntry(c) ? "נותן שירות" : "פרגון";
    return `
      <div class="flex items-center justify-between gap-2 rounded-xl bg-white/5 border border-white/10 p-2 mb-1">
        <label class="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
          <input type="checkbox" class="credit-board-select exp-select" data-credit-id="${c.id}" />
          <span class="text-sm truncate">${adminCreditLabel(c)} <span class="text-white/40">• ${kind}</span></span>
        </label>
        <button type="button" class="event-action-btn delete compact" data-board-delete-credit-id="${c.id}" aria-label="מחיקה">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>`;
  };

  return `
    <div class="glass rounded-2xl p-3 mt-4 border border-red-400/20">
      <div class="flex items-center justify-between mb-2">
        <div class="font-black text-sm">ניהול קרדיטים (${all.length})</div>
        <div class="flex gap-2">
          <button type="button" id="boardSelectAllBtn" class="rounded-xl bg-white/10 border border-white/10 px-3 py-1.5 text-xs font-bold">סמן הכל</button>
          <button type="button" id="boardDeleteSelectedBtn" class="rounded-xl bg-red-500/20 px-3 py-1.5 text-xs font-bold">מחק נבחרים</button>
        </div>
      </div>
      ${all.map(row).join("")}
    </div>
  `;
}

function toggleSelectAllCreditsBoard() {
  const boxes = Array.from(document.querySelectorAll(".credit-board-select"));
  if (!boxes.length) return;
  const allChecked = boxes.every((b) => b.checked);
  boxes.forEach((b) => (b.checked = !allChecked));
  const btn = document.getElementById("boardSelectAllBtn");
  if (btn) btn.textContent = allChecked ? "סמן הכל" : "נקה בחירה";
}

async function deleteSelectedCreditsBoard() {
  if (!currentUser?.isAdmin) return;
  const ids = Array.from(document.querySelectorAll(".credit-board-select:checked")).map(
    (b) => b.dataset.creditId
  );
  if (!ids.length) {
    showToast("לא נבחרו פריטים");
    return;
  }
  if (!confirm(`למחוק ${ids.length} פריטים?`)) return;
  const list = (credits || []).filter((c) => ids.includes(c.id));
  await deletePerItem(
    list,
    (c) => Api.deleteCredit(c.id),
    "פריטים",
    () => list.forEach((c) => purgeCreditLocally(c.id))
  );
}

function creditsTopNav(active) {
  return `
    <div class="glass rounded-2xl p-2 mb-3 grid grid-cols-3 gap-2">
      <button type="button" data-credit-screen="guest" class="rounded-xl p-2 text-xs ${active === "guest" ? "bg-pink-500/30 border border-pink-400/50" : "bg-white/10"}">פרגן לאירוע</button>
      <button type="button" data-credit-screen="owner" class="rounded-xl p-2 text-xs ${active === "owner" ? "bg-pink-500/30 border border-pink-400/50" : "bg-white/10"}">המלצת בעל אירוע</button>
      <button type="button" data-credit-screen="board" class="rounded-xl p-2 text-xs ${active === "board" ? "bg-pink-500/30 border border-pink-400/50" : "bg-white/10"}">לוח קרדיטים</button>
    </div>
  `;
}

function onCreditEventSelectionChange() {
  if (creditScreen === "owner") {
    refreshOwnerProviders();
    return;
  }
  refreshGuestProviders();
}

function renderCreditTagsInputs() {
  return ["מקצועיות", "שירות", "אדיבות"]
    .map(
      (tag) => `
        <button type="button" class="credit-tag-btn rounded-lg border border-white/10 bg-white/5 p-2 flex items-center gap-1 justify-center" data-credit-tag="${tag}">
          <span>${tag}</span>
        </button>
      `
    )
    .join("");
}

function updateCreditTagButtonsUI() {
  document.querySelectorAll("[data-credit-tag]").forEach((btn) => {
    const tag = btn.dataset.creditTag || "";
    const active = guestCreditTagsSelected.includes(tag);
    btn.classList.toggle("bg-pink-500/25", active);
    btn.classList.toggle("border-pink-400/60", active);
    btn.classList.toggle("text-white", active);
    btn.classList.toggle("text-white/75", !active);
  });
}

function updateCreditScoreChips(containerId, selectedScore) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  wrap.querySelectorAll("button").forEach((btn) => {
    const score = Number(btn.dataset.creditScore || btn.dataset.ownerCreditScore || 0);
    const active = selectedScore > 0 && selectedScore >= score;
    btn.classList.toggle("text-yellow-300", active);
    btn.classList.toggle("text-white/35", !active);
  });
}

function renderGlowStarRating(containerId, selectedScore) {
  const stars = [1, 2, 3, 4, 5]
    .map(
      (n) =>
        `<button type="button" class="glow-star ${selectedScore >= n ? "is-on" : ""}" data-credit-score="${n}" aria-label="דירוג ${n}">★</button>`
    )
    .join("");
  const pct = Math.max(0, Math.min(5, selectedScore)) * 20;
  return `
    <div id="${containerId}" class="glow-rating" data-score="${selectedScore}">
      <div class="glow-rating-fill" style="width:${pct}%"></div>
      <div class="glow-rating-stars">${stars}</div>
    </div>
  `;
}

function updateGlowStarRating(containerId, selectedScore) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  const pct = Math.max(0, Math.min(5, selectedScore)) * 20;
  const fill = wrap.querySelector(".glow-rating-fill");
  if (fill) fill.style.width = `${pct}%`;
  wrap.classList.toggle("has-score", selectedScore > 0);
  wrap.querySelectorAll(".glow-star").forEach((btn) => {
    const n = Number(btn.dataset.creditScore || 0);
    btn.classList.toggle("is-on", selectedScore >= n);
  });
}

function renderStarRating(containerId, starClass, dataAttr, selectedScore) {
  const stars = [1, 2, 3, 4, 5]
    .map((n) => `<button type="button" class="${starClass} text-xl ${selectedScore >= n ? "text-yellow-300" : "text-white/35"}" ${dataAttr}="${n}" aria-label="דירוג ${n}">★</button>`)
    .join("");
  return `<div id="${containerId}" class="credit-stars-wrap credit-main-stars">${stars}</div>`;
}

function providerModalTemplate() {
  return `
    <div class="glass rounded-[24px] p-3 hidden" id="providerModal">
      <div class="font-black mb-2">נותן שירות חדש</div>
      <input id="providerNameInput" class="w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm mb-2" placeholder="שם נותן השירות" />
      <input id="providerPhoneInput" class="w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm mb-2" placeholder="טלפון" />
      <input id="providerEmailInput" class="w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm mb-2" placeholder="אימייל" />
      <select id="providerCategoryInput" class="w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm mb-2">
        <option value="צלמת">צלמת</option><option value="אולם">אולם</option><option value="בונה מצגות/וידאו">בונה מצגות/וידאו</option><option value="מפעילה">מפעילה</option><option value="קייטרינג">קייטרינג</option><option value="קינוחים">קינוחים</option><option value="אחר">אחר</option>
      </select>
      <input id="providerCategoryOtherInput" class="hidden w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm mb-2" placeholder="קטגוריה אחרת" />
      <div class="flex gap-2">
        <button type="button" data-save-provider class="flex-1 rounded-xl bg-white/10 border border-white/10 p-2 text-sm font-bold">שמירה</button>
        <button type="button" data-close-provider-modal class="flex-1 rounded-xl bg-white/5 border border-white/10 p-2 text-sm">סגירה</button>
      </div>
    </div>
  `;
}

function pastEventsSortedDesc() {
  return events
    .filter((e) => isEventPastByDate(e.date))
    .sort((a, b) => new Date(`${b.date}T${b.time || "00:00"}`) - new Date(`${a.date}T${a.time || "00:00"}`));
}

function allEventsSortedForCredit() {
  const past = pastEventsSortedDesc();
  const upcoming = events
    .filter((e) => !isEventPastByDate(e.date))
    .sort((a, b) => new Date(`${a.date}T${a.time || "00:00"}`) - new Date(`${b.date}T${b.time || "00:00"}`));
  return [...past, ...upcoming];
}

function setGuestPublishEnabled(enabled) {
  const btn = document.getElementById("publishGuestCreditBtn");
  if (!btn) return;
  btn.disabled = !enabled;
  btn.classList.toggle("opacity-40", !enabled);
  btn.classList.toggle("pointer-events-none", !enabled);
}

function refreshGuestProviders() {
  const eventId = document.getElementById("creditEventId")?.value || "";
  const wrap = document.getElementById("guestProvidersWrap");
  if (!wrap) return;
  guestCreditSelectedEventId = eventId;
  document.getElementById("creditManualEvent")?.classList.toggle("hidden", eventId !== "__external__");

  // חסימות לפי האירוע שנבחר
  const selectedEvent = events.find((e) => e.id === eventId);
  if (selectedEvent && isOwnEvent(selectedEvent)) {
    wrap.innerHTML = creditBlockMessage(
      "🙃",
      'אינך יכול לפרגן לאירוע שלך, אך אתה יכול בהחלט להמליץ על נותני שירות שאהבת — עברו למסך "המלצת בעל אירוע".'
    );
    setGuestPublishEnabled(false);
    return;
  }
  if (selectedEvent && !isEventPastByDate(selectedEvent.date)) {
    wrap.innerHTML = creditBlockMessage("😜", "לא ניתן לפרגן לאירוע שעדיין לא התקיים — תחזרו אחרי החגיגה!");
    setGuestPublishEnabled(false);
    return;
  }
  setGuestPublishEnabled(true);

  wrap.innerHTML = CREDIT_SERVICE_TYPES
    .map((service, i) => {
      const st = guestProviderState[service] || { selected: false, score: 0, note: "" };
      return `
        <div class="credit-provider-card rounded-xl border border-white/10 bg-white/5 p-2 ${st.selected ? "is-selected" : ""}" data-provider-card data-selected="${st.selected ? "1" : "0"}" data-provider-key="${escapeHtmlAttr(service)}">
          <button type="button" data-credit-provider-toggle class="credit-provider-toggle w-full text-right text-sm font-bold">
            <span class="credit-provider-icon">${serviceIcon(service)}</span>
            <span>${service}</span>
          </button>
          <div class="text-xs text-white/70 mt-1">דרג/י בכוכבים — הבחירה תסומן אוטומטית</div>
          <div id="guestProviderStars_${i}" class="credit-stars-wrap mt-1">
            ${[1, 2, 3, 4, 5]
              .map(
                (n) =>
                  `<button type="button" class="provider-star text-xl ${st.score >= n && st.score > 0 ? "text-yellow-300" : "text-white/35"}" data-provider-star="${n}" data-provider-score-id="guestProviderScore_${i}" aria-label="דירוג ${n}">★</button>`
              )
              .join("")}
          </div>
          <input id="guestProviderScore_${i}" data-provider-name="${escapeHtmlAttr(service)}" data-provider-category="${escapeHtmlAttr(service)}" type="hidden" value="${st.score}" />
          <input id="guestProviderNote_${i}" class="w-full mt-1 rounded-lg bg-white/10 border border-white/10 p-1.5 text-xs" placeholder="מילה טובה על ${service}" value="${escapeHtmlAttr(st.note)}" />
        </div>
      `;
    })
    .join("");
  CREDIT_SERVICE_TYPES.forEach((service, i) => {
    const noteInput = document.getElementById(`guestProviderNote_${i}`);
    if (noteInput) {
      noteInput.oninput = () => {
        guestProviderState[service] = {
          ...(guestProviderState[service] || { selected: false, score: 0, note: "" }),
          note: noteInput.value || "",
        };
      };
    }
  });
}

function refreshOwnerProviders() {
  const eventId = document.getElementById("creditEventId")?.value || "";
  const wrap = document.getElementById("ownerProvidersWrap");
  if (!wrap) return;
  const providers = collectOwnerRecommendationTargets(eventId);
  wrap.innerHTML = providers.length
    ? providers
        .map(
          (p, i) => {
            const key = `${p.name}@@${p.category || ""}`;
            const st = ownerProviderState[key] || { selected: false, score: 0 };
            return `
            <div class="credit-provider-card rounded-xl border border-white/10 bg-white/5 p-2 ${st.selected ? "is-selected" : ""}" data-provider-card data-selected="${st.selected ? "1" : "0"}" data-provider-key="${escapeHtmlAttr(key)}">
              <button type="button" data-credit-provider-toggle class="credit-provider-toggle w-full text-right text-sm font-bold">
                <span class="credit-provider-icon">${serviceIcon(p.category || p.name)}</span>
                <span>${p.name}${p.category ? ` • ${p.category}` : ""}</span>
              </button>
              <div id="ownerProviderStars_${i}" class="credit-stars-wrap mt-1">
                ${[1, 2, 3, 4, 5]
                  .map(
                    (n) =>
                      `<button type="button" class="provider-star text-xl ${st.score >= n && st.score > 0 ? "text-yellow-300" : "text-white/35"}" data-provider-star="${n}" data-provider-score-id="ownerProviderScore_${i}" aria-label="דירוג ${n}">★</button>`
                  )
                  .join("")}
              </div>
              <input id="ownerProviderScore_${i}" data-provider-name="${escapeHtmlAttr(p.name)}" data-provider-category="${escapeHtmlAttr(p.category || "")}" type="hidden" value="${st.score}" />
            </div>
          `;
          }
        )
        .join("")
    : '<div class="text-xs text-white/50">אין ספקים לאירוע זה. הוסיפי ספק חדש.</div>';
}

async function publishGuestCredits() {
  const selectedEventId = document.getElementById("creditEventId").value;
  const manualEvent = document.getElementById("creditManualEvent").value.trim();
  const eventId = selectedEventId === "__external__" ? `manual:${manualEvent}` : selectedEventId;
  if (!eventId || (selectedEventId === "__external__" && !manualEvent)) {
    showToast("בחר/י אירוע");
    return;
  }
  const selectedEvent = events.find((e) => e.id === selectedEventId);
  if (selectedEvent && isOwnEvent(selectedEvent)) {
    showToast("אינך יכול לפרגן לאירוע שלך — אפשר להמליץ על נותני שירות במסך המלצת בעל אירוע");
    return;
  }
  if (selectedEvent && !isEventPastByDate(selectedEvent.date)) {
    showToast("לא ניתן לפרגן לאירוע שעדיין לא התקיים");
    return;
  }
  const selectedCards = Array.from(document.querySelectorAll("#guestProvidersWrap [data-provider-card][data-selected='1']"));
  if (!selectedCards.length) {
    showToast("בחר/י לפחות נותן שירות אחד");
    return;
  }
  const note = document.getElementById("guestCreditNote").value.trim();
  const eventScore = guestEventScoreSelected;
  const tags = [...guestCreditTagsSelected];
  try {
    for (const card of selectedCards) {
      const scoreInput = card.querySelector("[data-provider-name]");
      const providerName = scoreInput?.dataset.providerName || "";
      const category = scoreInput?.dataset.providerCategory || "";
      const score = Number(scoreInput?.value || 0);
      if (score <= 0) {
        showToast(`חסר דירוג לספק: ${providerName || category || "ספק"}`);
        return;
      }
      const providerNote = card.querySelector("input[type='text']")?.value.trim() || "";
      await retryApiCall(() =>
        Api.createCredit({
        id: crypto.randomUUID(),
        eventId,
        category,
        professionalName: providerName,
        note: [providerNote, note].filter(Boolean).join(" | "),
        tags: ["__guest__", ...tags].join("|"),
        sentiment: "like",
        ownerUserId: currentUser.id,
        ownerName: currentUser.parentName,
        ratings: JSON.stringify({ [currentUser.id]: score, ...(eventScore ? { [`${currentUser.id}_event`]: eventScore } : {}) }),
        createdAt: new Date().toISOString(),
      })
      );
    }
    await syncFromServer({ silent: true });
    showToast("הפרגון פורסם");
    guestProviderStateReset();
    guestCreditNoteDraft = "";
    guestCreditTagsSelected = [];
    guestEventScoreSelected = 0;
    creditScreen = "board";
    renderCredits();
  } catch (err) {
    console.error(err);
    const msg = String(err?.message || "");
    if (msg.includes("Unknown action")) {
      const localCredits = selectedCards.map((card) => {
        const scoreInput = card.querySelector("[data-provider-name]");
        const providerName = scoreInput?.dataset.providerName || "";
        const category = scoreInput?.dataset.providerCategory || "";
        const score = Number(scoreInput?.value || 0);
        const providerNote = card.querySelector("input[type='text']")?.value.trim() || "";
        return {
          id: crypto.randomUUID(),
          eventId,
          category,
          professionalName: providerName,
          note: [providerNote, note].filter(Boolean).join(" | "),
          tags: ["__guest__", ...tags].join("|"),
          sentiment: "like",
          ownerUserId: currentUser.id,
          ownerName: currentUser.parentName,
          ratings: { [currentUser.id]: score, ...(eventScore ? { [`${currentUser.id}_event`]: eventScore } : {}) },
        };
      });
      pendingCredits = [...localCredits, ...pendingCredits];
      saveJson("bm_pending_credits", pendingCredits);
      credits = mergePendingCredits(credits, pendingCredits);
      saveJson("bm_credits", credits);
      guestProviderStateReset();
      guestCreditNoteDraft = "";
      guestCreditTagsSelected = [];
      guestEventScoreSelected = 0;
      creditScreen = "board";
      renderCredits();
      renderAll();
      showToast("הפרגון פורסם");
    } else {
      showToast(`לא הצלחנו לפרסם פרגון: ${msg.slice(0, 90)}`);
    }
  }
}

async function publishOwnerCredits() {
  const eventId = document.getElementById("creditEventId").value;
  if (!eventId) {
    showToast("בחר/י אירוע");
    return;
  }
  const event = events.find((e) => e.id === eventId);
  if (!event || !canManageEvent(event)) {
    showToast("ניתן להמליץ רק על האירוע שלך");
    return;
  }
  const selectedCards = Array.from(document.querySelectorAll("#ownerProvidersWrap [data-provider-card][data-selected='1']"));
  if (!selectedCards.length) {
    showToast("בחר/י לפחות נותן שירות אחד");
    return;
  }
  const note = document.getElementById("ownerCreditNote").value.trim();
  try {
    for (const card of selectedCards) {
      const scoreInput = card.querySelector("[data-provider-name]");
      const providerName = scoreInput?.dataset.providerName || "";
      const category = scoreInput?.dataset.providerCategory || "";
      const score = Number(scoreInput?.value || 0);
      if (score <= 0) {
        showToast(`חסר דירוג לספק: ${providerName || category || "ספק"}`);
        return;
      }
      await retryApiCall(() =>
        Api.createCredit({
        id: crypto.randomUUID(),
        eventId,
        category,
        professionalName: providerName,
        note,
        tags: "__owner__",
        sentiment: "like",
        ownerUserId: currentUser.id,
        ownerName: currentUser.parentName,
        ratings: JSON.stringify({ [currentUser.id]: score }),
        createdAt: new Date().toISOString(),
      })
      );
    }
    await syncFromServer({ silent: true });
    showToast("ההמלצה פורסמה");
    creditScreen = "board";
    renderCredits();
  } catch (err) {
    console.error(err);
    const msg = String(err?.message || "");
    if (msg.includes("Unknown action")) {
      const localCredits = selectedCards.map((card) => {
        const scoreInput = card.querySelector("[data-provider-name]");
        const providerName = scoreInput?.dataset.providerName || "";
        const category = scoreInput?.dataset.providerCategory || "";
        const score = Number(scoreInput?.value || 0);
        return {
          id: crypto.randomUUID(),
          eventId,
          category,
          professionalName: providerName,
          note,
          tags: "__owner__",
          sentiment: "like",
          ownerUserId: currentUser.id,
          ownerName: currentUser.parentName,
          ratings: { [currentUser.id]: score },
        };
      });
      pendingCredits = [...localCredits, ...pendingCredits];
      saveJson("bm_pending_credits", pendingCredits);
      credits = mergePendingCredits(credits, pendingCredits);
      saveJson("bm_credits", credits);
      creditScreen = "board";
      renderCredits();
      renderAll();
      showToast("ההמלצה פורסמה");
    } else {
      showToast(`לא הצלחנו לפרסם המלצה: ${msg.slice(0, 90)}`);
    }
  }
}

function aggregateProviderScores(list) {
  const map = new Map();
  list.forEach((c) => {
    const key = `${c.professionalName}@@${c.category || ""}`;
    if (!map.has(key)) map.set(key, { name: c.professionalName, category: c.category || "", total: 0, count: 0, likes: 0 });
    const item = map.get(key);
    const values = Object.values(c.ratings || {}).map(Number).filter((n) => Number.isFinite(n) && n > 0);
    item.total += values.reduce((a, b) => a + b, 0);
    item.count += values.length;
    if (c.sentiment === "like") item.likes += 1;
  });
  return Array.from(map.values()).map((x) => ({ ...x, avg: x.count ? (x.total / x.count).toFixed(1) : "—" }));
}

function collectProvidersForEvent(eventId) {
  const providers = new Map();
  credits.forEach((c) => {
    if (String(c.eventId || "") !== String(eventId || "")) return;
    if (!c.professionalName) return;
    const key = c.professionalName.trim();
    if (!providers.has(key)) providers.set(key, { name: key, category: c.category || "" });
  });
  return Array.from(providers.values());
}

function collectOwnerRecommendationTargets(eventId) {
  const base = CREDIT_SERVICE_TYPES.map((name) => ({ name, category: name }));
  const existing = collectProvidersForEvent(eventId);
  const map = new Map();
  [...base, ...existing].forEach((p) => {
    const key = `${p.name}@@${p.category || ""}`;
    if (!map.has(key)) map.set(key, p);
  });
  return Array.from(map.values());
}

async function addProviderFromModal() {
  const eventId = document.getElementById("creditEventId")?.value || "";
  const name = document.getElementById("providerNameInput")?.value.trim();
  const phone = document.getElementById("providerPhoneInput")?.value.trim();
  const email = document.getElementById("providerEmailInput")?.value.trim();
  const providerNote = document.getElementById("providerNoteInput")?.value.trim();
  const categoryBase = document.getElementById("providerCategoryInput")?.value || "";
  const categoryOther = document.getElementById("providerCategoryOtherInput")?.value.trim();
  const category = categoryBase === "אחר" ? categoryOther : categoryBase;
  if (!eventId || !name || !category) {
    showToast("יש לבחור אירוע ולמלא שם וקטגוריה");
    return;
  }
  try {
    await Api.createCredit({
      id: crypto.randomUUID(),
      eventId: eventId === "__external__" ? `manual:${document.getElementById("creditManualEvent")?.value.trim() || "אירוע חיצוני"}` : eventId,
      category,
      professionalName: name,
      phone,
      link: email,
      note: providerNote || "",
      tags: "__provider__",
      sentiment: "",
      contact: [phone, email].filter(Boolean).join(" | "),
      ownerUserId: currentUser.id,
      ownerName: currentUser.parentName,
      ratings: JSON.stringify({}),
      createdAt: new Date().toISOString(),
    });
    await syncFromServer({ silent: true });
    document.getElementById("providerModal")?.classList.add("hidden");
    document.getElementById("ownerInlineProviderForm")?.classList.add("hidden");
    showToast("נותן השירות נוסף");
    renderCredits();
  } catch (err) {
    console.error(err);
    showToast("לא הצלחנו להוסיף נותן שירות");
  }
}

function isProviderEntry(credit) {
  return String(credit.tags || "").includes("__provider__");
}

function isOwnerRecommendation(credit) {
  return String(credit.tags || "").includes("__owner__");
}

function extractUserTags(tagsRaw) {
  return String(tagsRaw || "")
    .split("|")
    .map((s) => s.trim())
    .filter((t) => t && !t.startsWith("__"));
}

function manualEventLabelFromCredit(credit) {
  const val = String(credit.eventId || "");
  return val.startsWith("manual:") ? val.slice("manual:".length) : "אירוע חיצוני";
}

function escapeHtmlAttr(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function serviceIcon(name) {
  const v = String(name || "");
  if (v.includes("צילום")) return "🖼️";
  if (v.includes("מקום") || v.includes("אולם")) return "🏛️";
  if (v.includes("מצגת") || v.includes("וידאו")) return "🎬";
  if (v.includes("אוכל") || v.includes("קייטרינג")) return "🍽️";
  if (v.includes("עיצוב")) return "🎀";
  if (v.includes("הפעלה")) return "🎉";
  return "✨";
}

function guestProviderStateReset() {
  Object.keys(guestProviderState).forEach((k) => delete guestProviderState[k]);
}

function sanitizeEventImage(value) {
  const raw = String(value || "").trim();
  if (!raw) return APP_CONFIG.placeholderImage;
  if (raw.startsWith("data:image/")) return raw;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("assets/")) return raw;
  if (raw === "undefined" || raw === "null") return APP_CONFIG.placeholderImage;
  return APP_CONFIG.placeholderImage;
}

function isEventPastByDate(dateString) {
  if (!dateString) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const date = parseEventDateTime(dateString, "00:00");
  if (!date) return false;
  const onlyDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return onlyDate <= today;
}

function parseEventDateTime(dateString, timeString = "00:00") {
  const datePart = String(dateString || "").trim();
  if (!datePart) return null;
  const timePart = String(timeString || "").trim() || "00:00";
  const normalizedTime = /^\d{1,2}:\d{2}/.test(timePart) ? timePart.slice(0, 5) : "00:00";
  const isoCandidate = `${datePart}T${normalizedTime}`;
  const isoDate = new Date(isoCandidate);
  if (!Number.isNaN(isoDate.getTime())) return isoDate;

  const splitDate = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(datePart);
  if (splitDate) {
    const first = Number(splitDate[1]);
    const second = Number(splitDate[2]);
    const year = Number(splitDate[3]);
    const day = first > 12 ? first : second > 12 ? second : first;
    const month = first > 12 ? second - 1 : second > 12 ? first - 1 : second - 1;
    const [h, m] = normalizedTime.split(":").map(Number);
    const parsed = new Date(year, month, day, h || 0, m || 0);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const fallback = new Date(datePart);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function setCreditSentiment(type) {
  const likeBtn = document.getElementById("creditLikeBtn");
  const dislikeBtn = document.getElementById("creditDislikeBtn");
  if (!likeBtn || !dislikeBtn) return;
  likeBtn.dataset.active = type === "like" ? "1" : "0";
  dislikeBtn.dataset.active = type === "dislike" ? "1" : "0";
  likeBtn.classList.toggle("ring-2", type === "like");
  dislikeBtn.classList.toggle("ring-2", type === "dislike");
}

function getSelectedCreditSentiment() {
  const likeActive = document.getElementById("creditLikeBtn")?.dataset.active === "1";
  const dislikeActive = document.getElementById("creditDislikeBtn")?.dataset.active === "1";
  if (likeActive) return "like";
  if (dislikeActive) return "dislike";
  return "";
}

function applyPendingCreditEventSelection() {
  const select = document.getElementById("creditEventId");
  if (!select || !pendingCreditEventId) return;
  const exists = Array.from(select.options).some((o) => o.value === pendingCreditEventId);
  if (exists) select.value = pendingCreditEventId;
  pendingCreditEventId = "";
  onCreditEventSelectionChange();
}

async function rateCredit(creditId, score) {
  const credit = credits.find((c) => c.id === creditId);
  if (!credit) return;
  const ratings = { ...(credit.ratings || {}), [currentUser.id]: score };
  try {
    await Api.rateCredit({
      creditId,
      ratings: JSON.stringify(ratings),
    });
    await syncFromServer({ silent: true });
    showToast("הדירוג נשמר");
  } catch (err) {
    console.error(err);
    showToast("לא הצלחנו לשמור דירוג");
  }
}

async function rateCreditSentiment(creditId, sentiment) {
  const credit = credits.find((c) => c.id === creditId);
  if (!credit) return;
  const event = events.find((e) => e.id === credit.eventId);
  const isMyEvent = !!event && canManageEvent(event);
  if ((isOwnerRecommendation(credit) || !isMyEvent) && sentiment === "dislike") {
    showToast("בקרדיט אורחים ניתן לתת רק משוב חיובי");
    return;
  }
  try {
    await Api.rateCredit({
      creditId,
      ratings: JSON.stringify(credit.ratings || {}),
      sentiment,
    });
    await syncFromServer({ silent: true });
    showToast("העדפה נשמרה");
  } catch (err) {
    console.error(err);
    showToast("לא הצלחנו לשמור העדפה");
  }
}

// ─── חוויות ────────────────────────────────────────────────
function bindExperiences() {
  document.getElementById("experiencesTab").addEventListener("click", async (e) => {
    const dlBtn = e.target.closest("[data-download-exp-url]");
    if (dlBtn) {
      const a = document.createElement("a");
      a.href = toDownloadUrl(dlBtn.dataset.downloadExpUrl);
      a.download = dlBtn.dataset.downloadExpName || "media";
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }

    const delBtn = e.target.closest("[data-delete-experience-id]");
    if (delBtn) {
      if (delBtn.disabled) return;
      await deleteExperienceById(delBtn.dataset.deleteExperienceId);
    }
  });
}

// הרשאת מחיקת תמונה: מנהל / מי שהעלה / בעל האירוע
function canDeleteExperience(exp) {
  if (!currentUser) return false;
  if (currentUser.isAdmin) return true;
  if (exp.userId && String(exp.userId) === String(currentUser.id)) return true;
  const event = events.find((ev) => ev.id === exp.eventId);
  if (event && canManageEvent(event)) return true;
  return false;
}

function experienceMediaType(exp) {
  if (String(exp.text || "").toLowerCase() === "video") return "video";
  const url = String(exp.imageUrl || "").toLowerCase();
  if (/\.(mp4|mov|webm|m4v|ogg|avi)(\?|$)/.test(url)) return "video";
  return "image";
}

function renderExperiences() {
  const tab = document.getElementById("experiencesTab");
  const eventOptions = events
    .map((e) => `<option value="${e.id}">${eventOptionLabel(e)}</option>`)
    .join("");

  const media = experiences.filter((exp) => exp.imageUrl);
  const filterOptions = events
    .filter((e) => media.some((m) => String(m.eventId) === String(e.id)))
    .map((e) => `<option value="${e.id}">${eventOptionLabel(e)}</option>`)
    .join("");

  const visible = experiencesFilterEventId
    ? media.filter((m) => String(m.eventId) === String(experiencesFilterEventId))
    : media;

  const grouped = visible.reduce((acc, item) => {
    const key = item.eventId || "unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  tab.innerHTML = `
    <div class="glass rounded-[28px] p-4">
      <div class="font-black mb-3">אלבום משותף — תמונות וסרטונים</div>
      <select id="expEventId" class="w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm">
        <option value="">בחר/י אירוע</option>
        ${eventOptions}
        <option value="__external__">אירוע אחר / חיצוני</option>
      </select>
      <input id="expEventManual" class="hidden w-full mt-2 rounded-xl bg-white/10 border border-white/10 p-2 text-sm" placeholder="שם אירוע חיצוני" />
      <input id="expImageFile" type="file" accept="image/*,video/*" multiple class="w-full mt-2 text-sm" />
      <div class="text-[11px] text-white/45 mt-1">אפשר להעלות תמונות, מצגת או סרטון של הילדה</div>
      <button id="addExperienceBtn" type="button" class="w-full mt-3 rounded-2xl bg-gradient-to-r from-pink-500 to-purple-600 p-3 font-black">העלה/י לאלבום המשותף</button>
      <div id="expProgressWrap" class="upload-progress hidden mt-3">
        <div class="upload-progress-head">
          <span id="expProgressLabel">מעלה…</span>
          <span id="expProgressPct">0%</span>
        </div>
        <div class="upload-progress-track"><div id="expProgressBar" class="upload-progress-bar" style="width:0%"></div></div>
      </div>
    </div>

    <div class="glass rounded-2xl p-3">
      <div class="flex items-center gap-2 flex-wrap">
        <select id="expFilterEventId" class="flex-1 min-w-[140px] rounded-xl bg-white/10 border border-white/10 p-2 text-sm">
          <option value="">כל האירועים</option>
          ${filterOptions}
        </select>
        <button id="expSelectAllBtn" type="button" class="rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-xs font-bold">סמן הכל</button>
        <button id="expDownloadBtn" type="button" class="rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 px-3 py-2 text-xs font-black">הורדה</button>
      </div>
      <div class="text-[11px] text-white/45 mt-1">סמן/י פריטים והורד/י אותם למכשיר</div>
    </div>

    <div id="experiencesList" class="space-y-4"></div>
  `;

  const select = document.getElementById("expEventId");
  if (experiencesSelectedEventId) select.value = experiencesSelectedEventId;
  select.onchange = () => {
    experiencesSelectedEventId = select.value;
    document.getElementById("expEventManual").classList.toggle("hidden", select.value !== "__external__");
  };
  document.getElementById("expEventManual").classList.toggle("hidden", select.value !== "__external__");
  document.getElementById("addExperienceBtn").onclick = addExperienceFromForm;

  const filterSelect = document.getElementById("expFilterEventId");
  filterSelect.value = experiencesFilterEventId;
  filterSelect.onchange = () => {
    experiencesFilterEventId = filterSelect.value;
    renderExperiences();
  };
  document.getElementById("expSelectAllBtn").onclick = toggleSelectAllExperiences;
  document.getElementById("expDownloadBtn").onclick = downloadSelectedExperiences;

  const list = document.getElementById("experiencesList");
  const keys = Object.keys(grouped);
  list.innerHTML = keys.length
    ? keys
        .map((eventId) => {
          const event = events.find((e) => e.id === eventId);
          const title = event ? `האירוע של ${event.girlName}` : "אלבום כללי";
          const cards = grouped[eventId]
            .map((exp) => {
              const type = experienceMediaType(exp);
              const fileName = `${(event ? event.girlName : "media")}_${String(exp.id).slice(0, 6)}.${type === "video" ? "mp4" : "jpg"}`;
              const mediaEl =
                type === "video"
                  ? `<video src="${exp.imageUrl}" class="w-full rounded-xl max-h-64 bg-black" controls playsinline></video>`
                  : `<img src="${exp.imageUrl}" class="w-full rounded-xl object-cover max-h-64" alt="">`;
              const canDelete = canDeleteExperience(exp);
              return `
                <div class="relative mb-3">
                  <label class="exp-check-wrap">
                    <input type="checkbox" class="exp-select" data-url="${escapeHtmlAttr(exp.imageUrl)}" data-name="${escapeHtmlAttr(fileName)}" />
                  </label>
                  <div class="exp-actions">
                    <button type="button" class="exp-action-btn download" data-download-exp-url="${escapeHtmlAttr(exp.imageUrl)}" data-download-exp-name="${escapeHtmlAttr(fileName)}" aria-label="הורדה" title="הורדה">
                      <i class="fa-solid fa-download"></i>
                    </button>
                    <button type="button" class="exp-action-btn delete ${canDelete ? "" : "is-disabled"}" data-delete-experience-id="${exp.id}" ${canDelete ? "" : "disabled"} aria-label="מחיקה" title="${canDelete ? "מחיקה" : "רק מי שהעלה / בעל האירוע / מנהל יכול למחוק"}">
                      <i class="fa-solid fa-trash"></i>
                    </button>
                  </div>
                  ${type === "video" ? '<span class="exp-video-badge">🎬 סרטון</span>' : ""}
                  ${mediaEl}
                  <div class="text-[11px] text-white/50 mt-1">${exp.userName} • ${new Date(exp.createdAt).toLocaleString("he-IL")}</div>
                </div>
              `;
            })
            .join("");
          return `
            <div class="glass rounded-2xl p-3">
              <div class="font-black text-sm mb-2">${title} <span class="text-white/40 font-normal">(${grouped[eventId].length})</span></div>
              <div>${cards}</div>
            </div>
          `;
        })
        .join("")
    : '<div class="text-center text-white/40 text-sm">עדיין אין תמונות או סרטונים באלבומים</div>';
}

function toggleSelectAllExperiences() {
  const boxes = Array.from(document.querySelectorAll(".exp-select"));
  if (!boxes.length) return;
  const allChecked = boxes.every((b) => b.checked);
  boxes.forEach((b) => {
    b.checked = !allChecked;
  });
  const btn = document.getElementById("expSelectAllBtn");
  if (btn) btn.textContent = allChecked ? "סמן הכל" : "נקה בחירה";
}

function toDownloadUrl(url) {
  const str = String(url || "");
  const m = /[?&]id=([^&]+)/.exec(str);
  if (str.includes("drive.google.com") && m) {
    return `https://drive.google.com/uc?export=download&id=${m[1]}`;
  }
  return str;
}

function downloadSelectedExperiences() {
  const checked = Array.from(document.querySelectorAll(".exp-select:checked"));
  if (!checked.length) {
    showToast("סמן/י פריטים להורדה");
    return;
  }
  checked.forEach((cb, idx) => {
    const url = cb.dataset.url;
    const name = cb.dataset.name || `media_${idx + 1}`;
    setTimeout(() => {
      const a = document.createElement("a");
      a.href = toDownloadUrl(url);
      a.download = name;
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }, idx * 350);
  });
  showToast(`מוריד ${checked.length} פריטים`);
}

async function addExperienceFromForm() {
  const selected = document.getElementById("expEventId").value;
  const manualEvent = document.getElementById("expEventManual").value.trim();
  const eventId = selected === "__external__" ? `manual:${manualEvent}` : selected;
  const files = Array.from(document.getElementById("expImageFile").files || []);
  if (!eventId || (selected === "__external__" && !manualEvent) || !files.length) {
    showToast("בחר/י אירוע והעלה/י תמונה");
    return;
  }
  const oversize = files.find((f) => f.size > 45 * 1024 * 1024);
  if (oversize) {
    showToast("קובץ גדול מ-45MB — נסו קובץ קטן יותר");
    return;
  }
  const btn = document.getElementById("addExperienceBtn");
  if (btn) btn.disabled = true;
  showUploadProgress("expProgress", 0, `מעלה 0 מתוך ${files.length}`);
  const uploaded = [];
  try {
    for (let idx = 0; idx < files.length; idx++) {
      const file = files[idx];
      const isVideo = String(file.type || "").startsWith("video") || /\.(mp4|mov|webm|m4v|ogg|avi)$/i.test(file.name || "");
      const dataUrl = await toBase64(file);
      const parts = splitDataUrl(dataUrl);
      // טווח האחוזים של הקובץ הנוכחי מתוך כלל הקבצים
      const base = Math.round((idx / files.length) * 100);
      const span = Math.round((1 / files.length) * 100);
      const upload = await retryApiCall(() =>
        Api.uploadExperienceImageWithProgress(
          {
            fileName: file.name || `exp_${Date.now()}.${isVideo ? "mp4" : "jpg"}`,
            mimeType: file.type || parts.mimeType,
            base64Data: parts.base64,
          },
          (filePct) => {
            const overall = Math.min(99, base + Math.round((filePct / 100) * span));
            showUploadProgress("expProgress", overall, `מעלה ${idx + 1} מתוך ${files.length}`);
          }
        )
      );
      const imageUrl = upload.imageUrl || "";
      if (!imageUrl) throw new Error("לא התקבל קישור מהשרת");

      const record = {
        id: crypto.randomUUID(),
        eventId,
        userId: currentUser.id,
        userName: currentUser.parentName,
        text: isVideo ? "video" : "image",
        imageUrl,
        createdAt: new Date().toISOString(),
      };
      await retryApiCall(() => Api.createExperience(record));
      uploaded.push(record);
    }
    showUploadProgress("expProgress", 100, "הושלם");
    // הצגה מיידית (אופטימי) כדי שזה ירגיש מהיר, וסנכרון ברקע
    experiences = [...uploaded, ...experiences];
    saveJson("bm_experiences", experiences);
    document.getElementById("expImageFile").value = "";
    renderExperiences();
    showToast(uploaded.length > 1 ? `${uploaded.length} פריטים עלו לענן` : "הקובץ עלה לענן");
    syncFromServer({ silent: true });
  } catch (err) {
    const msg = String(err?.message || "");
    if (isUnknownActionError(err)) {
      // השרת לא פרוס נכון — לא מעמידים פנים שהצליח, כדי שלא ייווצרו "תמונות מקומיות" שלא בענן
      alert("ההעלאה לענן נכשלה.\n\n" + REDEPLOY_MSG);
    } else {
      console.error(err);
      showToast(`ההעלאה נכשלה: ${msg.slice(0, 90)}`);
    }
  } finally {
    if (btn) btn.disabled = false;
    hideUploadProgress("expProgress");
  }
}

// ─── סרגל התקדמות העלאה ─────────────────────────────────────
function showUploadProgress(prefix, pct, label) {
  const wrap = document.getElementById(`${prefix}Wrap`);
  if (!wrap) return;
  wrap.classList.remove("hidden");
  const bar = document.getElementById(`${prefix}Bar`);
  const pctEl = document.getElementById(`${prefix}Pct`);
  const labelEl = document.getElementById(`${prefix}Label`);
  const safe = Math.max(0, Math.min(100, Math.round(pct)));
  if (bar) bar.style.width = `${safe}%`;
  if (pctEl) pctEl.textContent = `${safe}%`;
  if (labelEl && label) labelEl.textContent = label;
}

function hideUploadProgress(prefix) {
  const wrap = document.getElementById(`${prefix}Wrap`);
  if (!wrap) return;
  // השארת "הושלם" לרגע קצר לפני הסתרה
  setTimeout(() => {
    wrap.classList.add("hidden");
    showUploadProgress(prefix, 0, "מעלה…");
  }, 700);
}

// ─── ניווט ─────────────────────────────────────────────────
function bindNavigation() {
  document.getElementById("bottomNav").addEventListener("click", (e) => {
    const tabBtn = e.target.closest("[data-tab]");
    if (tabBtn) switchTab(tabBtn.dataset.tab);
  });

  document.getElementById("eventsTab").addEventListener("click", (e) => {
    const editBtn = e.target.closest("[data-edit-id]");
    if (editBtn) {
      openModalForEdit(editBtn.dataset.editId);
      return;
    }

    const deleteBtn = e.target.closest("[data-delete-id]");
    if (deleteBtn) {
      deleteEventById(deleteBtn.dataset.deleteId);
      return;
    }

    const toggleHideBtn = e.target.closest("[data-toggle-hide-id]");
    if (toggleHideBtn) {
      toggleEventGuestsVisibility(toggleHideBtn.dataset.toggleHideId);
      return;
    }

    const quickCreditBtn = e.target.closest("[data-quick-credit-event]");
    if (quickCreditBtn) {
      pendingCreditEventId = quickCreditBtn.dataset.quickCreditEvent || "";
      switchTab("credits", false);
      return;
    }

    const btn = e.target.closest(".rsvp-btn");
    if (btn) {
      vote(btn.dataset.eventId, btn.dataset.vote);
      return;
    }

    const wazeBtn = e.target.closest("[data-waze-address]");
    if (wazeBtn) {
      window.open(`https://waze.com/ul?q=${wazeBtn.dataset.wazeAddress}&navigate=yes`, "_blank");
    }
  });

  document.getElementById("calendarTab").addEventListener("click", (e) => {
    const navBtn = e.target.closest("[data-cal-nav]");
    if (navBtn) {
      const action = navBtn.dataset.calNav || "";
      if (action === "month-prev") calendarCursor.setMonth(calendarCursor.getMonth() - 1);
      if (action === "month-next") calendarCursor.setMonth(calendarCursor.getMonth() + 1);
      if (action === "year-prev") calendarCursor.setFullYear(calendarCursor.getFullYear() - 1);
      if (action === "year-next") calendarCursor.setFullYear(calendarCursor.getFullYear() + 1);
      renderCalendar();
      return;
    }
    const eventBtn = e.target.closest("[data-calendar-event-id]");
    if (!eventBtn) return;
    const eventId = eventBtn.dataset.calendarEventId;
    switchTab("events", false);
    const cardBtn = document.querySelector(`[data-edit-id="${eventId}"], [data-event-id="${eventId}"]`);
    const card = cardBtn ? cardBtn.closest(".event-card") : null;
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      card.style.boxShadow = "0 0 0 2px rgba(244,114,182,.8), 0 0 22px rgba(244,114,182,.3)";
      setTimeout(() => {
        card.style.boxShadow = "";
      }, 1500);
    }
  });

  document.getElementById("adminTab").addEventListener("click", async (e) => {
    const editBtn = e.target.closest("[data-admin-edit-id]");
    if (editBtn) {
      openModalForEdit(editBtn.dataset.adminEditId);
      return;
    }

    const delBtn = e.target.closest("[data-admin-delete-id]");
    if (delBtn) {
      await deleteEventById(delBtn.dataset.adminDeleteId);
      return;
    }

    const delUserBtn = e.target.closest("[data-admin-delete-user-id]");
    if (delUserBtn) {
      await deleteUserById(delUserBtn.dataset.adminDeleteUserId);
      return;
    }

    const delMsgBtn = e.target.closest("[data-admin-delete-message-id]");
    if (delMsgBtn) {
      await deleteMessageById(delMsgBtn.dataset.adminDeleteMessageId);
      return;
    }

    const delCreditBtn = e.target.closest("[data-admin-delete-credit-id]");
    if (delCreditBtn) {
      await deleteCreditById(delCreditBtn.dataset.adminDeleteCreditId);
      return;
    }

    const delExpBtn = e.target.closest("[data-admin-delete-experience-id]");
    if (delExpBtn) {
      await deleteExperienceById(delExpBtn.dataset.adminDeleteExperienceId);
      return;
    }

    if (e.target.closest("#adminRefreshBtn")) {
      await syncFromServer();
      return;
    }
    if (e.target.closest("#adminClearLocalBtn")) {
      await adminClearLocalAndResync();
      return;
    }
    if (e.target.closest("#adminDeleteAllUsersBtn")) {
      await adminDeleteAllUsers();
      return;
    }
    if (e.target.closest("#adminDeleteAllEventsBtn")) {
      await adminDeleteAllEvents();
      return;
    }
    if (e.target.closest("#adminDeleteAllRsvpsBtn")) {
      await adminDeleteAllRsvps();
      return;
    }
    if (e.target.closest("#adminDeleteAllCreditsBtn")) {
      await adminDeleteAllCredits();
      return;
    }
    if (e.target.closest("#adminDeleteAllRecommendationsBtn")) {
      await adminDeleteAllRecommendations();
      return;
    }
    if (e.target.closest("#adminDeleteAllMessagesBtn")) {
      await adminDeleteAllMessages();
      return;
    }
    if (e.target.closest("#adminDeleteAllExperiencesBtn")) {
      await adminDeleteAllExperiences();
      return;
    }
    if (e.target.closest("#adminDeleteEverythingBtn")) {
      await adminDeleteEverything();
      return;
    }
  });
}

function switchTab(tab, shouldSync = true) {
  if (tab === "admin" && !currentUser?.isAdmin) {
    tab = "events";
  }

  const map = {
    events: "eventsTab",
    calendar: "calendarTab",
    messages: "messagesTab",
    credits: "creditsTab",
    experiences: "experiencesTab",
    admin: "adminTab",
  };

  if (!map[tab]) return;

  activeTab = tab;
  sessionStorage.setItem("bm_active_tab", tab);

  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.getElementById(map[tab]).classList.add("active");

  document.querySelectorAll(".nav-tab[data-tab]").forEach((btn) => {
    btn.classList.toggle("nav-tab-active", btn.dataset.tab === tab);
    btn.classList.toggle("nav-tab-idle", btn.dataset.tab !== tab);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });

  if (shouldSync && (tab === "events" || tab === "messages" || tab === "credits" || tab === "experiences")) {
    syncFromServer({ silent: true });
  }
}

// ─── עזר ───────────────────────────────────────────────────
function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
  });
}

function splitDataUrl(dataUrl) {
  const [meta, base64] = String(dataUrl).split(",");
  const mimeMatch = /data:(.*?);base64/.exec(meta || "");
  return {
    mimeType: mimeMatch ? mimeMatch[1] : "image/jpeg",
    base64: base64 || "",
  };
}

async function retryApiCall(fn, retries = 1) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 450));
      }
    }
  }
  throw lastErr;
}

function mergePendingCredits(serverCredits, pending) {
  const map = new Map();
  [...pending, ...serverCredits].forEach((c) => {
    const key = String(c.id || crypto.randomUUID());
    map.set(key, c);
  });
  return Array.from(map.values());
}

function mergePendingExperiences(serverExperiences, pending) {
  const map = new Map();
  [...pending, ...serverExperiences].forEach((exp) => {
    const key = String(exp.id || crypto.randomUUID());
    map.set(key, exp);
  });
  return Array.from(map.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function relativeDaysLabel(dateObj, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  const diffDays = Math.round((target - today) / 86400000);
  if (diffDays < 0) return "התקיים";
  if (diffDays === 0) return "היום";
  if (diffDays === 1) return "בעוד יום";
  if (diffDays === 2) return "בעוד יומיים";
  if (diffDays === 7) return "בעוד שבוע";
  if (diffDays === 14) return "בעוד שבועיים";
  return `בעוד ${diffDays} ימים`;
}

function eventOptionLabel(event) {
  const d = parseEventDateTime(event.date, event.time || "00:00");
  const dateText = d ? d.toLocaleDateString("he-IL") : (String(event.date || "").slice(0, 10) || "תאריך לא זמין");
  let status = "";
  if (d) {
    status = isEventPastByDate(event.date) ? "התקיים" : relativeDaysLabel(d);
  }
  return `האירוע של ${event.girlName || "—"} • ${dateText}${status ? ` • (${status})` : ""}`;
}
