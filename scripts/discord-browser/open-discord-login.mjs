#!/usr/bin/env node
/**
 * Open a separate Chrome profile for Discord automation login.
 * Cross-platform (Windows / macOS / Linux).
 *
 * Usage:
 *   node open-discord-login.mjs
 */
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const profileDir = path.join(__dirname, 'chrome-profile');
const configPath = path.join(__dirname, 'config.json');
const examplePath = path.join(__dirname, 'config.example.json');

function resolveChromeExecutable() {
  const candidates = [];

  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA;
    const pf = process.env.ProgramFiles;
    const pf86 = process.env['ProgramFiles(x86)'];
    if (local) candidates.push(path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    if (pf) candidates.push(path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    if (pf86) candidates.push(path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      path.join(os.homedir(), 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
    );
  } else {
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
    );
  }

  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

/** .app bundle path for macOS `open -a` (not the inner MacOS binary). */
function resolveChromeAppBundle() {
  const candidates = [
    '/Applications/Google Chrome.app',
    path.join(os.homedir(), 'Applications', 'Google Chrome.app'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function ensureConfig() {
  if (!fs.existsSync(configPath)) {
    if (fs.existsSync(examplePath)) {
      fs.copyFileSync(examplePath, configPath);
    } else {
      throw new Error(
        'config.json not found. Copy config.example.json to config.json and set channelUrl.',
      );
    }
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const discordUrl = config.channelUrl;
  if (!discordUrl || String(discordUrl).includes('YOUR_GUILD_ID')) {
    throw new Error(
      'Set channelUrl in scripts/discord-browser/config.json before Setup Discord.',
    );
  }
  return { config, discordUrl };
}

function chromeArgs(discordUrl) {
  return [
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate',
    discordUrl,
  ];
}

/**
 * Launch Chrome and return only after the OS has accepted the process.
 * Exiting before 'spawn' on unix can kill a detached child still starting.
 */
function launchDetachedChrome(chrome, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(chrome, args, {
      detached: true,
      stdio: 'ignore',
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

function launchChromeMacos(discordUrl) {
  const app = resolveChromeAppBundle();
  if (!app) {
    throw new Error(
      'Google Chrome not found under /Applications. Install Chrome, then retry.',
    );
  }
  // LaunchServices owns lifetime — avoids detached-child dying with this script.
  const r = spawnSync(
    'open',
    ['-n', '-a', app, '--args', ...chromeArgs(discordUrl)],
    { stdio: 'ignore' },
  );
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw new Error(
      `Failed to open Google Chrome (open exited ${r.status ?? 'null'}).`,
    );
  }
}

async function main() {
  const { discordUrl } = ensureConfig();

  fs.mkdirSync(profileDir, { recursive: true });

  console.log('Opening isolated Chrome profile (Discord automation)...');
  console.log(`Target: ${discordUrl}`);
  console.log('1. Sign in to Discord if prompted');
  console.log('2. Open the target channel');
  console.log('3. Close this Chrome window when finished');
  console.log('');

  if (process.platform === 'darwin') {
    launchChromeMacos(discordUrl);
    return;
  }

  const chrome = resolveChromeExecutable();
  if (!chrome) {
    throw new Error('Google Chrome not found. Install Chrome, then retry.');
  }

  await launchDetachedChrome(chrome, chromeArgs(discordUrl));
}

try {
  await main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
