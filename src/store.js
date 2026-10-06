// Settings and the daily water log, kept in <userData>/state.json.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

/** "sathish.eathuraj" → "Sathish" */
function defaultName() {
  const user = (os.userInfo().username || "friend").split(/[._\s-]/)[0];
  return user.charAt(0).toUpperCase() + user.slice(1);
}

const DEFAULTS = {
  name: defaultName(),
  intervalMinutes: 60,
  snoozeMinutes: 10,
  glassMl: 250,
  goalMl: 2500,
  launchAtLogin: true,
  character: null,   // chosen in the picker on first run
};

/** Local calendar day, e.g. "2026-10-05". */
function dayKey(date = new Date()) {
  const p = n => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

class Store {
  constructor(dir) {
    this.file = path.join(dir, "state.json");
    let saved = {};
    try { saved = JSON.parse(fs.readFileSync(this.file, "utf8")); } catch { /* first run or unreadable: start fresh */ }
    this.settings = { ...DEFAULTS, ...saved.settings };
    this.history = saved.history && typeof saved.history === "object" ? saved.history : {};   // { "yyyy-mm-dd": ml }
  }

  save() {
    // Write-then-rename so a crash mid-write never leaves a corrupt file.
    const tmp = `${this.file}.tmp`;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify({ settings: this.settings, history: this.history }, null, 2));
    fs.renameSync(tmp, this.file);
  }

  set(key, value) { this.settings[key] = value; this.save(); }

  mlOn(date) { return this.history[dayKey(date)] || 0; }
  get mlToday() { return this.mlOn(new Date()); }

  addMl(delta) {
    this.history[dayKey()] = Math.max(0, this.mlToday + delta);
    this.save();
  }
}

/** 750 → "750 ml", 1250 → "1.25 L" */
function amount(ml) {
  return ml < 1000 ? `${ml} ml` : `${+(ml / 1000).toFixed(2)} L`;
}

module.exports = { Store, amount };
