import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import {
  buildLoginText,
  buildProgressText,
  buildLogoutText,
  buildSumText,
  isBreakEntry,
  isBreakStart,
  isBreakEnd,
  parseEtaToHours,
  formatHoursHuman,
  formatTimer,
  CLEAN_WORK_TARGET_HOURS,
} from './render';
import { getUiLanguageFromSetting, t as ti18n } from './i18n';

export function getUiLanguage(): import('./i18n').UiLanguage {
  return getUiLanguageFromSetting(getSetting('ui_language'));
}

export type MessageRow = {
  id: number;
  work_day_id: number;
  type: 'login' | 'progress' | 'logout';
  scheduled_time: string;
  title: string | null;
  design_id: string | null;
  eta: string | null;
  body_extra: string | null;
  integration: string | null;
  pending: string | null;
  rendered_text: string | null;
  status: string;
  sent_at: string | null;
  error: string | null;
  sort_order: number;
};

let db: Database.Database | null = null;

function dbPath(): string {
  const dir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'progress-reporter.db');
}

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(dbPath());
    db.pragma('journal_mode = WAL');
    migrate(db);
  }
  return db;
}

export function closeDb() {
  if (db) {
    try {
      db.close();
    } catch {
      // ignore
    }
    db = null;
  }
}

function migrate(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS work_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      scheduler_status TEXT NOT NULL DEFAULT 'idle',
      scheduler_pid TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_day_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      scheduled_time TEXT NOT NULL,
      title TEXT,
      design_id TEXT,
      eta TEXT,
      body_extra TEXT,
      integration TEXT,
      pending TEXT,
      rendered_text TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      sent_at TEXT,
      error TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (work_day_id) REFERENCES work_days(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      message TEXT NOT NULL
    );
  `);

  const defaults: Record<string, string> = {
    discord_channel_url: '',
    timezone: 'Asia/Jakarta',
    discord_logged_in: 'false',
    ui_language: 'id',
  };
  const insert = database.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
  );
  for (const [key, value] of Object.entries(defaults)) {
    insert.run(key, value);
  }
}

export type WorkDayRow = {
  id: number;
  date: string;
  scheduler_status: string;
  scheduler_pid: string | null;
  created_at: string;
};

export function todayDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function getWorkDayById(id: number): WorkDayRow | undefined {
  return getDb().prepare('SELECT * FROM work_days WHERE id = ?').get(id) as
    | WorkDayRow
    | undefined;
}

export function getOrCreateWorkDay(date: string): WorkDayRow {
  const database = getDb();
  const existing = database
    .prepare('SELECT * FROM work_days WHERE date = ?')
    .get(date) as WorkDayRow | undefined;
  if (existing) return existing;
  const created_at = new Date().toISOString();
  const result = database
    .prepare(
      'INSERT INTO work_days (date, scheduler_status, created_at) VALUES (?, ?, ?)',
    )
    .run(date, 'idle', created_at);
  return {
    id: Number(result.lastInsertRowid),
    date,
    scheduler_status: 'idle',
    scheduler_pid: null,
    created_at,
  };
}

export function getOrCreateToday(): WorkDayRow {
  return getOrCreateWorkDay(todayDate());
}

export function listWorkDays(): WorkDayRow[] {
  return getDb()
    .prepare('SELECT * FROM work_days ORDER BY date DESC')
    .all() as WorkDayRow[];
}

export function getMessages(workDayId: number): MessageRow[] {
  return getDb()
    .prepare(
      'SELECT * FROM messages WHERE work_day_id = ? ORDER BY scheduled_time, sort_order, id',
    )
    .all(workDayId) as MessageRow[];
}

export function getSetting(key: string): string {
  const row = getDb()
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row?.value ?? '';
}

export function getSettings() {
  return {
    discord_channel_url: getSetting('discord_channel_url'),
    timezone: getSetting('timezone'),
    discord_logged_in: getSetting('discord_logged_in') === 'true',
    ui_language: getSetting('ui_language') === 'en' ? 'en' : 'id',
  };
}

export function setSetting(key: string, value: string) {
  getDb()
    .prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
    .run(key, value);
}

export function setUiLanguage(lang: 'id' | 'en') {
  setSetting('ui_language', lang);
}

export function appendLog(message: string) {
  getDb()
    .prepare('INSERT INTO app_logs (created_at, message) VALUES (?, ?)')
    .run(new Date().toISOString(), message);
}

export function getLogs(limit = 100): string[] {
  const rows = getDb()
    .prepare(
      'SELECT created_at, message FROM app_logs ORDER BY id DESC LIMIT ?',
    )
    .all(limit) as { created_at: string; message: string }[];
  return rows
    .reverse()
    .map((r) => `[${r.created_at}] ${r.message}`);
}

function nextSortOrder(workDayId: number): number {
  const row = getDb()
    .prepare(
      'SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM messages WHERE work_day_id = ?',
    )
    .get(workDayId) as { max_order: number };
  return row.max_order + 1;
}

export function addLogin(workDayId: number, date: string, scheduled_time: string, lines: string[]) {
  const text = buildLoginText(date, lines);
  const sort_order = nextSortOrder(workDayId);
  const result = getDb()
    .prepare(
      `INSERT INTO messages (work_day_id, type, scheduled_time, body_extra, rendered_text, status, sort_order)
       VALUES (?, 'login', ?, ?, ?, 'pending', ?)`,
    )
    .run(workDayId, scheduled_time, JSON.stringify(lines), text, sort_order);
  return Number(result.lastInsertRowid);
}

export function addProgress(
  workDayId: number,
  scheduled_time: string,
  title: string,
  design_id: string,
  eta: string,
) {
  const isBreak = isBreakEntry(title);
  const safeDesign = isBreak ? '-' : design_id;
  const safeEta = isBreak ? '-' : eta || '1hr';
  const text = buildProgressText(title, safeDesign, safeEta);
  const sort_order = nextSortOrder(workDayId);
  const result = getDb()
    .prepare(
      `INSERT INTO messages (work_day_id, type, scheduled_time, title, design_id, eta, rendered_text, status, sort_order)
       VALUES (?, 'progress', ?, ?, ?, ?, ?, 'pending', ?)`,
    )
    .run(
      workDayId,
      scheduled_time,
      title.trim(),
      safeDesign,
      safeEta,
      text,
      sort_order,
    );
  return Number(result.lastInsertRowid);
}

export function saveLogout(
  workDayId: number,
  date: string,
  scheduled_time: string,
  integration: string,
  pending: string,
) {
  const database = getDb();
  const existing = database
    .prepare(
      "SELECT id FROM messages WHERE work_day_id = ? AND type = 'logout' LIMIT 1",
    )
    .get(workDayId) as { id: number } | undefined;

  const sum = computeSum(workDayId);
  const text = buildLogoutText(date, sum, integration, pending);

  if (existing) {
    database
      .prepare(
        `UPDATE messages SET scheduled_time = ?, integration = ?, pending = ?, rendered_text = ?, status = 'pending', error = NULL
         WHERE id = ?`,
      )
      .run(scheduled_time, integration, pending, text, existing.id);
    return existing.id;
  }

  const sort_order = nextSortOrder(workDayId);
  const result = database
    .prepare(
      `INSERT INTO messages (work_day_id, type, scheduled_time, integration, pending, rendered_text, status, sort_order)
       VALUES (?, 'logout', ?, ?, ?, ?, 'pending', ?)`,
    )
    .run(workDayId, scheduled_time, integration, pending, text, sort_order);
  return Number(result.lastInsertRowid);
}

export function computeSum(workDayId: number): string {
  const login = getDb()
    .prepare(
      `SELECT body_extra FROM messages
       WHERE work_day_id = ? AND type = 'login' AND status = 'sent'
       ORDER BY scheduled_time, id LIMIT 1`,
    )
    .get(workDayId) as { body_extra: string | null } | undefined;

  let loginLines: string[] = [];
  if (login?.body_extra) {
    try {
      loginLines = JSON.parse(login.body_extra);
    } catch {
      loginLines = [];
    }
  }

  const rows = getDb()
    .prepare(
      `SELECT title FROM messages
       WHERE work_day_id = ? AND type = 'progress' AND status = 'sent' AND title IS NOT NULL
       ORDER BY scheduled_time, sort_order, id`,
    )
    .all(workDayId) as { title: string }[];

  return buildSumText(
    loginLines,
    rows.map((r) => r.title),
  );
}

/** Tandai sudah terkirim tanpa kirim Discord (manual Done). */
export function markMessageDone(id: number) {
  const msg = getMessageById(id);
  if (!msg) throw new Error('Message not found');
  const day = getWorkDayById(msg.work_day_id);
  getDb()
    .prepare(
      `UPDATE messages SET status = 'sent', sent_at = ?, error = NULL WHERE id = ?`,
    )
    .run(new Date().toISOString(), id);
  if (day && (msg.type === 'progress' || msg.type === 'login')) {
    refreshLogoutRender(msg.work_day_id, day.date);
  }
  return getMessageById(id);
}

function timeOnDate(dateStr: string, hhmm: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(y, mo - 1, d, h, m ?? 0, 0, 0);
}

/**
 * Kerja bersih = timer dari jam Login, dikurangi break.
 * - Hari ini: live (now)
 * - Hari lalu: beku di jam logout (jika ada) atau 23:59
 * - Hari depan (planning): timer belum jalan
 */
export function getWorkStatus(workDayId: number) {
  const day = getWorkDayById(workDayId);
  const dateStr = day?.date ?? todayDate();
  const today = todayDate();
  const isToday = dateStr === today;
  const isFuture = dateStr > today;
  const isPast = dateStr < today;

  const messages = getMessages(workDayId);
  const workProgress = messages.filter(
    (m) => m.type === 'progress' && !isBreakEntry(m.title),
  );

  let plannedHours = 0;
  let sentHours = 0;
  for (const m of workProgress) {
    const h = parseEtaToHours(m.eta);
    plannedHours += h;
    if (m.status === 'sent') sentHours += h;
  }

  const logins = messages
    .filter((m) => m.type === 'login')
    .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));

  const logoutMsg = messages.find((m) => m.type === 'logout');
  const targetHours = CLEAN_WORK_TARGET_HOURS;

  let cleanHours = 0;
  let onBreak = false;
  let sessionStarted = false;

  if (logins.length > 0 && !isFuture) {
    const sessionStart = timeOnDate(dateStr, logins[0].scheduled_time).getTime();
    sessionStarted = true;

    let nowMs = Date.now();
    if (isPast) {
      if (logoutMsg) {
        nowMs = timeOnDate(dateStr, logoutMsg.scheduled_time).getTime();
      } else {
        nowMs = timeOnDate(dateStr, '23:59').getTime();
      }
    }

    if (nowMs > sessionStart) {
      const breakEvents = messages
        .filter((m) => m.type === 'progress' && isBreakEntry(m.title))
        .sort((a, b) => {
          const t = a.scheduled_time.localeCompare(b.scheduled_time);
          return t !== 0 ? t : a.id - b.id;
        });

      let breakMs = 0;
      let openBreakStart: number | null = null;

      for (const ev of breakEvents) {
        const t = timeOnDate(dateStr, ev.scheduled_time).getTime();
        if (t > nowMs) break;

        if (isBreakStart(ev.title)) {
          if (openBreakStart == null) openBreakStart = t;
        } else if (isBreakEnd(ev.title) && openBreakStart != null) {
          breakMs += Math.max(0, t - openBreakStart);
          openBreakStart = null;
        }
      }

      if (openBreakStart != null) {
        onBreak = isToday;
        breakMs += Math.max(0, nowMs - openBreakStart);
      }

      cleanHours = Math.max(0, (nowMs - sessionStart - breakMs) / 3_600_000);
    }
  }

  const canLogout =
    isToday && sessionStarted && !onBreak && cleanHours + 1e-9 >= targetHours;
  const remainingHours = Math.max(0, targetHours - cleanHours);
  const lang = getUiLanguage();

  let etaCompleteLabel = '—';
  let etaCompleteNote = '';
  if (isFuture) {
    etaCompleteLabel = '—';
    etaCompleteNote = ti18n('planningTimerNote', lang);
  } else if (sessionStarted && remainingHours > 0 && isToday) {
    const now = Date.now();
    let etaMs = now + remainingHours * 3_600_000;

    const allBreaks = messages
      .filter((m) => m.type === 'progress' && isBreakEntry(m.title))
      .sort((a, b) => {
        const t = a.scheduled_time.localeCompare(b.scheduled_time);
        return t !== 0 ? t : a.id - b.id;
      });

    let futureBreakMs = 0;
    let futureOpenStart: number | null = null;
    for (const ev of allBreaks) {
      const t = timeOnDate(dateStr, ev.scheduled_time).getTime();
      if (t <= now) continue;
      if (isBreakStart(ev.title)) {
        if (futureOpenStart == null) futureOpenStart = t;
      } else if (isBreakEnd(ev.title) && futureOpenStart != null) {
        futureBreakMs += Math.max(0, t - futureOpenStart);
        futureOpenStart = null;
      }
    }
    etaMs += futureBreakMs;

    const etaDate = new Date(etaMs);
    etaCompleteLabel = `${String(etaDate.getHours()).padStart(2, '0')}:${String(etaDate.getMinutes()).padStart(2, '0')}`;

    const notes: string[] = [];
    if (onBreak) notes.push(ti18n('onBreakEtaNote', lang));
    if (futureBreakMs > 0) {
      notes.push(
        `+${formatHoursHuman(futureBreakMs / 3_600_000, lang)} ${ti18n('scheduledBreakNote', lang)}`,
      );
    }
    notes.push(ti18n('breakShiftsEta', lang));
    etaCompleteNote = notes.join('; ');
  } else if (sessionStarted && remainingHours <= 0) {
    etaCompleteLabel = ti18n('achieved', lang);
    etaCompleteNote = isPast ? ti18n('pastSummaryNote', lang) : '';
  }

  return {
    plannedHours,
    sentHours,
    cleanHours,
    targetHours,
    remainingHours,
    onBreak,
    canLogout,
    sessionStarted,
    isToday,
    isPast,
    isFuture,
    plannedLabel: formatHoursHuman(plannedHours, lang),
    cleanLabel: formatTimer(cleanHours, lang),
    remainingLabel: formatTimer(remainingHours, lang),
    targetLabel: formatHoursHuman(targetHours, lang),
    etaCompleteLabel,
    etaCompleteNote,
  };
}

export function updateMessage(
  id: number,
  patch: {
    scheduled_time?: string;
    title?: string;
    design_id?: string;
    eta?: string;
    lines?: string[];
    integration?: string;
    pending?: string;
    resetToPending?: boolean;
  },
) {
  const msg = getMessageById(id);
  if (!msg) throw new Error('Message not found');
  const day = getWorkDayById(msg.work_day_id);
  if (!day) throw new Error('Work day not found');

  const scheduled_time = patch.scheduled_time ?? msg.scheduled_time;
  let title = patch.title ?? msg.title;
  let design_id = patch.design_id ?? msg.design_id;
  let eta = patch.eta ?? msg.eta;
  let body_extra = msg.body_extra;
  let integration = patch.integration ?? msg.integration;
  let pending = patch.pending ?? msg.pending;
  let rendered_text = msg.rendered_text;
  let status = msg.status;
  let sent_at = msg.sent_at;
  let error = msg.error;

  if (msg.type === 'login') {
    const lines = patch.lines ?? (body_extra ? JSON.parse(body_extra) : []);
    body_extra = JSON.stringify(lines);
    rendered_text = buildLoginText(day.date, lines);
  } else if (msg.type === 'progress') {
    const isBreak = isBreakEntry(title);
    if (isBreak) {
      title = isBreakStart(title) ? 'Break Start' : 'Break End';
      design_id = '-';
      eta = '-';
      rendered_text = buildProgressText(title!, '-', '-');
    } else {
      design_id = design_id ?? '';
      eta = eta || '1hr';
      rendered_text = buildProgressText(title ?? '', design_id, eta);
    }
  } else if (msg.type === 'logout') {
    const sum = computeSum(msg.work_day_id);
    rendered_text = buildLogoutText(
      day.date,
      sum,
      integration ?? '',
      pending ?? '',
    );
  }

  if (patch.resetToPending) {
    status = 'pending';
    sent_at = null;
    error = null;
  }

  getDb()
    .prepare(
      `UPDATE messages SET scheduled_time = ?, title = ?, design_id = ?, eta = ?,
       body_extra = ?, integration = ?, pending = ?, rendered_text = ?,
       status = ?, sent_at = ?, error = ? WHERE id = ?`,
    )
    .run(
      scheduled_time,
      title,
      design_id,
      eta,
      body_extra,
      integration,
      pending,
      rendered_text,
      status,
      sent_at,
      error,
      id,
    );

  if (msg.type === 'progress') {
    refreshLogoutRender(msg.work_day_id, day.date);
  }

  return getMessageById(id);
}

export function getDayReport(workDayId: number) {
  const day = getWorkDayById(workDayId);
  if (!day) throw new Error('Work day not found');
  const messages = getMessages(workDayId);
  const workStatus = getWorkStatus(workDayId);
  const logoutPreview = getLogoutPreview(workDayId, day.date);

  const login = messages.find((m) => m.type === 'login');
  const logout = messages.find((m) => m.type === 'logout');
  const progress = messages.filter(
    (m) => m.type === 'progress' && !isBreakEntry(m.title),
  );
  const breaks = messages.filter(
    (m) => m.type === 'progress' && isBreakEntry(m.title),
  );

  return {
    day,
    messages,
    workStatus,
    logoutPreview,
    summary: {
      login: login
        ? {
            time: login.scheduled_time,
            text: login.rendered_text,
            status: login.status,
            lines: login.body_extra ? JSON.parse(login.body_extra) : [],
          }
        : null,
      progress: progress.map((m) => ({
        id: m.id,
        time: m.scheduled_time,
        title: m.title,
        design_id: m.design_id,
        eta: m.eta,
        status: m.status,
        text: m.rendered_text,
      })),
      breaks: breaks.map((m) => ({
        id: m.id,
        time: m.scheduled_time,
        title: m.title,
        status: m.status,
      })),
      logout: logout
        ? {
            time: logout.scheduled_time,
            text: logout.rendered_text ?? logoutPreview.fullText,
            status: logout.status,
            integration: logout.integration,
            pending: logout.pending,
            sum: logoutPreview.sum,
          }
        : null,
      sentCount: messages.filter((m) => m.status === 'sent').length,
      pendingCount: messages.filter((m) => m.status !== 'sent').length,
      totalCount: messages.length,
    },
  };
}

export function refreshLogoutRender(workDayId: number, date: string) {
  const row = getDb()
    .prepare(
      "SELECT id, integration, pending FROM messages WHERE work_day_id = ? AND type = 'logout' LIMIT 1",
    )
    .get(workDayId) as
    | { id: number; integration: string | null; pending: string | null }
    | undefined;
  if (!row) return;
  const sum = computeSum(workDayId);
  const text = buildLogoutText(
    date,
    sum,
    row.integration ?? '',
    row.pending ?? '',
  );
  getDb()
    .prepare('UPDATE messages SET rendered_text = ? WHERE id = ?')
    .run(text, row.id);
}

export function getLogoutPreview(workDayId: number, date: string) {
  const row = getDb()
    .prepare(
      "SELECT integration, pending FROM messages WHERE work_day_id = ? AND type = 'logout' LIMIT 1",
    )
    .get(workDayId) as
    | { integration: string | null; pending: string | null }
    | undefined;
  const sum = computeSum(workDayId);
  const integration = row?.integration ?? '';
  const pending = row?.pending ?? '';
  return {
    sum,
    integration,
    pending,
    fullText: buildLogoutText(date, sum, integration, pending),
  };
}

export function getMessageById(id: number): MessageRow | undefined {
  return getDb().prepare('SELECT * FROM messages WHERE id = ?').get(id) as
    | MessageRow
    | undefined;
}

export function markMessageStatus(
  id: number,
  status: string,
  error: string | null = null,
  rendered_text?: string,
) {
  const sent_at = status === 'sent' ? new Date().toISOString() : null;
  if (rendered_text) {
    getDb()
      .prepare(
        'UPDATE messages SET status = ?, error = ?, sent_at = ?, rendered_text = ? WHERE id = ?',
      )
      .run(status, error, sent_at, rendered_text, id);
  } else {
    getDb()
      .prepare('UPDATE messages SET status = ?, error = ?, sent_at = ? WHERE id = ?')
      .run(status, error, sent_at, id);
  }
}

export function deleteMessage(id: number) {
  getDb().prepare('DELETE FROM messages WHERE id = ?').run(id);
}

export function setSchedulerStatus(
  workDayId: number,
  status: string,
  pid: string | null,
) {
  getDb()
    .prepare(
      'UPDATE work_days SET scheduler_status = ?, scheduler_pid = ? WHERE id = ?',
    )
    .run(status, pid, workDayId);
}

export function getPendingMessages(workDayId: number): MessageRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM messages WHERE work_day_id = ? AND status IN ('pending', 'failed')
       ORDER BY scheduled_time, sort_order, id`,
    )
    .all(workDayId) as MessageRow[];
}

export function getMessageText(msg: MessageRow, date: string): string {
  if (msg.type === 'logout') {
    return buildLogoutText(
      date,
      computeSum(msg.work_day_id),
      msg.integration ?? '',
      msg.pending ?? '',
    );
  }
  if (msg.rendered_text) return msg.rendered_text;
  if (msg.type === 'login') {
    const lines = msg.body_extra ? JSON.parse(msg.body_extra) : [];
    return buildLoginText(date, lines);
  }
  return buildProgressText(msg.title ?? '', msg.design_id ?? '', msg.eta ?? '1hr');
}
