export function formatDateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dd = String(d).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const yy = String(y).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

/** Break Start / Break End (tulis di Judul progress) */
export function isBreakStart(title: string | null | undefined): boolean {
  return /break\s*start/i.test((title ?? '').trim());
}

export function isBreakEnd(title: string | null | undefined): boolean {
  return /break\s*end/i.test((title ?? '').trim());
}

export function isBreakEntry(title: string | null | undefined): boolean {
  return isBreakStart(title) || isBreakEnd(title);
}

/**
 * Parse ETA ke jam desimal.
 * Contoh valid:
 *   1hr | 1h | 1 jam
 *   1hr 20m | 1h20m | 1 jam 20 menit | 1 jam 20 m
 *   80m | 80 menit
 *   1.5hr | 1,5 jam
 */
export function parseEtaToHours(eta: string | null | undefined): number {
  if (!eta) return 0;
  let s = eta.trim().toLowerCase().replace(/,/g, '.');
  if (!s || s === '-' || s === 'n/a') return 0;

  s = s
    .replace(/menit/g, 'm')
    .replace(/mins?/g, 'm')
    .replace(/hours?/g, 'h')
    .replace(/jam/g, 'h')
    .replace(/hrs?/g, 'h')
    .replace(/\s+/g, ' ')
    .trim();

  // "1h20m" or "1h 20m"
  const hm = s.match(/^(\d+(?:\.\d+)?)\s*h(?:\s*(\d+(?:\.\d+)?)\s*m)?$/);
  if (hm) {
    const hours = parseFloat(hm[1]);
    const mins = hm[2] ? parseFloat(hm[2]) : 0;
    return hours + mins / 60;
  }

  // "20m" only
  const onlyM = s.match(/^(\d+(?:\.\d+)?)\s*m$/);
  if (onlyM) return parseFloat(onlyM[1]) / 60;

  // bare number = hours
  const bare = s.match(/^(\d+(?:\.\d+)?)$/);
  if (bare) return parseFloat(bare[1]);

  return 0;
}

/** Format jam desimal ke teks Discord yang mudah dibaca */
export function formatEtaLabel(hours: number): string {
  if (hours <= 0) return '-';
  const totalMins = Math.round(hours * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h > 0 && m > 0) return `${h}hr ${m}m`;
  if (h > 0) return `${h}hr`;
  return `${m}m`;
}

/** Normalisasi input user ke label ETA konsisten */
export function normalizeEta(eta: string | null | undefined): string {
  const hours = parseEtaToHours(eta);
  if (hours <= 0) return (eta ?? '').trim() || '1hr';
  return formatEtaLabel(hours);
}

export function formatHoursHuman(hours: number): string {
  const totalMins = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h > 0 && m > 0) return `${h} jam ${m} menit`;
  if (h > 0) return `${h} jam`;
  return `${m} menit`;
}

/** Timer live: 1 jam 06 mnt 22 dtk */
export function formatTimer(hours: number): string {
  const totalSecs = Math.max(0, Math.floor(hours * 3600));
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h} jam ${mm} mnt ${ss} dtk`;
  return `${mm} mnt ${ss} dtk`;
}

export function buildLoginText(date: string, lines: string[]): string {
  const header = `Login(${formatDateLabel(date)}):`;
  const body = lines.map((l) => l.trim()).filter(Boolean);
  return [header, ...body].join('\n');
}

export function buildProgressText(
  title: string,
  designId: string,
  eta: string,
): string {
  const t = title.trim();
  if (isBreakEntry(t)) {
    return isBreakStart(t) ? 'Break Start' : 'Break End';
  }
  const etaLabel = normalizeEta(eta);
  return `${t}\nDesign id : ${designId.trim()}\nEta : ${etaLabel}`;
}

/** Sum = login baris 1–2 + judul progress (bukan break), seperti format tim. */
export function buildSumText(loginLines: string[], progressTitles: string[]): string {
  const parts = [
    ...loginLines.map((t) => t.trim()).filter(Boolean),
    ...progressTitles
      .map((t) => t.trim())
      .filter((t) => t && !isBreakEntry(t)),
  ];
  if (parts.length === 0) return 'Worked on ';
  return `Worked on ${parts.join(', ')}.`;
}

/** @deprecated pakai buildSumText */
export function buildSumFromProgressTitles(titles: string[]): string {
  return buildSumText([], titles);
}

export function buildLogoutText(
  date: string,
  sum: string,
  integration: string,
  pending: string,
): string {
  const lines = [`Logout(${formatDateLabel(date)}): `];
  lines.push(`- Sum: ${sum.trim()}`);
  lines.push('- Integration: ');
  lines.push(integration.trim());
  lines.push('- Pending: ');
  lines.push(pending.trim());
  return lines.join('\n');
}

export const CLEAN_WORK_TARGET_HOURS = 8;
