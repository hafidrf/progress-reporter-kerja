import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  getTodayDate: () => ipcRenderer.invoke('getTodayDate'),
  getOrCreateWorkDay: (date: string) => ipcRenderer.invoke('getOrCreateWorkDay', date),
  listWorkDays: () => ipcRenderer.invoke('listWorkDays'),
  getMessages: (workDayId: number) => ipcRenderer.invoke('getMessages', workDayId),
  getSettings: () => ipcRenderer.invoke('getSettings'),
  setUiLanguage: (lang: 'id' | 'en') => ipcRenderer.invoke('setUiLanguage', lang),
  addLogin: (payload: {
    workDayId: number;
    scheduled_time: string;
    lines: string[];
  }) => ipcRenderer.invoke('addLogin', payload),
  addProgress: (payload: {
    workDayId: number;
    scheduled_time: string;
    title: string;
    design_id: string;
    eta: string;
  }) => ipcRenderer.invoke('addProgress', payload),
  saveLogout: (payload: {
    workDayId: number;
    scheduled_time: string;
    integration: string;
    pending: string;
  }) => ipcRenderer.invoke('saveLogout', payload),
  deleteMessage: (id: number) => ipcRenderer.invoke('deleteMessage', id),
  updateMessage: (id: number, patch: Record<string, unknown>) =>
    ipcRenderer.invoke('updateMessage', id, patch),
  getLogoutPreview: (workDayId: number) =>
    ipcRenderer.invoke('getLogoutPreview', workDayId),
  getWorkStatus: (workDayId: number) => ipcRenderer.invoke('getWorkStatus', workDayId),
  getDayReport: (workDayId: number) => ipcRenderer.invoke('getDayReport', workDayId),
  startScheduler: (workDayId: number) => ipcRenderer.invoke('startScheduler', workDayId),
  stopScheduler: () => ipcRenderer.invoke('stopScheduler'),
  getSchedulerStatus: () => ipcRenderer.invoke('getSchedulerStatus'),
  openDiscordLogin: () => ipcRenderer.invoke('openDiscordLogin'),
  sendNow: (messageId: number) => ipcRenderer.invoke('sendNow', messageId),
  markDone: (messageId: number) => ipcRenderer.invoke('markDone', messageId),
  getLogs: () => ipcRenderer.invoke('getLogs'),
});
