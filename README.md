# WaterBuddy 💧

A dancing hourly water reminder for **macOS and Windows**. Every hour your chosen cartoon buddy — **Vijay** or
**Suriya** — dances in from the left edge of the screen to his own song, asks you to drink water and keeps count of
how much you've had. On first launch a picker lets you choose your buddy; switch any time from the 💧 menu
(**Character**).

- **Drinking now 💧** logs a glass. He jumps for joy, says *"See you in another 1 hour!"* and dances back out.
- **I will do it later** snoozes for 10 minutes. He drops his head, says *"I'll come back in another 10 minutes"*
  and walks out sadly.

The tray/menu-bar icon shows today's total and has the menu: last 7 days, *I drank a glass*, *Undo last glass*,
glass size, daily goal, character, *Show reminder now*, pause, start at login and quit.

> **Personal use only.** The characters are likenesses of actors Vijay and Suriya and the bundled songs are
> copyrighted. Don't publish or redistribute builds that contain them; swap in your own media first (see [Media](#media)).

## Install

| Platform | File (in `dist/`) | Notes |
|---|---|---|
| Windows 10/11 (64-bit) | `WaterBuddy-Setup-1.0.0.exe` | Installs for the current user, no admin rights needed. |
| Mac, Apple Silicon | `WaterBuddy-1.0.0-arm64.dmg` | Drag WaterBuddy to Applications. |
| Mac, Intel | `WaterBuddy-1.0.0.dmg` | Drag WaterBuddy to Applications. |

The builds are **not code-signed with a paid certificate**, so the first launch shows a warning:

- **Windows:** SmartScreen says *"Windows protected your PC"*. Click **More info → Run anyway**.
- **macOS:** If it says the app *"can't be opened"*, go to **System Settings → Privacy & Security** and click
  **Open Anyway**.

It starts automatically at login (toggle it under **Start at login** in the menu).

## Settings and data

Everything is stored in `state.json`:

- macOS: `~/Library/Application Support/WaterBuddy/state.json`
- Windows: `%APPDATA%\WaterBuddy\state.json`

```json
{
  "settings": { "name": "Sathish", "intervalMinutes": 60, "snoozeMinutes": 10,
                "glassMl": 250, "goalMl": 2500, "launchAtLogin": true, "character": "vijay" },
  "history": { "2026-10-05": 2500 }
}
```

Glass size, goal and start at login can be changed from the menu. To change `name`, `intervalMinutes` or
`snoozeMinutes`, quit WaterBuddy, edit the file and start it again.

## Media

Each character lives in `assets/characters/<id>/`: five clips, `song.mp3` and `character.json` (name, menu order and
clip lengths). Use **Open media folder…** in the menu and drop in files with these names to override the chosen
character's own:

| File | Used for |
|---|---|
| `enter.webm` | Dancing in from the left, and dancing out after *Drinking now* (loops) |
| `dance.webm` | Dancing with the bottle in the middle (loops) |
| `happy.webm` | Celebration after *Drinking now* (loops) |
| `sad.webm` | Head drop after *I will do it later* (plays once, ~1.6 s) |
| `sad-walk.webm` | Slow sad walk out (loops) |
| any `.mp3` / `.m4a` / `.wav` / `.ogg` | Background song (instead of the character's) |

Clips must be **WebM with a transparent background** (VP9 + alpha).

## Development

Requires Node.js 20+.

```bash
npm install
npm start            # run in the tray
npm run now          # run and show a reminder immediately
```

### Changing the character clips

The green-screen originals (made with Higgsfield) live in `source/<id>/`. After replacing one, regenerate the
trimmed, transparent WebM files and `character.json` in `assets/characters/<id>/`:

```bash
npm run prepare-media            # every character
npm run prepare-media -- suriya  # just one
```

Names, trim points and each character's key colour are at the top of `scripts/prepare-media.js`. To add a
character, add an entry there, put its four green-screen clips in `source/<id>/` and a `song.mp3` in
`assets/characters/<id>/`, then run the script.

### Building installers

```bash
npm run dist:win     # dist/WaterBuddy-Setup-<version>.exe
npm run dist:mac     # dist/WaterBuddy-<version>-arm64.dmg and dist/WaterBuddy-<version>.dmg
npm run dist         # both
```

Both can be built from a Mac, but a Mac-built Windows `.exe` keeps Electron's default file icon (embedding it
needs Wine). The installer attached to each **Windows build & test** run on GitHub is built on Windows and has the
WaterBuddy icon.

### Testing

`test/e2e.js` drives an installed build end to end as a first run: it picks Suriya in the character picker, then
checks his animations, song, text, buttons, water log, snooze and timer (1-minute timers), and takes screenshots. It
uses its own temporary data folder, so your settings and water log are never touched; the reminders do appear on
screen while it runs (about 4 minutes). It clicks with the real mouse — set `E2E_DEVTOOLS_CLICKS=1` to click through
DevTools instead if you'll be using the computer meanwhile.

```bash
npm run test:e2e -- ~/Applications/WaterBuddy.app/Contents/MacOS/WaterBuddy                  # macOS
npm run test:e2e -- "$env:LOCALAPPDATA\Programs\WaterBuddy\WaterBuddy.exe"                 # Windows (PowerShell)
npm run test:e2e -- node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .     # dev build (macOS)
```

On GitHub, **Windows build & test** (`.github/workflows/windows.yml`) builds the Windows installer, installs it on a
Windows runner and runs this test whenever the app changes. You can also start it from the Actions tab. Screenshots
and the installer are attached to each run.

## Project layout

```
src/main.js          app lifecycle, tray menu, scheduler, popup window
src/store.js         settings + daily water log (state.json)
src/preload.js       the only bridge between the popup page and the app
src/popup/           the reminder page (HTML/CSS/JS)
src/picker/          the first-run character picker
assets/characters/   one folder per character: transparent clips, song, character.json
assets/              icons
scripts/             prepare-media.js (green screen → transparent WebM)
test/e2e.js          end-to-end test of an installed build
source/<id>/         green-screen source clips and character image, per character
```
