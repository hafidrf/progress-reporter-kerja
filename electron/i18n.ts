export type UiLanguage = 'id' | 'en';

const messages = {
  id: {
    schedulerAlreadyRunning: 'Scheduler sudah berjalan',
    workDayNotFound: 'Hari kerja tidak ditemukan',
    schedulerTodayOnly:
      'Scheduler hanya untuk hari ini. Pilih tanggal hari ini, lalu klik Mulai Hari Ini.',
    schedulerStarted: 'Scheduler dimulai',
    sendTodayOnly:
      'Kirim Discord hanya untuk hari ini. Hari planning/history tidak dikirim otomatis.',
    logoutOnBreak:
      'Sedang break — kirim Break End dulu, dan pastikan timer kerja bersih sudah 8 jam.',
    achieved: 'sudah tercapai',
    planningTimerNote: 'hari planning — timer belum jalan',
    pastSummaryNote: 'ringkasan hari itu',
    onBreakEtaNote: 'sedang break — selesai mundur sampai Break End',
    scheduledBreakNote: 'break terjadwal',
    breakShiftsEta: 'break ikut menggeser jam selesai',
  },
  en: {
    schedulerAlreadyRunning: 'Scheduler is already running',
    workDayNotFound: 'Work day not found',
    schedulerTodayOnly:
      "Scheduler only runs for today. Select today's date, then click Start Today.",
    schedulerStarted: 'Scheduler started',
    sendTodayOnly:
      'Discord send is only for today. Planning/history days are not sent automatically.',
    logoutOnBreak:
      'Currently on break — send Break End first, and ensure 8 clean work hours are reached.',
    achieved: 'already reached',
    planningTimerNote: 'planning day — timer not started',
    pastSummaryNote: 'summary for that day',
    onBreakEtaNote: 'on break — completion shifts until Break End',
    scheduledBreakNote: 'scheduled break',
    breakShiftsEta: 'breaks shift the completion time',
  },
} as const;

export type BackendMessageKey = keyof typeof messages.id;

export function t(key: BackendMessageKey, lang: UiLanguage): string {
  return messages[lang][key];
}

export function formatLogoutRemaining(
  clean: string,
  target: string,
  remaining: string,
  lang: UiLanguage,
): string {
  if (lang === 'en') {
    return `Clean work is only ${clean} / ${target}. Remaining ${remaining}.`;
  }
  return `Kerja bersih baru ${clean} / ${target}. Sisa ${remaining}.`;
}

export function getUiLanguageFromSetting(value: string): UiLanguage {
  return value === 'en' ? 'en' : 'id';
}
