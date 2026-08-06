import { spawn, execFileSync, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { appendLog } from './db';

export function engineDir(): string {
  return path.resolve(__dirname, '../scripts/discord-browser');
}

function ensureEngineFiles() {
  const dir = engineDir();
  const configPath = path.join(dir, 'config.json');
  const configExample = path.join(dir, 'config.example.json');
  if (!fs.existsSync(configPath) && fs.existsSync(configExample)) {
    fs.copyFileSync(configExample, configPath);
  }
  const queuePath = path.join(dir, 'messages-pending.json');
  const queueExample = path.join(dir, 'messages-pending.example.json');
  if (!fs.existsSync(queuePath) && fs.existsSync(queueExample)) {
    fs.copyFileSync(queueExample, queuePath);
  }
}

/** Use system Node — not the Electron binary (breaks when run as background child). */
function resolveNodeBinary(): string {
  if (process.env.npm_node_execpath && fs.existsSync(process.env.npm_node_execpath)) {
    return process.env.npm_node_execpath;
  }
  // Finder / .command launches often lack nvm on PATH; check Homebrew next.
  if (process.platform === 'darwin') {
    for (const candidate of ['/opt/homebrew/bin/node', '/usr/local/bin/node']) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('where.exe', ['node'], { encoding: 'utf8' });
      const first = out
        .split(/\r?\n/)
        .map((s) => s.trim())
        .find(Boolean);
      if (first && fs.existsSync(first)) return first;
    } else {
      const out = execFileSync('which', ['node'], { encoding: 'utf8' });
      const first = out.trim().split(/\r?\n/)[0]?.trim();
      if (first && fs.existsSync(first)) return first;
    }
  } catch {
    // ignore
  }
  return 'node';
}

/** Env for child Node scripts: drop Electron-as-Node, keep Homebrew on PATH. */
function childNodeEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  if (process.platform !== 'win32') {
    const prefix = ['/opt/homebrew/bin', '/usr/local/bin'];
    env.PATH = [...prefix, env.PATH || '/usr/bin:/bin'].join(':');
  }
  return env;
}

function escapePkillPattern(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function killDiscordChrome() {
  try {
    if (process.platform === 'win32') {
      execFileSync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          // One `\` in the -like pattern matches Windows CommandLine (discord-browser\chrome-profile).
          "Get-CimInstance Win32_Process -Filter \"name='chrome.exe'\" | Where-Object { $_.CommandLine -like '*discord-browser\\chrome-profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
        ],
        { stdio: 'ignore' },
      );
    } else {
      // Match absolute user-data-dir (pkill -f is a regex — escape the path).
      const pattern = escapePkillPattern(
        path.join(engineDir(), 'chrome-profile'),
      );
      try {
        execFileSync('pkill', ['-f', pattern], {
          stdio: 'ignore',
        });
      } catch {
        // pkill exits non-zero when nothing matched
      }
    }
  } catch {
    // ignore
  }
}

const trackedChildren = new Set<ChildProcess>();

function trackChild(child: ChildProcess): ChildProcess {
  trackedChildren.add(child);
  child.once('close', () => trackedChildren.delete(child));
  child.once('error', () => trackedChildren.delete(child));
  return child;
}

/** Stop Discord send/login child processes and automation Chrome on app exit. */
export function shutdownDiscordEngine() {
  for (const child of trackedChildren) {
    try {
      if (!child.killed) child.kill();
    } catch {
      // ignore
    }
  }
  trackedChildren.clear();
  killDiscordChrome();
}

export function openDiscordLogin(): Promise<void> {
  ensureEngineFiles();
  return new Promise((resolve, reject) => {
    const script = path.join(engineDir(), 'open-discord-login.mjs');
    const nodeBin = resolveNodeBinary();
    const child = trackChild(
      spawn(nodeBin, [script], {
        cwd: engineDir(),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: false,
        env: childNodeEnv(),
      }),
    );
    let out = '';
    child.stdout?.on('data', (d) => {
      out += d.toString();
    });
    child.stderr?.on('data', (d) => {
      out += d.toString();
    });
    child.on('error', (err) => {
      reject(new Error(`Failed to open Discord login: ${err.message}`));
    });
    child.on('close', (code) => {
      if (code === 0) {
        appendLog('Discord login window opened');
        resolve();
      } else {
        reject(
          new Error(
            out.trim() || `open-discord-login exited with code ${code}`,
          ),
        );
      }
    });
  });
}

function runSendScript(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const sendScript = path.join(engineDir(), 'send-discord.mjs');
    const nodeBin = resolveNodeBinary();
    const child = trackChild(
      spawn(nodeBin, [sendScript, ...args], {
        cwd: engineDir(),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        env: childNodeEnv(),
      }),
    );
    let out = '';
    child.stdout?.on('data', (d) => {
      out += d.toString();
    });
    child.stderr?.on('data', (d) => {
      out += d.toString();
    });
    child.on('error', (err) => {
      reject(new Error(`Gagal jalankan node: ${err.message}`));
    });
    child.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(out || `send-discord exited with code ${code}`));
    });
  });
}

export function sendMessageText(text: string): Promise<void> {
  return (async () => {
    ensureEngineFiles();
    killDiscordChrome();
    await new Promise((r) => setTimeout(r, 2000));

    const tmpDir = path.join(engineDir(), '.tmp');
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, `msg-${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, text, 'utf8');

    try {
      appendLog('Menjalankan kirim Discord...');
      await runSendScript(['--message-file', tmpFile]);
      appendLog('Discord message sent');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appendLog(`Discord send failed: ${msg.slice(0, 400)}`);
      throw error;
    } finally {
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        // ignore
      }
      killDiscordChrome();
    }
  })();
}

export function sendMessageDryRun(text: string): Promise<string> {
  return (async () => {
    ensureEngineFiles();
    const tmpDir = path.join(engineDir(), '.tmp');
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, `msg-dry-${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, text, 'utf8');
    try {
      return await runSendScript(['--message-file', tmpFile, '--dry-run']);
    } finally {
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        // ignore
      }
    }
  })();
}

export function syncChannelUrl(url: string) {
  if (!url.trim()) return;
  ensureEngineFiles();
  const configPath = path.join(engineDir(), 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.channelUrl = url.trim();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

export function readChannelUrlFromConfig(): string | null {
  ensureEngineFiles();
  const configPath = path.join(engineDir(), 'config.json');
  if (!fs.existsSync(configPath)) return null;
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return typeof config.channelUrl === 'string' && config.channelUrl.trim()
    ? config.channelUrl.trim()
    : null;
}
