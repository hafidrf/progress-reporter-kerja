/**
 * Kill Chrome processes that use the discord-browser automation profile.
 * Shared by Electron (via spawn) and send-discord.mjs.
 */
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the automation Chrome user-data-dir. */
export function profileDirHint() {
  return path.join(__dirname, 'chrome-profile');
}

/** Escape a string for use as a literal pkill -f regex. */
export function escapePkillPattern(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function killDiscordChrome() {
  try {
    if (process.platform === 'win32') {
      // PowerShell -like: one `\` in the pattern matches Windows CommandLine paths.
      // Use execFileSync (argv) so cmd.exe does not mangle quotes.
      execFileSync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          "Get-CimInstance Win32_Process -Filter \"name='chrome.exe'\" | Where-Object { $_.CommandLine -like '*discord-browser\\chrome-profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
        ],
        { stdio: 'ignore' },
      );
    } else {
      // Absolute profile path (regex-escaped) — avoids killing unrelated processes
      // that merely mention "discord-browser" in argv.
      const pattern = escapePkillPattern(profileDirHint());
      try {
        execFileSync('pkill', ['-f', pattern], { stdio: 'ignore' });
      } catch {
        // pkill exits non-zero when nothing matched
      }
    }
  } catch {
    // ignore — process may already be gone
  }
}
