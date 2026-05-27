/**
 * ישומון אירועי בת מצווה — לוגיקת האפליקציה
 */

// ─── מצב ───────────────────────────────────────────────────
let currentUser = loadJson(APP_CONFIG.storage.user);
let events = [];
let messages = [];
let selectedRole = APP_CONFIG.defaultRole;
let hideGuests = false;
let syncTimer = null;
let isSyncing = false;
let activeTab = sessionStorage.getItem("bm_active_tab") || "events";
let editingEventId = null;
let editingEventImage = "";
let isSavingEvent = false;

// ─── הפעלה ─────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  bindPhoneCells();
  bindRoleButtons();
  bindTwinToggle();
  bindLogin();
  bindModal();
  bindEventForm();
  bindNavigation();
  bindMessages();
  bindFloatingAdd();
  bindLogout();

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

async function syncFromServer() {
  if (isSyncing) return;
  isSyncing = true;
  setSyncStatus("מסנכרן נתונים...");

  try {
    const data = await Api.fetchAll();
    const normalized = Api.normalizePayload(data.events, data.rsvps, data.messages);
    events = normalized.events;
    messages = normalized.messages;
    renderAll();
    setSyncStatus("");
  } catch (err) {
    console.error(err);
    setSyncStatus("לא הצלחנו לטעון מהשרת — נסו שוב", true);
  } finally {
    isSyncing = false;
  }
}

function startAutoSync() {
  stopAutoSync();
  syncTimer = setInterval(syncFromServer, APP_CONFIG.syncIntervalMs);
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
  updateAddButton();
}

// ─── התחברות ───────────────────────────────────────────────
function bindLogin() {
  document.getElementById("loginForm").addEventListener("submit", (e) => {
    e.preventDefault();

    const parentName = document.getElementById("parentName").value.trim();
    const girlName = document.getElementById("girlName").value.trim();
    const twinName = document.getElementById("twinName").value.trim();

    if (!parentName || !girlName) {
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
      saved.girlName === girlName;

    currentUser = {
      id: sameUser ? saved.id : crypto.randomUUID(),
      role: selectedRole,
      parentName,
      girlName,
      twinName: twinName || "",
      phone,
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

  mom.className = `roleBtn rounded-2xl p-3 font-bold ${role === "אמא" ? "role-mom-active" : "role-mom-idle"}`;
  dad.className = `roleBtn rounded-2xl p-3 font-bold ${role === "אבא" ? "role-dad-active" : "role-dad-idle"}`;
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
    });
  });
}

// ─── מסכים ──────────────────────────────────────────────────
async function showApp() {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("appScreen").classList.remove("hidden");
  document.getElementById("bottomNav").classList.remove("hidden");

  switchTab(activeTab, false);
  await syncFromServer();
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

  document.getElementById("addBtn").classList.add("hidden");

  switchTab("events", false);
}

// ─── כותרת ─────────────────────────────────────────────────
function renderHeader() {
  document.getElementById("headerName").textContent = currentUser.parentName;
  const girls = currentUser.twinName
    ? `${currentUser.girlName} ו${currentUser.twinName}`
    : currentUser.girlName;
  document.getElementById("headerRole").textContent =
    `${currentUser.role} של ${girls}`;
}

// ─── אירועים קרובים ────────────────────────────────────────
function renderUpcoming() {
  const bar = document.getElementById("upcomingBar");
  const now = new Date();
  const upcoming = events
    .filter((e) => new Date(`${e.date}T${e.time}`) >= now)
    .slice(0, 2);

  if (!upcoming.length) {
    bar.innerHTML = "אין אירועים קרובים";
    return;
  }

  bar.innerHTML = upcoming
    .map((e) => {
      const d = new Date(`${e.date}T${e.time}`);
      const formatted =
        d.toLocaleDateString("he-IL") +
        " " +
        d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
      return `🚨 ${e.girlName} • ${formatted}`;
    })
    .join("<br>");
}

// ─── הוספת / עריכת אירוע ───────────────────────────────────
function bindFloatingAdd() {
  document.getElementById("addBtn").addEventListener("click", openModalForCreate);
  document.getElementById("navAdd").addEventListener("click", () => {
    const familyEvent = events.find((e) => e.girlName === currentUser.girlName);
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

function canManageEvent(event) {
  return event.girlName === currentUser.girlName;
}

function resetEventForm() {
  document.getElementById("eventForm").reset();
  editingEventId = null;
  editingEventImage = "";
  hideGuests = false;
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
  document.getElementById("eventMenu").value = event.menu;

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
  btn.disabled = loading;
  if (loading) {
    btn.dataset.originalText = btn.textContent;
    btn.textContent = "שומר...";
  } else if (btn.dataset.originalText) {
    btn.textContent = btn.dataset.originalText;
    delete btn.dataset.originalText;
  }
}

function updateAddButton() {
  const exists = events.some((e) => e.girlName === currentUser.girlName);
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
    const menu = document.getElementById("eventMenu").value;

    if (!date || !time || !location || !address || !menu) {
      alert("יש למלא את כל השדות");
      return;
    }

    if (!editingEventId && events.some((ev) => ev.girlName === currentUser.girlName)) {
      alert("כבר קיים אירוע למשפחה — השתמשו בעריכה");
      return;
    }

    isSavingEvent = true;
    setEventSubmitLoading(true);

    let image = editingEventImage;
    const file = document.getElementById("girlImage").files[0];
    if (file) {
      image = await toBase64(file);
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
    const formatted =
      d.toLocaleDateString("he-IL") +
      " " +
      d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

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
              <div class="text-white/50 text-sm mt-1">${formatted}</div>
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
          <div>🗺️ ${event.address}</div>
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
            event.hideGuests
              ? `<div class="text-white/40 text-sm">אישורי ההגעה מוסתרים 🔒</div>`
              : `
          <div class="flex gap-4 flex-wrap text-sm">
            <div class="text-green-300">מגיעים: ${yes}</div>
            <div class="text-yellow-300">אולי: ${maybe}</div>
            <div class="text-red-300">לא מגיעים: ${no}</div>
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
  const days = new Date(year, month + 1, 0).getDate();
  const weekdays = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

  const cells = Array.from({ length: days }, (_, i) => {
    const day = i + 1;
    const currentDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayEvents = events.filter((e) => e.date === currentDate);
    return `
      <div class="calendar-day glass rounded-2xl p-2 text-xs">
        <div class="font-bold mb-1">${day}</div>
        ${dayEvents.map((e) => `<div class="bg-pink-500 rounded-xl p-1 text-[10px] mb-1">${e.girlName}</div>`).join("")}
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

    const btn = e.target.closest(".rsvp-btn");
    if (!btn) return;
    vote(btn.dataset.eventId, btn.dataset.vote);
  });
}

function switchTab(tab, shouldSync = true) {
  const map = {
    events: "eventsTab",
    calendar: "calendarTab",
    messages: "messagesTab",
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

  if (shouldSync && (tab === "events" || tab === "messages")) {
    syncFromServer();
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
