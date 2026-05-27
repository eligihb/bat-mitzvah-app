/**
 * ישומון אירועי בת מצווה — לוגיקת האפליקציה
 */

// ─── מצב ───────────────────────────────────────────────────
let currentUser = loadJson(APP_CONFIG.storage.user);
let events = loadJson(APP_CONFIG.storage.events) || [];
let messages = loadJson(APP_CONFIG.storage.messages) || [];
let selectedRole = APP_CONFIG.defaultRole;
let hideGuests = false;

// ─── הפעלה ─────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  bindPhoneCells();
  bindRoleButtons();
  bindLogin();
  bindModal();
  bindPrivacy();
  bindEventForm();
  bindNavigation();
  bindMessages();
  bindFloatingAdd();

  if (currentUser) {
    showApp();
  }
});

// ─── אחסון ─────────────────────────────────────────────────
function loadJson(key) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}

function saveJson(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

// ─── התחברות ───────────────────────────────────────────────
function bindLogin() {
  const form = document.getElementById("loginForm");
  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const parentName = document.getElementById("parentName").value.trim();
    const girlName = document.getElementById("girlName").value.trim();

    if (!parentName || !girlName) {
      alert("יש למלא את כל שדות החובה");
      return;
    }

    const digits = [...document.querySelectorAll(".phoneCell")]
      .map((c) => c.value)
      .join("");

    let phone = "";
    if (digits.length === 7) {
      const prefix = document.getElementById("phonePrefix").value;
      phone = `${prefix}-${digits}`;
    }

    currentUser = {
      id: crypto.randomUUID(),
      role: selectedRole,
      parentName,
      girlName,
      phone,
    };

    saveJson(APP_CONFIG.storage.user, currentUser);
    showApp();
  });
}

function bindRoleButtons() {
  document.querySelectorAll(".roleBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".roleBtn").forEach((b) => {
        b.classList.remove("bg-purple-600");
        b.classList.add("bg-white/10");
      });
      btn.classList.remove("bg-white/10");
      btn.classList.add("bg-purple-600");
      selectedRole = btn.dataset.role;
    });
  });
}

function bindPhoneCells() {
  document.querySelectorAll(".phoneCell").forEach((cell, index) => {
    cell.addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/[^0-9]/g, "");
      if (e.target.value.length === 1) {
        const cells = document.querySelectorAll(".phoneCell");
        cells[index + 1]?.focus();
      }
    });
  });
}

// ─── מסכים ──────────────────────────────────────────────────
function showApp() {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("appScreen").classList.remove("hidden");
  document.getElementById("bottomNav").classList.remove("hidden");

  renderHeader();
  renderUpcoming();
  renderEvents();
  renderCalendar();
  renderMessages();
  updateAddButton();
}

// ─── כותרת ─────────────────────────────────────────────────
function renderHeader() {
  document.getElementById("headerName").textContent = currentUser.parentName;
  document.getElementById("headerRole").textContent =
    `${currentUser.role} של ${currentUser.girlName}`;
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

// ─── הוספת אירוע ───────────────────────────────────────────
function bindFloatingAdd() {
  document.getElementById("addBtn").addEventListener("click", openModal);
  document.getElementById("navAdd").addEventListener("click", openModal);
}

function bindModal() {
  document.getElementById("closeModal").addEventListener("click", closeModal);
}

function openModal() {
  const modal = document.getElementById("eventModal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function closeModal() {
  const modal = document.getElementById("eventModal");
  modal.classList.add("hidden");
  modal.classList.remove("flex");
}

function bindPrivacy() {
  document.getElementById("privacyBtn").addEventListener("click", () => {
    hideGuests = !hideGuests;
    document.getElementById("privacyText").classList.toggle("hidden");
    document.getElementById("privacyBtn").classList.toggle("bg-purple-600");
  });
}

function updateAddButton() {
  const exists = events.some((e) => e.girlName === currentUser.girlName);
  document.getElementById("addBtn").classList.toggle("hidden", exists);
}

function bindEventForm() {
  document.getElementById("eventForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const date = document.getElementById("eventDate").value;
    const time = document.getElementById("eventTime").value;
    const location = document.getElementById("eventLocation").value.trim();
    const address = document.getElementById("eventAddress").value.trim();
    const menu = document.getElementById("eventMenu").value;

    if (!date || !time || !location || !address || !menu) {
      alert("יש למלא את כל השדות");
      return;
    }

    if (events.some((ev) => ev.girlName === currentUser.girlName)) {
      alert("האירוע כבר קיים");
      return;
    }

    let image = "";
    const file = document.getElementById("girlImage").files[0];
    if (file) {
      image = await toBase64(file);
    }

    events.push({
      id: crypto.randomUUID(),
      ownerId: currentUser.id,
      girlName: currentUser.girlName,
      date,
      time,
      location,
      address,
      menu,
      image,
      hideGuests,
      rsvp: {},
    });

    saveJson(APP_CONFIG.storage.events, events);
    renderEvents();
    renderUpcoming();
    renderCalendar();
    updateAddButton();
    closeModal();
  });
}

// ─── רשימת אירועים ─────────────────────────────────────────
function renderEvents() {
  const container = document.getElementById("eventsTab");
  container.innerHTML = "";

  events.forEach((event) => {
    const isMine = event.ownerId === currentUser.id;
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
        <div class="flex gap-4">
          <img src="${img}" class="w-20 h-20 rounded-full object-cover border-4 border-white/10" alt="">
          <div class="flex-1">
            <h3 class="font-black text-lg">בת מצווה ל${event.girlName} ✨</h3>
            <div class="text-white/50 text-sm mt-1">${formatted}</div>
            <div class="bg-white/10 px-3 py-1 rounded-full text-xs inline-block mt-2">${event.menu}</div>
          </div>
        </div>
        <div class="bg-white/5 rounded-2xl p-4 mt-4 text-sm space-y-2">
          <div>📍 ${event.location}</div>
          <div>🗺️ ${event.address}</div>
        </div>
        ${
          !isMine
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

function vote(eventId, status) {
  const event = events.find((e) => e.id === eventId);
  if (!event) return;
  event.rsvp[currentUser.id] = status;
  saveJson(APP_CONFIG.storage.events, events);
  renderEvents();
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
    const event = events.find((e) => e.date === currentDate);
    return `
      <div class="calendar-day glass rounded-2xl p-2 text-xs">
        <div class="font-bold mb-1">${day}</div>
        ${event ? `<div class="bg-pink-500 rounded-xl p-1 text-[10px]">${event.girlName}</div>` : ""}
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

function publishMessage() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!text) return;

  messages.unshift({
    id: crypto.randomUUID(),
    name: currentUser.parentName,
    text,
    date: new Date().toLocaleString("he-IL"),
  });

  saveJson(APP_CONFIG.storage.messages, messages);
  input.value = "";
  renderMessages();
}

function renderMessages() {
  const container = document.getElementById("messagesContainer");
  container.innerHTML = messages
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
    .join("");
}

// ─── ניווט ─────────────────────────────────────────────────
function bindNavigation() {
  document.getElementById("bottomNav").addEventListener("click", (e) => {
    const tabBtn = e.target.closest("[data-tab]");
    if (tabBtn) switchTab(tabBtn.dataset.tab);
  });

  document.getElementById("eventsTab").addEventListener("click", (e) => {
    const btn = e.target.closest(".rsvp-btn");
    if (!btn) return;
    vote(btn.dataset.eventId, btn.dataset.vote);
  });
}

function switchTab(tab) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));

  const map = {
    events: "eventsTab",
    calendar: "calendarTab",
    messages: "messagesTab",
  };

  document.getElementById(map[tab])?.classList.add("active");
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
