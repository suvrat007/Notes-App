/**
 * Google Calendar / Tasks connection UI.
 *
 * Everything here is one-way (FORGE -> Google) and best-effort, and the copy
 * says so — a sync toggle that quietly does nothing while you're offline is
 * worse than no toggle at all.
 */
import { useCallback, useEffect, useState } from 'react';
import { useForge } from '../store/useForge';
import { toast } from '../store/useToast';
import { db } from '../db/schema';
import {
  drainQueue, enqueueBacklog, queueStatus, retryStuck, clearSyncState,
  type QueueStatus,
} from '../db/sync';
import { isGoogleConfigured } from '../lib/google/config';
import { getAccessToken, disconnect, hasValidToken, onAuthChange } from '../lib/google/auth';
import { buildIcs, icsToBlob, icsFilename } from '../lib/google/ics';

export default function GoogleSyncPanel() {
  const { appState, updateSettings } = useForge();
  const [authed, setAuthed] = useState(hasValidToken());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<QueueStatus>({ pending: 0, stuck: 0, lastError: null });

  const settings = appState?.settings;
  const connected = Boolean(settings?.googleConnected);

  const refreshStatus = useCallback(() => {
    void queueStatus().then(setStatus);
  }, []);

  useEffect(() => {
    refreshStatus();
    return onAuthChange(() => setAuthed(hasValidToken()));
  }, [refreshStatus]);

  if (!settings) return null;

  const configured = isGoogleConfigured();

  const connect = async () => {
    setBusy(true);
    try {
      // Must stay inside the click handler's gesture — browsers block the
      // consent popup otherwise, and it fails as a generic "dismissed".
      await getAccessToken(true);
      await updateSettings({
        googleConnected: true,
        // Calendar alone by default: pushing to both puts every task in two
        // places, which reads as duplication rather than as a feature.
        googleCalendar: settings.googleCalendar ?? true,
        googleTasks: settings.googleTasks ?? false,
      });
      const n = await enqueueBacklog();
      const res = await drainQueue();
      refreshStatus();
      toast.success(
        res.pushed > 0
          ? `Connected. Pushed ${res.pushed} of ${n} task${n === 1 ? '' : 's'}.`
          : 'Connected to Google.',
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not connect to Google.');
    } finally {
      setBusy(false);
    }
  };

  const doDisconnect = async () => {
    setBusy(true);
    try {
      await disconnect();
      await clearSyncState();
      await updateSettings({ googleConnected: false });
      refreshStatus();
      // Say plainly what we did NOT do, so nobody goes hunting for vanished events.
      toast.success('Disconnected. Events already in Google were left in place.');
    } finally {
      setBusy(false);
    }
  };

  const syncNow = async () => {
    setBusy(true);
    try {
      // Re-auth interactively here: this IS a user gesture, and a silent
      // refresh that has already failed shouldn't make the button a no-op.
      if (!hasValidToken()) await getAccessToken(true);
      const res = await drainQueue();
      refreshStatus();
      if (res.skipped) toast.error(`Nothing sent — ${res.reason}.`);
      else if (res.failed > 0) toast.error(`Sent ${res.pushed}, ${res.failed} failed.`);
      else toast.success(res.pushed > 0 ? `Sent ${res.pushed} update${res.pushed === 1 ? '' : 's'}.` : 'Already up to date.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sync failed.');
    } finally {
      setBusy(false);
    }
  };

  const doRetry = async () => {
    await retryStuck();
    await syncNow();
  };

  const exportIcs = async () => {
    const tasks = await db.tasks.toArray();
    if (tasks.length === 0) {
      toast.error('No tasks to export yet.');
      return;
    }
    const url = URL.createObjectURL(icsToBlob(buildIcs(tasks)));
    const a = document.createElement('a');
    a.href = url;
    a.download = icsFilename();
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${tasks.length} task${tasks.length === 1 ? '' : 's'} as .ics.`);
  };

  return (
    <>
      <h2 className="sect">Google</h2>

      {!configured && (
        <p className="setting__hint" data-testid="google-unconfigured">
          No Google client ID built in. Set <code>VITE_GOOGLE_CLIENT_ID</code> to enable
          syncing — the .ics export below works without it.
        </p>
      )}

      <div className="card">
        <div className="card__row">
          <span className="card__label">
            {connected ? 'Connected to Google' : 'Connect Google'}
            <span className="setting__hint">
              {connected
                ? authed
                  ? 'Tasks push to Google as you add and complete them.'
                  : 'Session expired — reconnect or hit Sync now to refresh it.'
                : 'One-way: FORGE sends tasks to Google. Changes made in Google do not come back.'}
            </span>
          </span>
          <button className="btn btn--ghost" style={{ marginTop: 0, width: 'auto' }}
                  data-testid="google-connect" disabled={busy || !configured}
                  onClick={() => void (connected ? doDisconnect() : connect())}>
            {connected ? 'Disconnect' : 'Connect'}
          </button>
        </div>

        {connected && (
          <>
            <label className="card__row" style={{ cursor: 'pointer' }}>
              <span className="card__label">
                Google Calendar
                <span className="setting__hint">
                  One event per task. Tasks without a time become all-day events.
                </span>
              </span>
              <input type="checkbox" data-testid="set-gcal"
                     checked={settings.googleCalendar ?? false}
                     onChange={(e) => void updateSettings({ googleCalendar: e.target.checked })} />
            </label>

            <label className="card__row" style={{ cursor: 'pointer' }}>
              <span className="card__label">
                Google Tasks
                <span className="setting__hint">
                  What Google Reminders became. Google Tasks stores the due date
                  only — the time of day is dropped.
                </span>
              </span>
              <input type="checkbox" data-testid="set-gtasks"
                     checked={settings.googleTasks ?? false}
                     onChange={(e) => void updateSettings({ googleTasks: e.target.checked })} />
            </label>

            <div className="card__row">
              <span className="card__label">
                {status.pending > 0
                  ? `${status.pending} change${status.pending === 1 ? '' : 's'} waiting to send`
                  : 'Everything sent'}
                {status.stuck > 0 && (
                  <span className="setting__hint" data-testid="google-stuck">
                    {status.stuck} gave up after repeated failures
                    {status.lastError ? `: ${status.lastError}` : '.'}
                  </span>
                )}
              </span>
              <button className="btn btn--ghost" style={{ marginTop: 0, width: 'auto' }}
                      data-testid="google-sync-now" disabled={busy}
                      onClick={() => void (status.stuck > 0 ? doRetry() : syncNow())}>
                {status.stuck > 0 ? 'Retry' : 'Sync now'}
              </button>
            </div>
          </>
        )}
      </div>

      <button className="btn btn--ghost" data-testid="export-ics" onClick={() => void exportIcs()}>
        Export tasks as .ics
      </button>
      <p className="setting__hint">
        Import this into Google Calendar, Apple Calendar or Outlook by hand. Works
        offline and needs no account.
      </p>
    </>
  );
}
