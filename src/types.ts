export type MessageType = 'login' | 'progress' | 'logout';
export type MessageStatus = 'pending' | 'sending' | 'sent' | 'failed';

export interface Message {
  id: number;
  work_day_id: number;
  type: MessageType;
  scheduled_time: string;
  title: string | null;
  design_id: string | null;
  eta: string | null;
  body_extra: string | null;
  integration: string | null;
  pending: string | null;
  rendered_text: string | null;
  status: MessageStatus;
  sent_at: string | null;
  error: string | null;
  sort_order: number;
}

export interface WorkDay {
  id: number;
  date: string;
  scheduler_status: 'idle' | 'running' | 'completed' | string;
  scheduler_pid: string | null;
  created_at: string;
}

export interface Settings {
  discord_channel_url: string;
  timezone: string;
  discord_logged_in: boolean;
  ui_language: 'id' | 'en';
}

export interface LogoutPreview {
  sum: string;
  integration: string;
  pending: string;
  fullText: string;
}

export interface WorkStatus {
  plannedHours: number;
  sentHours: number;
  cleanHours: number;
  targetHours: number;
  remainingHours: number;
  onBreak: boolean;
  canLogout: boolean;
  sessionStarted: boolean;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  plannedLabel: string;
  cleanLabel: string;
  remainingLabel: string;
  targetLabel: string;
  etaCompleteLabel: string;
  etaCompleteNote: string;
}

export interface DayReport {
  day: WorkDay;
  messages: Message[];
  workStatus: WorkStatus;
  logoutPreview: LogoutPreview;
  summary: {
    login: {
      time: string;
      text: string | null;
      status: string;
      lines: string[];
    } | null;
    progress: Array<{
      id: number;
      time: string;
      title: string | null;
      design_id: string | null;
      eta: string | null;
      status: string;
      text: string | null;
    }>;
    breaks: Array<{
      id: number;
      time: string;
      title: string | null;
      status: string;
    }>;
    logout: {
      time: string;
      text: string;
      status: string;
      integration: string | null;
      pending: string | null;
      sum: string;
    } | null;
    sentCount: number;
    pendingCount: number;
    totalCount: number;
  };
}
