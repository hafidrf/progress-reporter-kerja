import type {
  Message,
  WorkDay,
  Settings,
  LogoutPreview,
  WorkStatus,
  DayReport,
} from './types';

export interface ElectronAPI {
  getTodayDate: () => Promise<string>;
  getOrCreateWorkDay: (date: string) => Promise<WorkDay>;
  listWorkDays: () => Promise<WorkDay[]>;
  getMessages: (workDayId: number) => Promise<Message[]>;
  getSettings: () => Promise<Settings>;
  setUiLanguage: (lang: 'id' | 'en') => Promise<Settings>;
  addLogin: (payload: {
    workDayId: number;
    scheduled_time: string;
    lines: string[];
  }) => Promise<Message>;
  addProgress: (payload: {
    workDayId: number;
    scheduled_time: string;
    title: string;
    design_id: string;
    eta: string;
  }) => Promise<Message>;
  saveLogout: (payload: {
    workDayId: number;
    scheduled_time: string;
    integration: string;
    pending: string;
  }) => Promise<Message>;
  deleteMessage: (id: number) => Promise<void>;
  updateMessage: (
    id: number,
    patch: Record<string, unknown>,
  ) => Promise<Message>;
  getLogoutPreview: (workDayId: number) => Promise<LogoutPreview>;
  getWorkStatus: (workDayId: number) => Promise<WorkStatus>;
  getDayReport: (workDayId: number) => Promise<DayReport>;
  startScheduler: (
    workDayId: number,
  ) => Promise<{ ok: boolean; message: string }>;
  stopScheduler: () => Promise<{ ok: boolean }>;
  getSchedulerStatus: () => Promise<{
    running: boolean;
    pid: number | null;
    workDayId: number | null;
  }>;
  openDiscordLogin: () => Promise<{ ok: boolean }>;
  sendNow: (messageId: number) => Promise<{ ok: boolean; error?: string }>;
  markDone: (messageId: number) => Promise<Message>;
  getLogs: () => Promise<string[]>;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
