/** הגדרות מרכזיות */
const APP_CONFIG = {
  /** גרסת הפרונט — לעדכן בכל פריסה (יחד עם index.html data-app-version) */
  appVersion: "121.2",
  bootMessage: "כמה רגעים התוכן יעלה",
  title: "ישומון אירועי בת מצווה",
  classInfo: "כנפי רוח ו׳-4 • תשפ״ו",

  scriptUrl:
    "https://script.google.com/macros/s/AKfycby1dYb8JgEj8fuqPQQwxhtroAT_r_sPQC7j_i2YnnlLEue6Moq4mtxWIdLQrkSiaWU/exec",

  storage: {
    user: "bm_user",
  },

  phonePrefixes: ["051", "052", "053", "054", "055", "056", "057", "058", "059"],

  menuOptions: [
    { value: "", label: "בחר תפריט" },
    { value: "חלבי 🥛", label: "חלבי 🥛" },
    { value: "בשרי 🥩", label: "בשרי 🥩" },
  ],

  defaultRole: "אמא",
  placeholderImage:
    "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Cdefs%3E%3ClinearGradient id='bg' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%23f9a8d4'/%3E%3Cstop offset='100%25' stop-color='%23c084fc'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='100' cy='100' r='100' fill='url(%23bg)'/%3E%3Ccircle cx='100' cy='82' r='34' fill='%23fde7f3'/%3E%3Cpath d='M52 175c6-33 25-49 48-49s42 16 48 49' fill='%23ffffffaa'/%3E%3Cpath d='M70 80c4-17 16-27 30-27s26 10 30 27' stroke='%236b21a8' stroke-width='9' stroke-linecap='round' fill='none'/%3E%3Ccircle cx='88' cy='82' r='4.5' fill='%236b21a8'/%3E%3Ccircle cx='112' cy='82' r='4.5' fill='%236b21a8'/%3E%3Cpath d='M88 97c6 5 18 5 24 0' stroke='%23db2777' stroke-width='4' stroke-linecap='round' fill='none'/%3E%3C/svg%3E",
  syncIntervalMs: 60000,
  adminPassword: "1234",
  adminPhone: "054-2452100",
};
