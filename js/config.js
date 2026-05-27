/** הגדרות מרכזיות — ערכים שמשתנים לפי הפרויקט */
const APP_CONFIG = {
  title: "ישומון אירועי בת מצווה",
  classInfo: "כנפי רוח ו׳-4 • תשפ״ו",

  /** Google Apps Script — יחובר בשלב הבא */
  scriptUrl:
    "https://script.google.com/macros/s/AKfycbyRNLuyH_sP-7GJIpvveZWvDdtIu5bj6nfNyVG1G3y7g7rT88SHOtqwyPhWKCBtWpA/exec",

  storage: {
    user: "bm_user",
    events: "bm_events",
    messages: "bm_messages",
  },

  phonePrefixes: ["051", "052", "053", "054", "055", "056", "057", "058", "059"],

  menuOptions: [
    { value: "", label: "בחר תפריט" },
    { value: "חלבי 🥛", label: "חלבי 🥛" },
    { value: "בשרי 🥩", label: "בשרי 🥩" },
  ],

  defaultRole: "אמא",
  placeholderImage: "https://placehold.co/200",
};
