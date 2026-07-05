import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  Message,
  WorkDay,
  LogoutPreview,
  WorkStatus,
  DayReport,
} from './types';
import './styles.css';

function statusIcon(status: string) {
  if (status === 'sent') return '✅';
  if (status === 'failed') return '❌';
  if (status === 'sending') return '🔄';
  return '⏳';
}

function isBreakTitle(title: string | null) {
  return /break\s*(start|end)/i.test(title ?? '');
}

function formatDateId(date: string) {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

function shiftDate(date: string, days: number) {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function App() {
  const [tab, setTab] = useState<'kerja' | 'history'>('kerja');
  const [todayStr, setTodayStr] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [day, setDay] = useState<WorkDay | null>(null);
  const [days, setDays] = useState<WorkDay[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [logoutPreview, setLogoutPreview] = useState<LogoutPreview | null>(null);
  const [workStatus, setWorkStatus] = useState<WorkStatus | null>(null);
  const [report, setReport] = useState<DayReport | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [schedulerRunning, setSchedulerRunning] = useState(false);
  const [schedulerDayId, setSchedulerDayId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [editMsg, setEditMsg] = useState<Message | null>(null);

  const [loginTime, setLoginTime] = useState('08:51');
  const [loginLine1, setLoginLine1] = useState('Working on feature implementation');
  const [loginLine2, setLoginLine2] = useState('Reviewing requirements and blockers');

  const [progressTime, setProgressTime] = useState('09:19');
  const [progressTitle, setProgressTitle] = useState('');
  const [progressDesignId, setProgressDesignId] = useState('');
  const [progressEta, setProgressEta] = useState('1hr');

  const [logoutTime, setLogoutTime] = useState('17:22');
  const [integration, setIntegration] = useState('');
  const [pending, setPending] = useState('');

  // edit form
  const [eTime, setETime] = useState('');
  const [eTitle, setETitle] = useState('');
  const [eDesign, setEDesign] = useState('');
  const [eEta, setEEta] = useState('');
  const [eLine1, setELine1] = useState('');
  const [eLine2, setELine2] = useState('');
  const [eIntegration, setEIntegration] = useState('');
  const [ePending, setEPending] = useState('');
  const [eResetPending, setEResetPending] = useState(false);

  const isToday = selectedDate === todayStr;
  const isFuture = selectedDate > todayStr;
  const isPast = selectedDate < todayStr;

  const refresh = useCallback(async () => {
    const today = await window.api.getTodayDate();
    setTodayStr(today);
    const date = selectedDate || today;
    if (!selectedDate) setSelectedDate(today);

    const workDay = await window.api.getOrCreateWorkDay(date);
    setDay(workDay);
    const list = await window.api.listWorkDays();
    setDays(list);
    const msgs = await window.api.getMessages(workDay.id);
    setMessages(msgs);
    const preview = await window.api.getLogoutPreview(workDay.id);
    setLogoutPreview(preview);
    const status = await window.api.getWorkStatus(workDay.id);
    setWorkStatus(status);
    const dayReport = await window.api.getDayReport(workDay.id);
    setReport(dayReport);
    const logLines = await window.api.getLogs();
    setLogs(logLines);
    const sched = await window.api.getSchedulerStatus();
    setSchedulerRunning(sched.running);
    setSchedulerDayId(sched.workDayId);
  }, [selectedDate]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 1000);
    return () => clearInterval(timer);
  }, [refresh]);

  const openEdit = (m: Message) => {
    setEditMsg(m);
    setETime(m.scheduled_time);
    setETitle(m.title ?? '');
    setEDesign(m.design_id ?? '');
    setEEta(m.eta ?? '1hr');
    const lines = m.body_extra ? JSON.parse(m.body_extra) : ['', ''];
    setELine1(lines[0] ?? '');
    setELine2(lines[1] ?? '');
    setEIntegration(m.integration ?? '');
    setEPending(m.pending ?? '');
    setEResetPending(false);
  };

  const saveEdit = async () => {
    if (!editMsg) return;
    setBusy(true);
    const patch: Record<string, unknown> = {
      scheduled_time: eTime,
      resetToPending: eResetPending,
    };
    if (editMsg.type === 'login') {
      patch.lines = [eLine1, eLine2].filter(Boolean);
    } else if (editMsg.type === 'progress') {
      patch.title = eTitle;
      patch.design_id = eDesign;
      patch.eta = eEta;
    } else if (editMsg.type === 'logout') {
      patch.integration = eIntegration;
      patch.pending = ePending;
    }
    await window.api.updateMessage(editMsg.id, patch);
    setEditMsg(null);
    await refresh();
    setBusy(false);
  };

  const handleAddLogin = async () => {
    if (!day) return;
    setBusy(true);
    await window.api.addLogin({
      workDayId: day.id,
      scheduled_time: loginTime,
      lines: [loginLine1, loginLine2].filter(Boolean),
    });
    await refresh();
    setBusy(false);
  };

  const handleAddProgress = async () => {
    if (!day) return;
    const title = progressTitle.trim();
    if (!title) return;
    const breakEntry = isBreakTitle(title);
    if (!breakEntry && !progressDesignId.trim()) return;
    setBusy(true);
    await window.api.addProgress({
      workDayId: day.id,
      scheduled_time: progressTime,
      title,
      design_id: breakEntry ? '-' : progressDesignId,
      eta: breakEntry ? '-' : progressEta,
    });
    setProgressTitle('');
    await refresh();
    setBusy(false);
  };

  const addBreak = async (kind: 'start' | 'end') => {
    if (!day) return;
    setBusy(true);
    await window.api.addProgress({
      workDayId: day.id,
      scheduled_time: progressTime,
      title: kind === 'start' ? 'Break Start' : 'Break End',
      design_id: '-',
      eta: '-',
    });
    await refresh();
    setBusy(false);
  };

  const handleSaveLogout = async () => {
    if (!day) return;
    setBusy(true);
    await window.api.saveLogout({
      workDayId: day.id,
      scheduled_time: logoutTime,
      integration,
      pending,
    });
    await refresh();
    setBusy(false);
  };

  const handleStart = async () => {
    if (!day) return;
    setBusy(true);
    const result = await window.api.startScheduler(day.id);
    if (!result.ok) alert(result.message);
    await refresh();
    setBusy(false);
  };

  const handleStop = async () => {
    await window.api.stopScheduler();
    await refresh();
  };

  const handleSendNow = async (id: number) => {
    setBusy(true);
    const result = await window.api.sendNow(id);
    if (!result.ok) alert(result.error ?? 'Gagal kirim');
    await refresh();
    setBusy(false);
  };

  const handleMarkDone = async (id: number) => {
    setBusy(true);
    await window.api.markDone(id);
    await refresh();
    setBusy(false);
  };

  const cleanPct = workStatus
    ? Math.min(100, (workStatus.cleanHours / workStatus.targetHours) * 100)
    : 0;

  const dayLabel = isToday
    ? 'Hari ini'
    : isFuture
      ? 'Planning'
      : 'History';

  return (
    <div className="app">
      <header>
        <div>
          <h1>Progress Reporter Kerja</h1>
          <p>
            <strong>{formatDateId(selectedDate || '...')}</strong> · {dayLabel} ·
            Scheduler:{' '}
            <strong>
              {schedulerRunning && schedulerDayId === day?.id
                ? 'AKTIF'
                : schedulerRunning
                  ? 'AKTIF (hari lain)'
                  : 'IDLE'}
            </strong>
            {workStatus?.onBreak ? ' · ⏸ BREAK' : ''}
          </p>
        </div>
        <div className="header-actions">
          <button type="button" onClick={() => window.api.openDiscordLogin()}>
            Setup Discord
          </button>
          <button
            type="button"
            onClick={handleStart}
            disabled={busy || schedulerRunning || !isToday}
            title={!isToday ? 'Hanya untuk hari ini' : undefined}
          >
            Mulai Hari Ini
          </button>
          <button type="button" onClick={handleStop} disabled={!schedulerRunning}>
            Stop
          </button>
        </div>
      </header>

      <div className="date-bar">
        <button
          type="button"
          className="secondary"
          onClick={() => setSelectedDate(shiftDate(selectedDate || todayStr, -1))}
        >
          ←
        </button>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
        />
        <button
          type="button"
          className="secondary"
          onClick={() => setSelectedDate(shiftDate(selectedDate || todayStr, 1))}
        >
          →
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => setSelectedDate(todayStr)}
        >
          Hari ini
        </button>
        <div className="tabs">
          <button
            type="button"
            className={tab === 'kerja' ? '' : 'secondary'}
            onClick={() => setTab('kerja')}
          >
            Kerja / Plan
          </button>
          <button
            type="button"
            className={tab === 'history' ? '' : 'secondary'}
            onClick={() => setTab('history')}
          >
            History
          </button>
        </div>
      </div>

      {isFuture && (
        <p className="banner plan">Mode planning — draft saja. Klik Mulai Hari Ini saat tanggal ini tiba.</p>
      )}
      {isPast && (
        <p className="banner hist">Mode history — bisa lihat & edit. Kirim Discord hanya untuk hari ini.</p>
      )}

      {tab === 'kerja' && workStatus && (
        <section className="card wide work-status">
          <h2>
            {isToday
              ? 'Kerja bersih (timer live — pause saat break)'
              : isPast
                ? 'Ringkasan kerja bersih hari itu'
                : 'Kerja bersih (belum jalan — planning)'}
          </h2>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${cleanPct}%` }} />
          </div>
          <p className="timer-line">
            <strong>{workStatus.cleanLabel}</strong>
            <span className="muted"> / {workStatus.targetLabel}</span>
            {workStatus.canLogout ? (
              <span className="ok"> — Logout siap dikirim</span>
            ) : !workStatus.sessionStarted ? (
              <span className="warn"> — Tambah Login dulu</span>
            ) : workStatus.onBreak ? (
              <span className="warn"> — ⏸ BREAK (timer pause)</span>
            ) : isToday ? (
              <span className="warn"> — Sisa {workStatus.remainingLabel}</span>
            ) : null}
          </p>
          {isToday && (
            <p className="eta-complete">
              Perkiraan selesai kerja bersih (8 jam):{' '}
              <strong>{workStatus.etaCompleteLabel}</strong>
              {workStatus.etaCompleteNote ? (
                <span className="muted"> — {workStatus.etaCompleteNote}</span>
              ) : null}
            </p>
          )}
          <p className="muted">
            Rencana ETA progress: {workStatus.plannedLabel}
          </p>
        </section>
      )}

      {tab === 'kerja' && (
        <main className="grid">
          <section className="card">
            <h2>Login</h2>
            <label>
              Jam
              <input value={loginTime} onChange={(e) => setLoginTime(e.target.value)} />
            </label>
            <label>
              Baris 1
              <input value={loginLine1} onChange={(e) => setLoginLine1(e.target.value)} />
            </label>
            <label>
              Baris 2
              <input value={loginLine2} onChange={(e) => setLoginLine2(e.target.value)} />
            </label>
            <button type="button" onClick={handleAddLogin} disabled={busy}>
              + Tambah Login
            </button>
          </section>

          <section className="card">
            <h2>Progress</h2>
            <label>
              Jam
              <input value={progressTime} onChange={(e) => setProgressTime(e.target.value)} />
            </label>
            <label>
              Judul
              <input
                value={progressTitle}
                onChange={(e) => setProgressTitle(e.target.value)}
                placeholder="Integrate ... / Break Start"
              />
            </label>
            <label>
              Design ID
              <input
                value={progressDesignId}
                onChange={(e) => setProgressDesignId(e.target.value)}
                placeholder="1000:2000"
              />
            </label>
            <label>
              ETA
              <input
                value={progressEta}
                onChange={(e) => setProgressEta(e.target.value)}
                placeholder="1hr atau 1hr 20m"
              />
            </label>
            <p className="hint">
              Format ETA: <code>1hr</code>, <code>1hr 20m</code>, <code>1 jam 20 menit</code>
            </p>
            <div className="row-actions">
              <button type="button" onClick={handleAddProgress} disabled={busy}>
                + Tambah Progress
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => addBreak('start')}
                disabled={busy}
              >
                Break Start
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => addBreak('end')}
                disabled={busy}
              >
                Break End
              </button>
            </div>
          </section>

          <section className="card">
            <h2>Logout</h2>
            <label>
              Jam
              <input value={logoutTime} onChange={(e) => setLogoutTime(e.target.value)} />
            </label>
            <label>
              Integration (manual)
              <textarea
                rows={3}
                value={integration}
                onChange={(e) => setIntegration(e.target.value)}
              />
            </label>
            <label>
              Pending (manual)
              <textarea
                rows={4}
                value={pending}
                onChange={(e) => setPending(e.target.value)}
              />
            </label>
            <button type="button" onClick={handleSaveLogout} disabled={busy}>
              Simpan Logout (draft)
            </button>
            <p className="hint">
              Kirim logout hanya hari ini, setelah timer ≥ 8 jam & tidak break.
            </p>
            {logoutPreview && (
              <div className="preview">
                <strong>Sum (auto):</strong>
                <pre>{logoutPreview.sum}</pre>
              </div>
            )}
          </section>

          <section className="card wide">
            <h2>Pesan tanggal ini</h2>
            <ul className="message-list">
              {messages.map((m) => {
                const isLogout = m.type === 'logout';
                const sendBlocked =
                  !isToday || (isLogout && workStatus && !workStatus.canLogout);
                return (
                  <li key={m.id}>
                    <span>
                      {statusIcon(m.status)} {m.scheduled_time} · {m.type}
                      {m.title ? ` · ${m.title}` : ''}
                      {m.type === 'progress' && m.eta && m.eta !== '-'
                        ? ` · ETA ${m.eta}`
                        : ''}
                    </span>
                    <span className="row-actions">
                      <button type="button" className="secondary" onClick={() => openEdit(m)}>
                        Edit
                      </button>
                      {m.status !== 'sent' && (
                        <button
                          type="button"
                          className="done-btn"
                          onClick={() => handleMarkDone(m.id)}
                          disabled={busy}
                          title="Tandai sudah terkirim (tanpa kirim ulang ke Discord)"
                        >
                          Done
                        </button>
                      )}
                      {m.status !== 'sent' && isToday && (
                        <button
                          type="button"
                          onClick={() => handleSendNow(m.id)}
                          disabled={busy || !!sendBlocked}
                        >
                          Kirim sekarang
                        </button>
                      )}
                      {m.status === 'pending' && (
                        <button
                          type="button"
                          className="secondary"
                          onClick={() =>
                            window.api.deleteMessage(m.id).then(refresh)
                          }
                        >
                          Hapus
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
              {messages.length === 0 && (
                <li className="muted">Belum ada pesan untuk tanggal ini.</li>
              )}
            </ul>
          </section>

          <section className="card wide">
            <h2>Log</h2>
            <pre className="log-box">{logs.join('\n') || 'Belum ada log'}</pre>
          </section>
        </main>
      )}

      {tab === 'history' && (
        <div className="history-layout">
          <aside className="card history-list">
            <h2>Daftar hari</h2>
            <ul>
              {days.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    className={
                      d.date === selectedDate ? '' : 'secondary'
                    }
                    onClick={() => {
                      setSelectedDate(d.date);
                      setTab('history');
                    }}
                  >
                    {formatDateId(d.date)}
                    {d.date === todayStr ? ' (hari ini)' : ''}
                  </button>
                </li>
              ))}
              {days.length === 0 && <li className="muted">Belum ada data</li>}
            </ul>
          </aside>

          <section className="card wide history-report">
            <h2>Laporan {formatDateId(selectedDate)}</h2>
            {!report || report.summary.totalCount === 0 ? (
              <p className="muted">Belum ada dokumentasi untuk tanggal ini.</p>
            ) : (
              <div className="report-body">
                <p className="report-meta">
                  Kerja bersih: <strong>{report.workStatus.cleanLabel}</strong> /{' '}
                  {report.workStatus.targetLabel} · Terkirim{' '}
                  {report.summary.sentCount}/{report.summary.totalCount}
                </p>

                {report.summary.login && (
                  <div className="report-block">
                    <h3>
                      {statusIcon(report.summary.login.status)} Login ·{' '}
                      {report.summary.login.time}
                    </h3>
                    <pre>{report.summary.login.text}</pre>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        const m = messages.find((x) => x.type === 'login');
                        if (m) openEdit(m);
                      }}
                    >
                      Edit Login
                    </button>
                  </div>
                )}

                {report.summary.progress.map((p) => (
                  <div className="report-block" key={p.id}>
                    <h3>
                      {statusIcon(p.status)} Progress · {p.time}
                      {p.eta && p.eta !== '-' ? ` · ETA ${p.eta}` : ''}
                    </h3>
                    <pre>{p.text}</pre>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        const m = messages.find((x) => x.id === p.id);
                        if (m) openEdit(m);
                      }}
                    >
                      Edit
                    </button>
                  </div>
                ))}

                {report.summary.breaks.length > 0 && (
                  <div className="report-block">
                    <h3>Break</h3>
                    <ul>
                      {report.summary.breaks.map((b) => (
                        <li key={b.id}>
                          {statusIcon(b.status)} {b.time} · {b.title}{' '}
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => {
                              const m = messages.find((x) => x.id === b.id);
                              if (m) openEdit(m);
                            }}
                          >
                            Edit
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {report.summary.logout && (
                  <div className="report-block">
                    <h3>
                      {statusIcon(report.summary.logout.status)} Logout ·{' '}
                      {report.summary.logout.time}
                    </h3>
                    <pre>{report.summary.logout.text}</pre>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        const m = messages.find((x) => x.type === 'logout');
                        if (m) openEdit(m);
                      }}
                    >
                      Edit Logout
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {editMsg && (
        <div className="modal-backdrop">
          <div className="modal card">
            <h2>Edit {editMsg.type}</h2>
            <label>
              Jam
              <input value={eTime} onChange={(e) => setETime(e.target.value)} />
            </label>
            {editMsg.type === 'login' && (
              <>
                <label>
                  Baris 1
                  <input value={eLine1} onChange={(e) => setELine1(e.target.value)} />
                </label>
                <label>
                  Baris 2
                  <input value={eLine2} onChange={(e) => setELine2(e.target.value)} />
                </label>
              </>
            )}
            {editMsg.type === 'progress' && (
              <>
                <label>
                  Judul
                  <input value={eTitle} onChange={(e) => setETitle(e.target.value)} />
                </label>
                <label>
                  Design ID
                  <input value={eDesign} onChange={(e) => setEDesign(e.target.value)} />
                </label>
                <label>
                  ETA
                  <input value={eEta} onChange={(e) => setEEta(e.target.value)} />
                </label>
              </>
            )}
            {editMsg.type === 'logout' && (
              <>
                <label>
                  Integration
                  <textarea
                    rows={3}
                    value={eIntegration}
                    onChange={(e) => setEIntegration(e.target.value)}
                  />
                </label>
                <label>
                  Pending
                  <textarea
                    rows={3}
                    value={ePending}
                    onChange={(e) => setEPending(e.target.value)}
                  />
                </label>
              </>
            )}
            {editMsg.status === 'sent' && isToday && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={eResetPending}
                  onChange={(e) => setEResetPending(e.target.checked)}
                />
                Reset status ke pending (bisa kirim ulang)
              </label>
            )}
            <div className="row-actions">
              <button type="button" onClick={saveEdit} disabled={busy}>
                Simpan
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setEditMsg(null)}
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
