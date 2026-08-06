#!/usr/bin/env node
/**
 * Copy example Discord engine config files if missing.
 * Cross-platform replacement for the old PowerShell setup:discord script.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engine = path.join(root, 'scripts', 'discord-browser');

const pairs = [
  ['config.example.json', 'config.json'],
  ['messages-pending.example.json', 'messages-pending.json'],
];

for (const [exampleName, targetName] of pairs) {
  const example = path.join(engine, exampleName);
  const target = path.join(engine, targetName);
  if (!fs.existsSync(target) && fs.existsSync(example)) {
    fs.copyFileSync(example, target);
    console.log(`Created ${path.relative(root, target)}`);
  } else if (fs.existsSync(target)) {
    console.log(`Exists ${path.relative(root, target)} (skipped)`);
  } else {
    console.warn(`Missing example: ${exampleName}`);
  }
}

console.log('Done. Edit scripts/discord-browser/config.json channelUrl if needed.');
