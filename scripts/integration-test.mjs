/**
 * Integration test — simulates full day flow with short schedule (dry-run + optional live send).
 * npm run test:integration
 * npm run test:integration -- --live   (sends 1 real test message to Discord)
 */

import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const engineDir = path.resolve(__dirname, 'discord-browser');
const live = process.argv.includes('--live');

function log(msg) {
  console.log(`[integration] ${msg}`);
}

function runNode(args, cwd = engineDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, stdio: 'pipe' });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(out || `exit ${code}`));
    });
  });
}

function killChrome() {
  try {
    execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name='chrome.exe'\\" | Where-Object { $_.CommandLine -like '*discord-browser\\\\chrome-profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
      { stdio: 'ignore' },
    );
  } catch { /* ignore */ }
}

const progress1 = `Sample progress update A\nDesign id : 1000:2000\nEta : 1hr`;
const progress2 = `Sample progress update B\nDesign id : 3000:4000\nEta : 1hr`;

const sum = `Worked on Sample progress update A, Sample progress update B.`;
const logout = [
  'Logout(03/07/26): ',
  `- Sum: ${sum}`,
  '- Integration: ',
  'Module A is ready for QA.',
  '- Pending: ',
  'Module B blocked pending backend fix.',
].join('\n');

async function dryRunMessage(label, text) {
  const tmp = path.join(engineDir, '.tmp', `int-${Date.now()}.txt`);
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, text);
  log(`dry-run: ${label}`);
  const out = await runNode(['send-discord.mjs', '--message-file', tmp, '--dry-run']);
  fs.unlinkSync(tmp);
  if (!out.includes('[DRY RUN]')) throw new Error(`dry-run failed for ${label}`);
  log(`  OK ${label}`);
}

async function liveSend(label, text) {
  killChrome();
  await new Promise((r) => setTimeout(r, 2000));
  const tmp = path.join(engineDir, '.tmp', `live-${Date.now()}.txt`);
  fs.writeFileSync(tmp, text);
  log(`live send: ${label}`);
  const out = await runNode(['send-discord.mjs', '--message-file', tmp]);
  fs.unlinkSync(tmp);
  if (!out.includes('Posted to Discord')) throw new Error(`live send failed for ${label}`);
  log(`  OK ${label}`);
}

async function main() {
  log('Starting integration tests...');

  await dryRunMessage('progress-1', progress1);
  await dryRunMessage('progress-2', progress2);
  await dryRunMessage('logout', logout);

  if (live) {
    const liveText = `Live test from Progress Reporter Kerja\nDesign id : 9000:9000\nEta : 1hr`;
    await liveSend('single-live', liveText);
  } else {
    log('Skip live Discord send (use --live to send one real message)');
  }

  log('All integration tests passed.');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
