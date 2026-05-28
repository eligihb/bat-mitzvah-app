/** הגדרות מרכזיות */
const APP_CONFIG = {
  title: "ישומון אירועי בת מצווה",
  classInfo: "כנפי רוח ו׳-4 • תשפ״ו",

  scriptUrl:
    "https://script.google.com/macros/s/AKfycbxo60K9X9yEVEqLCrKA5y2PvSihCrP_iKQN9KCQejGvfkE51p2SK2TPpzGvafTA1S0/exec",

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
  placeholderImage: "assets/default-girl12.svg",
  syncIntervalMs: 30000,
};
