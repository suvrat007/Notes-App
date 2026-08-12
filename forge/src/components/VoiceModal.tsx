import { useState } from 'react';
import Modal from './Modal';
import { IconMic } from './icons';
import { useForge } from '../store/useForge';
import { startListening, stopListening, isVoiceSupported, VoiceError } from '../lib/voice';
import { type ParsedItem, type IntentKind } from '../engine/parseVoice';
import { parseIntents, isGroqConfigured, type ParseSource } from '../lib/intent';
import { todayStr, addDays } from '../lib/dates';
import { toast } from '../store/useToast';

type Props = { onClose: () => void };

const KIND_LABEL: Record<IntentKind, string> = {
  habit: 'Habit rep',
  'bad-habit': 'Slip',
  task: 'Task',
  redeem: 'Redeem',
};

export default function VoiceModal({ onClose }: Props) {
  const { habits, rewards, commitVoiceItems, appState } = useForge();
  const supported = isVoiceSupported();
  // AI parsing is opt-out via Settings, and only possible when a key is built in.
  const useAi = (appState?.settings.aiParsing ?? true) && isGroqConfigured();

  const [phase, setPhase] = useState<'idle' | 'listening' | 'thinking' | 'preview'>('idle');
  const [source, setSource] = useState<ParseSource>('rules');
  const [fallbackReason, setFallbackReason] = useState<string | undefined>();
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

  const runParse = async (text: string) => {
    setTranscript(text);
    // The AI pass is a network call; show it rather than appearing frozen.
    setPhase(useAi && isGroqConfigured() ? 'thinking' : 'preview');
    const out = await parseIntents(text, ctx, { useAi });
    setItems(out.items);
    setSource(out.source);
    setFallbackReason(out.fallbackReason);
    if (useAi && out.source === 'rules' && out.fallbackReason) {
      toast.info('Smart parsing unavailable — sorted it on-device instead. Check the rows below.');
    }
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
      await runParse(text);
    } catch (e) {
      // VoiceError already carries human-readable text; anything else is a
      // surprise, so don't leak its raw message either.
      const msg = e instanceof VoiceError
        ? e.message
        : 'Voice failed. Type it below instead.';
      setError(msg);
      toast.error(msg, {
        label: 'Type it',
        onClick: () => document.querySelector<HTMLInputElement>('[data-testid=voice-text]')?.focus(),
      });
      if (!(e instanceof VoiceError)) console.error('voice:', e);
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
    const n = items.length;
    try {
      await commitVoiceItems(items);
      toast.success(`Logged ${n} item${n === 1 ? '' : 's'}.`);
      onClose();
    } catch {
      // Leave the preview open so the user can retry without re-dictating.
      setSaving(false);
      toast.error('Could not save those items. Nothing was committed — try again.');
    }
  };

  /** An item that needs a ref but has none can't be committed. */
  const unresolved = items.filter(
    (it) => it.kind !== 'task' && !it.refId,
  );
  const canCommit = items.length > 0 && unresolved.length === 0;

  return (
    <Modal title="Voice" onClose={() => { stopListening(); onClose(); }} testId="voice-modal">
      {phase === 'thinking' && (
        <p className="voice__thinking" data-testid="voice-thinking">Making sense of that…</p>
      )}

      {phase !== 'preview' && phase !== 'thinking' && (
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
                       if (v) void runParse(v);
                     }
                   }} />
          </label>
          <button className="btn btn--ghost" data-testid="voice-parse-typed"
                  onClick={() => {
                    const el = document.querySelector<HTMLInputElement>('[data-testid=voice-text]');
                    const v = el?.value.trim();
                    if (v) void runParse(v);
                  }}>Preview</button>

          {error && <p className="voice__err" data-testid="voice-error">{error}</p>}
        </>
      )}

      {phase === 'preview' && (
        <>
          <p className="voice__heard" data-testid="voice-transcript">“{transcript}”</p>
          <div className="voice__srcrow">
            <h3 className="sect">Is this correct?</h3>
            <span className={'voice__src' + (source === 'groq' ? ' voice__src--ai' : '')}
                  data-testid="voice-source"
                  title={fallbackReason ? 'AI unavailable: ' + fallbackReason : undefined}>
              {source === 'groq' ? 'AI' : 'basic'}
            </span>
          </div>

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
              {it.count > 1 && (
                <span className="vrow__count num" data-testid={`vcount-${it.id}`}>
                  ×{it.count}
                </span>
              )}
              {it.kind === 'bad-habit' && (
                <span className={'vrow__avoid' + (it.avoided ? ' vrow__avoid--ok' : '')}
                      data-testid={`vavoid-${it.id}`}
                      title={it.avoided
                        ? 'You avoided this — nothing will be logged'
                        : 'You did this — a penalty will be logged'}>
                  {it.avoided ? 'avoided' : 'slipped'}
                </span>
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
