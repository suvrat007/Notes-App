import { useRef, useState } from 'react';
import { useForge } from '../store/useForge';
import { exportBackup, backupToBlob, importBackup, InvalidBackupError } from '../db/backup';
import { isGroqConfigured } from '../lib/intent';
import { toast } from '../store/useToast';

export default function SettingsPanel() {
  const { appState, updateSettings, loadToday } = useForge();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const settings = appState?.settings;
  if (!settings) return null;

  const doExport = async () => {
    setErr(null);
    const backup = await exportBackup();
    const url = URL.createObjectURL(backupToBlob(backup));
    const a = document.createElement('a');
    a.href = url;
    a.download = `forge-backup-${backup.exportedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${backup.logs.length} log entries.`);
    setMsg(`Exported ${backup.logs.length} log entries.`);
  };

  const doImport = async (file: File) => {
    setErr(null);
    setMsg(null);
    try {
      const parsed = JSON.parse(await file.text());
      await importBackup(parsed);
      await loadToday();
      toast.success('Backup restored.');
      setMsg('Backup restored.');
    } catch (e) {
      setErr(
        e instanceof InvalidBackupError ? e.message
          : e instanceof SyntaxError ? 'That file isn\'t valid JSON.'
          : 'Import failed.',
      );
    }
  };

  return (
    <>
      <h2 className="sect">Settings</h2>
      <div className="card">
        <label className="card__row" style={{ cursor: 'pointer' }}>
          <span className="card__label">
            Floor negative days at zero
            <span className="setting__hint">A bad day can't drag the week down.</span>
          </span>
          <input type="checkbox" data-testid="set-floor"
                 checked={settings.negativeFloor}
                 onChange={(e) => void updateSettings({ negativeFloor: e.target.checked })} />
        </label>

        <label className="card__row">
          <span className="card__label">
            Smarter voice parsing
            <span className="setting__hint">
              {isGroqConfigured()
                ? 'Sends the transcript to Groq to sort it into habits and tasks. '
                  + 'Needs a connection; falls back to on-device parsing offline.'
                : 'No API key built in — using on-device parsing.'}
            </span>
          </span>
          <input type="checkbox" data-testid="set-ai"
                 disabled={!isGroqConfigured()}
                 checked={(settings.aiParsing ?? true) && isGroqConfigured()}
                 onChange={(e) => void updateSettings({ aiParsing: e.target.checked })} />
        </label>

        <label className="card__row">
          <span className="card__label">Week starts on</span>
          <select className="vrow__kind" data-testid="set-weekstart"
                  value={settings.weekResetDay}
                  onChange={(e) => void updateSettings({ weekResetDay: Number(e.target.value) })}>
            <option value={1}>Monday</option>
            <option value={0}>Sunday</option>
            <option value={6}>Saturday</option>
          </select>
        </label>
      </div>

      <h2 className="sect">Backup</h2>
      <div className="rewardadd">
        <button className="btn btn--ghost" style={{ marginTop: 0 }}
                data-testid="export-json" onClick={() => void doExport()}>
          Export JSON
        </button>
        <button className="btn btn--ghost" style={{ marginTop: 0 }}
                data-testid="import-json" onClick={() => fileRef.current?.click()}>
          Import JSON
        </button>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json"
             data-testid="import-file" style={{ display: 'none' }}
             onChange={(e) => {
               const f = e.target.files?.[0];
               if (f) void doImport(f);
               e.target.value = '';
             }} />

      {msg && <p className="setting__ok" data-testid="settings-msg">{msg}</p>}
      {err && <p className="voice__err" data-testid="settings-err">{err}</p>}
    </>
  );
}
