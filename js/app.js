/**
 * ישומון אירועי בת מצווה — לוגיקת האפליקציה
 */

// ─── מצב ───────────────────────────────────────────────────
let currentUser = loadJson(APP_CONFIG.storage.user);
let events = [];
let messages = [];
let users = [];
let credits = [];
let experiences = [];
let pendingCredits = [];
let pendingExperiences = [];
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
let boardPraiseKey = "";
const boardPraiseState = {};
let creditBoardView = "latest";
let isAppBootLoading = false;
const CREDIT_SERVICE_TYPES = ["צילום", "מקום אירוע", "מצגת/סרטון", "אוכל", "עיצוב", "הפעלה"];
// נותני שירות שרלוונטי להמליץ עליהם גם לפני האירוע (צלמת, מצגת/עורך וידאו)
const PRE_EVENT_SERVICE_TYPES = ["צילום", "מצגת/סרטון"];
let selectedRole = APP_CONFIG.defaultRole;
let loginEditMode = false;
let hideGuests = false;
let syncTimer = null;
let isSyncing = false;
let isExperienceUploading = false;
let activeTab = sessionStorage.getItem("bm_active_tab") || "events";
let editingEventId = null;
let editingEventImage = "";
let removeEventImage = false;
const eventSavePatchById = new Map();
let isSavingEvent = false;
let isSavingOwnerProvider = false;
let isPublishingGuest = false;
let editingProviderCreditId = null;
let eventCustomNoteOpen = false;
let lightboxItems = [];
let lightboxIndex = -1;
let selectedEventMenuChoice = "";
let toastTimer = null;
let globalUploadDepth = 0;
let globalUploadCreepTimer = null;
let rsvpScreenEventId = "";
let rsvpScreenTab = "yes";

function appBootMessage() {
  return APP_CONFIG.bootMessage || "כמה רגעים התוכן יעלה";
}

function setGlobalUpload(title, detail = "", pct = null) {
  const el = document.getElementById("globalUploadOverlay");
  if (!el) return;
  el.classList.remove("hidden");
  const titleEl = el.querySelector(".global-upload-title");
  const detailEl = el.querySelector(".global-upload-detail");
  const track = el.querySelector(".global-upload-track");
  const bar = el.querySelector(".global-upload-bar");
  const pctEl = el.querySelector(".global-upload-pct");
  if (titleEl) titleEl.textContent = title || "מעלה תוכן…";
  if (detailEl) detailEl.textContent = detail || "";
  if (pct == null || pct === undefined) {
    track?.classList.add("is-indeterminate");
    if (bar) bar.style.width = "";
    if (pctEl) pctEl.textContent = "";
  } else {
    track?.classList.remove("is-indeterminate");
    const safe = Math.max(0, Math.min(100, Math.round(pct)));
    if (bar) bar.style.width = `${safe}%`;
    if (pctEl) pctEl.textContent = `${safe}%`;
  }
}

function stopGlobalUploadCreep() {
  if (globalUploadCreepTimer) {
    clearInterval(globalUploadCreepTimer);
    globalUploadCreepTimer = null;
  }
}

function startGlobalUploadCreep(title, detail, from = 8, to = 88) {
  stopGlobalUploadCreep();
  let v = from;
  setGlobalUpload(title, detail, v);
  globalUploadCreepTimer = setInterval(() => {
    v = Math.min(to, v + 2);
    setGlobalUpload(title, detail, v);
    if (v >= to) stopGlobalUploadCreep();
  }, 280);
}

function beginGlobalUpload(title, detail = "") {
  globalUploadDepth += 1;
  stopGlobalUploadCreep();
  setGlobalUpload(title, detail, null);
}

function cancelGlobalUpload() {
  globalUploadDepth = 0;
  stopGlobalUploadCreep();
  document.getElementById("globalUploadOverlay")?.classList.add("hidden");
}

async function finishGlobalUpload(successTitle = "נשמר בהצלחה ✓", successDetail = "") {
  stopGlobalUploadCreep();
  globalUploadDepth = Math.max(0, globalUploadDepth - 1);
  if (globalUploadDepth > 0) return;
  setGlobalUpload(successTitle, successDetail, 100);
  await new Promise((r) => setTimeout(r, 750));
  document.getElementById("globalUploadOverlay")?.classList.add("hidden");
}

function normalizePhone(phone) {
  return (phone || "").replace(/[^0-9]/g, "");
}

function isAdminByPhoneAndPass(phone, pass) {
  const normalized = normalizePhone(phone);
  return normalized === normalizePhone(APP_CONFIG.adminPhone) && pass === APP_CONFIG.adminPassword;
}

// ─── גרסה ומניעת cache ישן ─────────────────────────────────
function applyVersionLabels() {
  const ver = APP_CONFIG.appVersion || "?";
  document.querySelectorAll("[data-version-label]").forEach((el) => {
    el.innerHTML = `<span dir="rtl">גרסה</span> <span class="login-version-num" dir="ltr">${ver}</span>`;
  });
}

function reloadForAppUpdate(targetVersion, reason) {
  const key = "bm_reload_attempt";
  if (sessionStorage.getItem(key) === targetVersion) {
    console.warn("עדכון גרסה נכשל לאחר רענון:", reason, targetVersion);
    return false;
  }
  sessionStorage.setItem(key, targetVersion);
  const u = new URL(window.location.href);
  u.searchParams.set("bm_v", targetVersion);
  u.searchParams.set("bm_t", String(Date.now()));
  window.location.replace(u.toString());
  return true;
}

function ensureHtmlJsVersionMatch() {
  const htmlVer = document.documentElement.dataset.appVersion || "";
  const jsVer = APP_CONFIG.appVersion || "";
  if (!htmlVer || !jsVer) return;
  if (htmlVer === jsVer) {
    sessionStorage.removeItem("bm_reload_attempt");
    return;
  }
  console.warn("אי-התאמת גרסה HTML/JS:", htmlVer, jsVer, "— ממשיכים בלי רענון אוטומטי");
}

async function checkServerAppVersion() {
  /* רענון אוטומטי גרסה הוסר — גרם למסכים ריקים בגלל cache מעורבב */
}

// ─── הפעלה ─────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  applyVersionLabels();
  ensureHtmlJsVersionMatch();

  bindPhoneCells();
  bindRoleButtons();
  bindTwinToggle();
  bindAdminAccessGate();
  bindLogin();
  bindModal();
  bindEventMenuControls();
  bindEventForm();
  bindEventImageControls();
  bindNavigation();
  bindMessages();
  bindCredits();
  bindExperiences();
  bindFloatingAdd();
  bindGlobalNav();
  bindLightbox();
  bindEventImageErrors();
  bindLogout();
  bindProfileEdit();
  bindRsvpScreen();

  if (currentUser) {
    currentUser = applyStableUserId(currentUser);
    saveJson(APP_CONFIG.storage.user, currentUser);
    showApp();
  }

  hideSplashAfterDelay();
  checkServerAppVersion();
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

const EVENTS_SNAPSHOT_KEY = "bm_events_snapshot";
const USER_PROFILE_KEY = "bm_user_profile";

function saveEventsSnapshot() {
  if (!events.length) return;
  try {
    sessionStorage.setItem(
      EVENTS_SNAPSHOT_KEY,
      JSON.stringify({ at: Date.now(), events })
    );
  } catch (_) {}
}

function restoreEventsSnapshot() {
  try {
    const raw = sessionStorage.getItem(EVENTS_SNAPSHOT_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed?.events?.length) return false;
    if (Date.now() - (parsed.at || 0) > 86400000) return false;
    events = parsed.events.map((e) => ({ ...e, rsvp: normalizeEventRsvpMap(e.rsvp) }));
    return true;
  } catch (_) {
    return false;
  }
}

/** מוחק מטמון מקומי של נתוני ענן — מקור האמת הוא השרת בלבד */
function clearCloudDataCache() {
  credits = [];
  experiences = [];
  pendingCredits = [];
  pendingExperiences = [];
  ["bm_credits", "bm_experiences", "bm_pending_credits", "bm_pending_experiences"].forEach((k) =>
    localStorage.removeItem(k)
  );
}

function setAppBootLoading(on, text) {
  isAppBootLoading = on;
  const el = document.getElementById("appBootLoading");
  if (!el) return;
  el.classList.toggle("hidden", !on);
  const label = el.querySelector(".app-boot-text");
  if (label && text) label.textContent = text;
  else if (label && on) label.textContent = appBootMessage();
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
    : "mx-4 mt-3 text-center text-xs text-emerald-300/95";
  el.classList.remove("hidden");
}

async function syncFromServer({ silent = false, boot = false } = {}) {
  if (isSyncing) return;
  isSyncing = true;
  if (boot) setAppBootLoading(true, appBootMessage());
  else if (!silent) setSyncStatus("מסנכרן נתונים...");

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
    events = normalized.events.map((e) => ({ ...e, rsvp: normalizeEventRsvpMap(e.rsvp) }));
    saveEventsSnapshot();
    applyEventSavePatches();
    messages = normalized.messages;
    users = normalized.users || [];
    reconcileCurrentUserWithServer();
    credits = mergePendingCredits(normalized.credits || [], pendingCredits);
    experiences = mergePendingExperiences(normalized.experiences || [], pendingExperiences);
    // מטמון mirror בלבד — מקור האמת הוא השרת
    saveJson("bm_credits", credits);
    saveJson("bm_experiences", experiences);
    if (boot && events.length) {
      setSyncStatus(`נטענו ${events.length} אירועים מהשרת ✓`, false);
      setTimeout(() => setSyncStatus(""), 2800);
    } else if (!silent) {
      setSyncStatus("");
    }
    paintAppAfterSync();
  } catch (err) {
    console.error(err);
    const detail = String(err?.message || "").trim();
    if (!events.length && restoreEventsSnapshot()) {
      setSyncStatus("מציגים אירועים שמורים במכשיר — לא הצלחנו לרענן מהשרת", true);
      paintAppAfterSync();
    } else if (!silent) {
      setSyncStatus(detail ? `לא הצלחנו לטעון: ${detail}` : "לא הצלחנו לטעון מהשרת — נסו שוב", true);
    } else if (boot) {
      setSyncStatus(detail ? `טעינה נכשלה: ${detail}` : "לא הצלחנו לטעון אירועים מהשרת", true);
    }
  } finally {
    isSyncing = false;
    if (boot) setAppBootLoading(false);
  }
}

function isAppScreenVisible() {
  const app = document.getElementById("appScreen");
  return !!(currentUser && app && !app.classList.contains("hidden"));
}

function paintAppAfterSync() {
  if (!isAppScreenVisible()) return;
  renderAll();
  updateAddButton(activeTab);
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
  const safe = (fn, label) => {
    try {
      fn();
    } catch (err) {
      console.error("[renderAll]", label, err);
    }
  };
  safe(renderHeader, "header");
  safe(renderUpcoming, "upcoming");
  safe(renderEvents, "events");
  safe(renderCalendar, "calendar");
  safe(renderMessages, "messages");
  safe(renderCredits, "credits");
  if (isExperienceUploading) safe(renderExperiencesListOnly, "experiences-list");
  else safe(renderExperiences, "experiences");
  safe(renderAdminPanel, "admin");
  if (rsvpScreenEventId) safe(renderRsvpScreen, "rsvp-screen");
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
  if (!currentUser || currentUser.isAdmin) return;
  const girl = String(currentUser.girlName || "").trim();
  const family = String(currentUser.familyName || "").trim();
  if (!girl || !family) return;
  const hasOtherParentEvent = events.some((e) => {
    if (String(e.ownerId || "") === String(currentUser.id)) return false;
    return (
      String(e.girlName || "").trim() === girl &&
      String(e.familyName || "").trim() === family
    );
  });
  if (hasOtherParentEvent) {
    setTimeout(() => {
      showToast("יש כבר אירוע למשפחה שלכם — הוא מופיע ברשימת האירועים");
    }, 800);
  }
}

// ─── זיהוי: משפחה (ילדה+משפחה) + הורה (אבא/אמא) ───────────
/** מזהה משפחה משותף לאבא ולאמא */
function buildFamilyId(girlName, familyName) {
  const g = normalizeFamilyPart(girlName);
  const f = normalizeFamilyPart(familyName);
  if (!g || !f) return "";
  return `${g}@@${f}`;
}

function getFamilyId(user = currentUser) {
  if (!user) return "";
  return user.familyId || buildFamilyId(user.girlName, user.familyName);
}

/** מזהה הורה בודד בגיליון Users */
function buildUserId(role, girlName, familyName) {
  const familyId = buildFamilyId(girlName, familyName);
  const r = normalizeFamilyPart(role);
  if (!familyId) return crypto.randomUUID();
  return r ? `${r}@@${familyId}` : familyId;
}

function userIdentityLabel(user = currentUser) {
  if (!user) return "";
  if (user.isAdmin) return "מנהל מערכת";
  const child = [String(user.girlName || "").trim(), String(user.familyName || "").trim()]
    .filter(Boolean)
    .join(" ");
  const role = String(user.role || "").trim() || "הורה";
  return child ? `${role} של ${child}` : role;
}

function sameParentIdentity(a, b) {
  if (!a || !b) return false;
  return (
    normalizeFamilyPart(a.role) === normalizeFamilyPart(b.role) &&
    getFamilyId(a) === getFamilyId(b)
  );
}

function sameFamilyIdentity(a, b) {
  if (!a || !b) return false;
  return getFamilyId(a) === getFamilyId(b) && !!getFamilyId(a);
}

function applyStableUserId(user) {
  if (!user || user.isAdmin) return user;
  user.familyId = buildFamilyId(user.girlName, user.familyName);
  const stableUserId = buildUserId(user.role, user.girlName, user.familyName);
  if (stableUserId && String(user.id) !== String(stableUserId)) {
    if (user.id && !String(user.id).includes("@@")) user.legacyId = user.legacyId || user.id;
    user.id = stableUserId;
  }
  return user;
}

function saveUserProfile(user) {
  if (!user?.id) return;
  saveJson(USER_PROFILE_KEY, {
    id: user.id,
    familyId: getFamilyId(user),
    parentName: user.parentName || "",
    girlName: user.girlName || "",
    familyName: user.familyName || "",
    role: user.role || "",
    phone: user.phone || "",
  });
}

function reconcileCurrentUserWithServer() {
  if (!currentUser) return;
  applyStableUserId(currentUser);
  if (users?.length) {
    const match = users.find((u) => sameParentIdentity(u, currentUser));
    if (match?.id && String(match.id) !== String(currentUser.id)) {
      if (!String(currentUser.id).includes("@@")) currentUser.legacyId = currentUser.legacyId || currentUser.id;
    }
  }
  saveJson(APP_CONFIG.storage.user, currentUser);
  saveUserProfile(currentUser);
}

function fillLoginFormFromUser(user) {
  if (!user) return;
  document.getElementById("parentName").value = user.parentName || "";
  document.getElementById("girlName").value = user.girlName || "";
  document.getElementById("familyName").value = user.familyName || "";
  selectedRole = user.role || APP_CONFIG.defaultRole;
  updateRoleButtonStyles(selectedRole);
  setTwinFieldOpen(!!user.twinName);
  document.getElementById("twinName").value = user.twinName || "";
  document.querySelectorAll(".phoneCell").forEach((c) => {
    c.value = "";
  });
  const phone = String(user.phone || "");
  const m = phone.match(/^(\d{3})-(\d{7})$/);
  if (m) {
    document.getElementById("phonePrefix").value = m[1];
    const digits = m[2].split("");
    document.querySelectorAll(".phoneCell").forEach((c, i) => {
      c.value = digits[i] || "";
    });
  }
  updateAdminFieldVisibility();
  const submitBtn = document.querySelector("#loginForm .login-submit");
  if (submitBtn) submitBtn.textContent = loginEditMode ? "שמירת פרטים" : "כניסה לישומון";
}

function openLoginForProfileEdit() {
  if (!currentUser) return;
  loginEditMode = true;
  fillLoginFormFromUser(currentUser);
  document.getElementById("appScreen").classList.add("hidden");
  document.getElementById("bottomNav").classList.add("hidden");
  document.getElementById("loginScreen").classList.remove("hidden");
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

    const wasEdit = loginEditMode;
    const prevLegacyId = currentUser?.legacyId || (wasEdit ? currentUser?.id : "");

    const familyId = buildFamilyId(girlName, familyName);
    currentUser = applyStableUserId({
      id: buildUserId(selectedRole, girlName, familyName),
      familyId,
      role: selectedRole,
      parentName,
      girlName,
      familyName,
      twinName: twinName || "",
      phone,
      isAdmin: isAdminByPhoneAndPass(phone, adminPass),
      legacyId: prevLegacyId && !String(prevLegacyId).includes("@@") ? prevLegacyId : "",
    });

    saveJson(APP_CONFIG.storage.user, currentUser);
    saveUserProfile(currentUser);
    registerCurrentUser();
    loginEditMode = false;
    const submitBtn = document.querySelector("#loginForm .login-submit");
    if (submitBtn) submitBtn.textContent = "כניסה לישומון";
    showApp();
    if (wasEdit) showToast("הפרטים עודכנו");
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

  clearCloudDataCache();
  cancelGlobalUpload();
  restoreEventsSnapshot();
  setAppBootLoading(true, appBootMessage());
  switchTab(activeTab, false);
  renderAll();
  await syncFromServer({ silent: false, boot: true });
  updateAddButton();
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
  clearCloudDataCache();
  if (currentUser) saveUserProfile(currentUser);
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
  const identity = userIdentityLabel();
  document.getElementById("headerGreeting").textContent = identity;
  if (currentUser.isAdmin) {
    document.getElementById("headerRole").textContent = `${greet} • בקרת מערכת`;
    setContactActions();
    return;
  }
  const twinNote = currentUser.twinName ? ` (אחות תאומה: ${currentUser.twinName})` : "";
  document.getElementById("headerRole").textContent = `${greet}${twinNote}`;
  setContactActions();
}

function setContactActions() {
  const callBtn = document.getElementById("callBtn");
  const waBtn = document.getElementById("waBtn");
  // למנהל — אין צורך באייקוני התקשרות אישיים בכותרת
  if (currentUser?.isAdmin) {
    callBtn.classList.add("hidden");
    waBtn.classList.add("hidden");
    return;
  }
  callBtn.classList.remove("hidden");
  waBtn.classList.remove("hidden");
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
    openLoginForProfileEdit();
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
function openFamilyEventModal() {
  if (currentUser?.isAdmin) {
    openModalForCreate();
    return;
  }
  const familyEvent = events.find(
    (e) =>
      e.girlName === currentUser.girlName &&
      (e.familyName || "") === (currentUser.familyName || "")
  );
  if (familyEvent) openModalForEdit(familyEvent.id);
  else openModalForCreate();
}

function bindFloatingAdd() {
  document.getElementById("addBtn").addEventListener("click", openFamilyEventModal);
  document.getElementById("navAdd").addEventListener("click", openFamilyEventModal);
}

function bindEventImageErrors() {
  document.getElementById("eventsTab")?.addEventListener(
    "error",
    (e) => {
      const img = e.target;
      if (img?.matches?.("img[data-event-img]")) {
        img.onerror = null;
        img.src = APP_CONFIG.placeholderImage;
      }
    },
    true
  );
  document.getElementById("eventCurrentImageEl")?.addEventListener("error", (e) => {
    e.target.onerror = null;
    e.target.src = APP_CONFIG.placeholderImage;
  });
}

function bindGlobalNav() {
  document.getElementById("homeBtn")?.addEventListener("click", () => switchTab("events"));
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

function normalizeFamilyPart(v) {
  return String(v || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function eventMatchesUserFamily(event, user = currentUser) {
  if (!event || !user) return false;
  return (
    normalizeFamilyPart(event.girlName) === normalizeFamilyPart(user.girlName) &&
    normalizeFamilyPart(event.familyName) === normalizeFamilyPart(user.familyName)
  );
}

// האירוע של המשפחה (בעל/ת) — לא כולל מנהל על אירוע זר
function isOwnEvent(event) {
  if (!event || !currentUser) return false;
  const fid = getFamilyId();
  if (fid && event.ownerId && String(event.ownerId) === String(fid)) return true;
  if (event.ownerId && String(event.ownerId) === String(currentUser.id)) return true;
  return eventMatchesUserFamily(event);
}

function normalizeEventRsvpMap(rsvp) {
  const out = {};
  Object.entries(rsvp || {}).forEach(([userId, entry]) => {
    if (!userId) return;
    if (typeof entry === "string") {
      out[userId] = { status: entry, userName: "" };
    } else {
      out[userId] = {
        status: String(entry?.status || ""),
        userName: String(entry?.userName || ""),
      };
    }
  });
  return out;
}

function rsvpEntryStatus(entry) {
  if (!entry) return "";
  if (typeof entry === "string") return entry;
  return String(entry.status || "");
}

function findUserById(userId) {
  return users.find((u) => String(u.id) === String(userId));
}

function userFamilyKeyFromUser(user) {
  return getFamilyId(user);
}

function rsvpBelongsToFamily(userId, familyId) {
  if (!familyId || !userId) return false;
  if (String(userId) === String(familyId)) return true;
  const u = findUserById(userId);
  if (u && getFamilyId(u) === familyId) return true;
  if (String(userId).endsWith(`@@${familyId}`)) return true;
  if (currentUser?.legacyId && String(userId) === String(currentUser.legacyId)) return true;
  return false;
}

function isUuidLike(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(id || ""));
}

function parseIdentityFromUserId(userId) {
  const parts = String(userId || "").split("@@").filter(Boolean);
  if (parts.length === 3) {
    return { role: parts[0], girlName: parts[1], familyName: parts[2] };
  }
  if (parts.length === 2 && !isUuidLike(parts[0])) {
    return { role: "", girlName: parts[0], familyName: parts[1] };
  }
  return null;
}

function roleFromRsvpUserName(userName) {
  const s = String(userName || "");
  if (s.includes("אבא")) return "אבא";
  if (s.includes("אמא")) return "אמא";
  return "";
}

function buildAttendeeDisplayLabel(userId, fallbackUserName = "") {
  const u = findUserById(userId);
  if (u) {
    const role = String(u.role || "").trim() || "הורה";
    const child = [String(u.girlName || "").trim(), String(u.familyName || "").trim()]
      .filter(Boolean)
      .join(" ");
    return child ? `${role} של ${child}` : role;
  }

  const parsed = parseIdentityFromUserId(userId);
  if (parsed?.girlName && parsed?.familyName) {
    const role = String(parsed.role || "").trim() || roleFromRsvpUserName(fallbackUserName) || "הורה";
    const child = [parsed.girlName, parsed.familyName].filter(Boolean).join(" ");
    return `${role} של ${child}`;
  }

  const famUser = users.find((x) => getFamilyId(x) === String(userId));
  if (famUser) return buildAttendeeDisplayLabel(famUser.id);

  if (currentUser && getFamilyId() === userId) return userIdentityLabel(currentUser);

  const role = roleFromRsvpUserName(fallbackUserName);
  const nameOnly = String(fallbackUserName || "")
    .replace(/אבא|אמא/g, "")
    .trim();
  if (role && nameOnly) {
    const guess = users.find(
      (x) =>
        String(x.role || "") === role &&
        String(x.parentName || "").trim() === nameOnly
    );
    if (guess) return buildAttendeeDisplayLabel(guess.id);
  }

  if (isUuidLike(userId)) return "";
  return "הורה";
}

function familyKeyForRsvpEntry(entry) {
  const u = findUserById(entry.userId);
  if (u) {
    const fk = getFamilyId(u);
    if (fk) return fk;
  }

  const parsed = parseIdentityFromUserId(entry.userId);
  if (parsed?.girlName && parsed?.familyName) {
    return buildFamilyId(parsed.girlName, parsed.familyName);
  }

  if (getFamilyId() && rsvpBelongsToFamily(entry.userId, getFamilyId())) {
    return getFamilyId();
  }

  const role = roleFromRsvpUserName(entry.userName);
  const parentGuess = String(entry.userName || "")
    .replace(/אבא|אמא/g, "")
    .trim();
  if (role && parentGuess) {
    const match = users.find(
      (x) => String(x.role || "") === role && String(x.parentName || "").trim() === parentGuess
    );
    if (match) return getFamilyId(match) || `uid:${entry.userId}`;
  }

  return `uid:${entry.userId}`;
}

function pickBestRsvpLabel(entries) {
  const labels = entries
    .map((e) => buildAttendeeDisplayLabel(e.userId, e.userName))
    .filter((l) => l && !isUuidLike(l));
  const best = labels.find((l) => /של/.test(l) && (l.startsWith("אבא") || l.startsWith("אמא")));
  return best || labels[0] || "הורה";
}

function getRsvpEntries(event) {
  return Object.entries(event?.rsvp || {})
    .map(([userId, entry]) => ({
      userId,
      status: rsvpEntryStatus(entry),
      userName: typeof entry === "object" ? entry.userName : "",
    }))
    .filter((e) => e.status);
}

function countRsvpByStatus(event, status) {
  return buildRsvpListRows(event, status).length;
}

function canVoteOnEvent(event) {
  return !!event && !!currentUser && !isOwnEvent(event);
}

function canViewRsvpDetails(event) {
  if (!event || !currentUser) return false;
  if (currentUser.isAdmin) return true;
  if (isOwnEvent(event)) return true;
  return !event.hideGuests;
}

/** אישור הגעה ברמת משפחה — משותף לאבא ולאמא */
function findFamilyRsvpEntry(event) {
  if (!currentUser || !event?.rsvp) return null;
  const familyId = getFamilyId();
  if (!familyId) return null;

  if (event.rsvp[familyId]) {
    const entry = event.rsvp[familyId];
    return { userId: familyId, entry, status: rsvpEntryStatus(entry) };
  }

  if (currentUser.legacyId && event.rsvp[currentUser.legacyId]) {
    const entry = event.rsvp[currentUser.legacyId];
    return { userId: currentUser.legacyId, entry, status: rsvpEntryStatus(entry) };
  }

  for (const [userId, entry] of Object.entries(event.rsvp)) {
    if (rsvpBelongsToFamily(userId, familyId)) {
      return { userId, entry, status: rsvpEntryStatus(entry) };
    }
  }
  return null;
}

function getFamilyVoteUserId() {
  return getFamilyId() || currentUser?.id || "";
}

function getOtherFamilyRsvp(event) {
  if (!currentUser || isOwnEvent(event)) return null;
  const familyVote = findFamilyRsvpEntry(event);
  if (!familyVote?.status) return null;

  const who =
    typeof familyVote.entry === "object" ? String(familyVote.entry.userName || "").trim() : "";
  const myRole = String(currentUser.role || "").trim();
  const otherRole = myRole === "אבא" ? "אמא" : myRole === "אמא" ? "אבא" : "";

  if (otherRole && who.includes(otherRole)) {
    return {
      status: familyVote.status,
      label: who || buildAttendeeDisplayLabel(familyVote.userId),
      userId: familyVote.userId,
    };
  }

  if (String(familyVote.userId) !== String(currentUser.id)) {
    const voter = findUserById(familyVote.userId);
    if (voter && sameFamilyIdentity(voter, currentUser) && !sameParentIdentity(voter, currentUser)) {
      return {
        status: familyVote.status,
        label: buildAttendeeDisplayLabel(familyVote.userId),
        userId: familyVote.userId,
      };
    }
  }

  return null;
}

function getMyRsvpStatus(event) {
  if (getOtherFamilyRsvp(event)) return "";
  return findFamilyRsvpEntry(event)?.status || "";
}

function buildRsvpListRows(event, statusFilter) {
  const entries = getRsvpEntries(event).filter((e) => e.status === statusFilter);
  const byFamily = new Map();
  entries.forEach((entry) => {
    const fk = familyKeyForRsvpEntry(entry);
    if (!byFamily.has(fk)) byFamily.set(fk, []);
    byFamily.get(fk).push(entry);
  });
  const rows = [];
  byFamily.forEach((list) => {
    const label = pickBestRsvpLabel(list);
    if (!label) return;
    rows.push({ label, status: list[0].status });
  });
  return rows;
}

function adminConfirm(message) {
  if (!currentUser?.isAdmin) return true;
  return confirm(`פעולה כמנהל — לוודא לפני המשך\n\n${message}`);
}

function openRsvpScreen(eventId, tab = "yes") {
  const event = events.find((e) => String(e.id) === String(eventId));
  if (!event || !canViewRsvpDetails(event)) return;
  rsvpScreenEventId = event.id;
  rsvpScreenTab = tab;
  renderRsvpScreen();
  document.getElementById("rsvpScreen")?.classList.remove("hidden");
  document.getElementById("appScreen")?.classList.add("rsvp-screen-open");
}

function closeRsvpScreen() {
  rsvpScreenEventId = "";
  document.getElementById("rsvpScreen")?.classList.add("hidden");
  document.getElementById("appScreen")?.classList.remove("rsvp-screen-open");
}

function renderRsvpScreen() {
  const event = events.find((e) => String(e.id) === String(rsvpScreenEventId));
  const title = document.getElementById("rsvpScreenTitle");
  const sub = document.getElementById("rsvpScreenSub");
  const list = document.getElementById("rsvpScreenList");
  if (!event || !title || !sub || !list) return;

  title.textContent = "אישורי הגעה";
  sub.textContent = `בת מצווה ל${event.girlName}${event.familyName ? " " + event.familyName : ""} • ${event.date || ""}`;

  document.querySelectorAll(".rsvp-screen-tab").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.rsvpTab === rsvpScreenTab);
  });

  const rows = buildRsvpListRows(event, rsvpScreenTab);
  const tabLabels = { yes: "מגיעים", maybe: "אולי", no: "לא מגיעים" };
  list.innerHTML = rows.length
    ? rows.map((r) => `<div class="rsvp-list-row">${escapeHtmlAttr(r.label)}</div>`).join("")
    : `<div class="rsvp-list-empty">אין ${tabLabels[rsvpScreenTab] || ""} עדיין</div>`;
}

function bindRsvpScreen() {
  document.getElementById("rsvpScreenBack")?.addEventListener("click", closeRsvpScreen);
  document.getElementById("rsvpScreen")?.addEventListener("click", (e) => {
    const tabBtn = e.target.closest("[data-rsvp-tab]");
    if (tabBtn) {
      rsvpScreenTab = tabBtn.dataset.rsvpTab || "yes";
      renderRsvpScreen();
    }
  });
}

function renderEventRsvpSection(event, isPastEvent, canManage) {
  const canView = canViewRsvpDetails(event);
  const canVote = canVoteOnEvent(event) && !isPastEvent;
  const otherFamily = getOtherFamilyRsvp(event);
  const myVote = getMyRsvpStatus(event);
  const yes = countRsvpByStatus(event, "yes");
  const maybe = countRsvpByStatus(event, "maybe");
  const no = countRsvpByStatus(event, "no");

  let voteHtml = "";
  if (canVote && otherFamily) {
    const statusLabel =
      otherFamily.status === "yes" ? "מגיע" : otherFamily.status === "maybe" ? "אולי" : "לא מגיע";
    voteHtml = `<div class="rsvp-family-notice rounded-2xl border border-purple-400/35 bg-purple-500/10 p-3 text-sm text-purple-100">
      אושרה הגעה על ידי ההורה השני (${escapeHtmlAttr(otherFamily.label)}) — ${statusLabel}
    </div>`;
  } else if (canVote) {
    voteHtml = `<div class="grid grid-cols-3 gap-2 mt-4">
      <button type="button" class="rsvp-btn ${rsvpClass(myVote, "yes")} rounded-2xl p-3 font-bold" data-event-id="${event.id}" data-vote="yes">מגיע 👍</button>
      <button type="button" class="rsvp-btn ${rsvpClass(myVote, "maybe")} rounded-2xl p-3 font-bold" data-event-id="${event.id}" data-vote="maybe">אולי 🤔</button>
      <button type="button" class="rsvp-btn ${rsvpClass(myVote, "no")} rounded-2xl p-3 font-bold" data-event-id="${event.id}" data-vote="no">לא מגיע 👎</button>
    </div>`;
  }

  const summaryInner = canView
    ? `<button type="button" class="rsvp-open-btn" data-open-rsvp-id="${event.id}"><i class="fa-solid fa-users"></i> אישורי הגעה</button>
      <div class="flex gap-4 flex-wrap rsvp-summary-counts">
        <button type="button" class="rsvp-count-btn text-green-300" data-open-rsvp-id="${event.id}" data-rsvp-tab="yes">מגיעים: ${yes}</button>
        <button type="button" class="rsvp-count-btn text-yellow-300" data-open-rsvp-id="${event.id}" data-rsvp-tab="maybe">אולי: ${maybe}</button>
        <button type="button" class="rsvp-count-btn text-red-300" data-open-rsvp-id="${event.id}" data-rsvp-tab="no">לא מגיעים: ${no}</button>
      </div>`
    : `<div class="text-white/40 text-sm">אישורי ההגעה מוסתרים 🔒</div>`;

  const hideBtn =
    canManage && !currentUser?.isAdmin
      ? `<button type="button" class="hide-rsvp-btn" data-toggle-hide-id="${event.id}" title="הסתר ממשתמשים אחרים" aria-label="הסתר ממשתמשים אחרים">
          <i class="fa-solid fa-eye-slash"></i>
        </button>`
      : canManage && currentUser?.isAdmin
        ? `<span class="text-[10px] text-white/40">מנהל רואה תמיד</span>`
        : "";

  return `<div class="mt-4 pt-4 border-t border-white/10">
    ${voteHtml}
    <div class="rsvp-summary-row text-sm ${voteHtml ? "mt-4" : ""}">
      ${summaryInner}
      ${hideBtn}
    </div>
    ${
      canManage && event.hideGuests
        ? `<div class="text-[12px] text-purple-200/85 mt-2">תוכן זה מוסתר ממשתמשים אחרים</div>`
        : ""
    }
  </div>`;
}

function creditBlockMessage(icon, text) {
  return `
    <div class="credit-block-msg rounded-2xl border border-pink-400/30 bg-pink-500/10 p-4 text-center">
      <div class="text-3xl mb-2">${icon}</div>
      <div class="text-sm leading-6 text-white/90">${text}</div>
    </div>`;
}

function rememberEventSavePatch(eventId, fields) {
  if (!eventId) return;
  eventSavePatchById.set(String(eventId), { fields, at: Date.now() });
}

function applyEventSavePatches() {
  const now = Date.now();
  eventSavePatchById.forEach((entry, id) => {
    if (now - entry.at > 120000) {
      eventSavePatchById.delete(id);
      return;
    }
    const idx = events.findIndex((e) => String(e.id) === String(id));
    if (idx >= 0) events[idx] = { ...events[idx], ...entry.fields };
  });
}

function eventFormDateValue(rawDate) {
  const s = String(rawDate || "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  }
  const p = parseEventDateTime(s, "12:00");
  if (p) {
    return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, "0")}-${String(p.getDate()).padStart(2, "0")}`;
  }
  return s.slice(0, 10);
}

function eventFormTimeValue(rawTime) {
  const s = String(rawTime || "").trim();
  if (!s) return "";
  if (/^\d{1,2}:\d{2}/.test(s)) {
    const [h, m] = s.split(":");
    return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
  }
  if (s.includes("T")) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false });
    }
  }
  return "";
}

function renderEventImagePreview() {
  const preview = document.getElementById("eventCurrentImagePreview");
  const imgEl = document.getElementById("eventCurrentImageEl");
  const fileInput = document.getElementById("girlImage");
  const newChip = document.getElementById("eventNewImageChip");
  const newName = document.getElementById("eventNewImageName");
  if (!preview || !imgEl) return;

  const showCurrent = !!editingEventImage && !removeEventImage && sanitizeEventImage(editingEventImage) !== APP_CONFIG.placeholderImage;
  preview.classList.toggle("hidden", !showCurrent);
  if (showCurrent) imgEl.src = eventImageDisplayUrl(editingEventImage);

  const file = fileInput?.files?.[0];
  if (newChip && newName) {
    newChip.classList.toggle("hidden", !file);
    if (file) newName.textContent = file.name;
  }
}

function bindEventImageControls() {
  document.getElementById("removeEventImageBtn")?.addEventListener("click", () => {
    removeEventImage = true;
    editingEventImage = "";
    const fileInput = document.getElementById("girlImage");
    if (fileInput) fileInput.value = "";
    renderEventImagePreview();
  });
  document.getElementById("clearNewImageBtn")?.addEventListener("click", () => {
    const fileInput = document.getElementById("girlImage");
    if (fileInput) fileInput.value = "";
    renderEventImagePreview();
  });
  document.getElementById("girlImage")?.addEventListener("change", () => {
    removeEventImage = false;
    renderEventImagePreview();
  });
}

async function uploadEventImageFile(file) {
  const dataUrl = await toBase64(file);
  const parts = splitDataUrl(dataUrl);
  const up = await retryApiCall(() =>
    Api.uploadExperienceImage({
      fileName: file.name || `event_${Date.now()}.jpg`,
      mimeType: file.type || parts.mimeType,
      base64Data: parts.base64,
    })
  );
  const url = up.imageUrl || "";
  if (!url) throw new Error("לא התקבל קישור לתמונה");
  return url;
}

function isDrivePermissionError(err) {
  const msg = String(err?.message || err || "");
  return /DriveApp|הרשאה|permission|authorization/i.test(msg);
}

function resetEventForm() {
  removeEventImage = false;
  eventCustomNoteOpen = false;
  document.getElementById("eventForm").reset();
  document.getElementById("eventCustomNoteWrap")?.classList.add("hidden");
  document.getElementById("toggleEventNoteBtn")?.classList.remove("hidden");
  editingEventId = null;
  editingEventImage = "";
  hideGuests = false;
  setEventMenuValue("");
  document.getElementById("currentImageHint")?.classList.add("hidden");
  document.getElementById("modalTitle").textContent = "הוספת אירוע";
  document.getElementById("eventSubmitBtn").textContent = "פרסום אירוע 🚀";
  setEventSubmitLoading(false);
  renderEventImagePreview();
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
  removeEventImage = false;

  document.getElementById("eventDate").value = eventFormDateValue(event.date);
  document.getElementById("eventTime").value = eventFormTimeValue(event.time);
  document.getElementById("eventLocation").value = event.location || "";
  document.getElementById("eventAddress").value = event.address || "";
  setEventMenuValue(event.menu);
  const noteEl = document.getElementById("eventCustomNote");
  if (noteEl) {
    noteEl.value = event.eventNote || "";
    eventCustomNoteOpen = !!event.eventNote;
    document.getElementById("eventCustomNoteWrap")?.classList.toggle("hidden", !eventCustomNoteOpen);
    document.getElementById("toggleEventNoteBtn")?.classList.toggle("hidden", !!event.eventNote);
  }

  hideGuests = event.hideGuests;

  document.getElementById("modalTitle").textContent = "עריכת אירוע";
  document.getElementById("eventSubmitBtn").textContent = "שמירת שינויים ✓";
  renderEventImagePreview();

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

function userHasFamilyEvent() {
  if (!currentUser) return false;
  const girl = String(currentUser.girlName || "").trim();
  const family = String(currentUser.familyName || "").trim();
  return events.some(
    (e) => String(e.girlName || "").trim() === girl && String(e.familyName || "").trim() === family
  );
}

function updateAddButton(tabName = activeTab) {
  const addBtn = document.getElementById("addBtn");
  const navAdd = document.getElementById("navAdd");
  if (!currentUser) {
    addBtn?.classList.add("hidden");
    navAdd?.classList.add("hidden");
    return;
  }
  const isAdmin = !!currentUser.isAdmin;
  const onAdminTab = tabName === "admin";
  const showFab = !onAdminTab;
  addBtn?.classList.toggle("hidden", !showFab);
  const showNavAdd = !isAdmin && showFab && !userHasFamilyEvent();
  navAdd?.classList.toggle("hidden", !showNavAdd);
}

function bindEventForm() {
  document.getElementById("toggleEventNoteBtn")?.addEventListener("click", () => {
    eventCustomNoteOpen = true;
    document.getElementById("eventCustomNoteWrap")?.classList.remove("hidden");
    document.getElementById("toggleEventNoteBtn")?.classList.add("hidden");
    document.getElementById("eventCustomNote")?.focus();
  });

  document.getElementById("eventForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isSavingEvent) return;

    const date = document.getElementById("eventDate").value;
    const time = document.getElementById("eventTime").value;
    const location = document.getElementById("eventLocation").value.trim();
    const address = document.getElementById("eventAddress").value.trim();
    const menu = getEventMenuValue();
    const eventNote = document.getElementById("eventCustomNote")?.value.trim().slice(0, 120) || "";

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
    beginGlobalUpload(editingEventId ? "מעדכן אירוע" : "שומר אירוע", "אנא המתינו…");

    // העלאת תמונה — רק אם נבחר קובץ חדש; כישלון לא חוסם עריכת שאר השדות
    let newImageUrl = "";
    const file = document.getElementById("girlImage").files[0];
    if (file) {
      startGlobalUploadCreep("מעלה תמונה", "זה עלול לקחת כמה רגעים…", 12, 75);
      try {
        newImageUrl = await uploadEventImageFile(file);
        stopGlobalUploadCreep();
        setGlobalUpload("מעלה תמונה", "התמונה עלתה", 78);
      } catch (imgErr) {
        stopGlobalUploadCreep();
        console.error(imgErr);
        if (editingEventId) {
          const cont = confirm(
            "העלאת התמונה נכשלה (חסרה הרשאת Drive ב-Apps Script).\n\nלשמור את שאר השינויים בלי לעדכן תמונה?"
          );
          if (!cont) {
            isSavingEvent = false;
            setEventSubmitLoading(false);
            cancelGlobalUpload();
            return;
          }
        } else {
          setGlobalUpload("שומר אירוע", "התמונה לא עלתה — שומרים עם תמונת ברירת מחדל", 40);
        }
      }
    }

    try {
      setGlobalUpload(editingEventId ? "מעדכן אירוע" : "שומר אירוע", "שולח לענן…", file ? 85 : 55);

      if (editingEventId) {
        const payload = {
          eventId: editingEventId,
          date,
          time,
          location,
          address,
          menu,
          eventNote,
          hideAttendees: hideGuests,
        };
        if (newImageUrl) payload.image = newImageUrl;
        if (removeEventImage) {
          payload.removeImage = true;
          payload.image = APP_CONFIG.placeholderImage;
        }
        await Api.updateEvent(payload);
        const patch = { date, time, location, address, menu, eventNote, hideGuests };
        if (newImageUrl) patch.image = newImageUrl;
        if (removeEventImage) patch.image = APP_CONFIG.placeholderImage;
        rememberEventSavePatch(editingEventId, patch);
        const idx = events.findIndex((ev) => ev.id === editingEventId);
        if (idx >= 0) events[idx] = { ...events[idx], ...patch };
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
          eventNote,
          hideAttendees: hideGuests,
          image: newImageUrl || APP_CONFIG.placeholderImage,
          phone: currentUser.phone || "",
          role: currentUser.role,
        });
      }

      closeModal();
      renderAll();
      await finishGlobalUpload(editingEventId ? "האירוע עודכן ✓" : "האירוע נשמר ✓");
      syncFromServer({ silent: true });
    } catch (err) {
      console.error(err);
      cancelGlobalUpload();
      alert(editingEventId ? "לא הצלחנו לעדכן את האירוע." : "לא הצלחנו לשמור את האירוע.");
    } finally {
      isSavingEvent = false;
      setEventSubmitLoading(false);
    }
  });
}

async function deleteEventById(eventId) {
  const event = events.find((e) => e.id === eventId);
  if (!event || !canManageEvent(event)) return;
  const msg = `למחוק את האירוע של ${event.girlName}?`;
  if (currentUser?.isAdmin) {
    if (!adminConfirm(msg)) return;
  } else if (!confirm(msg)) return;

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
  if (!adminConfirm(`למחוק ${label}?`)) return;
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
  if (!adminConfirm("למחוק את כל הקרדיטים?")) return;
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
  if (!adminConfirm("למחוק את כל ההמלצות?")) return;
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
  const ids = String(userId || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  try {
    for (const id of ids) {
      await Api.deleteUser(id);
    }
    users = users.filter((u) => !ids.includes(String(u.id)));
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

// ייצוא טבלה ל-CSV (נפתח באקסל, כולל BOM לעברית תקינה)
function downloadCsv(filename, headerRow, dataRows) {
  const escapeCell = (v) => {
    const s = String(v == null ? "" : v).replace(/"/g, '""');
    return `"${s}"`;
  };
  const lines = [headerRow, ...dataRows].map((r) => r.map(escapeCell).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + lines], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportProvidersCsv() {
  const providers = aggregateAllProviders();
  if (!providers.length) {
    showToast("אין נותני שירות לייצוא");
    return;
  }
  const rows = providers.map((p) => [
    p.name,
    p.category || "",
    p.avg === "—" ? "" : p.avg,
    p.ratingCount,
    p.eventCount,
    p.phone || "",
  ]);
  downloadCsv(
    "providers.csv",
    ["שם נותן שירות", "קטגוריה", "דירוג ממוצע", "כמות מדרגים", "כמות אירועים", "טלפון"],
    rows
  );
  showToast("דוח נותני שירות יוצא");
}

function exportVenuesCsv() {
  const rows = (events || [])
    .filter((e) => (e.location || "").trim())
    .map((e) => {
      const d = parseEventDateTime(e.date, e.time || "00:00");
      const dateText = d ? d.toLocaleDateString("he-IL") : e.date || "";
      return [e.location || "", e.address || "", e.girlName || "", dateText];
    });
  if (!rows.length) {
    showToast("אין אולמות לייצוא");
    return;
  }
  downloadCsv("venues.csv", ["אולם", "כתובת", "אירוע (בת)", "תאריך"], rows);
  showToast("דוח אולמות יוצא");
}

// מזהה ייחודי טבעי למשתמש: לפי טלפון, ואם אין — לפי שם הורה+ילדה+משפחה
function userNaturalKey(u) {
  const phone = String(u.phone || "").replace(/\D/g, "");
  if (phone) return "p:" + phone;
  return (
    "n:" +
    [u.parentName, u.girlName, u.familyName]
      .map((x) => String(x || "").trim().toLowerCase())
      .join("|")
  );
}

// מאחד כניסות חוזרות של אותו משתמש לרשומה אחת (מאסף את כל ה-ids למחיקה)
function dedupeUsers(list) {
  const map = new Map();
  (list || []).forEach((u) => {
    const key = userNaturalKey(u);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...u, _ids: [u.id].filter(Boolean) });
      return;
    }
    prev._ids = Array.from(new Set([...(prev._ids || []), u.id].filter(Boolean)));
    if (String(u.lastSeen || "") > String(prev.lastSeen || "")) {
      Object.assign(prev, u, { _ids: prev._ids });
    }
  });
  return Array.from(map.values());
}

// מקבץ משתמשים לפי הילדה (הורים של אותה ילדה יוצגו יחד)
function groupUsersByGirl(list) {
  const groups = new Map();
  dedupeUsers(list).forEach((u) => {
    const girlKey = [u.girlName, u.familyName]
      .map((x) => String(x || "").trim().toLowerCase())
      .join("|");
    const hasGirl = girlKey.replace(/\|/g, "").trim().length > 0;
    const key = hasGirl ? "g:" + girlKey : "solo:" + (u._ids?.[0] || u.parentName || Math.random());
    if (!groups.has(key)) {
      groups.set(key, { girlName: u.girlName || "", familyName: u.familyName || "", members: [] });
    }
    groups.get(key).members.push(u);
  });
  return Array.from(groups.values());
}

function purgeCreditLocally(creditId) {
  credits = credits.filter((c) => c.id !== creditId);
  pendingCredits = pendingCredits.filter((c) => c.id !== creditId);
  saveJson("bm_credits", credits);
  saveJson("bm_pending_credits", pendingCredits);
}

async function deleteCreditById(creditId) {
  const credit = credits.find((c) => c.id === creditId);
  if (!credit) return;
  const event = events.find((e) => e.id === credit.eventId);
  const canDelete =
    currentUser?.isAdmin ||
    (isProviderEntry(credit) && event && canManageEvent(event));
  if (!canDelete) return;
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
  purgeCreditLocally(creditId);
  if (creditScreen === "owner") refreshOwnerProviders();
  else if (creditScreen === "guest") refreshGuestProviders();
  else renderCredits();
  syncFromServer({ silent: true });
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
  if (!event || !isOwnEvent(event)) return;
  if (currentUser?.isAdmin && !adminConfirm("לשנות נראות אישורי הגעה לאירוע זה?")) return;

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
  const creditList = (credits || []).filter((c) => !isOwnerRecommendation(c) && !isProviderEntry(c));
  const providerList = (credits || []).filter((c) => isProviderEntry(c));
  const recList = (credits || []).filter((c) => isOwnerRecommendation(c));
  const photoList = experiences.filter((e) => e.imageUrl);
  const userGroups = groupUsersByGirl(users);
  const uniqueUserCount = userGroups.reduce((sum, g) => sum + g.members.length, 0);

  const adminCard = (title, meta, actions = "") => `
    <div class="admin-data-card">
      <div class="admin-data-body">
        <div class="admin-data-title">${title}</div>
        ${meta ? `<div class="admin-data-meta">${meta}</div>` : ""}
      </div>
      ${actions ? `<div class="admin-data-actions">${actions}</div>` : ""}
    </div>`;

  const adminDeleteBtn = (attrs, label = "מחיקה") =>
    `<button type="button" class="admin-icon-btn admin-icon-btn-danger" ${attrs} aria-label="${label}"><i class="fa-solid fa-trash"></i></button>`;

  const adminEditBtn = (attrs) =>
    `<button type="button" class="admin-icon-btn admin-icon-btn-edit" ${attrs} aria-label="עריכה"><i class="fa-solid fa-pen"></i></button>`;

  const emptyState = (txt) => `<div class="admin-empty">${txt}</div>`;
  const kpi = (label, value, icon) =>
    `<div class="admin-kpi"><div class="admin-kpi-icon">${icon}</div><div class="admin-kpi-value">${value}</div><div class="admin-kpi-label">${label}</div></div>`;

  const dangerOpen = tab.dataset.dangerOpen === "1";

  tab.innerHTML = `
    <div class="admin-panel">
      <header class="admin-panel-head">
        <h2 class="admin-panel-title">פאנל ניהול</h2>
        <p class="admin-panel-sub">סקירה, ייצוא וניהול נתוני המערכת</p>
      </header>
      <div class="admin-kpi-grid">
        ${kpi("משתמשים", uniqueUserCount, "👥")}
        ${kpi("אירועים", events.length, "🎉")}
        ${kpi("אישורי הגעה", rsvpCount, "✅")}
        ${kpi("תמונות", photoList.length, "🖼️")}
      </div>
      <div class="admin-toolbar">
        <button type="button" id="adminRefreshBtn" class="admin-btn admin-btn-neutral"><i class="fa-solid fa-rotate"></i> רענון</button>
        <button type="button" id="adminClearLocalBtn" class="admin-btn admin-btn-neutral"><i class="fa-solid fa-broom"></i> ניקוי מטמון</button>
        <button type="button" id="adminExportProvidersBtn" class="admin-btn admin-btn-primary"><i class="fa-solid fa-file-export"></i> ייצוא נותני שירות</button>
        <button type="button" id="adminExportVenuesBtn" class="admin-btn admin-btn-primary"><i class="fa-solid fa-building"></i> ייצוא אולמות</button>
      </div>

      <section class="admin-section">
        <div class="admin-section-head"><h3 class="admin-section-title">משתמשים רשומים</h3><span class="admin-section-count">${uniqueUserCount}</span></div>
        <div class="admin-section-body">
          ${
            userGroups.length
              ? userGroups
                  .map((g) => {
                    const girlTitle = g.girlName
                      ? `${g.girlName}${g.familyName ? " " + g.familyName : ""}`
                      : "ללא שיוך לילדה";
                    const parents = g.members
                      .map((u) =>
                        adminCard(
                          u.parentName || "—",
                          [u.role, u.phone].filter(Boolean).join(" • "),
                          adminDeleteBtn(`data-admin-delete-user-id="${(u._ids || [u.id]).join(",")}"`)
                        )
                      )
                      .join("");
                    return `<div class="admin-group-card"><div class="admin-group-title">בת: ${girlTitle}${g.members.length > 1 ? ` <span class="admin-group-badge">${g.members.length} הורים</span>` : ""}</div>${parents}</div>`;
                  })
                  .join("")
              : emptyState("אין משתמשים רשומים — יירשמו אוטומטית בכניסה")
          }
        </div>
      </section>

      <section class="admin-section">
        <div class="admin-section-head"><h3 class="admin-section-title">אירועים</h3><span class="admin-section-count">${events.length}</span></div>
        <div class="admin-section-body">
          ${
            sortedEvents.length
              ? sortedEvents
                  .map((event) =>
                    adminCard(
                      `בת מצווה ${event.girlName}`,
                      `${event.date || "—"} • ${event.time || "—"}${event.location ? " • " + event.location : ""}${event.ownerName ? " • " + event.ownerName : ""}`,
                      `${adminEditBtn(`data-admin-edit-id="${event.id}"`)}${adminDeleteBtn(`data-admin-delete-id="${event.id}"`, "מחיקת אירוע")}`
                    )
                  )
                  .join("")
              : emptyState("אין אירועים במערכת")
          }
        </div>
      </section>

      <details class="admin-details">
        <summary class="admin-details-summary">נותני שירות (${providerList.length}) · קרדיטים (${creditList.length}) · המלצות (${recList.length})</summary>
        <div class="admin-section-body admin-section-body-nested">
          <div class="admin-subsection-title">נותני שירות</div>
          ${providerList.length ? providerList.map((c) => adminCard(adminCreditLabel(c), c.phone || c.link || "", adminDeleteBtn(`data-admin-delete-credit-id="${c.id}"`))).join("") : emptyState("אין נותני שירות")}
          <div class="admin-subsection-title">קרדיטים / פרגונים</div>
          ${creditList.length ? creditList.map((c) => adminCard(adminCreditLabel(c), "", adminDeleteBtn(`data-admin-delete-credit-id="${c.id}"`))).join("") : emptyState("אין קרדיטים")}
          <div class="admin-subsection-title">המלצות בעלי אירוע</div>
          ${recList.length ? recList.map((c) => adminCard(adminCreditLabel(c), "", adminDeleteBtn(`data-admin-delete-credit-id="${c.id}"`))).join("") : emptyState("אין המלצות")}
        </div>
      </details>

      <details class="admin-details">
        <summary class="admin-details-summary">תמונות וסרטונים (${photoList.length}) · הודעות (${messages.length})</summary>
        <div class="admin-section-body admin-section-body-nested">
          <div class="admin-subsection-title">תמונות / סרטונים</div>
          ${
            photoList.length
              ? photoList
                  .map((exp) => {
                    const ev = events.find((e) => e.id === exp.eventId);
                    return adminCard(
                      `${experienceMediaType(exp) === "video" ? "סרטון" : "תמונה"} — ${ev ? ev.girlName : "כללי"}`,
                      exp.userName || "",
                      adminDeleteBtn(`data-admin-delete-experience-id="${exp.id}"`, "מחיקת תמונה")
                    );
                  })
                  .join("")
              : emptyState("אין תמונות")
          }
          <div class="admin-subsection-title">הודעות</div>
          ${
            messages.length
              ? messages.map((msg) => adminCard(msg.text, msg.name, adminDeleteBtn(`data-admin-delete-message-id="${msg.id}"`, "מחיקת הודעה"))).join("")
              : emptyState("אין הודעות")
          }
        </div>
      </details>

      <div class="admin-danger-wrap">
        <button type="button" id="adminToggleDangerBtn" class="admin-danger-toggle" aria-expanded="${dangerOpen ? "true" : "false"}">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <span>אזור מסוכן — מחיקות המוניות</span>
          <i class="fa-solid fa-chevron-down admin-danger-chevron ${dangerOpen ? "is-open" : ""}"></i>
        </button>
        <div id="adminDangerZone" class="admin-danger-zone ${dangerOpen ? "" : "hidden"}">
          <p class="admin-danger-note">פעולות אלו בלתי הפיכות. מומלץ לייצא דוח לפני מחיקה.</p>
          <div class="admin-danger-grid">
            <button type="button" id="adminDeleteAllUsersBtn" class="admin-btn admin-btn-danger-outline">מחיקת כל המשתמשים</button>
            <button type="button" id="adminDeleteAllEventsBtn" class="admin-btn admin-btn-danger-outline">מחיקת כל האירועים</button>
            <button type="button" id="adminDeleteAllRsvpsBtn" class="admin-btn admin-btn-danger-outline">מחיקת אישורי הגעה</button>
            <button type="button" id="adminDeleteAllCreditsBtn" class="admin-btn admin-btn-danger-outline">מחיקת כל הקרדיטים</button>
            <button type="button" id="adminDeleteAllRecommendationsBtn" class="admin-btn admin-btn-danger-outline">מחיקת כל ההמלצות</button>
            <button type="button" id="adminDeleteAllExperiencesBtn" class="admin-btn admin-btn-danger-outline">מחיקת כל התמונות</button>
            <button type="button" id="adminDeleteAllMessagesBtn" class="admin-btn admin-btn-danger-outline">מחיקת כל ההודעות</button>
          </div>
          <button type="button" id="adminDeleteEverythingBtn" class="admin-btn admin-btn-danger-solid">מחיקת כל הנתונים במערכת</button>
        </div>
      </div>
    </div>
  `;
  tab.dataset.dangerOpen = dangerOpen ? "1" : "0";
}

function adminCreditLabel(c) {
  const event = events.find((e) => e.id === c.eventId);
  const eventName = event ? `האירוע של ${event.girlName}` : "אירוע חיצוני";
  const who = c.professionalName || c.category || (c.note ? c.note.slice(0, 30) : "פרגון");
  return `${who} • ${eventName}`;
}

/** מיון ללוח אירועים: קרובים קודם (מהקרוב לרחוק), אחר כך עבר (מהחדש לישן) */
function sortEventsForDisplay(list) {
  const now = new Date();
  return [...(list || [])].sort((a, b) => {
    const ad = parseEventDateTime(a.date, a.time);
    const bd = parseEventDateTime(b.date, b.time);
    if (!ad && !bd) return 0;
    if (!ad) return 1;
    if (!bd) return -1;
    const aUpcoming = ad >= now;
    const bUpcoming = bd >= now;
    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
    return aUpcoming ? ad - bd : bd - ad;
  });
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

  sortEventsForDisplay(events).forEach((event) => {
    const canManage = canManageEvent(event);
    const isOwnerEvent = isOwnEvent(event);

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
          canManage
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
            <img src="${img}" data-event-img class="w-20 h-20 shrink-0 rounded-full object-cover border-4 border-white/10" alt="" referrerpolicy="no-referrer" loading="lazy" />
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
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <span>🗺️ ${event.address}</span>
            ${
              event.address
                ? `<button type="button" class="waze-live-btn" data-waze-address="${encodeURIComponent(event.address)}" aria-label="ניווט ב-Waze">
              <i class="fa-brands fa-waze"></i>
              <span>ניווט</span>
            </button>`
                : ""
            }
          </div>
          ${event.eventNote ? `<div class="text-purple-200/90 text-xs mt-1">💡 ${escapeHtmlAttr(event.eventNote)}</div>` : ""}
        </div>
        ${renderEventRsvpSection(event, isPastEvent, canManage && isOwnerEvent)}
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
  if (!event || !canVoteOnEvent(event)) return;
  if (getOtherFamilyRsvp(event)) {
    showToast("אושרה הגעה על ידי ההורה השני");
    return;
  }

  const voteUserId = getFamilyVoteUserId();
  if (!event.rsvp) event.rsvp = {};
  const voterLabel = `${currentUser.role || ""} ${currentUser.parentName || ""}`.trim();
  event.rsvp[voteUserId] = { status, userName: voterLabel };
  renderEvents();
  if (rsvpScreenEventId === eventId) renderRsvpScreen();

  try {
    await Api.vote({
      eventId,
      userId: voteUserId,
      userName: `${currentUser.role || ""} ${currentUser.parentName || ""}`.trim(),
      status,
    });
    await syncFromServer({ silent: true });
    paintAppAfterSync();
  } catch (err) {
    console.error(err);
    delete event.rsvp[voteUserId];
    renderEvents();
    if (rsvpScreenEventId === eventId) renderRsvpScreen();
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
  beginGlobalUpload("מפרסם הודעה", "שולח לענן…");

  try {
    await Api.createMessage({
      id: msgId,
      userName: currentUser.parentName,
      messageText: text,
    });
    input.value = "";
    setGlobalUpload("מפרסם הודעה", "מסנכרן…", 90);
    await syncFromServer({ silent: true });
    await finishGlobalUpload("ההודעה פורסמה ✓");
  } catch (err) {
    console.error(err);
    cancelGlobalUpload();
    alert("לא הצלחנו לפרסם את ההודעה. נסו שוב.");
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
    if (e.target.closest("[data-credit-exit]")) {
      creditScreen = "home";
      closeOwnerQuickAddModal();
      renderCredits();
      return;
    }
    const ownerDelBtn = e.target.closest("[data-owner-delete-credit]");
    if (ownerDelBtn) {
      await deleteCreditById(ownerDelBtn.dataset.ownerDeleteCredit);
      return;
    }
    const ownerEditBtn = e.target.closest("[data-owner-edit-credit]");
    if (ownerEditBtn) {
      openOwnerQuickAddModalForEdit(ownerEditBtn.dataset.ownerEditCredit);
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
    const ownerAddBtn = e.target.closest("[data-owner-add-category]");
    if (ownerAddBtn) {
      openOwnerQuickAddModal(ownerAddBtn.dataset.ownerAddCategory || "");
      return;
    }
    if (e.target.closest("[data-owner-quick-save]")) {
      saveOwnerQuickAddProvider();
      return;
    }
    if (e.target.closest("[data-owner-quick-close]")) {
      closeOwnerQuickAddModal();
      return;
    }
    const ownerRateBtn = e.target.closest("[data-owner-rate-credit]");
    if (ownerRateBtn) {
      rateProviderCredit(
        ownerRateBtn.dataset.ownerRateCredit,
        Number(ownerRateBtn.dataset.ownerRateScore || 0),
        ownerRateBtn
      );
      return;
    }
    const boardViewBtn = e.target.closest("[data-board-view]");
    if (boardViewBtn) {
      creditBoardView = boardViewBtn.dataset.boardView || "latest";
      renderCredits();
      return;
    }
    const boardProviderBtn = e.target.closest("[data-credit-board-provider]");
    if (boardProviderBtn) {
      const name = boardProviderBtn.dataset.creditBoardProvider || "";
      creditBoardExpandedProvider = creditBoardExpandedProvider === name ? "" : name;
      renderCredits();
      return;
    }
    const boardPraiseToggle = e.target.closest("[data-board-praise-toggle]");
    if (boardPraiseToggle) {
      const key = boardPraiseToggle.dataset.boardPraiseToggle || "";
      if (boardPraiseToggle.classList.contains("is-active")) {
        const creditId = boardPraiseToggle.dataset.praiseCreditId || "";
        if (creditId) {
          await removeBoardPraise(creditId);
          return;
        }
      }
      boardPraiseKey = boardPraiseKey === key ? "" : key;
      if (boardPraiseKey && !boardPraiseState[key]) {
        const [provName, provCategory] = key.split("@@");
        const firstPast = pastEventsForProviderPraise(provName, provCategory)[0];
        const existing = firstPast ? findUserPraiseCredit(provName, provCategory, firstPast.id) : null;
        const score = existing ? Number(existing.ratings?.[currentUser?.id] || 0) : 0;
        boardPraiseState[key] = { eventId: firstPast?.id || "", score };
      }
      renderCredits();
      return;
    }
    const boardStarBtn = e.target.closest("[data-board-praise-star]");
    if (boardStarBtn) {
      const key = boardStarBtn.dataset.boardPraiseKey || "";
      const score = Number(boardStarBtn.dataset.boardPraiseStar || 0);
      boardPraiseState[key] = { ...(boardPraiseState[key] || {}), score };
      const wrap = boardStarBtn.closest(".credit-stars-wrap");
      if (wrap) {
        wrap.querySelectorAll("[data-board-praise-star]").forEach((starEl) => {
          const n = Number(starEl.dataset.boardPraiseStar || 0);
          starEl.classList.toggle("text-yellow-300", n <= score);
          starEl.classList.toggle("text-white/35", n > score);
        });
      }
      return;
    }
    const boardSubmitBtn = e.target.closest("[data-board-praise-submit]");
    if (boardSubmitBtn) {
      await submitBoardPraise(
        boardSubmitBtn.dataset.boardPraiseSubmit,
        boardSubmitBtn.dataset.providerName,
        boardSubmitBtn.dataset.providerCategory
      );
      return;
    }
  });
}

function renderCredits() {
  const tab = document.getElementById("creditsTab");
  if (creditScreen === "home") {
    tab.innerHTML = `
      <div class="glass rounded-[28px] credit-home-shell">
        <div class="credit-home-grid">
          <button type="button" data-credit-screen="guest" class="credit-home-card credit-home-card-guest">
            <span class="credit-home-icon">💝</span>
            <span class="credit-home-title">פרגן לאירוע</span>
            <span class="credit-home-sub">דרג/י נותני שירות</span>
          </button>
          <button type="button" data-credit-screen="owner" class="credit-home-card credit-home-card-owner">
            <span class="credit-home-icon">🌟</span>
            <span class="credit-home-title">המלצת בעל/ת אירוע</span>
            <span class="credit-home-sub">נותני שירות שלי</span>
          </button>
        </div>
        <button type="button" data-credit-screen="board" class="credit-home-board">
          לוח קרדיטים <span class="credit-home-board-icon">📊</span>
        </button>
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
  const options = buildCreditEventSelectOptions();
  const pastHint = guestPastEventsHintHtml();
  tab.innerHTML = creditsScreenWrap(
    "guest",
    `
    <div id="guestCreditForm" class="glass rounded-[28px] p-4 space-y-2">
      ${pastHint}
      <select id="creditEventId" class="w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm text-white">
        ${options}
        <option value="__external__">אירוע אחר / הוספה ידנית</option>
      </select>
      <div id="creditOwnEventHint" class="credit-info-hint credit-info-hint-warn hidden" role="status"></div>
      <input id="creditManualEvent" class="hidden w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm" placeholder="שם אירוע חיצוני" />
      <div class="guest-credit-hint-line text-xs text-white/70">דרג/י לפי סוג שירות — גם בלי שם נותן ספציפי</div>
      <div id="guestProvidersWrap" class="space-y-2"></div>
      <div id="guestGeneralPraiseSection" class="border-t border-white/10 pt-3 mt-2">
        <div class="text-sm font-black text-center mb-2">✨ פרגון כללי על האירוע ✨</div>
        ${renderGlowStarRating("guestEventScoreWrap", guestEventScoreSelected)}
        <textarea id="guestCreditNote" class="w-full mt-2 rounded-xl bg-white/10 border border-white/10 p-2 text-sm min-h-[72px]" placeholder="הערה (אופציונלי)">${escapeHtmlAttr(guestCreditNoteDraft)}</textarea>
      </div>
      <button type="button" id="publishGuestCreditBtn" class="w-full rounded-2xl bg-gradient-to-r from-pink-500 to-purple-600 p-3 font-black">פרסום</button>
    </div>`
  );
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
    document.getElementById("creditManualEvent")?.classList.toggle("hidden", creditEventSelect.value !== "__external__");
    updateGuestOwnEventHint();
    refreshGuestProviders();
  };
  updateGuestOwnEventHint();
  manualInput.oninput = () => {
    guestCreditManualEventName = manualInput.value || "";
    refreshGuestProviders();
  };
  document.getElementById("guestCreditNote").oninput = (e) => {
    guestCreditNoteDraft = e.target.value || "";
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
        לא נמצא אירוע בבעלותכם. צרו קודם אירוע כדי להמליץ על נותני השירות.
      </div>
    `;
    return;
  }
  const preEventOnly = !isEventPastByDate(myEvent.date);
  const d = parseEventDateTime(myEvent.date, myEvent.time || "00:00");
  const dateText = d ? d.toLocaleDateString("he-IL") : "";
  const categoryTypes = preEventOnly ? PRE_EVENT_SERVICE_TYPES : CREDIT_SERVICE_TYPES;
  tab.innerHTML = creditsScreenWrap(
    "owner",
    `
    <div class="glass rounded-[28px] p-4 space-y-2">
      <div class="rounded-xl bg-white/10 border border-white/10 p-2 text-sm text-white">האירוע של ${myEvent ? myEvent.girlName : "—"}${dateText ? ` • ${dateText}` : ""}</div>
      <input id="creditEventId" type="hidden" value="${myEvent ? myEvent.id : ""}" />
      ${
        preEventOnly
          ? `<div class="rounded-xl bg-yellow-500/10 border border-yellow-400/30 p-2 text-xs text-yellow-100 text-center">האירוע עוד לא התקיים — באפשרותכם לבחור נותני שירות שניתן להמליץ עליהם כבר עכשיו ולדרג אותם.</div>`
          : `<div class="text-xs text-white/70">בחר/י קטגוריה → הוסיפ/י נותן שירות → דרג/י בכוכבים</div>`
      }
      <div id="ownerProvidersWrap" class="space-y-3"></div>
    </div>
    <div id="ownerQuickAddModal" class="hidden fixed inset-0 z-[80] items-center justify-center bg-black/70 p-4">
      <div class="glass rounded-[24px] p-4 w-full max-w-md space-y-2 relative">
        <button type="button" data-owner-quick-close class="screen-exit-btn screen-exit-in-modal" aria-label="סגירה בלי שמירה"><i class="fa-solid fa-xmark"></i></button>
        <div id="ownerQuickAddTitle" class="font-black text-sm pt-1">הוספת נותן שירות — <span id="ownerQuickAddCategoryLabel"></span></div>
        <input id="ownerQuickAddCategory" type="hidden" />
        <input id="ownerQuickAddName" class="w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm" placeholder="שם נותן השירות *" />
        <input id="ownerQuickAddPhone" class="w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm" placeholder="טלפון" />
        <input id="ownerQuickAddEmail" class="w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm" placeholder='דוא"ל' />
        <input id="ownerQuickAddCity" class="w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm" placeholder="עיר" />
        <textarea id="ownerQuickAddDetails" class="w-full rounded-xl bg-white/10 border border-white/10 p-2 text-sm min-h-[72px]" placeholder="פרטים נוספים"></textarea>
        <div class="flex gap-2 pt-1">
          <button type="button" data-owner-quick-save class="flex-1 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 p-2 text-sm font-black">שמירה</button>
          <button type="button" data-owner-quick-close class="flex-1 rounded-xl bg-white/10 border border-white/10 p-2 text-sm">ביטול</button>
        </div>
      </div>
    </div>`
  );
  refreshOwnerProviders();
}

function ownEventsForCurrentUser() {
  return events.filter((e) => isOwnEvent(e));
}

function detectMyEventForOwnerCredit() {
  const own = ownEventsForCurrentUser();
  if (!own.length) return null;

  const upcoming = own
    .filter((e) => !isEventPastByDate(e.date))
    .sort((a, b) => {
      const ad = parseEventDateTime(a.date, a.time);
      const bd = parseEventDateTime(b.date, b.time);
      if (!ad || !bd) return 0;
      return ad - bd;
    });
  if (upcoming.length) return upcoming[0];

  const past = pastEventsSortedDesc().filter((e) => isOwnEvent(e));
  return past[0] || own[0];
}

function renderCreditsBoard() {
  const tab = document.getElementById("creditsTab");
  const viewTabs = `
    <div class="board-view-tabs">
      <button type="button" class="board-view-tab ${creditBoardView === "latest" ? "is-active" : ""}" data-board-view="latest">🕐 אחרונים</button>
      <button type="button" class="board-view-tab ${creditBoardView === "event" ? "is-active" : ""}" data-board-view="event">📅 לפי אירוע</button>
      <button type="button" class="board-view-tab ${creditBoardView === "category" ? "is-active" : ""}" data-board-view="category">🏷️ לפי קטגוריה</button>
    </div>`;
  let feed = "";
  if (creditBoardView === "latest") feed = renderBoardLatestView();
  else if (creditBoardView === "event") feed = renderBoardEventView();
  else feed = renderBoardCategoryView();
  const summary = boardFeedSummaryHtml();
  tab.innerHTML = creditsScreenWrap(
    "board",
    `${viewTabs}${summary}<div class="board-feed space-y-2">${feed}</div>${renderProvidersDirectory()}${renderCreditsAdminManager()}`
  );
  bindBoardPraiseSelects();
}

function getBoardDisplayCredits() {
  return dedupeBoardCredits((credits || []).filter((c) => !isProviderEntry(c)));
}

function dedupeBoardCredits(list) {
  const seen = new Set();
  const sorted = [...list].sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );
  return sorted.filter((c) => {
    const key = `${c.ownerUserId || ""}@@${String(c.professionalName || "").trim()}@@${c.category || ""}@@${c.eventId || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function praiseableGuestEvents() {
  return pastEventsSortedDesc().filter((e) => !isOwnEvent(e));
}

function guestPastEventsHintHtml() {
  if (praiseableGuestEvents().length) return "";
  const hasOwnPast = ownEventsForCurrentUser().some((e) => isEventPastByDate(e.date));
  if (hasOwnPast) return "";
  return `<div class="credit-info-hint credit-info-hint-warn" role="status"><i class="fa-solid fa-circle-exclamation shrink-0 mt-0.5"></i><span>אין אירועים שהתקיימו עדיין</span></div>`;
}

function setGuestCreditFormLocked(locked) {
  const form = document.getElementById("guestCreditForm");
  if (!form) return;
  form.classList.toggle("guest-credit-locked", locked);
  form.querySelectorAll("input, textarea, button").forEach((el) => {
    if (el.id === "creditEventId") return;
    el.disabled = !!locked;
  });
  setGuestPublishEnabled(!locked && !!getCreditEventIdFromForm());
}

function updateGuestOwnEventHint() {
  const hint = document.getElementById("creditOwnEventHint");
  const select = document.getElementById("creditEventId");
  if (!hint || !select) return;
  const event = events.find((e) => String(e.id) === String(select.value));
  const isOwn = !!(event && isOwnEvent(event));
  if (isOwn) {
    hint.innerHTML = `<span>אינך יכול לפרגן לאירוע של עצמך 🙃</span>`;
    hint.classList.remove("hidden");
    select.classList.add("is-own-event-selected");
    setGuestCreditFormLocked(true);
  } else {
    hint.classList.add("hidden");
    hint.innerHTML = "";
    select.classList.remove("is-own-event-selected");
    setGuestCreditFormLocked(false);
  }
}

function findUserPraiseCredit(name, category, eventId) {
  return (credits || []).find(
    (c) =>
      !isProviderEntry(c) &&
      String(c.professionalName || "").trim() === String(name || "").trim() &&
      String(c.category || "") === String(category || "") &&
      String(c.ownerUserId || "") === String(currentUser?.id || "") &&
      String(c.eventId || "") === String(eventId || "")
  );
}

function findUserBoardPraises(name, category) {
  return (credits || [])
    .filter(
      (c) =>
        !isProviderEntry(c) &&
        String(c.professionalName || "").trim() === String(name || "").trim() &&
        String(c.category || "") === String(category || "") &&
        String(c.ownerUserId || "") === String(currentUser?.id || "")
    )
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}

function userHasPraisedProvider(name, category, eventId) {
  return !!findUserPraiseCredit(name, category, eventId);
}

async function removeBoardPraise(creditId) {
  if (!creditId) return;
  try {
    await deleteCreditById(creditId);
    boardPraiseKey = "";
    showToast("הפרגון הוסר");
    await syncFromServer({ silent: true });
    renderCredits();
  } catch (err) {
    console.error(err);
    showToast("לא הצלחנו להסיר את הפרגון");
  }
}

function boardFeedSummaryHtml() {
  const list = getBoardDisplayCredits();
  const providers = aggregateAllProviders().length;
  if (!list.length && !providers) return "";
  const n = list.length;
  const label =
    n === 0
      ? "עדיין אין פרגונים שפורסמו"
      : n === 1
        ? "פרגון אחד בלוח"
        : `${n} פרגונים בלוח`;
  return `<div class="board-feed-summary" dir="rtl">${label}${providers ? ` • ${providers} נותני שירות בספרייה` : ""}</div>`;
}

function boardFeedEmptyHtml() {
  const providers = aggregateAllProviders().length;
  if (providers) {
    return `<div class="credit-info-hint credit-info-hint-info text-center" dir="rtl"><i class="fa-solid fa-circle-info shrink-0"></i><span>עדיין אין פרגונים שפורסמו. אפשר לפרגן מכפתור <strong>תן פרגון</strong> בספריית נותני השירות למטה.</span></div>`;
  }
  return '<div class="text-center text-white/40 text-sm py-4" dir="rtl">עדיין אין נתוני קרדיטים</div>';
}

function creditScoreLabel(credit) {
  const values = Object.values(credit.ratings || {})
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!values.length) return credit.sentiment === "like" ? "פרגון ♥" : "";
  const avg = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
  return `${avg} ★`;
}

function creditFeedCard(c) {
  const event = events.find((e) => String(e.id) === String(c.eventId));
  const eventLabel = event ? `האירוע של ${event.girlName}` : manualEventLabelFromCredit(c);
  const provider = c.professionalName ? `${serviceIcon(c.category)} ${c.professionalName}` : "פרגון כללי";
  const score = creditScoreLabel(c);
  const dateText = c.createdAt ? new Date(c.createdAt).toLocaleDateString("he-IL") : "";
  const by = c.ownerName || "אורח/ת";
  return `
    <div class="board-feed-card">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="font-bold text-sm truncate">${provider}</div>
          <div class="text-[11px] text-white/60 mt-0.5">${c.category || "כללי"} • ${eventLabel}</div>
        </div>
        ${score ? `<div class="text-yellow-300 text-sm font-black shrink-0">${score}</div>` : ""}
      </div>
      ${c.note ? `<div class="text-xs text-white/75 mt-2">${escapeHtmlAttr(c.note)}</div>` : ""}
      <div class="board-feed-meta">${by}${dateText ? ` • ${dateText}` : ""}</div>
    </div>`;
}

function renderBoardLatestView() {
  const list = getBoardDisplayCredits();
  if (!list.length) return boardFeedEmptyHtml();
  return list.map(creditFeedCard).join("");
}

function renderBoardEventView() {
  const list = getBoardDisplayCredits();
  if (!list.length) return boardFeedEmptyHtml();
  const byEvent = new Map();
  list.forEach((c) => {
    const key = String(c.eventId || "");
    if (!byEvent.has(key)) byEvent.set(key, []);
    byEvent.get(key).push(c);
  });
  return Array.from(byEvent.entries())
    .map(([eventId, items]) => {
      const event = events.find((e) => String(e.id) === eventId);
      const title = event ? `האירוע של ${event.girlName}` : manualEventLabelFromCredit({ eventId });
      return `
        <div class="glass rounded-2xl p-3">
          <div class="board-group-title">${title} (${items.length})</div>
          ${items.map(creditFeedCard).join("")}
        </div>`;
    })
    .join("");
}

function renderBoardCategoryView() {
  const list = getBoardDisplayCredits();
  if (!list.length) return boardFeedEmptyHtml();
  const byCat = new Map();
  list.forEach((c) => {
    const key = c.category || "כללי";
    if (!byCat.has(key)) byCat.set(key, []);
    byCat.get(key).push(c);
  });
  return Array.from(byCat.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([category, items]) => {
      return `
        <div class="glass rounded-2xl p-3">
          <div class="board-group-title">${serviceIcon(category)} ${category} (${items.length})</div>
          ${items.map(creditFeedCard).join("")}
        </div>`;
    })
    .join("");
}

function pastEventsForProviderPraise(name, category) {
  return praiseableGuestEvents().filter((e) => !userHasPraisedProvider(name, category, e.id));
}

function buildPastEventSelectOptionsForProvider(name, category) {
  const eligible = pastEventsForProviderPraise(name, category);
  if (!eligible.length) return "";
  return `<option value="">בחר אירוע שהתקיים</option>${eligible.map((e) => `<option value="${e.id}">${eventOptionLabel(e)}</option>`).join("")}`;
}

function buildCreditEventSelectOptions() {
  const past = pastEventsSortedDesc();
  const upcoming = events
    .filter((e) => !isEventPastByDate(e.date))
    .sort((a, b) => new Date(`${a.date}T${a.time || "00:00"}`) - new Date(`${b.date}T${b.time || "00:00"}`));
  let html = `<option value="">בחר אירוע</option>`;
  html += past.map((e) => creditEventOptionHtml(e)).join("");
  html += upcoming.map((e) => creditEventOptionHtml(e)).join("");
  return html;
}

function creditEventOptionHtml(event) {
  const own = isOwnEvent(event);
  const cls = own ? ' class="credit-event-option-own"' : "";
  const suffix = own ? " — האירוע שלי" : "";
  return `<option value="${event.id}"${cls}>${eventOptionLabel(event)}${suffix}</option>`;
}

function bindBoardPraiseSelects() {
  document.querySelectorAll("[data-board-praise-event]").forEach((sel) => {
    sel.onchange = () => {
      const key = sel.dataset.boardPraiseEvent || "";
      boardPraiseState[key] = { ...(boardPraiseState[key] || {}), eventId: sel.value };
    };
    const key = sel.dataset.boardPraiseEvent || "";
    const st = boardPraiseState[key];
    if (st?.eventId) sel.value = st.eventId;
  });
}

// ספריית נותני שירות — עם פרגון מהיר מהלוח
function renderProvidersDirectory() {
  const providers = aggregateAllProviders();
  if (!providers.length) return "";
  const rows = providers
    .map((p) => {
      const wa = whatsappLink(p.phone);
      const stars = p.avg === "—" ? "" : `★ ${p.avg}`;
      const key = `${p.name}@@${p.category}`;
      const praiseableEvents = pastEventsForProviderPraise(p.name, p.category);
      const userPraises = findUserBoardPraises(p.name, p.category);
      const activePraise = userPraises[0] || null;
      const st = boardPraiseState[key] || {
        eventId: praiseableEvents[0]?.id || activePraise?.eventId || "",
        score: activePraise ? Number(activePraise.ratings?.[currentUser?.id] || 0) : 0,
      };
      const expanded = boardPraiseKey === key;
      const hasPastEvents = praiseableGuestEvents().length > 0;
      const isActive = !!activePraise;
      const eventOptions = buildPastEventSelectOptionsForProvider(p.name, p.category);
      const panelNoEventsHint =
        !praiseableEvents.length && hasPastEvents && !isActive
          ? `<div class="credit-info-hint credit-info-hint-warn mb-2"><i class="fa-solid fa-circle-exclamation shrink-0"></i><span>פרגנתם לנותן זה בכל האירועים הזמינים</span></div>`
          : !hasPastEvents
            ? `<div class="credit-info-hint credit-info-hint-warn mb-2"><i class="fa-solid fa-circle-exclamation shrink-0"></i><span>אין אירועים שהתקיימו עדיין</span></div>`
            : "";
      const praiseStars = [1, 2, 3, 4, 5]
        .map(
          (n) =>
            `<button type="button" class="provider-star text-lg ${st.score >= n && st.score > 0 ? "text-yellow-300" : "text-white/35"}" data-board-praise-star="${n}" data-board-praise-key="${escapeHtmlAttr(key)}" aria-label="דירוג ${n}">★</button>`
        )
        .join("");
      const praiseAction = hasPastEvents
        ? `<button type="button" class="board-praise-btn ${isActive ? "is-active" : ""}" data-board-praise-toggle="${escapeHtmlAttr(key)}" data-praise-credit-id="${activePraise?.id || ""}" aria-label="תן פרגון">${isActive ? "תן פרגון ✓" : "תן פרגון"}</button>`
        : `<button type="button" class="board-praise-btn is-disabled" disabled aria-label="תן פרגון">תן פרגון</button>`;
      return `
        <div class="provider-dir-row rounded-xl bg-white/5 border border-white/10 p-2 mb-2">
          <div class="min-w-0">
            <div class="font-bold text-sm truncate">${serviceIcon(p.category)} ${p.name}</div>
            <div class="text-[11px] text-white/55 mt-0.5">${p.category || "נותן שירות"}</div>
            <div class="flex items-center gap-3 mt-2 text-[11px] flex-wrap">
              <span class="provider-badge">${stars || "אין דירוג"}</span>
              <span class="provider-badge">${p.ratingCount} מדרגים</span>
              <span class="provider-badge">${p.eventCount} אירועים</span>
            </div>
            ${
              expanded && !isActive && hasPastEvents
                ? `<div class="board-praise-panel mt-2 pt-2 border-t border-white/10">
                    ${panelNoEventsHint}
                    ${
                      eventOptions
                        ? `<div class="text-[11px] text-white/60 mb-1">בחר/י אירוע ודרג/י</div>
                    <select class="board-praise-event w-full rounded-lg bg-white/10 border border-white/10 p-1.5 text-xs mb-2" data-board-praise-event="${escapeHtmlAttr(key)}">
                      ${eventOptions}
                    </select>
                    <div class="credit-stars-wrap">${praiseStars}</div>
                    <button type="button" class="w-full mt-2 rounded-lg bg-gradient-to-r from-pink-500 to-purple-600 p-2 text-xs font-black" data-board-praise-submit="${escapeHtmlAttr(key)}" data-provider-name="${escapeHtmlAttr(p.name)}" data-provider-category="${escapeHtmlAttr(p.category)}">פרסום פרגון</button>`
                        : ""
                    }
                  </div>`
                : ""
            }
          </div>
          <div class="provider-dir-actions">
            ${praiseAction}
            <div class="provider-wa-slot ${wa ? "" : "is-empty"}">
              ${
                wa
                  ? `<a href="${wa}" target="_blank" rel="noopener" class="provider-wa-btn" aria-label="וואטסאפ"><i class="fa-brands fa-whatsapp"></i></a>`
                  : `<span aria-hidden="true"></span>`
              }
            </div>
          </div>
        </div>`;
    })
    .join("");
  return `
    <div class="glass rounded-2xl p-3 mb-3">
      <div class="font-black text-sm mb-2">📒 ספריית נותני שירות (${providers.length})</div>
      ${rows}
    </div>
  `;
}

async function submitBoardPraise(key, providerName, category) {
  const st = boardPraiseState[key] || { eventId: "", score: 0 };
  const select = document.querySelector(`[data-board-praise-event="${CSS.escape(key)}"]`);
  const eventId = select?.value || st.eventId;
  const score = st.score || 0;
  if (!eventId) {
    showToast("בחר/י אירוע שהתקיים");
    return;
  }
  if (score <= 0) {
    showToast("בחר/י דירוג בכוכבים");
    return;
  }
  const event = events.find((e) => e.id === eventId);
  if (event && isOwnEvent(event)) {
    showToast("לא ניתן לפרגן לאירוע שלך — השתמש/י בהמלצת בעל אירוע");
    return;
  }
  if (userHasPraisedProvider(providerName, category, eventId)) {
    showToast("כבר פרגנת לנותן שירות זה באירוע הזה");
    return;
  }
  try {
    beginGlobalUpload("מפרסם פרגון", "שולח לענן…");
    await Api.createCredit({
      id: crypto.randomUUID(),
      eventId,
      category,
      professionalName: providerName,
      tags: "__guest__",
      sentiment: "like",
      ownerUserId: currentUser.id,
      ownerName: currentUser.parentName,
      ratings: JSON.stringify({ [currentUser.id]: score }),
      createdAt: new Date().toISOString(),
    });
    boardPraiseKey = "";
    setGlobalUpload("מפרסם פרגון", "מסנכרן…", 92);
    await syncFromServer({ silent: true });
    await finishGlobalUpload("הפרגון פורסם ✓");
    renderCredits();
  } catch (err) {
    console.error(err);
    cancelGlobalUpload();
    showToast("לא הצלחנו לפרסם");
  }
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

function creditsScreenWrap(active, bodyHtml) {
  return `
    <div class="credit-screen-wrap relative">
      <button type="button" data-credit-exit class="screen-exit-btn" aria-label="יציאה בלי שמירה"><i class="fa-solid fa-xmark"></i></button>
      ${creditsTopNav(active)}
      ${bodyHtml}
    </div>`;
}

function getCreditEventIdFromForm() {
  const selectedEventId = document.getElementById("creditEventId")?.value || "";
  const manualEvent =
    document.getElementById("creditManualEvent")?.value.trim() || guestCreditManualEventName || "";
  if (selectedEventId === "__external__") return manualEvent ? `manual:${manualEvent}` : "";
  return selectedEventId;
}

function findDuplicateProvider(eventId, category, name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return null;
  return (credits || []).find(
    (c) =>
      isProviderEntry(c) &&
      String(c.eventId || "") === String(eventId || "") &&
      String(c.category || "") === String(category || "") &&
      String(c.professionalName || "").trim().toLowerCase() === n
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
  const eventId = getCreditEventIdFromForm();
  const wrap = document.getElementById("guestProvidersWrap");
  if (!wrap) return;
  guestCreditSelectedEventId = document.getElementById("creditEventId")?.value || "";
  document.getElementById("creditManualEvent")?.classList.toggle("hidden", guestCreditSelectedEventId !== "__external__");

  const praiseSection = document.getElementById("guestGeneralPraiseSection");
  const selectedEvent = events.find((e) => e.id === guestCreditSelectedEventId);

  if (!eventId) {
    wrap.innerHTML = creditBlockMessage("👆", "בחר/י אירוע (או הזן/י שם ידני) כדי לדרג נותני שירות.");
    if (praiseSection) praiseSection.classList.add("hidden");
    setGuestCreditFormLocked(false);
    setGuestPublishEnabled(false);
    return;
  }

  if (selectedEvent && isOwnEvent(selectedEvent)) {
    wrap.innerHTML = `<div class="text-xs text-white/40 text-center py-3">השדות למטה נעולים — בחר/י אירוע אחר כדי לפרגן</div>`;
    if (praiseSection) praiseSection.classList.remove("hidden");
    setGuestPublishEnabled(false);
    return;
  }
  if (selectedEvent && !isEventPastByDate(selectedEvent.date)) {
    wrap.innerHTML = creditBlockMessage("😜", "לא ניתן לפרגן לאירוע שעדיין לא התקיים — תחזרו אחרי החגיגה!");
    if (praiseSection) praiseSection.classList.add("hidden");
    setGuestPublishEnabled(false);
    return;
  }
  if (praiseSection) praiseSection.classList.remove("hidden");
  setGuestCreditFormLocked(false);
  setGuestPublishEnabled(true);

  let cardIndex = 0;
  const blocks = CREDIT_SERVICE_TYPES.map((service) => {
    const list = listEventProvidersByCategory(eventId, service);
    const cards = list.length
      ? list.map((p) => renderGuestProviderCard(p, cardIndex++)).join("")
      : renderGuestCategoryCard(service, eventId, cardIndex++);
    return `
      <div class="owner-category-block rounded-xl border border-white/10 bg-white/5 p-2 mb-2">
        <div class="font-bold text-sm mb-2">${serviceIcon(service)} ${service}</div>
        ${cards}
      </div>`;
  }).join("");

  wrap.innerHTML = blocks;
  wrap.querySelectorAll("[data-guest-provider-note]").forEach((noteInput) => {
    const creditId = noteInput.dataset.guestProviderNote || "";
    noteInput.oninput = () => {
      guestProviderState[creditId] = {
        ...(guestProviderState[creditId] || { selected: false, score: 0, note: "" }),
        note: noteInput.value || "",
      };
    };
  });
}

function renderGuestCategoryCard(service, eventId, idx) {
  const key = `cat::${eventId}::${service}`;
  const st = guestProviderState[key] || { selected: false, score: 0, note: "" };
  return `
    <div class="credit-provider-card credit-category-card rounded-xl border border-dashed border-white/15 bg-black/15 p-2 mb-2 ${st.selected ? "is-selected" : ""}" data-provider-card data-category-only="1" data-selected="${st.selected ? "1" : "0"}" data-provider-key="${escapeHtmlAttr(key)}">
      <div class="text-sm font-bold">${service}</div>
      <div class="text-[11px] text-white/45 mt-0.5">דרג/י את איכות ${service} באירוע</div>
      <div class="text-xs text-white/70 mt-2">דרג/י בכוכבים</div>
      <div id="guestProviderStars_${idx}" class="credit-stars-wrap mt-1">
        ${[1, 2, 3, 4, 5]
          .map(
            (n) =>
              `<button type="button" class="provider-star text-xl ${st.score >= n && st.score > 0 ? "text-yellow-300" : "text-white/35"}" data-provider-star="${n}" data-provider-score-id="guestProviderScore_${idx}" aria-label="דירוג ${n}">★</button>`
          )
          .join("")}
      </div>
      <input id="guestProviderScore_${idx}" data-provider-name="${escapeHtmlAttr(service)}" data-provider-category="${escapeHtmlAttr(service)}" data-category-only="1" type="hidden" value="${st.score}" />
      <input id="guestProviderNote_${idx}" data-guest-provider-note="${escapeHtmlAttr(key)}" class="w-full mt-1 rounded-lg bg-white/10 border border-white/10 p-1.5 text-xs" placeholder="מילה טובה (אופציונלי)" value="${escapeHtmlAttr(st.note)}" />
    </div>`;
}

function renderGuestProviderCard(credit, indexBase = 0) {
  const city = parseProviderCity(credit.note);
  const details = parseProviderDetails(credit.note);
  const st = guestProviderState[credit.id] || { selected: false, score: 0, note: "" };
  const idx = indexBase;
  return `
    <div class="credit-provider-card rounded-xl border border-white/10 bg-black/20 p-2 mb-2 ${st.selected ? "is-selected" : ""}" data-provider-card data-selected="${st.selected ? "1" : "0"}" data-provider-key="${escapeHtmlAttr(credit.id)}">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="text-sm font-bold truncate">${credit.professionalName}</div>
          <div class="text-[11px] text-white/55 mt-0.5">${[credit.phone, credit.link, city].filter(Boolean).join(" • ")}</div>
          ${details ? `<div class="text-[11px] text-white/45 mt-1">${escapeHtmlAttr(details)}</div>` : ""}
        </div>
        ${renderProviderContactActions(credit)}
      </div>
      <div class="text-xs text-white/70 mt-2">דרג/י בכוכבים</div>
      <div id="guestProviderStars_${idx}" class="credit-stars-wrap mt-1">
        ${[1, 2, 3, 4, 5]
          .map(
            (n) =>
              `<button type="button" class="provider-star text-xl ${st.score >= n && st.score > 0 ? "text-yellow-300" : "text-white/35"}" data-provider-star="${n}" data-provider-score-id="guestProviderScore_${idx}" aria-label="דירוג ${n}">★</button>`
          )
          .join("")}
      </div>
      <input id="guestProviderScore_${idx}" data-provider-name="${escapeHtmlAttr(credit.professionalName)}" data-provider-category="${escapeHtmlAttr(credit.category || "")}" data-provider-credit-id="${escapeHtmlAttr(credit.id)}" type="hidden" value="${st.score}" />
      <input id="guestProviderNote_${idx}" data-guest-provider-note="${escapeHtmlAttr(credit.id)}" class="w-full mt-1 rounded-lg bg-white/10 border border-white/10 p-1.5 text-xs" placeholder="מילה טובה (אופציונלי)" value="${escapeHtmlAttr(st.note)}" />
    </div>`;
}

function refreshOwnerProviders() {
  const eventId = document.getElementById("creditEventId")?.value || "";
  const wrap = document.getElementById("ownerProvidersWrap");
  if (!wrap) return;
  const ownerEvent = events.find((e) => e.id === eventId);
  const preEventOnly = ownerEvent && !isEventPastByDate(ownerEvent.date);
  const categories = preEventOnly ? PRE_EVENT_SERVICE_TYPES : CREDIT_SERVICE_TYPES;

  wrap.innerHTML = categories
    .map((category) => {
      const list = listEventProvidersByCategory(eventId, category);
      return `
        <div class="owner-category-block rounded-xl border border-white/10 bg-white/5 p-2">
          <div class="flex items-center justify-between gap-2 mb-2">
            <div class="font-bold text-sm">${serviceIcon(category)} ${category}</div>
            <button type="button" data-owner-add-category="${escapeHtmlAttr(category)}" class="rounded-lg bg-white/10 border border-white/10 px-2 py-1 text-xs font-bold">+ הוסף</button>
          </div>
          ${
            list.length
              ? list.map((p, i) => renderOwnerProviderCard(p, i)).join("")
              : `<div class="text-[11px] text-white/45">לחצ/י "+ הוסף" כדי להוסיף נותן שירות</div>`
          }
        </div>`;
    })
    .join("");
}

function renderOwnerProviderCard(credit, index) {
  const city = parseProviderCity(credit.note);
  const details = parseProviderDetails(credit.note);
  const ratings = credit.ratings || {};
  const score = Number(ratings[currentUser?.id] || 0);
  return `
    <div class="rounded-xl border border-white/10 bg-black/20 p-2 mb-2" data-owner-provider-id="${escapeHtmlAttr(credit.id)}">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 flex-1">
          <div class="text-sm font-bold truncate">${credit.professionalName}</div>
          <div class="text-[11px] text-white/55 mt-0.5">${[credit.phone, credit.link, city].filter(Boolean).join(" • ")}</div>
          ${details ? `<div class="text-[11px] text-white/45 mt-1">${escapeHtmlAttr(details)}</div>` : ""}
        </div>
        <div class="flex items-center gap-1 shrink-0">
          ${renderProviderContactActions(credit)}
          <button type="button" class="provider-action-mini" data-owner-edit-credit="${escapeHtmlAttr(credit.id)}" aria-label="עריכה"><i class="fa-solid fa-pen"></i></button>
          <button type="button" class="provider-action-mini danger" data-owner-delete-credit="${escapeHtmlAttr(credit.id)}" aria-label="הסרה"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
      <div class="credit-stars-wrap mt-2">
        ${[1, 2, 3, 4, 5]
          .map(
            (n) =>
              `<button type="button" class="provider-star text-xl ${score >= n && score > 0 ? "text-yellow-300" : "text-white/35"}" data-owner-rate-credit="${escapeHtmlAttr(credit.id)}" data-owner-rate-score="${n}" aria-label="דירוג ${n}">★</button>`
          )
          .join("")}
      </div>
    </div>`;
}

function renderProviderContactActions(credit) {
  const wa = whatsappLink(credit.phone);
  const tel = credit.phone ? `tel:${String(credit.phone).replace(/\s/g, "")}` : "";
  if (!wa && !tel) return "";
  return `
    <div class="flex items-center gap-1 shrink-0">
      ${tel ? `<a href="${tel}" class="provider-contact-btn" aria-label="התקשרות"><i class="fa-solid fa-phone"></i></a>` : ""}
      ${wa ? `<a href="${wa}" target="_blank" rel="noopener" class="provider-wa-btn compact" aria-label="וואטסאפ"><i class="fa-brands fa-whatsapp"></i></a>` : ""}
    </div>`;
}

function listEventProvidersByCategory(eventId, category) {
  return (credits || []).filter(
    (c) =>
      String(c.eventId || "") === String(eventId || "") &&
      String(c.category || "") === String(category || "") &&
      c.professionalName &&
      isProviderEntry(c)
  );
}

function formatProviderNote(city, details) {
  const parts = [];
  if (city) parts.push(`עיר: ${city}`);
  if (details) parts.push(details);
  return parts.join(" | ");
}

function parseProviderCity(note) {
  const m = String(note || "").match(/עיר:\s*([^|]+)/);
  return m ? m[1].trim() : "";
}

function parseProviderDetails(note) {
  const raw = String(note || "");
  const withoutCity = raw.replace(/עיר:\s*[^|]+\s*\|\s*/i, "").replace(/עיר:\s*[^|]+$/i, "").trim();
  return withoutCity;
}

function openOwnerQuickAddModal(category) {
  editingProviderCreditId = null;
  const modal = document.getElementById("ownerQuickAddModal");
  if (!modal) return;
  document.getElementById("ownerQuickAddCategory").value = category;
  document.getElementById("ownerQuickAddCategoryLabel").textContent = category;
  ["ownerQuickAddName", "ownerQuickAddPhone", "ownerQuickAddEmail", "ownerQuickAddCity", "ownerQuickAddDetails"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const saveBtn = document.querySelector("[data-owner-quick-save]");
  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.textContent = "שמירה";
  }
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function openOwnerQuickAddModalForEdit(creditId) {
  const credit = credits.find((c) => c.id === creditId);
  if (!credit) return;
  editingProviderCreditId = creditId;
  const modal = document.getElementById("ownerQuickAddModal");
  if (!modal) return;
  document.getElementById("ownerQuickAddCategory").value = credit.category || "";
  document.getElementById("ownerQuickAddCategoryLabel").textContent = credit.category || "";
  document.getElementById("ownerQuickAddName").value = credit.professionalName || "";
  document.getElementById("ownerQuickAddPhone").value = credit.phone || "";
  document.getElementById("ownerQuickAddEmail").value = credit.link || "";
  document.getElementById("ownerQuickAddCity").value = parseProviderCity(credit.note);
  document.getElementById("ownerQuickAddDetails").value = parseProviderDetails(credit.note);
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function closeOwnerQuickAddModal() {
  editingProviderCreditId = null;
  const modal = document.getElementById("ownerQuickAddModal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.classList.remove("flex");
}

async function saveOwnerQuickAddProvider() {
  if (isSavingOwnerProvider) return;
  const eventId = document.getElementById("creditEventId")?.value || "";
  const category = document.getElementById("ownerQuickAddCategory")?.value || "";
  const name = document.getElementById("ownerQuickAddName")?.value.trim();
  const phone = document.getElementById("ownerQuickAddPhone")?.value.trim();
  const email = document.getElementById("ownerQuickAddEmail")?.value.trim();
  const city = document.getElementById("ownerQuickAddCity")?.value.trim();
  const details = document.getElementById("ownerQuickAddDetails")?.value.trim();
  if (!eventId || !category || !name) {
    showToast("יש למלא קטגוריה ושם נותן שירות");
    return;
  }
  const dup = findDuplicateProvider(eventId, category, name);
  if (dup && dup.id !== editingProviderCreditId) {
    showToast("נותן שירות זה כבר קיים בקטגוריה");
    return;
  }

  const wasEdit = !!editingProviderCreditId;
  isSavingOwnerProvider = true;
  const saveBtn = document.querySelector("[data-owner-quick-save]");
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = "שומר…";
  }
  beginGlobalUpload(wasEdit ? "מעדכן נותן שירות" : "שומר נותן שירות", "שולח לענן…");

  if (editingProviderCreditId) {
    try {
      await Api.deleteCredit(editingProviderCreditId);
    } catch (_) {}
    purgeCreditLocally(editingProviderCreditId);
  }

  const record = {
    id: crypto.randomUUID(),
    eventId,
    category,
    professionalName: name,
    phone,
    link: email,
    note: formatProviderNote(city, details),
    tags: "__provider__",
    sentiment: "",
    contact: [phone, email, city].filter(Boolean).join(" | "),
    ownerUserId: currentUser.id,
    ownerName: currentUser.parentName,
    ratings: {},
    createdAt: new Date().toISOString(),
  };
  credits = [record, ...credits];
  saveJson("bm_credits", credits);
  closeOwnerQuickAddModal();
  refreshOwnerProviders();

  try {
    setGlobalUpload(wasEdit ? "מעדכן נותן שירות" : "שומר נותן שירות", "שולח לענן…", 70);
    await Api.createCredit({ ...record, ratings: JSON.stringify({}) });
    setGlobalUpload(wasEdit ? "מעדכן נותן שירות" : "שומר נותן שירות", "מסנכרן…", 90);
    await syncFromServer({ silent: true });
    await finishGlobalUpload(wasEdit ? "עודכן ✓" : "נוסף ✓");
  } catch (err) {
    console.error(err);
    cancelGlobalUpload();
    showToast("נשמר מקומית — יסתנכרן ברקע");
  } finally {
    isSavingOwnerProvider = false;
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = "שמירה";
    }
  }
}

async function rateProviderCredit(creditId, score, btnEl) {
  const credit = credits.find((c) => c.id === creditId);
  if (!credit || !currentUser) return;
  const prev = credit.ratings?.[currentUser.id];
  const ratings = { ...(credit.ratings || {}), [currentUser.id]: score };
  credit.ratings = ratings;
  credit.sentiment = "like";
  saveJson("bm_credits", credits);

  const wrap = btnEl?.closest(".credit-stars-wrap");
  if (wrap) {
    wrap.querySelectorAll("[data-owner-rate-score]").forEach((starEl) => {
      const n = Number(starEl.dataset.ownerRateScore || 0);
      starEl.classList.toggle("text-yellow-300", n <= score);
      starEl.classList.toggle("text-white/35", n > score);
    });
  }

  try {
    await Api.rateCredit({
      creditId,
      ratings: JSON.stringify(ratings),
      sentiment: "like",
    });
  } catch (err) {
    console.error(err);
    if (prev !== undefined) credit.ratings[currentUser.id] = prev;
    else delete credit.ratings[currentUser.id];
    saveJson("bm_credits", credits);
    if (wrap) refreshOwnerProviders();
    showToast("לא נשמר הדירוג");
  }
}

async function publishGuestCredits() {
  if (isPublishingGuest) return;
  const selectedEventId = document.getElementById("creditEventId").value;
  const manualEvent = document.getElementById("creditManualEvent").value.trim();
  const eventId = getCreditEventIdFromForm();
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
  const selectedCards = Array.from(
    document.querySelectorAll("#guestProvidersWrap [data-provider-card][data-selected='1']")
  );
  if (!selectedCards.length) {
    showToast("בחר/י לפחות קטגוריה אחת לדירוג");
    return;
  }
  const note = document.getElementById("guestCreditNote").value.trim();
  const eventScore = guestEventScoreSelected;
  const tags = [...guestCreditTagsSelected];
  isPublishingGuest = true;
  const pubBtn = document.getElementById("publishGuestCreditBtn");
  if (pubBtn) {
    pubBtn.disabled = true;
    pubBtn.textContent = "מפרסם…";
  }
  beginGlobalUpload("מפרסם פרגון", "שולח לענן…");
  try {
    const total = selectedCards.length;
    let done = 0;
    for (const card of selectedCards) {
      const scoreInput = card.querySelector("[data-provider-name]");
      const providerName = scoreInput?.dataset.providerName || "";
      const category = scoreInput?.dataset.providerCategory || "";
      const score = Number(scoreInput?.value || 0);
      const isCategoryOnly = card.dataset.categoryOnly === "1";
      if (score <= 0) {
        cancelGlobalUpload();
        showToast(`חסר דירוג ל${isCategoryOnly ? category : providerName || category || "ספק"}`);
        return;
      }
      const providerNote = card.querySelector("input[type='text']")?.value.trim() || "";
      setGlobalUpload("מפרסם פרגון", `${done + 1} מתוך ${total}`, Math.round((done / total) * 85));
      await retryApiCall(() =>
        Api.createCredit({
        id: crypto.randomUUID(),
        eventId,
        category,
        professionalName: providerName,
        note: [providerNote, note].filter(Boolean).join(" | "),
        tags: isCategoryOnly ? ["__guest__", "__category__", ...tags].join("|") : ["__guest__", ...tags].join("|"),
        sentiment: "like",
        ownerUserId: currentUser.id,
        ownerName: currentUser.parentName,
        ratings: JSON.stringify({ [currentUser.id]: score, ...(eventScore ? { [`${currentUser.id}_event`]: eventScore } : {}) }),
        createdAt: new Date().toISOString(),
      })
      );
      done += 1;
    }
    setGlobalUpload("מפרסם פרגון", "מסנכרן…", 92);
    await syncFromServer({ silent: true });
    guestProviderStateReset();
    guestCreditNoteDraft = "";
    guestCreditTagsSelected = [];
    guestEventScoreSelected = 0;
    creditScreen = "board";
    renderCredits();
    await finishGlobalUpload("הפרגון פורסם ✓");
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
      await finishGlobalUpload("הפרגון פורסם ✓");
    } else {
      cancelGlobalUpload();
      showToast(`לא הצלחנו לפרסם פרגון: ${msg.slice(0, 90)}`);
    }
  } finally {
    isPublishingGuest = false;
    const pubBtn = document.getElementById("publishGuestCreditBtn");
    if (pubBtn) {
      pubBtn.disabled = false;
      pubBtn.textContent = "פרסום";
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
  if (!event || !isOwnEvent(event)) {
    showToast("ניתן להמליץ רק על האירוע שלך");
    return;
  }
  const selectedCards = Array.from(document.querySelectorAll("#ownerProvidersWrap [data-provider-card][data-selected='1']"));
  if (!selectedCards.length) {
    showToast("בחר/י לפחות נותן שירות אחד");
    return;
  }
  const note = document.getElementById("ownerCreditNote").value.trim();
  beginGlobalUpload("מפרסם המלצה", "שולח לענן…");
  try {
    const total = selectedCards.length;
    let done = 0;
    for (const card of selectedCards) {
      const scoreInput = card.querySelector("[data-provider-name]");
      const providerName = scoreInput?.dataset.providerName || "";
      const category = scoreInput?.dataset.providerCategory || "";
      const score = Number(scoreInput?.value || 0);
      if (score <= 0) {
        cancelGlobalUpload();
        showToast(`חסר דירוג לספק: ${providerName || category || "ספק"}`);
        return;
      }
      setGlobalUpload("מפרסם המלצה", `${done + 1} מתוך ${total}`, Math.round((done / total) * 85));
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
      done += 1;
    }
    setGlobalUpload("מפרסם המלצה", "מסנכרן…", 92);
    await syncFromServer({ silent: true });
    creditScreen = "board";
    renderCredits();
    await finishGlobalUpload("ההמלצה פורסמה ✓");
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
      await finishGlobalUpload("ההמלצה פורסמה ✓");
    } else {
      cancelGlobalUpload();
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

// ספריית נותני שירות גלובלית: ממוצע דירוג, כמה דירגו, בכמה אירועים, טלפון
function aggregateAllProviders() {
  const map = new Map();
  (credits || []).forEach((c) => {
    if (!c.professionalName) return;
    const key = `${String(c.professionalName).trim()}@@${c.category || ""}`;
    if (!map.has(key)) {
      map.set(key, {
        name: String(c.professionalName).trim(),
        category: c.category || "",
        total: 0,
        ratingCount: 0,
        likes: 0,
        events: new Set(),
        phone: "",
      });
    }
    const item = map.get(key);
    const values = Object.values(c.ratings || {})
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0);
    item.total += values.reduce((a, b) => a + b, 0);
    item.ratingCount += values.length;
    if (c.sentiment === "like") item.likes += 1;
    if (c.eventId) item.events.add(String(c.eventId));
    if (!item.phone && c.phone) item.phone = String(c.phone);
  });
  return Array.from(map.values())
    .map((x) => ({
      name: x.name,
      category: x.category,
      avg: x.ratingCount ? (x.total / x.ratingCount).toFixed(1) : "—",
      ratingCount: x.ratingCount,
      eventCount: x.events.size,
      phone: x.phone,
    }))
    .sort((a, b) => b.eventCount - a.eventCount || (b.avg === "—" ? -1 : Number(b.avg)) - (a.avg === "—" ? -1 : Number(a.avg)));
}

function whatsappDigits(phone) {
  let d = String(phone || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("972")) return d;
  if (d.startsWith("0")) d = d.slice(1);
  return "972" + d;
}

function whatsappLink(phone) {
  const d = whatsappDigits(phone);
  return d ? `https://wa.me/${d}` : "";
}

function collectProvidersForEvent(eventId) {
  return (credits || []).filter(
    (c) =>
      String(c.eventId || "") === String(eventId || "") &&
      c.professionalName &&
      isProviderEntry(c)
  );
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
    beginGlobalUpload("שומר נותן שירות", "שולח לענן…");
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
    setGlobalUpload("שומר נותן שירות", "מסנכרן…", 90);
    await syncFromServer({ silent: true });
    document.getElementById("providerModal")?.classList.add("hidden");
    document.getElementById("ownerInlineProviderForm")?.classList.add("hidden");
    await finishGlobalUpload("נותן השירות נוסף ✓");
    renderCredits();
  } catch (err) {
    console.error(err);
    cancelGlobalUpload();
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
  return eventImageDisplayUrl(value);
}

function eventImageDisplayUrl(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === "undefined" || raw === "null") return APP_CONFIG.placeholderImage;
  if (raw.startsWith("data:image/")) {
    return raw.length > 120 ? raw : APP_CONFIG.placeholderImage;
  }
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    const m = /[?&]id=([^&]+)/.exec(raw);
    if (raw.includes("drive.google.com") && m) {
      return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400`;
    }
    return raw;
  }
  if (raw.startsWith("assets/")) return raw;
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
    const lbBtn = e.target.closest("[data-open-lightbox]");
    if (lbBtn) {
      openLightbox(Number(lbBtn.dataset.openLightbox || 0));
      return;
    }
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

function getVisibleExperiencesGrouped() {
  const media = experiences.filter((exp) => exp.imageUrl);
  const visible = experiencesFilterEventId
    ? media.filter((m) => String(m.eventId) === String(experiencesFilterEventId))
    : media;
  return visible.reduce((acc, item) => {
    const key = item.eventId || "unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

function experienceDisplayUrl(url) {
  const str = String(url || "");
  const m = /[?&]id=([^&]+)/.exec(str);
  if (str.includes("drive.google.com") && m) {
    return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1200`;
  }
  return str;
}

function buildLightboxItems() {
  const grouped = getVisibleExperiencesGrouped();
  return Object.values(grouped).flat();
}

function openLightbox(index) {
  lightboxItems = buildLightboxItems();
  if (!lightboxItems.length || index < 0 || index >= lightboxItems.length) return;
  lightboxIndex = index;
  renderLightboxSlide();
  document.getElementById("mediaLightbox")?.classList.remove("hidden");
  document.body.classList.add("lightbox-open");
}

function closeLightbox() {
  document.getElementById("mediaLightbox")?.classList.add("hidden");
  document.body.classList.remove("lightbox-open");
  const vid = document.getElementById("lightboxVideo");
  if (vid) {
    vid.pause();
    vid.classList.add("hidden");
  }
  lightboxIndex = -1;
}

function renderLightboxSlide() {
  const exp = lightboxItems[lightboxIndex];
  if (!exp) return;
  const type = experienceMediaType(exp);
  const img = document.getElementById("lightboxImg");
  const vid = document.getElementById("lightboxVideo");
  const counter = document.getElementById("lightboxCounter");
  if (type === "video") {
    if (img) img.classList.add("hidden");
    if (vid) {
      vid.src = exp.imageUrl;
      vid.classList.remove("hidden");
    }
  } else {
    if (vid) {
      vid.pause();
      vid.classList.add("hidden");
    }
    if (img) {
      img.src = experienceDisplayUrl(exp.imageUrl);
      img.classList.remove("hidden");
    }
  }
  if (counter) counter.textContent = `${lightboxIndex + 1} / ${lightboxItems.length}`;
}

function bindLightbox() {
  document.getElementById("lightboxClose")?.addEventListener("click", closeLightbox);
  document.getElementById("lightboxPrev")?.addEventListener("click", () => {
    if (lightboxIndex > 0) {
      lightboxIndex -= 1;
      renderLightboxSlide();
    }
  });
  document.getElementById("lightboxNext")?.addEventListener("click", () => {
    if (lightboxIndex < lightboxItems.length - 1) {
      lightboxIndex += 1;
      renderLightboxSlide();
    }
  });
  document.getElementById("mediaLightbox")?.addEventListener("click", (e) => {
    if (e.target.id === "mediaLightbox") closeLightbox();
  });
  let touchX = 0;
  document.getElementById("mediaLightbox")?.addEventListener("touchstart", (e) => {
    touchX = e.changedTouches[0]?.clientX || 0;
  }, { passive: true });
  document.getElementById("mediaLightbox")?.addEventListener("touchend", (e) => {
    const dx = (e.changedTouches[0]?.clientX || 0) - touchX;
    if (Math.abs(dx) < 40) return;
    if (dx > 0 && lightboxIndex > 0) {
      lightboxIndex -= 1;
      renderLightboxSlide();
    } else if (dx < 0 && lightboxIndex < lightboxItems.length - 1) {
      lightboxIndex += 1;
      renderLightboxSlide();
    }
  }, { passive: true });
}

function renderExperiencesListOnly() {
  const list = document.getElementById("experiencesList");
  if (!list) return;
  const grouped = getVisibleExperiencesGrouped();
  const keys = Object.keys(grouped);
  list.innerHTML = keys.length
    ? keys
        .map((eventId) => {
          const event = events.find((e) => e.id === eventId);
          const title = event ? `האירוע של ${event.girlName}` : "אלבום כללי";
          const flatStart = buildLightboxItems().findIndex((x) => String(x.eventId) === String(eventId));
          const cards = grouped[eventId]
            .map((exp, localIdx) => {
              const type = experienceMediaType(exp);
              const globalIdx = flatStart >= 0 ? flatStart + localIdx : localIdx;
              const fileName = `${(event ? event.girlName : "media")}_${String(exp.id).slice(0, 6)}.${type === "video" ? "mp4" : "jpg"}`;
              const thumb = experienceDisplayUrl(exp.imageUrl);
              const mediaEl =
                type === "video"
                  ? `<button type="button" class="exp-gallery-tile exp-gallery-video" data-open-lightbox="${globalIdx}" aria-label="צפייה בסרטון"><video src="${exp.imageUrl}" class="exp-gallery-thumb" muted playsinline preload="metadata"></video><span class="exp-gallery-play">▶</span></button>`
                  : `<button type="button" class="exp-gallery-tile" data-open-lightbox="${globalIdx}" aria-label="צפייה בתמונה"><img src="${thumb}" class="exp-gallery-thumb" alt="" loading="lazy" /></button>`;
              const canDelete = canDeleteExperience(exp);
              return `
                <div class="exp-gallery-item relative">
                  <label class="exp-check-wrap">
                    <input type="checkbox" class="exp-select" data-url="${escapeHtmlAttr(exp.imageUrl)}" data-name="${escapeHtmlAttr(fileName)}" />
                  </label>
                  <div class="exp-actions">
                    <button type="button" class="exp-action-btn download" data-download-exp-url="${escapeHtmlAttr(exp.imageUrl)}" data-download-exp-name="${escapeHtmlAttr(fileName)}" aria-label="הורדה" title="הורדה">
                      <i class="fa-solid fa-download"></i>
                    </button>
                    <button type="button" class="exp-action-btn delete ${canDelete ? "" : "is-disabled"}" data-delete-experience-id="${exp.id}" ${canDelete ? "" : "disabled"} aria-label="מחיקה">
                      <i class="fa-solid fa-trash"></i>
                    </button>
                  </div>
                  ${mediaEl}
                  <div class="text-[10px] text-white/45 mt-1 truncate">${exp.userName}</div>
                </div>
              `;
            })
            .join("");
          return `
            <div class="glass rounded-2xl p-3">
              <div class="font-black text-sm mb-2">${title} <span class="text-white/40 font-normal">(${grouped[eventId].length})</span></div>
              <div class="exp-gallery-grid">${cards}</div>
            </div>
          `;
        })
        .join("")
    : '<div class="text-center text-white/40 text-sm">עדיין אין תמונות או סרטונים באלבומים</div>';
}

function renderExperiences() {
  const tab = document.getElementById("experiencesTab");
  if (isExperienceUploading && tab?.querySelector("#experiencesList")) {
    renderExperiencesListOnly();
    return;
  }
  const eventOptions = events
    .map((e) => `<option value="${e.id}">${eventOptionLabel(e)}</option>`)
    .join("");

  const media = experiences.filter((exp) => exp.imageUrl);
  const filterOptions = events
    .filter((e) => media.some((m) => String(m.eventId) === String(e.id)))
    .map((e) => `<option value="${e.id}">${eventOptionLabel(e)}</option>`)
    .join("");

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
    renderExperiencesListOnly();
  };
  document.getElementById("expSelectAllBtn").onclick = toggleSelectAllExperiences;
  document.getElementById("expDownloadBtn").onclick = downloadSelectedExperiences;
  renderExperiencesListOnly();
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
  if (isExperienceUploading) return;
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
  isExperienceUploading = true;
  beginGlobalUpload("מעלה לגלריה", `0 מתוך ${files.length} קבצים`);
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
      const label = files.length > 1 ? `מעלה ${idx + 1} מתוך ${files.length} קבצים` : "מעלה קובץ…";
      setGlobalUpload("מעלה לגלריה", label, base);
      let lastPct = 0;
      // זחילה עדינה כדי שהסרגל תמיד יתקדם, גם כשהשרת מעבד (Drive) ואין אירועי התקדמות
      const creep = setInterval(() => {
        lastPct = Math.min(90, lastPct + 3);
        showUploadProgress("expProgress", Math.min(99, base + Math.round((lastPct / 100) * span)), label);
      }, 250);
      let upload;
      try {
        upload = await retryApiCall(() =>
          Api.uploadExperienceImageWithProgress(
            {
              fileName: file.name || `exp_${Date.now()}.${isVideo ? "mp4" : "jpg"}`,
              mimeType: file.type || parts.mimeType,
              base64Data: parts.base64,
            },
            (filePct) => {
              if (filePct > lastPct) lastPct = filePct;
              const overall = Math.min(99, base + Math.round((lastPct / 100) * span));
              showUploadProgress("expProgress", overall, label);
              setGlobalUpload("מעלה לגלריה", label, overall);
            }
          )
        );
      } finally {
        clearInterval(creep);
      }
      showUploadProgress("expProgress", Math.min(99, base + span), label);
      setGlobalUpload("מעלה לגלריה", label, Math.min(99, base + span));
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
    setGlobalUpload("מעלה לגלריה", "שומר ברשומות…", 96);
    // הצגה מיידית (אופטימי) כדי שזה ירגיש מהיר, וסנכרון ברקע
    experiences = [...uploaded, ...experiences];
    saveJson("bm_experiences", experiences);
    document.getElementById("expImageFile").value = "";
    renderExperiencesListOnly();
    await syncFromServer({ silent: true });
    await finishGlobalUpload(uploaded.length > 1 ? `${uploaded.length} פריטים עלו ✓` : "הקובץ עלה ✓");
  } catch (err) {
    const msg = String(err?.message || "");
    if (isUnknownActionError(err) || /DriveApp|הרשאה|permission/i.test(msg)) {
      cancelGlobalUpload();
      alert(
        "ההעלאה לענן נכשלה — חסרה הרשאת Drive.\n\n" +
          "פתח/י Apps Script → בחר/י authorizeDrive → Run → אשר/י הרשאות.\n\n" +
          REDEPLOY_MSG
      );
    } else {
      console.error(err);
      cancelGlobalUpload();
      showToast(`ההעלאה נכשלה — הקובץ נשאר נבחר, אפשר לנסות שוב`);
    }
  } finally {
    isExperienceUploading = false;
    if (btn) btn.disabled = false;
    hideUploadProgress("expProgress");
  }
}

// ─── סרגל התקדמות העלאה ─────────────────────────────────────
function showUploadProgress(prefix, pct, label) {
  const wrap = document.getElementById(`${prefix}Wrap`);
  if (wrap) {
    wrap.classList.remove("hidden");
    const bar = document.getElementById(`${prefix}Bar`);
    const pctEl = document.getElementById(`${prefix}Pct`);
    const labelEl = document.getElementById(`${prefix}Label`);
    const safe = Math.max(0, Math.min(100, Math.round(pct)));
    if (bar) bar.style.width = `${safe}%`;
    if (pctEl) pctEl.textContent = `${safe}%`;
    if (labelEl && label) labelEl.textContent = label;
  }
}

function hideUploadProgress(prefix) {
  const wrap = document.getElementById(`${prefix}Wrap`);
  if (!wrap) return;
  setTimeout(() => {
    wrap.classList.add("hidden");
    const bar = document.getElementById(`${prefix}Bar`);
    if (bar) bar.style.width = "0%";
  }, 400);
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

    const openRsvpBtn = e.target.closest("[data-open-rsvp-id]");
    if (openRsvpBtn) {
      openRsvpScreen(openRsvpBtn.dataset.openRsvpId, openRsvpBtn.dataset.rsvpTab || "yes");
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

    if (e.target.closest("#adminExportProvidersBtn")) {
      exportProvidersCsv();
      return;
    }
    if (e.target.closest("#adminExportVenuesBtn")) {
      exportVenuesCsv();
      return;
    }
    if (e.target.closest("#adminToggleDangerBtn")) {
      const zone = document.getElementById("adminDangerZone");
      const btn = e.target.closest("#adminToggleDangerBtn");
      const chevron = btn?.querySelector(".admin-danger-chevron");
      const tabEl = document.getElementById("adminTab");
      if (zone && tabEl) {
        zone.classList.toggle("hidden");
        const isOpen = !zone.classList.contains("hidden");
        tabEl.dataset.dangerOpen = isOpen ? "1" : "0";
        if (chevron) chevron.classList.toggle("is-open", isOpen);
        btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
      }
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

  closeRsvpScreen();
  activeTab = tab;
  sessionStorage.setItem("bm_active_tab", tab);

  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.getElementById(map[tab]).classList.add("active");

  document.querySelectorAll(".nav-tab[data-tab]").forEach((btn) => {
    btn.classList.toggle("nav-tab-active", btn.dataset.tab === tab);
    btn.classList.toggle("nav-tab-idle", btn.dataset.tab !== tab);
  });

  updateAddButton(tab);

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
  const serverIds = new Set((serverCredits || []).map((c) => String(c.id)));
  const extras = (pending || []).filter((c) => c.id && !serverIds.has(String(c.id)));
  return [...(serverCredits || []), ...extras];
}

function mergePendingExperiences(serverExperiences, pending) {
  const serverIds = new Set((serverExperiences || []).map((e) => String(e.id)));
  const extras = (pending || []).filter((e) => e.id && !serverIds.has(String(e.id)));
  return [...(serverExperiences || []), ...extras].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
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
