// WaterBuddy — a dancing, always-on-top hourly water reminder (macOS + Windows).
const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, net, powerMonitor, protocol, screen, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { Store, amount } = require("./store");

const IS_MAC = process.platform === "darwin";
const ASSETS = path.join(__dirname, "..", "assets");
const CHARACTERS_DIR = path.join(ASSETS, "characters");
const POPUP_HEIGHT = 780;
const MEDIA_ROLES = ["enter", "dance", "happy", "sad", "sad-walk"];
const SONG_EXTS = [".mp3", ".m4a", ".wav", ".ogg"];

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");   // play the song without a click

// A separate data folder (settings, water log, single-instance lock) for tests and trying things out.
if (process.env.WATERBUDDY_DATA_DIR) app.setPath("userData", path.resolve(process.env.WATERBUDDY_DATA_DIR));

// One running copy. Launching again (e.g. `WaterBuddy --now`) is forwarded to it.
if (!app.requestSingleInstanceLock()) app.exit(0);

// One custom origin, app://waterbuddy, keeps everything same-origin and away from file:// quirks:
//   /popup/…  the reminder page        /picker/…  the character picker
//   /characters/<id>/…  bundled clips  /media/…   the song and the user's own overrides
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

let store, tray, popup, picker;
let nextFire = 0;
let paused = false;
let quitting = false;   // windows closing because the app is quitting aren't user choices

const userMediaDir = () => path.join(app.getPath("userData"), "media");

/** A file the user dropped into the media folder wins over the bundled one. */
function mediaPath(file) {
  const user = path.join(userMediaDir(), file);
  return fs.existsSync(user) ? user : path.join(ASSETS, file);
}

/** The audio file named <base>.<ext> in `dir`, if any (e.g. song.mp3, sad-song.m4a). */
const findAudio = (dir, base) => SONG_EXTS.map(ext => base + ext).find(f => fs.existsSync(path.join(dir, f)));

/**
 * URL for a character's `song` (plays during the reminder) or `sad-song` (optional; plays after "I will do it later").
 * A file with that name in the user's media folder overrides the character's own.
 */
function audioUrl(characterId, base) {
  const user = findAudio(userMediaDir(), base);
  if (user) return `/media/${encodeURIComponent(user)}`;
  const own = findAudio(path.join(CHARACTERS_DIR, characterId), base);
  return own ? `/characters/${characterId}/${encodeURIComponent(own)}` : null;
}


/** Characters bundled in assets/characters/<id>/, each described by its character.json. */
const characters = (() => {
  let list = null;
  return () => list ??= fs.readdirSync(CHARACTERS_DIR).flatMap(id => {
    try { return [{ id, ...JSON.parse(fs.readFileSync(path.join(CHARACTERS_DIR, id, "character.json"), "utf8")) }]; }
    catch { return []; }
  }).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
})();
const character = () => characters().find(c => c.id === store.settings.character);

function registerProtocol() {
  protocol.handle("app", req => {
    const { host, pathname } = new URL(req.url);
    const [, folder, ...rest] = pathname.split("/").map(decodeURIComponent);
    const name = path.basename(rest.at(-1) || "");   // basename: never escape the folder
    const charId = folder === "characters" && rest.length === 2 && characters().some(c => c.id === rest[0]) ? rest[0] : null;
    const file = host !== "waterbuddy" || !name ? null
               : folder === "popup" || folder === "picker" ? path.join(__dirname, folder, name)
               : charId ? path.join(CHARACTERS_DIR, charId, name)
               : folder === "media" ? mediaPath(name)
               : null;
    if (!file || !fs.existsSync(file)) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

// ── Scheduling ────────────────────────────────────────────────────────────────

function schedule(minutes) {
  nextFire = Date.now() + minutes * 60_000;
  updateTray();
}

function tick() {
  if (!paused && !popup && character() && Date.now() >= nextFire) showPopup();
  updateTray();   // also rolls the totals over at midnight
}

// ── Tray / menu bar ──────────────────────────────────────────────────────────

function trayIcon() {
  const img = nativeImage.createFromPath(path.join(ASSETS, "tray.png"));
  return IS_MAC ? img.resize({ width: 18, height: 18 }) : img;
}

function updateTray() {
  if (!tray) return;
  const s = store.settings, ml = store.mlToday;
  const pct = Math.round((ml * 100) / s.goalMl);
  const summary = `Today: ${amount(ml)} of ${amount(s.goalMl)} (${pct}%)${ml >= s.goalMl ? " ✅" : ""}`;
  const next = paused ? "Reminders paused"
    : `Next reminder: ${new Date(nextFire).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;

  if (IS_MAC) tray.setTitle(` ${amount(ml)}`);
  tray.setToolTip(`WaterBuddy — ${summary}`);

  const weekday = new Intl.DateTimeFormat([], { weekday: "short", day: "numeric", month: "short" });
  const history = [...Array(7)].map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() - i);
    const dayMl = store.mlOn(d);
    return { label: `${i === 0 ? "Today" : weekday.format(d)}:  ${amount(dayMl)}${dayMl >= s.goalMl ? " ✅" : ""}`, enabled: false };
  });
  const choices = (values, key) => values.map(v => ({
    label: amount(v), type: "radio", checked: s[key] === v, click: () => { store.set(key, v); updateTray(); },
  }));

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: summary, enabled: false },
    { label: next, enabled: false },
    { label: "Last 7 days", submenu: history },
    { type: "separator" },
    { label: "I drank a glass", accelerator: "CmdOrCtrl+D", click: () => { store.addMl(s.glassMl); updateTray(); } },
    { label: "Undo last glass", accelerator: "CmdOrCtrl+Z", click: () => { store.addMl(-s.glassMl); updateTray(); } },
    { label: `Glass size: ${amount(s.glassMl)}`, submenu: choices([150, 200, 250, 300, 500, 750, 1000], "glassMl") },
    { label: `Daily goal: ${amount(s.goalMl)}`, submenu: choices([1500, 1750, 2000, 2250, 2500, 2750, 3000, 3250, 3500, 4000], "goalMl") },
    { type: "separator" },
    { label: `Character: ${character()?.name ?? "not chosen"}`, submenu: [
      ...characters().map(c => ({ label: c.name, type: "radio", checked: c.id === s.character, click: () => chooseCharacter(c.id, false) })),
      { type: "separator" },
      { label: "Choose with preview…", click: openPicker },
    ] },
    { type: "separator" },
    { label: "Show reminder now", click: showPopup },
    { label: paused ? "Resume reminders" : "Pause reminders", click: togglePause },
    { label: "Start at login", type: "checkbox", checked: s.launchAtLogin, click: i => setLaunchAtLogin(i.checked) },
    { label: "Open media folder…", click: openMediaFolder },
    { type: "separator" },
    { label: "Quit WaterBuddy", role: "quit" },
  ]));
}

function togglePause() {
  paused = !paused;
  if (!paused) schedule(store.settings.intervalMinutes);
  updateTray();
}

function setLaunchAtLogin(on) {
  store.set("launchAtLogin", on);
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: on });   // dev runs would register the Electron binary
}

function openMediaFolder() {
  fs.mkdirSync(userMediaDir(), { recursive: true });
  shell.openPath(userMediaDir());
}

// ── Character picker ─────────────────────────────────────────────────────────

/** A small normal window with a dancing preview of each character. Opens on first run and from the menu. */
function openPicker() {
  if (picker) { picker.show(); picker.focus(); return; }
  picker = new BrowserWindow({
    width: 820, height: 600, resizable: false, maximizable: false, fullscreenable: false, show: false,
    alwaysOnTop: true,   // macOS won't let a background app come to the front; keep the question visible
    title: "Choose your WaterBuddy", backgroundColor: "#0f1d33", autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true },
  });
  picker.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  picker.webContents.on("will-navigate", e => e.preventDefault());
  picker.once("ready-to-show", () => { picker.show(); picker.focus(); if (IS_MAC) app.focus({ steal: true }); });
  picker.on("closed", () => {
    picker = null;
    // Closed on first run without choosing: start with the first character; it can be changed from the menu.
    if (!character() && !quitting) chooseCharacter(characters()[0].id, false);
  });
  picker.loadURL("app://waterbuddy/picker/index.html");
}

function chooseCharacter(id, preview) {
  if (!characters().some(c => c.id === id)) return;
  store.set("character", id);
  updateTray();
  picker?.close();
  if (preview) { popup?.close(); setTimeout(showPopup, 400); }   // meet your new buddy right away
}

ipcMain.handle("picker:list", () => ({
  current: store.settings.character,
  characters: characters().map(c => ({ id: c.id, name: c.name, preview: `/characters/${c.id}/dance.webm` })),
}));
ipcMain.on("picker:choose", (_e, id) => chooseCharacter(id, true));

// ── Reminder popup ───────────────────────────────────────────────────────────

/** A transparent, click-through strip along the bottom of the screen the cursor is on. */
function showPopup() {
  if (popup) return;
  if (!character()) return openPicker();
  const { workArea: wa } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const height = Math.min(POPUP_HEIGHT, wa.height);

  popup = new BrowserWindow({
    x: wa.x, y: wa.y + wa.height - height, width: wa.width, height,
    transparent: true, backgroundColor: "#00000000", frame: false, hasShadow: false,
    resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, show: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true },
  });
  popup.setAlwaysOnTop(true, "screen-saver");
  popup.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  popup.setIgnoreMouseEvents(true, { forward: true });   // the page turns clicks on over its buttons
  popup.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  popup.webContents.on("will-navigate", e => e.preventDefault());
  popup.once("ready-to-show", () => popup.showInactive());
  popup.on("closed", () => { popup = null; updateTray(); });
  popup.loadURL("app://waterbuddy/popup/index.html");
}

ipcMain.handle("popup:config", () => {
  const s = store.settings, c = character();
  // A clip the user dropped into the media folder overrides the character's own.
  const clip = role => fs.existsSync(path.join(userMediaDir(), `${role}.webm`)) ? `/media/${role}.webm` : `/characters/${c.id}/${role}.webm`;
  return {
    name: s.name, ml: store.mlToday, glassMl: s.glassMl, goalMl: s.goalMl,
    intervalMinutes: s.intervalMinutes, snoozeMinutes: s.snoozeMinutes,
    character: c.id, durations: c.durations,
    clips: Object.fromEntries(MEDIA_ROLES.map(r => [r, clip(r)])),
    song: audioUrl(c.id, "song"), sadSong: audioUrl(c.id, "sad-song"),
  };
});

ipcMain.on("popup:choice", (_e, choice) => {
  const s = store.settings;
  if (choice === "drink") { store.addMl(s.glassMl); schedule(s.intervalMinutes); }
  else if (choice === "later") schedule(s.snoozeMinutes);
});

ipcMain.on("popup:interactive", (_e, on) => popup?.setIgnoreMouseEvents(!on, { forward: true }));
ipcMain.on("popup:done", () => popup?.close());

// ── Startup ──────────────────────────────────────────────────────────────────

app.on("second-instance", (_e, argv) => { if (argv.includes("--now")) showPopup(); });
app.on("window-all-closed", () => { /* keep running in the tray */ });
app.on("before-quit", () => { quitting = true; });

app.whenReady().then(() => {
  if (IS_MAC) app.dock.hide();
  if (process.platform === "win32") app.setAppUserModelId("com.sathish.waterbuddy");
  store = new Store(app.getPath("userData"));
  registerProtocol();
  setLaunchAtLogin(store.settings.launchAtLogin);

  tray = new Tray(trayIcon());
  if (!IS_MAC) tray.on("click", () => tray.popUpContextMenu());   // Windows: left-click opens the menu too
  schedule(store.settings.intervalMinutes);

  // Poll rather than one long timer so reminders stay right across sleep/wake.
  setInterval(tick, 15_000);
  powerMonitor.on("resume", tick);

  if (!character()) openPicker();                      // first run: pick a buddy (shows a reminder once chosen)
  else if (process.argv.includes("--now")) showPopup();
});
