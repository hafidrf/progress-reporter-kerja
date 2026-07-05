import { powerSaveBlocker } from 'electron';
import {
  appendLog,
  getMessageById,
  getMessageText,
  getPendingMessages,
  getWorkDayById,
  getWorkStatus,
  markMessageStatus,
  refreshLogoutRender,
  setSchedulerStatus,
  todayDate,
} from './db';
import { sendMessageText } from './discord';
import { formatHoursHuman } from './render';

/** Cek antrian tiap 10 detik — tahan monitor mati / screensaver (mengejar pesan terlambat). */
const HEARTBEAT_MS = 10_000;
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 12_000;

let schedulerRunning = false;
let schedulerAbort = false;
let schedulerPid: number | null = null;
let activeWorkDayId: number | null = null;
let powerBlockerId: number | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let tickInFlight = false;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseScheduledToday(scheduled: string): Date {
  const [h, m] = scheduled.split(':').map(Number);
  const target = new Date();
  target.setHours(h, m, 0, 0);
  return target;
}

function startPowerBlocker() {
  if (powerBlockerId != null) return;
  try {
    // Cegah Windows suspend app saat monitor/screensaver mati (PC tetap nyala)
    powerBlockerId = powerSaveBlocker.start('prevent-app-suspension');
    appendLog('Power blocker aktif (tahan throttle saat monitor mati)');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appendLog(`Power blocker gagal: ${msg}`);
  }
}

function stopPowerBlocker() {
  if (powerBlockerId == null) return;
  try {
    if (powerSaveBlocker.isStarted(powerBlockerId)) {
      powerSaveBlocker.stop(powerBlockerId);
    }
  } catch {
    // ignore
  }
  powerBlockerId = null;
}

async function sendWithRetry(messageId: number, text: string) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    if (schedulerAbort) throw new Error('Scheduler stopped');
    markMessageStatus(messageId, 'sending');
    appendLog(`Kirim pesan #${messageId} percobaan ${attempt}/${MAX_RETRIES}`);
    try {
      await sendMessageText(text);
      markMessageStatus(messageId, 'sent', null, text);
      appendLog(`Berhasil kirim pesan #${messageId}`);
      return;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appendLog(`Gagal #${messageId}: ${msg.split('\n')[0]}`);
      if (attempt === MAX_RETRIES) {
        markMessageStatus(messageId, 'failed', msg);
        throw error;
      }
      await sleep(RETRY_DELAY_MS);
    }
  }
}

async function processDueMessage(workDayId: number, date: string) {
  const pending = getPendingMessages(workDayId);
  if (pending.length === 0) return false;

  const next = pending[0];
  const current = getMessageById(next.id);
  if (!current || current.status === 'sent') return false;

  const target = parseScheduledToday(current.scheduled_time);
  const dueMs = target.getTime() - Date.now();
  if (dueMs > 0) {
    return false; // belum waktunya
  }

  appendLog(
    `${current.scheduled_time} — waktu tiba/lewat, kirim pesan #${current.id} (${current.type})`,
  );

  if (current.type === 'logout') {
    const status = getWorkStatus(workDayId);
    if (!status.canLogout) {
      if (status.onBreak) {
        appendLog(
          'Logout ditunda: sedang break. Tunggu Break End + timer 8 jam.',
        );
      } else {
        appendLog(
          `Logout ditunda: kerja bersih ${status.cleanLabel} / ${status.targetLabel}`,
        );
      }
      return false;
    }
    refreshLogoutRender(workDayId, date);
  }

  const latest = getMessageById(current.id);
  if (!latest || latest.status === 'sent') return false;

  if (latest.type === 'logout') {
    const status = getWorkStatus(workDayId);
    if (!status.canLogout) return false;
  }

  const text = getMessageText(latest, date);
  try {
    await sendWithRetry(latest.id, text);
    if (latest.type === 'progress' || latest.type === 'login') {
      refreshLogoutRender(workDayId, date);
    }
  } catch {
    appendLog(`Pesan #${latest.id} gagal — akan dicoba lagi di heartbeat berikutnya`);
  }
  return true;
}

async function tick(workDayId: number, date: string) {
  if (schedulerAbort || tickInFlight) return;
  if (date !== todayDate()) {
    appendLog('Hari sudah berganti — scheduler berhenti otomatis');
    stopScheduler();
    return;
  }

  tickInFlight = true;
  try {
    // Kirim semua yang sudah lewat (bisa lebih dari satu jika tertunda monitor mati)
    let guard = 0;
    while (!schedulerAbort && guard < 10) {
      const did = await processDueMessage(workDayId, date);
      if (!did) break;
      guard += 1;
      await sleep(2000);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg !== 'Scheduler stopped') {
      appendLog(`Scheduler tick error: ${msg}`);
    }
  } finally {
    tickInFlight = false;
  }
}

export function getSchedulerState() {
  return {
    running: schedulerRunning,
    pid: schedulerPid,
    workDayId: activeWorkDayId,
  };
}

export function stopScheduler() {
  schedulerAbort = true;
  schedulerRunning = false;
  schedulerPid = null;
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  stopPowerBlocker();
  if (activeWorkDayId != null) {
    setSchedulerStatus(activeWorkDayId, 'idle', null);
  }
  activeWorkDayId = null;
  appendLog('Scheduler dihentikan');
}

export async function startScheduler(workDayId: number) {
  if (schedulerRunning) {
    return { ok: false, message: 'Scheduler sudah berjalan' };
  }

  const day = getWorkDayById(workDayId);
  if (!day) {
    return { ok: false, message: 'Hari kerja tidak ditemukan' };
  }
  if (day.date !== todayDate()) {
    return {
      ok: false,
      message:
        'Scheduler hanya untuk hari ini. Pilih tanggal hari ini, lalu klik Mulai Hari Ini.',
    };
  }

  schedulerRunning = true;
  schedulerAbort = false;
  schedulerPid = process.pid;
  activeWorkDayId = workDayId;
  setSchedulerStatus(workDayId, 'running', String(process.pid));
  startPowerBlocker();
  appendLog(
    `Scheduler dimulai untuk ${day.date} — heartbeat ${HEARTBEAT_MS / 1000}s (aman monitor/screensaver mati)`,
  );

  const date = day.date;

  // Tick segera + interval (mengejar pesan yang terlewat saat monitor mati)
  void tick(workDayId, date);
  heartbeatTimer = setInterval(() => {
    void tick(workDayId, date);
  }, HEARTBEAT_MS);

  return { ok: true, message: 'Scheduler dimulai' };
}

export async function sendMessageNow(messageId: number) {
  const msg = getMessageById(messageId);
  if (!msg) throw new Error('Message not found');
  const day = getWorkDayById(msg.work_day_id);
  const date = day?.date ?? todayDate();

  if (date !== todayDate()) {
    return {
      ok: false,
      error:
        'Kirim Discord hanya untuk hari ini. Hari planning/history tidak dikirim otomatis.',
    };
  }

  if (msg.type === 'logout') {
    const status = getWorkStatus(msg.work_day_id);
    if (!status.canLogout) {
      const reason = status.onBreak
        ? 'Sedang break — kirim Break End dulu, dan pastikan timer kerja bersih sudah 8 jam.'
        : `Kerja bersih baru ${status.cleanLabel} / ${status.targetLabel}. Sisa ${status.remainingLabel}.`;
      return { ok: false, error: reason };
    }
    refreshLogoutRender(msg.work_day_id, date);
  }

  const fresh = getMessageById(messageId)!;
  const text = getMessageText(fresh, date);
  markMessageStatus(messageId, 'sending');
  try {
    await sendMessageText(text);
    markMessageStatus(messageId, 'sent', null, text);
    if (fresh.type === 'progress' || fresh.type === 'login') {
      refreshLogoutRender(fresh.work_day_id, date);
    }
    return { ok: true };
  } catch (error) {
    const err = error instanceof Error ? error.message : String(error);
    markMessageStatus(messageId, 'failed', err);
    return { ok: false, error: err };
  }
}
