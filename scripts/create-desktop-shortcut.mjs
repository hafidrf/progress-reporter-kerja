#!/usr/bin/env node
/**
 * Create a desktop launcher for Progress Reporter Kerja (Windows or macOS).
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const desktop = path.join(os.homedir(), 'Desktop');

if (process.platform === 'win32') {
  const ps1 = path.join(root, 'scripts', 'create-desktop-shortcut.ps1');
  const r = spawnSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1],
    { stdio: 'inherit' },
  );
  process.exit(r.status ?? 1);
}

if (process.platform === 'darwin') {
  fs.mkdirSync(desktop, { recursive: true });
  const commandPath = path.join(desktop, 'Progress Reporter Kerja.command');
  const startSh = path.join(root, 'start-app.sh');
  const body = `#!/bin/bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "${root}"
exec bash "${startSh}"
`;
  fs.writeFileSync(commandPath, body, { mode: 0o755 });
  try {
    fs.chmodSync(commandPath, 0o755);
    fs.chmodSync(startSh, 0o755);
  } catch {
    // ignore chmod failures
  }
  console.log(`Shortcut created: ${commandPath}`);
  console.log('Double-click it on the Desktop (or right-click → Open the first time).');
  process.exit(0);
}

console.error(`desktop-shortcut is not supported on ${process.platform}`);
process.exit(1);
