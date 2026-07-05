import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';

// Kurangi throttle timer saat jendela tidak fokus / monitor mati
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
import {
  addLogin,
  addProgress,
  deleteMessage,
  getDayReport,
  getLogs,
  getLogoutPreview,
  getMessages,
  getMessageById,
  getOrCreateWorkDay,
  getSettings,
  getWorkDayById,
  getWorkStatus,
  listWorkDays,
  markMessageDone,
  saveLogout,
  setUiLanguage,
  todayDate,
  updateMessage,
} from './db';
import { openDiscordLogin, readChannelUrlFromConfig, syncChannelUrl } from './discord';
import {
  getSchedulerState,
  sendMessageNow,
  startScheduler,
  stopScheduler,
} from './scheduler';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 780,
    title: 'Progress Reporter Kerja',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const distHtml = path.join(__dirname, '../dist/index.html');
  const useDevServer =
    process.env.PRK_DEV === '1' || process.argv.includes('--prk-dev');

  if (useDevServer) {
    mainWindow.loadURL('http://localhost:5173');
  } else if (fs.existsSync(distHtml)) {
    mainWindow.loadFile(distHtml);
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }
}

app.whenReady().then(() => {
  const settings = getSettings();
  const channelUrl =
    settings.discord_channel_url.trim() || readChannelUrlFromConfig() || '';
  if (channelUrl) {
    syncChannelUrl(channelUrl);
  }
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('getTodayDate', () => todayDate());

ipcMain.handle('getOrCreateWorkDay', (_e, date: string) => getOrCreateWorkDay(date));

ipcMain.handle('listWorkDays', () => listWorkDays());

ipcMain.handle('getMessages', (_e, workDayId: number) => getMessages(workDayId));

ipcMain.handle('getSettings', () => getSettings());

ipcMain.handle('setUiLanguage', (_e, lang: 'id' | 'en') => {
  setUiLanguage(lang);
  return getSettings();
});

ipcMain.handle(
  'addLogin',
  (_e, payload: { workDayId: number; scheduled_time: string; lines: string[] }) => {
    const day = getWorkDayById(payload.workDayId);
    if (!day) throw new Error('Work day not found');
    const id = addLogin(day.id, day.date, payload.scheduled_time, payload.lines);
    return getMessageById(id);
  },
);

ipcMain.handle(
  'addProgress',
  (
    _e,
    payload: {
      workDayId: number;
      scheduled_time: string;
      title: string;
      design_id: string;
      eta: string;
    },
  ) => {
    const day = getWorkDayById(payload.workDayId);
    if (!day) throw new Error('Work day not found');
    const id = addProgress(
      day.id,
      payload.scheduled_time,
      payload.title,
      payload.design_id,
      payload.eta,
    );
    return getMessageById(id);
  },
);

ipcMain.handle(
  'saveLogout',
  (
    _e,
    payload: {
      workDayId: number;
      scheduled_time: string;
      integration: string;
      pending: string;
    },
  ) => {
    const day = getWorkDayById(payload.workDayId);
    if (!day) throw new Error('Work day not found');
    const id = saveLogout(
      day.id,
      day.date,
      payload.scheduled_time,
      payload.integration,
      payload.pending,
    );
    return getMessageById(id);
  },
);

ipcMain.handle('deleteMessage', (_e, id: number) => {
  deleteMessage(id);
});

ipcMain.handle('updateMessage', (_e, id: number, patch: Record<string, unknown>) =>
  updateMessage(id, patch as Parameters<typeof updateMessage>[1]),
);

ipcMain.handle('getLogoutPreview', (_e, workDayId: number) => {
  const day = getWorkDayById(workDayId);
  if (!day) throw new Error('Work day not found');
  return getLogoutPreview(workDayId, day.date);
});

ipcMain.handle('getWorkStatus', (_e, workDayId: number) => getWorkStatus(workDayId));

ipcMain.handle('getDayReport', (_e, workDayId: number) => getDayReport(workDayId));

ipcMain.handle('startScheduler', async (_e, workDayId: number) =>
  startScheduler(workDayId),
);

ipcMain.handle('stopScheduler', () => {
  stopScheduler();
  return { ok: true };
});

ipcMain.handle('getSchedulerStatus', () => getSchedulerState());

ipcMain.handle('openDiscordLogin', async () => {
  await openDiscordLogin();
  return { ok: true };
});

ipcMain.handle('sendNow', async (_e, messageId: number) => sendMessageNow(messageId));

ipcMain.handle('markDone', (_e, messageId: number) => markMessageDone(messageId));

ipcMain.handle('getLogs', () => getLogs());
