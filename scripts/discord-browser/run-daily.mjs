#!/usr/bin/env node
/**
 * Jalankan sekali di awal hari — kirim semua pesan pending sesuai jadwal "scheduled".
 * Log: run-daily.log
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const queuePath = path.join(__dirname, 'messages-pending.json');
const logPath = path.join(__dirname, 'run-daily.log');
const pidPath = path.join(__dirname, 'run-daily.pid');

const MAX_RETRIES = 3;

function log(line) {
  const stamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const msg = `[${stamp}] ${line}`;
  console.log(msg);
  fs.appendFileSync(logPath, msg + '\n');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDuration(ms) {
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h} jam ${m} menit`;
  return `${m} menit`;
}

function killDiscordChrome() {
  try {
    execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name='chrome.exe'\\" | Where-Object { $_.CommandLine -like '*discord-browser\\\\chrome-profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
      { stdio: 'ignore' },
    );
  } catch {
    // ignore
  }
}

function readQueue() {
  return JSON.parse(fs.readFileSync(queuePath, 'utf8'));
}

function isAlreadySent(itemId) {
  const queue = readQueue();
  return (queue.sent ?? []).some((item) => item.id === itemId);
}

function runSend() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['send-discord.mjs', '--next'], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => {
      out += d.toString();
      process.stdout.write(d);
    });
    child.stderr.on('data', (d) => {
      out += d.toString();
      process.stderr.write(d);
    });
    child.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`send-discord exited with code ${code}\n${out}`));
    });
  });
}

async function runSendWithRetry(itemId) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    killDiscordChrome();
    await sleep(2000);
    try {
      log(`Percobaan ${attempt}/${MAX_RETRIES} untuk ${itemId}`);
      await runSend();
      return;
    } catch (error) {
      log(`Percobaan ${attempt} gagal: ${error.message.split('\n')[0]}`);
      if (attempt === MAX_RETRIES) {
        throw error;
      }
      await sleep(8000);
    }
  }
}

function parseScheduledToday(scheduled) {
  const [h, m] = scheduled.split(':').map(Number);
  const target = new Date();
  target.setHours(h, m, 0, 0);
  return target;
}

async function waitUntilScheduled(scheduled) {
  const target = parseScheduledToday(scheduled);
  let ms = target.getTime() - Date.now();
  if (ms <= 0) {
    log(`${scheduled} — waktu sudah lewat, kirim dalam 5 detik`);
    await sleep(5000);
    return;
  }
  log(`${scheduled} — menunggu ${formatDuration(ms)}`);
  await sleep(ms);
}

async function main() {
  fs.writeFileSync(pidPath, String(process.pid));

  const initial = readQueue();
  const schedule = [...(initial.pending ?? [])];

  if (schedule.length === 0) {
    log('Tidak ada pesan pending. Isi messages-pending.json dulu.');
    process.exit(0);
  }

  log(`Scheduler harian dimulai — ${schedule.length} pesan dijadwalkan`);
  schedule.forEach((item) => {
    log(`  • ${item.scheduled ?? '??:??'} — ${item.id}`);
  });

  for (const item of schedule) {
    if (!item.scheduled) {
      log(`Lewati ${item.id}: tidak ada field "scheduled"`);
      continue;
    }

    if (isAlreadySent(item.id)) {
      log(`${item.id} sudah terkirim sebelumnya, lewati`);
      continue;
    }

    await waitUntilScheduled(item.scheduled);

    if (isAlreadySent(item.id)) {
      log(`${item.id} sudah terkirim, lewati`);
      continue;
    }

    log(`Mengirim: ${item.id} (jadwal ${item.scheduled})`);

    try {
      await runSendWithRetry(item.id);
      log(`Berhasil: ${item.id}`);
    } catch (error) {
      log(`GAGAL ${item.id} setelah ${MAX_RETRIES}x percobaan: ${error.message.split('\n')[0]}`);
    }

    await sleep(3000);
  }

  log('Semua pesan hari ini selesai.');
  try {
    fs.unlinkSync(pidPath);
  } catch {
    // ignore
  }
}

main().catch((error) => {
  log(`Scheduler error: ${error.message}`);
  try {
    fs.unlinkSync(pidPath);
  } catch {
    // ignore
  }
  process.exit(1);
});
