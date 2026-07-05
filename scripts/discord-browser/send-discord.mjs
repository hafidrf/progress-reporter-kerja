#!/usr/bin/env node
/**
 * Send a message to Discord via a separate Chrome profile.
 *
 * Setup:
 *   .\open-discord-login.ps1
 *
 * Usage:
 *   node send-discord.mjs --next --dry-run
 *   node send-discord.mjs --next
 *   node send-discord.mjs --message "hello"
 *   node send-discord.mjs --message-file path.txt
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const sendNext = args.includes('--next');
const messageFlagIndex = args.indexOf('--message');
const messageFileFlagIndex = args.indexOf('--message-file');
const customMessage = messageFlagIndex >= 0 ? args[messageFlagIndex + 1] : null;
const messageFile =
  messageFileFlagIndex >= 0 ? args[messageFileFlagIndex + 1] : null;

const configPath = path.join(__dirname, 'config.json');
if (!fs.existsSync(configPath)) {
  console.error('config.json not found. Copy config.example.json to config.json and set channelUrl.');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const queuePath = path.join(__dirname, 'messages-pending.json');
const profileDir = path.resolve(__dirname, config.chromeProfileDir);

function channelIdFromUrl(url) {
  const match = String(url).match(/\/channels\/\d+\/(\d+)/);
  return match ? match[1] : null;
}

function loadMessage() {
  if (messageFile) {
    if (!fs.existsSync(messageFile)) {
      throw new Error(`Message file not found: ${messageFile}`);
    }
    const text = fs.readFileSync(messageFile, 'utf8').trim();
    return { id: 'custom', text };
  }
  if (customMessage) {
    return { id: 'custom', text: customMessage };
  }
  if (!sendNext) {
    console.error('Provide --next, --message "...", or --message-file path');
    process.exit(1);
  }
  const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  const next = queue.pending?.[0];
  if (!next) {
    console.error('No pending messages in messages-pending.json');
    process.exit(1);
  }
  return next;
}

function markSent(id) {
  const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  const index = queue.pending.findIndex((item) => item.id === id);
  if (index < 0) return;
  const [sent] = queue.pending.splice(index, 1);
  queue.sent.push({ ...sent, sentAt: new Date().toISOString() });
  fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2) + '\n');
}

function ensureProfileExists() {
  if (!fs.existsSync(profileDir)) {
    throw new Error(
      'Chrome profile belum ada. Jalankan dulu: .\\open-discord-login.ps1\n' +
        'Lalu login Discord sekali di jendela Chrome terpisah itu.',
    );
  }
}

async function findMessageBox(page, waitMs = 120000) {
  const selectors = [
    'div[role="textbox"][data-slate-editor="true"]',
    '[data-slate-editor="true"]',
    'div[aria-label^="Message #"]',
    'div[contenteditable="true"][role="textbox"]',
  ];

  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const locator = page.locator(selector).last();
      try {
        if (await locator.isVisible({ timeout: 2000 })) {
          return locator;
        }
      } catch {
        // try next selector
      }
    }
    const url = page.url();
    if (url.includes('/login') || url.includes('/register')) {
      console.log('Menunggu login Discord di jendela Chrome automation...');
    }
    await page.waitForTimeout(3000);
  }

  throw new Error(
    'Kotak chat tidak muncul dalam 2 menit. Login Discord via Setup Discord, buka channel target, lalu jalankan ulang.',
  );
}

async function typeMultiline(page, text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].length > 0) {
      await page.keyboard.insertText(lines[i]);
    }
    if (i < lines.length - 1) {
      await page.keyboard.press('Shift+Enter');
    }
  }
}

async function sendMessage(page, text) {
  const messageBox = await findMessageBox(page);
  await messageBox.click();
  await page.waitForTimeout(300);
  await typeMultiline(page, text);
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
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

async function openChannel(page) {
  const target = config.channelUrl;
  if (!target || target.includes('YOUR_GUILD_ID')) {
    throw new Error('channelUrl belum dikonfigurasi di config.json');
  }

  console.log(`Membuka channel: ${target}`);
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(4000);

  const expectedChannelId = channelIdFromUrl(target);
  const url = page.url();
  if (expectedChannelId && !url.includes(expectedChannelId)) {
    throw new Error(
      `Belum masuk channel yang benar. URL sekarang: ${url}\n` +
        'Pastikan sudah login Discord di profil automation.',
    );
  }
}

async function launchDiscordChrome() {
  ensureProfileExists();
  killDiscordChrome();
  await new Promise((r) => setTimeout(r, 2000));

  console.log('Membuka Chrome profil terpisah (Discord automation)...');
  console.log('Chrome kerja utama tidak akan terganggu.\n');

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: false,
    viewport: null,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion',
    ],
  });
  return context;
}

async function main() {
  const item = loadMessage();
  const text = item.text;

  console.log('--- Message preview ---');
  console.log(text);
  console.log('-----------------------\n');

  if (dryRun) {
    console.log('[DRY RUN] Message not sent.');
    return;
  }

  let context;
  try {
    context = await launchDiscordChrome();
    const page = context.pages()[0] ?? (await context.newPage());
    await openChannel(page);

    await sendMessage(page, text);
    await page.waitForTimeout(2500);

    if (item.id !== 'custom') {
      markSent(item.id);
    }

    console.log('Posted to Discord.');
  } finally {
    if (context) {
      await context.close();
    }
    killDiscordChrome();
  }
}

main().catch((error) => {
  console.error('\nFailed:', error.message);
  console.error(`
Tips:
  1. Setup sekali: Setup Discord di app, login, buka channel target
  2. Chrome kerja boleh tetap terbuka — ini pakai profil terpisah
  3. Jika profil sedang dipakai, tutup jendela Chrome automation lalu coba lagi
`);
  process.exit(1);
});
