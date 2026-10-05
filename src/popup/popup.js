// The reminder: dance in from the left, ask, react, then leave to the left.
const api = window.waterbuddy;
const $ = id => document.getElementById(id);
const wait = ms => new Promise(r => setTimeout(r, ms));
const amount = ml => (ml < 1000 ? `${ml} ml` : `${+(ml / 1000).toFixed(2)} L`);
const count = (n, unit) => `${n} ${unit}${n === 1 ? "" : "s"}`;
/** 60 → "1 hour", 90 → "1.5 hours", 10 → "10 minutes" */
const duration = min => (min >= 60 ? count(+(min / 60).toFixed(1), "hour") : count(min, "minute"));

const ENTER_MS = 4500;       // happy dance-walk in from the left edge
const CELEBRATE_MS = 3200;   // jumping after "Drinking now"
const HEAD_DOWN_MS = 1600;   // length of the sad.webm clip
const EXIT_HAPPY_MS = 4500;
const EXIT_SAD_MS = 5500;    // the sad walk is slower

const actor = $("actor"), msg = $("msg"), song = $("song");

// ── Clips ────────────────────────────────────────────────────────────────────

/** Load a clip fully into memory first so switching between them never flashes or stalls. */
async function loadClip(url) {
  const blob = await (await fetch(url)).blob();
  const v = Object.assign(document.createElement("video"), {
    src: URL.createObjectURL(blob), muted: true, playsInline: true, loop: true, hidden: true,
  });
  $("figure").append(v);
  if (v.readyState < 2) await new Promise(r => v.addEventListener("loadeddata", r, { once: true }));
  return v;
}

let current = null;
function play(clip, { loop = true } = {}) {
  if (current && current !== clip) { current.pause(); current.hidden = true; }
  current = clip;
  clip.loop = loop;
  clip.currentTime = 0;
  clip.hidden = false;
  clip.play().catch(() => {});
}

// ── Movement ─────────────────────────────────────────────────────────────────

const offLeft = () => -actor.offsetWidth;
const center = () => (window.innerWidth - actor.offsetWidth) / 2;

function slideTo(x, ms, easing) {
  actor.style.transition = `transform ${ms}ms ${easing}`;
  actor.style.transform = `translateX(${x}px)`;
  return wait(ms);
}

// ── Text ─────────────────────────────────────────────────────────────────────

function say(html) {
  msg.classList.remove("show");
  void msg.offsetWidth;   // restart the pop animation
  msg.innerHTML = html;
  msg.classList.add("show");
}

function showProgress(ml, goal) {
  $("progress-text").textContent = `Today: ${amount(ml)} of ${amount(goal)}${ml >= goal ? " ✅" : ""}`;
  $("fill").style.width = `${Math.min(100, (ml * 100) / goal)}%`;
}

function rainDrops() {
  for (let i = 0; i < 26; i++) {
    const d = Object.assign(document.createElement("div"), { className: "drop", textContent: "💧" });
    d.style.left = `${Math.random() * 100}%`;
    d.style.animationDelay = `${Math.random() * 0.6}s`;
    document.body.append(d);
  }
}

function fadeOutSong() {
  const t = setInterval(() => {
    song.volume = Math.max(0, song.volume - 0.05);
    if (song.volume === 0) { clearInterval(t); song.pause(); }
  }, 80);
}

// Clicks pass through the transparent window except over the buttons.
let interactive = false;
document.addEventListener("mousemove", e => {
  const over = !!e.target.closest("button:not(:disabled)");
  if (over !== interactive) api.setInteractive((interactive = over));
});

// ── The show ─────────────────────────────────────────────────────────────────

async function main() {
  const cfg = await api.config();
  const names = ["enter", "dance", "happy", "sad", "sad-walk"];
  const clips = Object.fromEntries(await Promise.all(names.map(async n => [n, await loadClip(cfg.clips[n])])));

  showProgress(cfg.ml, cfg.goalMl);
  $("later-hint").textContent = `Remind me in ${duration(cfg.snoozeMinutes)}`;

  if (cfg.song) { song.src = cfg.song; song.volume = 0.6; song.play().catch(() => {}); }

  // Dance in from the left, then dance with the bottle in the middle.
  actor.style.transform = `translateX(${offLeft()}px)`;
  play(clips.enter);
  await slideTo(center(), ENTER_MS, "cubic-bezier(.25,0,.6,1)");
  play(clips.dance);
  say(`Hey, ${cfg.name}!<br>Time to drink water! 💧`);
  await wait(400);
  $("progress").classList.add("show");
  $("buttons").classList.add("show");

  const choice = await new Promise(resolve => {
    $("drink").onclick = () => resolve("drink");
    $("later").onclick = () => resolve("later");
  });
  for (const b of document.querySelectorAll("button")) b.disabled = true;
  $("buttons").classList.add("gone");
  api.setInteractive((interactive = false));
  api.choose(choice);

  if (choice === "drink") {
    rainDrops();
    showProgress(cfg.ml + cfg.glassMl, cfg.goalMl);
    say(`Semma, ${cfg.name}! 🔥<br>See you in another ${duration(cfg.intervalMinutes)}!`);
    play(clips.happy);
    await wait(CELEBRATE_MS);
    play(clips.enter);                                     // dance back out
    await slideTo(offLeft(), EXIT_HAPPY_MS, "cubic-bezier(.4,0,.75,1)");
  } else {
    say(`Okay… 😔<br>I'll come back in another ${duration(cfg.snoozeMinutes)}`);
    fadeOutSong();
    play(clips.sad, { loop: false });                      // head drops…
    await wait(HEAD_DOWN_MS);
    play(clips["sad-walk"]);                               // …then a slow sad walk out
    await slideTo(offLeft(), EXIT_SAD_MS, "cubic-bezier(.4,0,.75,1)");
  }
  api.done();
}

main().catch(err => { console.error(err); api.done(); });
