# Progress Reporter Kerja

A Windows desktop app that schedules and sends daily progress updates to Discord — no manual copy-paste, no webhook server, and no interference with your main Chrome profile.

Built for teams with a fixed reporting format (Login → hourly Progress → Logout) who need a scheduler that keeps running even when the monitor is off or a screensaver is active.

---

## Problem it solves

Daily Discord progress updates tend to become repetitive busywork:

- Retyping the same message format over and over
- Rebuilding the logout summary by hand
- Missing scheduled send times
- No webhook access due to server permissions

This repo combines an **Electron app + local SQLite + Playwright browser automation** with a dedicated Chrome profile. The app handles formatting, scheduling, clean-work timing, and delivery — you plan your day in the morning and click **Mulai Hari Ini** (Start Today).

---

## Key features

| Feature | Description |
|---------|-------------|
| **Automatic scheduling** | Login, progress, and logout messages send at the times you set |
| **Clean work timer** | Tracks an 8-hour target; pauses on Break Start, resumes after Break End |
| **Logout gate** | Scheduled logout won't send until 8 clean hours are reached (manual send still available) |
| **Auto-generated Sum** | The `- Sum:` section in logout is built from login lines + sent progress titles |
| **Multi-day planning** | Plan several days ahead; the scheduler only runs for today |
| **History** | View and edit past daily reports |
| **Isolated Chrome profile** | Discord automation does not conflict with your main browser |
| **Resilience** | Scheduler heartbeat, retries, and power-save blocking when the monitor is off |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Electron (main process)                                │
│  ├── SQLite (work days, messages, settings, logs)       │
│  ├── Scheduler (timing, retry, logout gate)             │
│  └── IPC bridge → React UI                              │
└──────────────────────────┬──────────────────────────────┘
                           │ spawn node + temp message file
                           ▼
┌─────────────────────────────────────────────────────────┐
│  scripts/discord-browser/ (Playwright engine)           │
│  ├── send-discord.mjs — open Chrome, paste, send        │
│  ├── config.json — channel URL (local, not committed)   │
│  └── chrome-profile/ — Discord session (local)          │
└─────────────────────────────────────────────────────────┘
```

**Why browser automation instead of webhooks?**

Webhooks require Manage Webhooks permission on the Discord server. Many internal teams don't grant that to every developer. UI automation is more fragile technically, but it avoids server-admin coordination — a reasonable trade-off for a personal or small-team tool.

**Why local SQLite first?**

Daily reports contain sensitive work data (plans, blockers, design IDs). Keeping data local means zero infrastructure, zero latency, and zero hosting cost. Syncing to a backend (e.g. a Laravel API) can be added later without changing the UI flow.

---

## Prerequisites

- **Windows 10/11**
- **Node.js 20+** (LTS recommended)
- **Google Chrome** installed
- **PowerShell** (included with Windows)
- A Discord account with access to the target channel

---

## Installation

```powershell
git clone https://github.com/hafidrf/progress-reporter-kerja.git
cd progress-reporter-kerja
npm install
npm run setup:discord
npm run build
```

Edit your Discord channel in `scripts/discord-browser/config.json`:

```json
{
  "channelUrl": "https://discord.com/channels/GUILD_ID/CHANNEL_ID",
  "chromeProfileDir": "chrome-profile",
  "cdpPort": 9333
}
```

To get the channel URL: open the channel in Discord Web and copy it from the address bar.

---

## Discord setup (one-time)

1. Run the app: `npm start`
2. Click **Setup Discord**
3. A separate Chrome window opens — log in to Discord if prompted
4. Make sure the target channel is open
5. Close the automation Chrome window

The session is stored in `scripts/discord-browser/chrome-profile/` (this folder is not committed to git).

---

## Desktop shortcut (optional)

```powershell
npm run desktop-shortcut
```

This creates a **Progress Reporter Kerja** shortcut on your Desktop.

---

## Daily workflow

### Morning — plan

1. Open the app (date follows your local timezone; default is `Asia/Jakarta`)
2. Fill in **Login** — time + 2 lines describing your plan
3. Add **Progress** entries — one per update (title, design ID, ETA, send time)
4. Fill in **Logout** — logout time, Integration, Pending (Sum is automatic)
5. Optional: add **Break Start** / **Break End** progress entries to pause the timer

### When work starts

Click **Mulai Hari Ini** (Start Today) — the background scheduler activates. Pending messages send automatically when their scheduled time arrives.

### Before logout

The timer shows clean work hours and an estimated time when 8 hours will be reached. A scheduled logout waits until that target is met.

---

## Message formats

### Login

```
Login(DD/MM/YY):
Working on ...
Checking ...
```

### Progress

```
Task title
Design id : XXXX:YYYY
Eta : 1hr
```

For breaks, use the title `Break Start` or `Break End` (design ID is optional).

### Logout

```
Logout(DD/MM/YY):
- Sum: Worked on ..., ..., ...
- Integration:
<manual content, can be empty>
- Pending:
<manual content, can be empty>
```

**Sum** is generated from:

- Lines 1 and 2 of the login message
- Titles of all progress messages with status `sent` (Break Start/End entries are excluded)

**Integration / Pending** are filled in manually. Leave them empty if there's nothing to report — the `- Integration:` / `- Pending:` lines still appear.

---

## Clean work timer

| Concept | Behavior |
|---------|----------|
| Start | When the login message is sent / session begins |
| Pause | After a sent **Break Start**, until **Break End** is sent |
| Target | 8 clean work hours (`CLEAN_WORK_TARGET_HOURS`) |
| Completion ETA | Wall-clock estimate for when 8 clean hours will be reached; shifts forward during breaks |
| Logout gate | Scheduler holds logout until `canLogout === true` |

---

## Scheduler

- Only runs for **today's date** (local timezone)
- 10-second heartbeat — picks up messages added after the scheduler started
- Up to 5 retries on send failure
- `powerSaveBlocker` reduces OS throttling when the monitor is off
- **Stop** halts the scheduler; pending messages are not deleted

The **Done** button on a message marks it as sent without posting to Discord again (useful if you already sent it manually).

---

## Project structure

```
progress-reporter-kerja/
├── electron/           # Main process: DB, scheduler, Discord bridge
│   ├── db.ts           # SQLite schema & business logic
│   ├── scheduler.ts    # Background message dispatcher
│   ├── discord.ts      # Spawns Playwright engine
│   └── render.ts       # Message formatting & timer math
├── src/                # React UI
├── scripts/
│   └── discord-browser/  # Playwright send engine
│       ├── send-discord.mjs
│       ├── config.example.json
│       └── open-discord-login.ps1
├── start-app.ps1       # Launcher for desktop shortcut
└── package.json
```

---

## npm scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development mode (Vite + Electron hot reload) |
| `npm start` | Build and run the app |
| `npm run build` | Compile TypeScript and bundle React |
| `npm run setup:discord` | Copy example config files to local config |
| `npm test` | Unit tests for formatting logic |
| `npm run test:integration` | Dry-run the Discord engine |
| `npm run desktop-shortcut` | Create a Desktop shortcut |

---

## Troubleshooting

### Messages not sending when the monitor is off

Make sure the PC is not sleeping or hibernating. The app uses a power-save blocker, but full system sleep still stops all processes.

### "Message box did not appear"

1. Run **Setup Discord** again
2. Log in to Discord in the automation profile
3. Open the target channel manually once
4. Close the automation Chrome window, then try **Kirim sekarang** (Send now)

### Chrome profile locked

Close the automation Chrome window (not your main work browser). The app kills processes using the `discord-browser/chrome-profile` profile before each send.

### `better-sqlite3` build failure

```powershell
npm run postinstall
```

The native module must be rebuilt for the Electron version in use.

### Logout not sending automatically

This is expected — the scheduler waits for 8 clean work hours. Check the timer in the UI. Use manual send only when you're sure the target is met.

---

## Data & privacy

These files are **not** included in the repository:

- `scripts/discord-browser/config.json` — your channel URL
- `scripts/discord-browser/chrome-profile/` — Discord login session
- SQLite database at `%APPDATA%/progress-reporter-kerja/` — work history

Do not commit these to a public git repository.

---

## Roadmap

- [ ] Sync history to a backend (Laravel API)
- [ ] Installer packaging (electron-builder)
- [ ] Channel URL configuration from the UI
- [ ] Desktop notifications on send failure

---

## License

MIT — use this as a reference implementation; align with your team's policies and Discord's Terms of Service in your work environment.
