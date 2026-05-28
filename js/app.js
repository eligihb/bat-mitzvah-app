/**
 * ישומון אירועי בת מצווה — לוגיקת האפליקציה
 */

// ─── מצב ───────────────────────────────────────────────────
let currentUser = loadJson(APP_CONFIG.storage.user);
let events = [];
let messages = [];
let credits = loadJson("bm_credits") || [];
let experiences = loadJson("bm_experiences") || [];
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
});

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
      data.experiences || []
    );
    events = normalized.events;
    messages = normalized.messages;
    if (normalized.credits?.length) credits = normalized.credits;
    if (normalized.experiences?.length) experiences = normalized.experiences;
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
    showApp();
  });
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
  document.getElementById("headerGreeting").textContent = `${greet} ${currentUser.parentName}`;
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
    .filter((e) => new Date(`${e.date}T${e.time}`) >= now)
    .sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`))
    .slice(0, 2);

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
    const d = new Date(`${e.date}T${e.time}`);
    return d >= now && d <= weekAhead;
  }).length;
  const monthCount = events.filter((e) => {
    const d = new Date(`${e.date}T${e.time}`);
    return d >= now && d <= monthAhead;
  }).length;

  const relativeLabel = (dateObj) => {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    const diffDays = Math.round((target - today) / 86400000);
    if (diffDays === 0) return "היום";
    if (diffDays === 1) return "מחר";
    if (diffDays === 2) return "מחרתיים";
    if (diffDays <= 7) return "השבוע";
    return "שבוע הבא";
  };

  bar.innerHTML = `
    <div class="space-y-2">
      ${upcoming
        .map((e) => {
          const d = new Date(`${e.date}T${e.time}`);
          const dateStr = d.toLocaleDateString("he-IL");
          const timeStr = d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
          return `<div>🚨 <span class="font-black">${relativeLabel(d)}</span> • ${e.girlName} • ${dateStr} ${timeStr}</div>`;
        })
        .join("")}
      <div class="text-xs opacity-90">לשבוע הקרוב: ${weekCount} | לחודש הקרוב: ${monthCount}</div>
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
  return (
    event.girlName === currentUser.girlName &&
    (event.familyName || "") === (currentUser.familyName || "")
  );
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

    const duplicateEvents = events.filter(
      (ev) =>
        ev.girlName === currentUser.girlName &&
        (ev.familyName || "") === (currentUser.familyName || "") &&
        (!editingEventId || ev.id !== editingEventId)
    );
    if (duplicateEvents.length) {
      const proceed = confirm("קיים כבר אירוע לילדה הזו (גם אם בשעה אחרת). להמשיך בכל זאת?");
      if (!proceed) return;
    }

    isSavingEvent = true;
    setEventSubmitLoading(true);

    let image = editingEventImage;
    const file = document.getElementById("girlImage").files[0];
    if (file) {
      image = await toBase64(file);
    }
    if (!image) {
      image = APP_CONFIG.placeholderImage;
    }

    try {
      setSyncStatus(editingEventId ? "מעדכן אירוע..." : "שומר אירוע...");

      if (editingEventId) {
        await Api.updateEvent({
          eventId: editingEventId,
          date,
          time,
          location,
          address,
          menu,
          hideAttendees: hideGuests,
          image,
        });
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
          image,
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
    await syncFromServer({ silent: true });
    showToast("ההודעה נמחקה");
  } catch (err) {
    console.error(err);
    alert("לא הצלחנו למחוק הודעה. יש להוסיף deleteMessage גם בסקריפט Google.");
  }
}

async function adminDeleteAllEvents() {
  if (!currentUser?.isAdmin) return;
  if (!confirm("למחוק את כל האירועים?")) return;
  try {
    for (const ev of [...events]) {
      await Api.deleteEvent(ev.id);
    }
    await syncFromServer({ silent: true });
    showToast("כל האירועים נמחקו");
  } catch (err) {
    console.error(err);
    alert("לא הצלחנו למחוק את כל האירועים.");
  }
}

async function adminDeleteAllMessages() {
  if (!currentUser?.isAdmin) return;
  if (!confirm("למחוק את כל ההודעות?")) return;
  try {
    for (const msg of [...messages]) {
      await Api.deleteMessage(msg.id);
    }
    await syncFromServer({ silent: true });
    showToast("כל ההודעות נמחקו");
  } catch (err) {
    console.error(err);
    alert("לא הצלחנו למחוק את כל ההודעות. יש לוודא deleteMessage בסקריפט.");
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
    setSyncStatus(nextHide ? "מסתיר אישורים..." : "מציג אישורים...");
    await Api.updateEvent({
      eventId: event.id,
      date: event.date,
      time: event.time,
      location: event.location,
      address: event.address,
      menu: event.menu,
      hideAttendees: nextHide,
      image: event.image || "",
    });
    await syncFromServer();
  } catch (err) {
    console.error(err);
    event.hideGuests = !nextHide;
    renderEvents();
    alert("לא הצלחנו לעדכן את מצב ההסתרה.");
  }
}

function renderAdminPanel() {
  const tab = document.getElementById("adminTab");
  if (!tab) return;
  if (!currentUser?.isAdmin) {
    tab.innerHTML = "";
    return;
  }

  const sorted = [...events].sort((a, b) =>
    `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)
  );

  tab.innerHTML = `
    <div class="glass rounded-[28px] p-4 mb-4">
      <div class="font-black mb-2">פאנל ניהול</div>
      <div class="text-sm text-white/60 mb-3">אירועים: ${events.length} | הודעות: ${messages.length}</div>
      <div class="grid grid-cols-3 gap-2">
        <button type="button" id="adminRefreshBtn" class="rounded-xl bg-white/10 p-2 text-xs font-bold">רענון</button>
        <button type="button" id="adminDeleteAllEventsBtn" class="rounded-xl bg-red-500/20 p-2 text-xs font-bold">מחיקת כל האירועים</button>
        <button type="button" id="adminDeleteAllMessagesBtn" class="rounded-xl bg-red-500/20 p-2 text-xs font-bold">מחיקת כל ההודעות</button>
      </div>
    </div>
    <div class="space-y-3">
      <div class="text-xs text-white/50">אירועים</div>
      ${sorted
        .map(
          (event) => `
        <div class="glass rounded-2xl p-3">
          <div class="flex items-center justify-between gap-3">
            <div>
              <div class="font-black text-sm">בת מצווה ל${event.girlName}</div>
              <div class="text-xs text-white/50 mt-1">${event.date} • ${event.time}</div>
            </div>
            <button type="button" class="event-action-btn delete" data-admin-delete-id="${event.id}" aria-label="מחיקת אירוע">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>`
        )
        .join("")}
      <div class="text-xs text-white/50 mt-4">הודעות</div>
      ${(messages || [])
        .map(
          (msg) => `
        <div class="glass rounded-2xl p-3">
          <div class="flex items-center justify-between gap-2">
            <div class="text-sm">${msg.text}</div>
            <button type="button" class="event-action-btn delete" data-admin-delete-message-id="${msg.id}" aria-label="מחיקת הודעה">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
          <div class="text-[11px] text-white/50 mt-1">${msg.name}</div>
        </div>`
        )
        .join("")}
    </div>
  `;
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
    const myVote = event.rsvp[currentUser.id];
    const yes = Object.values(event.rsvp).filter((v) => v === "yes").length;
    const maybe = Object.values(event.rsvp).filter((v) => v === "maybe").length;
    const no = Object.values(event.rsvp).filter((v) => v === "no").length;

    const d = new Date(`${event.date}T${event.time}`);
    const formattedDate = d.toLocaleDateString("he-IL");
    const formattedTime = d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

    const img = event.image || APP_CONFIG.placeholderImage;

    container.insertAdjacentHTML(
      "beforeend",
      `
      <div class="event-card glass rounded-[34px] p-5">
        <div class="flex gap-3 items-start">
          <div class="flex gap-4 flex-1 min-w-0">
            <img src="${img}" class="w-20 h-20 shrink-0 rounded-full object-cover border-4 border-white/10" alt="">
            <div class="flex-1 min-w-0">
              <h3 class="font-black text-lg">בת מצווה ל${event.girlName} ✨</h3>
              <div class="text-white/50 text-sm mt-1">תאריך: ${formattedDate} • שעה: ${formattedTime}</div>
              <div class="bg-white/10 px-3 py-1 rounded-full text-xs inline-block mt-2">${event.menu}</div>
            </div>
          </div>
          ${
            isFamily
              ? `
          <div class="event-actions">
            <button type="button" class="event-action-btn edit" data-edit-id="${event.id}" aria-label="עריכה">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button type="button" class="event-action-btn delete" data-delete-id="${event.id}" aria-label="מחיקה">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>`
              : ""
          }
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
          !isFamily
            ? `
        <div class="grid grid-cols-3 gap-2 mt-4">
          <button type="button" class="rsvp-btn ${rsvpClass(myVote, "yes")} rounded-2xl p-3 font-bold" data-event-id="${event.id}" data-vote="yes">מגיע 👍</button>
          <button type="button" class="rsvp-btn ${rsvpClass(myVote, "maybe")} rounded-2xl p-3 font-bold" data-event-id="${event.id}" data-vote="maybe">אולי 🤔</button>
          <button type="button" class="rsvp-btn ${rsvpClass(myVote, "no")} rounded-2xl p-3 font-bold" data-event-id="${event.id}" data-vote="no">לא מגיע 👎</button>
        </div>`
            : ""
        }
        <div class="mt-4 pt-4 border-t border-white/10">
          ${
            event.hideGuests && !isFamily
              ? `<div class="text-white/40 text-sm">אישורי ההגעה מוסתרים 🔒</div>`
              : `
          <div class="flex items-center justify-between gap-2 text-sm">
            ${isFamily ? `<button type="button" class="hide-rsvp-btn" data-toggle-hide-id="${event.id}"><i class="fa-solid fa-eye-slash"></i>${event.hideGuests ? "הצג" : "הסתר"}</button>` : "<span></span>"}
            <div class="flex gap-4 flex-wrap">
            <div class="text-green-300">מגיעים: ${yes}</div>
            <div class="text-yellow-300">אולי: ${maybe}</div>
            <div class="text-red-300">לא מגיעים: ${no}</div>
            </div>
          </div>`
          }
        </div>
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
  const month = now.getMonth();
  const year = now.getFullYear();
  const todayDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
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
                    `<button type="button" class="bg-pink-500 rounded-xl p-1 text-[10px] mb-1 w-full text-right" data-calendar-event-id="${e.id}">${e.girlName}</button>`
                )
                .join("")
            : `<div class="calendar-no-event">אין אירועים</div>`
        }
      </div>`;
  }).join("");

  document.getElementById("calendarTab").innerHTML = `
    <div class="grid grid-cols-7 gap-2 text-center text-xs mb-3">
      ${weekdays.map((d) => `<div>${d}</div>`).join("")}
    </div>
    <div class="grid grid-cols-7 gap-2">${cells}</div>`;
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
  document.getElementById("creditsTab").addEventListener("click", (e) => {
    const rateBtn = e.target.closest("[data-rate-credit-id]");
    if (rateBtn) {
      const score = Number(rateBtn.dataset.score || 0);
      rateCredit(rateBtn.dataset.rateCreditId, score);
    }
  });
}

function renderCredits() {
  const tab = document.getElementById("creditsTab");
  const myEvents = events.filter((e) => canManageEvent(e));

  tab.innerHTML = `
    <div class="glass rounded-[28px] p-4">
      <div class="font-black mb-3">הוספת בעל מקצוע</div>
      <div class="space-y-2">
        <select id="creditEventId" class="w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm">
          <option value="">בחר אירוע</option>
          ${myEvents.map((e) => `<option value="${e.id}">${e.girlName} • ${e.date}</option>`).join("")}
        </select>
        <input id="creditCategory" class="w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm" placeholder="תחום (צלם/קייטרינג/מפעילה...)" />
        <input id="creditName" class="w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm" placeholder="שם בעל המקצוע" />
        <input id="creditContact" class="w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm" placeholder="טלפון / וואטסאפ / לינק" />
        <button id="addCreditBtn" type="button" class="w-full rounded-xl bg-white/10 p-2 text-sm font-bold">הוסף קרדיט</button>
      </div>
    </div>
    <div id="creditsList" class="space-y-3"></div>
  `;

  document.getElementById("addCreditBtn").onclick = addCreditFromForm;
  const list = document.getElementById("creditsList");
  if (!credits.length) {
    list.innerHTML = '<div class="text-center text-white/40 text-sm">עדיין אין קרדיטים</div>';
    return;
  }

  list.innerHTML = credits
    .map((c) => {
      const event = events.find((e) => e.id === c.eventId);
      const values = Object.values(c.ratings || {}).map(Number).filter(Boolean);
      const avg = values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : "—";
      return `
        <div class="glass rounded-2xl p-3">
          <div class="font-black text-sm">${c.professionalName}</div>
          <div class="text-xs text-white/60 mt-1">${c.category} • ${event ? `${event.girlName} (${event.date})` : "אירוע לא נמצא"}</div>
          <div class="text-xs text-white/70 mt-1">יצירת קשר: ${c.contact || "—"}</div>
          <div class="text-xs text-yellow-300 mt-2">דירוג ממוצע: ${avg}</div>
          <div class="flex gap-1 mt-2">
            ${[1, 2, 3, 4, 5]
              .map(
                (score) =>
                  `<button type="button" class="event-action-btn" data-rate-credit-id="${c.id}" data-score="${score}" aria-label="דירוג ${score}">${score}</button>`
              )
              .join("")}
          </div>
        </div>`;
    })
    .join("");
}

function addCreditFromForm() {
  const eventId = document.getElementById("creditEventId").value;
  const category = document.getElementById("creditCategory").value.trim();
  const professionalName = document.getElementById("creditName").value.trim();
  const contact = document.getElementById("creditContact").value.trim();
  if (!eventId || !category || !professionalName) {
    showToast("חסר מידע בקרדיט");
    return;
  }

  credits.unshift({
    id: crypto.randomUUID(),
    eventId,
    category,
    professionalName,
    contact,
    ownerUserId: currentUser.id,
    ownerName: currentUser.parentName,
    ratings: {},
  });
  saveJson("bm_credits", credits);
  renderCredits();
  showToast("הקרדיט נוסף");
}

function rateCredit(creditId, score) {
  const credit = credits.find((c) => c.id === creditId);
  if (!credit) return;
  credit.ratings = credit.ratings || {};
  credit.ratings[currentUser.id] = score;
  saveJson("bm_credits", credits);
  renderCredits();
  showToast("הדירוג נשמר");
}

// ─── חוויות ────────────────────────────────────────────────
function bindExperiences() {
  document.getElementById("experiencesTab").addEventListener("click", () => {});
}

function renderExperiences() {
  const tab = document.getElementById("experiencesTab");
  tab.innerHTML = `
    <div class="glass rounded-[28px] p-4">
      <div class="font-black mb-3">שיתוף חוויה</div>
      <textarea id="expText" class="w-full bg-white/10 rounded-2xl p-3 outline-none min-h-[90px]" placeholder="איך היה באירוע? מה היה מוצלח?"></textarea>
      <input id="expImageUrl" class="w-full mt-2 rounded-xl bg-white/10 border border-white/10 p-2 text-sm" placeholder="קישור לתמונה (אפשר מגוגל דרייב)" />
      <input id="expImageFile" type="file" accept="image/*" class="w-full mt-2 text-sm" />
      <button id="addExperienceBtn" type="button" class="w-full mt-3 rounded-2xl bg-gradient-to-r from-pink-500 to-purple-600 p-3 font-black">פרסם חוויה</button>
    </div>
    <div id="experiencesList" class="space-y-3"></div>
  `;

  document.getElementById("addExperienceBtn").onclick = addExperienceFromForm;
  const list = document.getElementById("experiencesList");
  list.innerHTML = experiences.length
    ? experiences
        .map(
          (exp) => `
      <div class="glass rounded-2xl p-3">
        <div class="font-black text-sm">${exp.userName}</div>
        <div class="text-xs text-white/45 mt-1">${new Date(exp.createdAt).toLocaleString("he-IL")}</div>
        <div class="text-sm mt-2">${exp.text}</div>
        ${exp.imageUrl ? `<img src="${exp.imageUrl}" class="mt-3 w-full rounded-xl object-cover max-h-64" alt="">` : ""}
      </div>`
        )
        .join("")
    : '<div class="text-center text-white/40 text-sm">עדיין אין חוויות</div>';
}

async function addExperienceFromForm() {
  const text = document.getElementById("expText").value.trim();
  let imageUrl = document.getElementById("expImageUrl").value.trim();
  const file = document.getElementById("expImageFile").files[0];
  if (!text && !imageUrl && !file) {
    showToast("צריך טקסט או תמונה");
    return;
  }
  if (file) {
    imageUrl = await toBase64(file);
  }

  experiences.unshift({
    id: crypto.randomUUID(),
    userId: currentUser.id,
    userName: currentUser.parentName,
    text,
    imageUrl,
    createdAt: new Date().toISOString(),
  });
  saveJson("bm_experiences", experiences);
  renderExperiences();
  showToast("החוויה פורסמה");
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
    const delBtn = e.target.closest("[data-admin-delete-id]");
    if (delBtn) {
      await deleteEventById(delBtn.dataset.adminDeleteId);
      return;
    }

    const delMsgBtn = e.target.closest("[data-admin-delete-message-id]");
    if (delMsgBtn) {
      await deleteMessageById(delMsgBtn.dataset.adminDeleteMessageId);
      return;
    }

    if (e.target.closest("#adminRefreshBtn")) {
      await syncFromServer();
      return;
    }
    if (e.target.closest("#adminDeleteAllEventsBtn")) {
      await adminDeleteAllEvents();
      return;
    }
    if (e.target.closest("#adminDeleteAllMessagesBtn")) {
      await adminDeleteAllMessages();
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
