import { useState } from 'react';
import Modal from './Modal';
import { IconMic } from './icons';
import { useForge } from '../store/useForge';
import { startListening, stopListening, isVoiceSupported } from '../lib/voice';
import { parseVoice, type ParsedItem, type IntentKind } from '../engine/parseVoice';
import { todayStr, addDays } from '../lib/dates';

type Props = { onClose: () => void };

const KIND_LABEL: Record<IntentKind, string> = {
  habit: 'Habit rep',
  'bad-habit': 'Slip',
  task: 'Task',
  redeem: 'Redeem',
};

export default function VoiceModal({ onClose }: Props) {
  const { habits, rewards, commitVoiceItems } = useForge();
  const supported = isVoiceSupported();

  const [phase, setPhase] = useState<'idle' | 'listening' | 'preview'>('idle');
  const [saving, setSaving] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const ctx = {
    habits: habits.map((h) => ({ id: h.id, name: h.name, polarity: h.polarity })),
    rewards: rewards.map((r) => ({ id: r.id, name: r.name })),
    today: todayStr(),
    tomorrow: addDays(todayStr(), 1),
  };

  const runParse = (text: string) => {
    setTranscript(text);
    setItems(parseVoice(text, ctx));
    setPhase('preview');
  };

  const listen = async () => {
    setError(null);
    setPhase('listening');
    try {
      const text = await startListening();
      if (!text.trim()) {
        setError('Nothing heard. Try again, or type it below.');
        setPhase('idle');
        return;
      }
      runParse(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Voice failed');
      setPhase('idle');
    }
  };

  const setKind = (id: string, kind: IntentKind) => {
    setItems((prev) => prev.map((it) => {
      if (it.id !== id) return it;
      // Re-resolve the ref when switching between kinds.
      if (kind === 'task') return { ...it, kind, refId: null, dueDate: it.dueDate ?? ctx.tomorrow };
      if (kind === 'redeem') {
        const r = ctx.rewards.find((x) => it.raw.toLowerCase().includes(x.name.toLowerCase()));
        return { ...it, kind, refId: r?.id ?? null, dueDate: null };
      }
      const h = ctx.habits.find((x) => it.raw.toLowerCase().includes(x.name.toLowerCase()));
      return { ...it, kind, refId: h?.id ?? null, dueDate: null };
    }));
  };

  const setText = (id: string, text: string) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, text } : it)));
  };

  const drop = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));

  const commit = async () => {
    setSaving(true);
    await commitVoiceItems(items);
    onClose();
  };

  /** An item that needs a ref but has none can't be committed. */
  const unresolved = items.filter(
    (it) => it.kind !== 'task' && !it.refId,
  );
  const canCommit = items.length > 0 && unresolved.length === 0;

  return (
    <Modal title="Voice" onClose={() => { stopListening(); onClose(); }} testId="voice-modal">
      {phase !== 'preview' && (
        <>
          {supported ? (
            <button className="btn btn--primary" data-testid="voice-mic"
                    disabled={phase === 'listening'} onClick={() => void listen()}>
              {phase === 'listening'
                ? 'Listening…'
                : <><IconMic size={18} /> Start speaking</>}
            </button>
          ) : (
            <p className="reward__note" data-testid="voice-unsupported">
              Speech recognition isn't available in this browser — type it instead.
            </p>
          )}

          <label className="field" style={{ marginTop: 16 }}>
            <span className="field__label">Or type it</span>
            <input className="input" data-testid="voice-text"
                   placeholder="tomorrow gym, read 20 pages, no TV"
                   onKeyDown={(e) => {
                     if (e.key === 'Enter') {
                       const v = (e.target as HTMLInputElement).value.trim();
                       if (v) runParse(v);
                     }
                   }} />
          </label>
          <button className="btn btn--ghost" data-testid="voice-parse-typed"
                  onClick={() => {
                    const el = document.querySelector<HTMLInputElement>('[data-testid=voice-text]');
                    const v = el?.value.trim();
                    if (v) runParse(v);
                  }}>Preview</button>

          {error && <p className="voice__err" data-testid="voice-error">{error}</p>}
        </>
      )}

      {phase === 'preview' && (
        <>
          <p className="voice__heard" data-testid="voice-transcript">“{transcript}”</p>
          <h3 className="sect">Is this correct?</h3>

          {items.map((it) => (
            <div className="vrow" key={it.id} data-testid={`vrow-${it.id}`}
                 data-kind={it.kind}>
              <select className="vrow__kind" value={it.kind}
                      data-testid={`vkind-${it.id}`}
                      onChange={(e) => setKind(it.id, e.target.value as IntentKind)}>
                {(Object.keys(KIND_LABEL) as IntentKind[]).map((k) => (
                  <option key={k} value={k}>{KIND_LABEL[k]}</option>
                ))}
              </select>
              <input className="vrow__text" value={it.text}
                     data-testid={`vtext-${it.id}`}
                     onChange={(e) => setText(it.id, e.target.value)} />
              {it.kind === 'task' && it.dueDate && (
                <span className="vrow__due">{it.dueDate === ctx.today ? 'today' : 'tmrw'}</span>
              )}
              <button className="task__del" data-testid={`vdrop-${it.id}`}
                      aria-label="Remove" onClick={() => drop(it.id)}>✕</button>
            </div>
          ))}

          {unresolved.length > 0 && (
            <p className="voice__err" data-testid="voice-unresolved">
              {unresolved.length} item(s) don't match a known habit or reward — change
              them to Task or remove them.
            </p>
          )}

          <button className="btn btn--primary" disabled={!canCommit || saving}
                  data-testid="voice-ok" onClick={() => void commit()}>
            OK — commit {items.length} item{items.length === 1 ? '' : 's'}
          </button>
          <button className="btn btn--ghost" data-testid="voice-back"
                  onClick={() => setPhase('idle')}>Start over</button>
        </>
      )}
    </Modal>
  );
}
