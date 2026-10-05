# WaterBuddy 💧

A dancing hourly water reminder for **macOS and Windows**. Every hour a cartoon character dances in from the left
edge of the screen, asks you to drink water and keeps count of how much you've had.

- **Drinking now 💧** logs a glass. He jumps for joy, says *"See you in another 1 hour!"* and dances back out.
- **I will do it later** snoozes for 10 minutes. He drops his head, says *"I'll come back in another 10 minutes"*
  and walks out sadly.

The tray/menu-bar icon shows today's total and has the menu: last 7 days, *I drank a glass*, *Undo last glass*,
glass size, daily goal, *Show reminder now*, pause, start at login and quit.

> **Personal use only.** The character is a likeness of actor Vijay and the bundled song is copyrighted. Don't
> publish or redistribute builds that contain them; swap in your own media first (see [Media](#media)).

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
                "glassMl": 250, "goalMl": 2500, "launchAtLogin": true },
  "history": { "2026-10-05": 2500 }
}
```

Glass size, goal and start at login can be changed from the menu. To change `name`, `intervalMinutes` or
`snoozeMinutes`, quit WaterBuddy, edit the file and start it again.

## Media

Use **Open media folder…** in the menu and drop in files with these names to override the bundled ones:

| File | Used for |
|---|---|
| `enter.webm` | Dancing in from the left, and dancing out after *Drinking now* (loops) |
| `dance.webm` | Dancing with the bottle in the middle (loops) |
| `happy.webm` | Celebration after *Drinking now* (loops) |
| `sad.webm` | Head drop after *I will do it later* (plays once, ~1.6 s) |
| `sad-walk.webm` | Slow sad walk out (loops) |
| any `.mp3` / `.m4a` / `.wav` / `.ogg` | Background song |

Clips must be **WebM with a transparent background** (VP9 + alpha).

## Development

Requires Node.js 20+.

```bash
npm install
npm start            # run in the tray
npm run now          # run and show a reminder immediately
```

### Changing the character clips

The green-screen originals (made with Higgsfield) live in `source/`. After replacing one, regenerate the trimmed,
transparent WebM files in `assets/media/`:

```bash
npm run prepare-media
```

Trim points and the key colour are at the top of `scripts/prepare-media.js`.

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

`test/e2e.js` drives an installed build end to end. It launches the app with 1-minute timers, clicks the buttons
with the real mouse, checks the animations, text, sound, water log, snooze and timer, and takes screenshots. Your
own `state.json` is backed up and restored, but the reminders will appear on screen while it runs (about 4 minutes).

```bash
npm run test:e2e -- ~/Applications/WaterBuddy.app/Contents/MacOS/WaterBuddy                  # macOS
npm run test:e2e -- "$env:LOCALAPPDATA\Programs\WaterBuddy\WaterBuddy.exe"                 # Windows (PowerShell)
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
assets/              icons, transparent clips, song
scripts/             prepare-media.js (green screen → transparent WebM)
test/e2e.js          end-to-end test of an installed build
source/              green-screen source clips and character image
```
