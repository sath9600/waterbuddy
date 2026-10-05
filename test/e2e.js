// End-to-end test of an installed WaterBuddy build (macOS or Windows).
//
//   node test/e2e.js <path to the WaterBuddy executable>
//
// Launches the app with 1-minute timers and drives it through the Chrome DevTools Protocol, clicking the buttons
// with the real OS mouse (which also proves click-through switches off over them). The user's state.json is
// backed up first and restored afterwards. Screenshots go to test/screenshots/. Exits non-zero on any failure.
const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const EXE = process.argv[2];
if (!EXE || !fs.existsSync(EXE)) { console.error("usage: node test/e2e.js <WaterBuddy executable>"); process.exit(2); }

const IS_WIN = process.platform === "win32";
const PORT = 9333;
const DATA = IS_WIN ? path.join(process.env.APPDATA, "WaterBuddy") : path.join(os.homedir(), "Library/Application Support/WaterBuddy");
const STATE = path.join(DATA, "state.json");
const SHOTS = path.join(__dirname, "screenshots");
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── OS helpers ───────────────────────────────────────────────────────────────

const ps = script => execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { stdio: "pipe" });

function screenshot(name) {
  const file = path.join(SHOTS, `${process.platform}-${name}.png`);
  if (IS_WIN) {
    ps(`Add-Type -AssemblyName System.Windows.Forms,System.Drawing
      $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
      $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size, [System.Drawing.CopyPixelOperation]::SourceCopy -bor [System.Drawing.CopyPixelOperation]::CaptureBlt)
      $bmp.Save('${file}')`);
  } else {
    execFileSync("screencapture", ["-x", file]);
  }
}

/** Real mouse: approach, hover (so the page enables clicks), then click. Coordinates in physical pixels. */
function click({ x, y }) {
  x = Math.round(x); y = Math.round(y);
  if (IS_WIN) {
    ps(`Add-Type -Namespace W -Name M -MemberDefinition '
        [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
        [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, System.UIntPtr e);'
      [W.M]::SetCursorPos(${x - 30}, ${y}); Start-Sleep -Milliseconds 150
      [W.M]::SetCursorPos(${x}, ${y});      Start-Sleep -Milliseconds 400
      [W.M]::mouse_event(2, 0, 0, 0, [System.UIntPtr]::Zero); Start-Sleep -Milliseconds 60
      [W.M]::mouse_event(4, 0, 0, 0, [System.UIntPtr]::Zero)`);
  } else {
    const src = path.join(os.tmpdir(), "waterbuddy-click.swift");
    fs.writeFileSync(src, `import CoreGraphics; import Foundation
      func ev(_ t: CGEventType, _ x: Double) { CGEvent(mouseEventSource: nil, mouseType: t, mouseCursorPosition: CGPoint(x: x, y: ${y}), mouseButton: .left)!.post(tap: .cghidEventTap) }
      ev(.mouseMoved, ${x - 30}); usleep(150_000); ev(.mouseMoved, ${x}); usleep(400_000)
      ev(.leftMouseDown, ${x}); usleep(60_000); ev(.leftMouseUp, ${x})`);
    execFileSync("swift", [src], { stdio: "ignore" });
  }
}

function loginItemRegistered() {
  if (IS_WIN) {
    try { return /WaterBuddy/i.test(execFileSync("reg", ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"]).toString()); }
    catch { return false; }
  }
  return null;   // macOS: checked by hand (System Settings → Login Items)
}

// ── DevTools protocol ────────────────────────────────────────────────────────

async function targets() {
  try { return await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch { return []; }
}
const isPopup = t => t.url.startsWith("app://waterbuddy/popup");
async function waitForPopup(timeoutMs) {
  for (const end = Date.now() + timeoutMs; Date.now() < end; await sleep(300)) {
    const t = (await targets()).find(isPopup);
    if (t) return t;
  }
  return null;
}
async function waitForClose(timeoutMs) {
  for (const end = Date.now() + timeoutMs; Date.now() < end; await sleep(300)) {
    if (!(await targets()).some(isPopup)) return true;
  }
  return false;
}
async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0; const pending = {};
  ws.onmessage = e => { const m = JSON.parse(e.data); pending[m.id]?.(m); delete pending[m.id]; };
  const evaluate = expression => new Promise(resolve => {
    pending[++id] = m => resolve(m.result?.result?.value);
    ws.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, returnByValue: true } }));
  });
  return { ws, evaluate };
}

// Everything the checks need from the page, in one round trip.
const SNAPSHOT = `(() => {
  const $ = id => document.getElementById(id), actor = $('actor'), msg = $('msg'), song = $('song');
  const visible = [...document.querySelectorAll('#figure video')].find(v => !v.hidden);
  const rect = msg.getBoundingClientRect(), lineHeight = parseFloat(getComputedStyle(msg).lineHeight);
  const screenPoint = id => { const r = $(id).getBoundingClientRect(); return { x: (screenX + r.x + r.width / 2) * devicePixelRatio, y: (screenY + r.y + r.height / 2) * devicePixelRatio }; };
  const measure = html => { const keep = msg.innerHTML; msg.innerHTML = html; const r = msg.getBoundingClientRect(); msg.innerHTML = keep;
    return { lines: Math.round(r.height / lineHeight), top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right) }; };
  return {
    x: Math.round(new DOMMatrix(getComputedStyle(actor).transform).m41),
    centre: Math.round((innerWidth - actor.offsetWidth) / 2), winW: innerWidth,
    clips: document.querySelectorAll('#figure video').length,
    clip: visible ? +visible.duration.toFixed(2) : null, playing: visible ? !visible.paused : null,
    msg: msg.innerText.replace(/\\n/g, ' / '),
    text: { lines: Math.round(rect.height / lineHeight), top: Math.round(rect.top), left: Math.round(rect.left), right: Math.round(rect.right) },
    longest: measure("Okay… 😔<br>I'll come back in another 10 minutes"),
    progress: $('progress-text').textContent, hint: $('later-hint').textContent,
    buttons: $('buttons').classList.contains('show'),
    song: { playing: !song.paused, volume: +song.volume.toFixed(2) },
    drink: screenPoint('drink'), later: screenPoint('later'),
  };
})()`;
const CLIPS = { enter: 3.5, dance: 5.0, happy: 3.75, sad: 1.63, "sad-walk": 2.96 };   // seconds, from assets/media
const clipName = d => Object.keys(CLIPS).find(k => Math.abs(CLIPS[k] - d) < 0.1) ?? `unknown (${d}s)`;
const onScreen = t => t.lines === 2 && t.top >= 0 && t.left >= 0 && t.right <= snapWidth;
let snapWidth = Infinity;

// ── Test ─────────────────────────────────────────────────────────────────────

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}
const mlToday = () => JSON.parse(fs.readFileSync(STATE, "utf8")).history?.[new Date().toLocaleDateString("sv")] ?? 0;

async function run() {
  // 1 ── Shows on launch, dances in from the left, "Drinking now"
  let target = await waitForPopup(60_000);
  check("Reminder opens on launch (--now)", !!target);
  if (!target) return;
  let { ws, evaluate } = await connect(target);
  await sleep(1200);
  screenshot("1-entering");
  let s = await evaluate(SNAPSHOT); snapWidth = s.winW;
  check("All 5 clips load", s.clips === 5, `${s.clips}`);
  check("Enters from the left edge", s.x < 100, `x=${s.x}px`);
  check("Dance-walks in", clipName(s.clip) === "enter" && s.playing, clipName(s.clip));
  check("Song plays", s.song.playing, `volume ${s.song.volume}`);
  check("Buttons hidden while entering", !s.buttons);

  await sleep(4800);
  screenshot("2-middle");
  s = await evaluate(SNAPSHOT);
  check("Stops in the middle", Math.abs(s.x - s.centre) <= 2, `x=${s.x}px, centre=${s.centre}px`);
  check("Dances with the bottle", clipName(s.clip) === "dance" && s.playing, clipName(s.clip));
  check("Greeting", s.msg === "Hey, Tester! / Time to drink water! 💧", s.msg);
  check("Greeting fully on screen", onScreen(s.text), JSON.stringify(s.text));
  check("Longest reply fits on screen", onScreen(s.longest), JSON.stringify(s.longest));
  check("Progress vs goal", s.progress === "Today: 500 ml of 2.75 L", s.progress);
  check("Snooze hint", s.hint === "Remind me in 1 minute", s.hint);
  check("Buttons shown", s.buttons);

  click(s.drink);
  await sleep(1300);
  screenshot("3-celebrating");
  s = await evaluate(SNAPSHOT);
  check("Real mouse click on 'Drinking now' lands", s.msg.startsWith("Semma"), s.msg);
  check("Celebration reply", s.msg === "Semma, Tester! 🔥 / See you in another 1 minute!", s.msg);
  check("Reply fully on screen", onScreen(s.text), JSON.stringify(s.text));
  check("Jumps for joy", clipName(s.clip) === "happy", clipName(s.clip));
  check("Glass logged", mlToday() === 750, `${mlToday()} ml`);
  check("Progress updated", s.progress === "Today: 750 ml of 2.75 L", s.progress);

  await sleep(3400);
  screenshot("4-leaving");
  s = await evaluate(SNAPSHOT);
  check("Dances back out to the left", clipName(s.clip) === "enter" && s.x < s.centre, `${clipName(s.clip)}, x=${s.x}px`);
  ws.close();
  check("Closes after leaving", await waitForClose(10_000));
  const drankAt = Date.now();

  // 2 ── Comes back after the interval; "I will do it later"
  target = await waitForPopup(110_000);
  const afterDrink = (Date.now() - drankAt) / 1000;
  check("Next reminder after the 1-minute interval", !!target && afterDrink >= 50 && afterDrink <= 85, `${afterDrink.toFixed(0)}s`);
  if (!target) return;
  ({ ws, evaluate } = await connect(target));
  await sleep(6000);
  s = await evaluate(SNAPSHOT);
  click(s.later);
  await sleep(900);
  screenshot("5-sad");
  s = await evaluate(SNAPSHOT);
  check("Real mouse click on 'I will do it later' lands", s.msg.startsWith("Okay"), s.msg);
  check("Sad reply", s.msg === "Okay… 😔 / I'll come back in another 1 minute", s.msg);
  check("Reply fully on screen", onScreen(s.text), JSON.stringify(s.text));
  check("Head drops", clipName(s.clip) === "sad", clipName(s.clip));
  await sleep(1800);
  screenshot("6-sad-walk");
  s = await evaluate(SNAPSHOT);
  check("Then walks out sadly", clipName(s.clip) === "sad-walk" && s.x < s.centre, `${clipName(s.clip)}, x=${s.x}px`);
  check("Song fades out", !s.song.playing && s.song.volume === 0, JSON.stringify(s.song));
  check("Nothing logged for 'later'", mlToday() === 750, `${mlToday()} ml`);
  ws.close();
  check("Closes after leaving", await waitForClose(10_000));
  const snoozedAt = Date.now();

  // 3 ── Snooze brings him back
  target = await waitForPopup(110_000);
  const afterSnooze = (Date.now() - snoozedAt) / 1000;
  check("Comes back after the 1-minute snooze", !!target && afterSnooze >= 50 && afterSnooze <= 85, `${afterSnooze.toFixed(0)}s`);

  const login = loginItemRegistered();
  if (login !== null) check("Registered to start at login", login);
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.mkdirSync(DATA, { recursive: true });
  const backup = fs.existsSync(STATE) ? fs.readFileSync(STATE) : null;
  fs.writeFileSync(STATE, JSON.stringify({
    settings: { name: "Tester", intervalMinutes: 1, snoozeMinutes: 1, glassMl: 250, goalMl: 2750, launchAtLogin: true },
    history: { [new Date().toLocaleDateString("sv")]: 500 },
  }));

  const app = spawn(EXE, [`--remote-debugging-port=${PORT}`, "--now"], { detached: true, stdio: "ignore" });
  try {
    await run();
  } catch (err) {
    check("Test ran without crashing", false, err.stack);
  } finally {
    try { process.kill(app.pid); } catch {}
    if (IS_WIN) try { execFileSync("taskkill", ["/F", "/IM", path.basename(EXE)], { stdio: "ignore" }); } catch {}
    await sleep(2000);
    if (backup) fs.writeFileSync(STATE, backup); else fs.rmSync(STATE, { force: true });
  }

  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
