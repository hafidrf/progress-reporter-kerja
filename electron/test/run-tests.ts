/**
 * Unit tests for message formatting and Discord engine wiring.
 * Run: npm test
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';

process.env.ELECTRON_RUN_AS_NODE = '1';

const {
  buildLoginText,
  buildProgressText,
  buildLogoutText,
  buildSumFromProgressTitles,
  buildSumText,
  parseEtaToHours,
  normalizeEta,
  formatTimer,
  isBreakEntry,
  isBreakStart,
  isBreakEnd,
} = require('../render');

const { sendMessageDryRun, engineDir } = require('../discord');

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      console.log(`  OK  ${name}`);
      passed += 1;
    } catch (error) {
      console.error(` FAIL ${name}`);
      console.error(`      ${error instanceof Error ? error.message : error}`);
      failed += 1;
    }
  })();
}

async function run() {
  console.log('Progress Reporter Kerja — tests\n');

  await test('buildLoginText format', () => {
    const text = buildLoginText('2026-07-03', [
      'Working on authentication module',
      'Reviewing API contract',
    ]);
    assert.ok(text.startsWith('Login(03/07/26):'));
    assert.ok(text.includes('authentication module'));
  });

  await test('buildProgressText format', () => {
    const text = buildProgressText('Integrate API', '1000:2000', '1hr');
    assert.strictEqual(
      text,
      'Integrate API\nDesign id : 1000:2000\nEta : 1hr',
    );
  });

  await test('parseEtaToHours formats', () => {
    assert.strictEqual(parseEtaToHours('1hr'), 1);
    assert.strictEqual(parseEtaToHours('1 jam'), 1);
    assert.ok(Math.abs(parseEtaToHours('1hr 20m') - (1 + 20 / 60)) < 1e-9);
    assert.ok(Math.abs(parseEtaToHours('1 jam 20 menit') - (1 + 20 / 60)) < 1e-9);
    assert.ok(Math.abs(parseEtaToHours('80m') - 80 / 60) < 1e-9);
    assert.strictEqual(normalizeEta('1 jam 20 menit'), '1hr 20m');
  });

  await test('formatTimer', () => {
    assert.ok(formatTimer(1 + 6 / 60 + 22 / 3600).includes('1 jam'));
    assert.ok(formatTimer(0.5).includes('mnt'));
  });

  await test('break entries', () => {
    assert.ok(isBreakStart('Break Start'));
    assert.ok(isBreakEnd('Break End'));
    assert.ok(isBreakEntry('break start'));
    assert.strictEqual(buildProgressText('Break Start', 'x', '1hr'), 'Break Start');
    const sum = buildSumFromProgressTitles(['Task A', 'Break Start', 'Task B', 'Break End']);
    assert.ok(!sum.includes('Break'));
    assert.ok(sum.includes('Task A'));
    assert.ok(sum.includes('Task B'));
  });

  await test('buildSumText includes login lines + progress', () => {
    const sum = buildSumText(
      ['Working on user profile screen', 'Checking validation rules'],
      ['Implement form validation', 'Write integration tests'],
    );
    assert.ok(sum.startsWith('Worked on '));
    assert.ok(sum.includes('user profile screen'));
    assert.ok(sum.includes('validation rules'));
    assert.ok(sum.includes('form validation'));
    assert.ok(sum.endsWith('.'));
  });

  await test('buildSumFromProgressTitles', () => {
    const sum = buildSumFromProgressTitles([
      'Implement checkout flow',
      'Add payment gateway hook',
    ]);
    assert.ok(sum.startsWith('Worked on '));
    assert.ok(sum.includes('checkout flow'));
    assert.ok(sum.includes('payment gateway'));
    assert.ok(sum.endsWith('.'));
  });

  await test('buildLogoutText with auto sum', () => {
    const sum = buildSumFromProgressTitles(['Task A', 'Task B']);
    const text = buildLogoutText(
      '2026-07-03',
      sum,
      'Module X is ready for QA.',
      'Module Y blocked pending backend fix.',
    );
    assert.ok(text.includes('Logout(03/07/26):'));
    assert.ok(text.includes('- Sum: Worked on Task A, Task B.'));
    assert.ok(text.includes('- Integration:'));
    assert.ok(text.includes('ready for QA'));
    assert.ok(text.includes('- Pending:'));
  });

  await test('engine directory exists', () => {
    const dir = engineDir();
    assert.ok(fs.existsSync(dir), `Missing ${dir}`);
    assert.ok(fs.existsSync(path.join(dir, 'send-discord.mjs')));
    assert.ok(fs.existsSync(path.join(dir, 'config.example.json')));
  });

  await test('discord dry-run via message file', async () => {
    const sample = buildProgressText('Sample progress update', '1000:2000', '1hr');
    const out = await sendMessageDryRun(sample);
    assert.ok(out.includes('[DRY RUN]'));
    assert.ok(out.includes('Sample progress update'));
  });

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
