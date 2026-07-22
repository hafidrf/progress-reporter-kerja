# Progress Reporter Kerja

**Progress Reporter Kerja** is a Windows desktop app for planning, scheduling, and sending daily work updates. You outline the day once; the app formats messages, waits for the right times, and delivers them — without manual copy-paste, without a webhook server, and without touching your main browser profile.

Delivery today uses **Discord** via local browser automation. The same local-first design (Electron + SQLite) keeps your plans and history on your machine.

---

## What it is for

Routine status updates are easy to postpone or mistype. This app is for anyone who wants:

- A clear daily plan (start-of-day note, timed progress notes, end-of-day wrap-up)
- Reliable send times, including when the monitor is off (as long as the PC is not asleep)
- Automatic assembly of an end-of-day summary from what you already logged
- Delivery without needing Discord webhook permissions on the server

Plan in the morning, press **Start Today**, and let the scheduler run.

---

## Key features

| Feature | Description |
|---------|-------------|
| **Automatic scheduling** | Start-of-day, progress, and end-of-day messages send at the times you set |
| **Clean work timer** | Tracks an 8-hour target; pauses on break start, resumes after break end |
| **Logout gate** | Scheduled wrap-up waits until the clean-hours target is met (manual send remains available) |
| **Auto-generated summary** | End-of-day sum is built from your opening plan and sent progress titles |
| **Multi-day planning** | Plan several days ahead; the scheduler runs only for today |
| **History** | Review and edit past daily reports |
| **Isolated Chrome profile** | Discord automation does not conflict with your main browser |
| **Resilience** | Scheduler heartbeat, retries, and power-save blocking when the display sleeps |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Electron (main process)                                │
│  ├── SQLite (work days, messages, settings, logs)       │
│  ├── Scheduler (timing, retry, wrap-up gate)            │
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

Webhooks need Manage Webhooks on the Discord server. Many workplaces do not grant that to every person. UI automation is more fragile, but it avoids server-admin setup — a fair trade-off for a personal or small-team tool.

**Why local SQLite first?**

Daily notes can include sensitive work detail. Keeping data local means no hosting cost, low latency, and no extra infrastructure. A remote sync layer can be added later without changing the day-to-day UI flow.

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

To obtain the channel URL: open the channel in Discord Web and copy it from the address bar.

---

## Discord setup (one-time)

1. Run the app: `npm start`
2. Click **Setup Discord**
3. A separate Chrome window opens — sign in to Discord if prompted
4. Open the target channel
5. Close the automation Chrome window

The session is stored in `scripts/discord-browser/chrome-profile/` (this folder is not committed).

---

## Desktop shortcut (optional)

```powershell
npm run desktop-shortcut
```

This creates a **Progress Reporter Kerja** shortcut on your Desktop.

---

## Daily workflow

### Morning — plan

1. Open the app (dates follow your local timezone; default preference is configurable)
2. Fill in the **start-of-day** note — time plus a short plan
3. Add **progress** entries — title, optional reference ID, ETA, and send time
4. Fill in the **end-of-day** fields — time, integration notes, pending items (the summary is automatic)
5. Optional: add break start / break end progress entries to pause the clean-work timer

### When work begins

Click **Start Today** — the background scheduler activates. Pending messages send when their scheduled time arrives.

### Before you finish

The timer shows clean work hours and an estimate of when the 8-hour target will be reached. A scheduled wrap-up waits until that target is met.

---

## Message formats

Default templates follow a simple daily cadence. Adjust wording to suit your team; the structure below is what the formatter expects today.

### Start of day

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

For breaks, use the title `Break Start` or `Break End` (reference ID optional).

### End of day

```
Logout(DD/MM/YY):
- Sum: Worked on ..., ..., ...
- Integration:
<manual content, can be empty>
- Pending:
<manual content, can be empty>
```

**Sum** is generated from:

- The first two lines of the start-of-day message
- Titles of progress messages with status `sent` (break entries are excluded)

**Integration** and **Pending** are filled in by hand. Leave them empty when there is nothing to report — the section labels still appear.

---

## Clean work timer

| Concept | Behaviour |
|---------|-----------|
| Start | When the start-of-day message is sent / the session begins |
| Pause | After a sent **Break Start**, until **Break End** is sent |
| Target | 8 clean work hours (`CLEAN_WORK_TARGET_HOURS`) |
| Completion ETA | Wall-clock estimate for when 8 clean hours will be reached; shifts forward during breaks |
| Wrap-up gate | Scheduler holds the end-of-day send until `canLogout === true` |

---

## Scheduler

- Runs only for **today’s date** (local timezone)
- 10-second heartbeat — picks up messages added after the scheduler started
- Up to 5 retries on send failure
- `powerSaveBlocker` reduces OS throttling when the display sleeps
- **Stop** halts the scheduler; pending messages are not deleted

The **Done** button marks a message as sent without posting to Discord again (useful if you already sent it by hand).

---

## Project structure

```
progress-reporter-kerja/
├── electron/           # Main process: DB, scheduler, Discord bridge
│   ├── db.ts           # SQLite schema & business logic
│   ├── scheduler.ts    # Background message dispatcher
│   ├── discord.ts      # Spawns Playwright engine
│   └── render.ts       # Message formatting & timer maths
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

Ensure the PC is not sleeping or hibernating. The app uses a power-save blocker, but full system sleep still stops all processes.

### “Message box did not appear”

1. Run **Setup Discord** again
2. Sign in to Discord in the automation profile
3. Open the target channel manually once
4. Close the automation Chrome window, then try **Send now**

### Chrome profile locked

Close the automation Chrome window (not your main browser). The app ends processes that use the `discord-browser/chrome-profile` profile before each send.

### `better-sqlite3` build failure

```powershell
npm run postinstall
```

The native module must be rebuilt for the Electron version in use.

### End-of-day message not sending automatically

Expected behaviour — the scheduler waits for 8 clean work hours. Check the timer in the UI. Use manual send only when you are sure the target is met.

---

## Data and privacy

These paths are **not** part of the repository:

- `scripts/discord-browser/config.json` — your channel URL
- `scripts/discord-browser/chrome-profile/` — Discord login session
- SQLite database under `%APPDATA%/progress-reporter-kerja/` — work history

Do not commit them to a public git repository.

---

## Roadmap

- [ ] Sync history to a backend API
- [ ] Installer packaging (electron-builder)
- [ ] Channel URL configuration from the UI
- [ ] Desktop notifications on send failure

---

## Licence

MIT — use this as a reference implementation; follow your workplace policies and Discord’s Terms of Service where you deploy it.
