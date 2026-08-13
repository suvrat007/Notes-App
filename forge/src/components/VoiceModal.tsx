import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import { IconMic } from './icons';
import { useForge } from '../store/useForge';
import { startListening, stopListening, isVoiceSupported, VoiceError } from '../lib/voice';
import { type ParsedItem, type IntentKind } from '../engine/parseVoice';
import { parseIntents, isGroqConfigured, type ParseSource } from '../lib/intent';
import { parseCommands } from '../lib/intent/parseCommands';
import type { Command } from '../lib/intent/commands';
import { todayStr, addDays, weekStartOf } from '../lib/dates';
import { toast } from '../store/useToast';
import { navigateTo } from '../store/useNav';
import {
  isGroqSttAvailable, startRecording, transcribe,
  MAX_RECORDING_MS, RECORDING_WARN_MS, type Recording,
} from '../lib/speech/groqStt';

export type VoiceMode = 'log' | 'command';

type Props = {
  onClose: () => void;
  mode?: VoiceMode;
  /** Command mode can ask the app to change screens. */
  onNavigate?: (screen: string) => void;
  /**
   * What the user already chose on the floating button. The sheet acts on it
   * on mount instead of presenting the same choice a second time.
   */
  autoStart?: 'speak' | 'type';
};

const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const KIND_LABEL: Record<IntentKind, string> = {
  habit: 'Habit rep',
  'bad-habit': 'Slip',
  task: 'Task',
  redeem: 'Redeem',
  'new-habit': 'New habit',
};

export default function VoiceModal({
  onClose, mode: initialMode = 'log', onNavigate, autoStart,
}: Props) {
  const { habits, rewards, commitVoiceItems, appState, upcomingTasks, applyCommands } = useForge();
  const [mode, setMode] = useState<VoiceMode>(initialMode);
  const [commands, setCommands] = useState<Command[]>([]);
  const supported = isVoiceSupported();
  // AI parsing is opt-out via Settings, and only possible when a key is built in.
  const useAi = (appState?.settings.aiParsing ?? true) && isGroqConfigured();

  const [phase, setPhase] = useState<'idle' | 'listening' | 'thinking' | 'preview'>('idle');
  const [source, setSource] = useState<ParseSource>('rules');
  const [fallbackReason, setFallbackReason] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [recording, setRecording] = useState<Recording | null>(null);
  // Groq transcription is preferred: Web Speech depends on reaching Google's
  // servers, which is the failure users actually hit.
  const useGroqStt = isGroqSttAvailable();
  // Destination chips only make sense once Google is actually connected.
  const googleReady = !!appState?.settings.googleConnected;
  const [elapsed, setElapsed] = useState(0);

  // Live elapsed readout while recording. Without it the hard cap arrives with
  // no warning, and there is no way to tell capture is still running.
  useEffect(() => {
    if (!recording) { setElapsed(0); return; }
    const tick = () => setElapsed(Date.now() - recording.startedAt);
    tick();
    const id = window.setInterval(tick, 250);
    return () => clearInterval(id);
  }, [recording]);

  // Acts on the FAB's choice exactly once per mount.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStarted.current) return;
    autoStarted.current = true;
    if (autoStart === 'type') {
      window.setTimeout(
        () => document.querySelector<HTMLInputElement>('[data-testid=voice-text]')?.focus(),
        80,
      );
    } else {
      void (useGroqStt ? toggleRecording() : listen());
    }
    // Intentionally mount-only: re-running would restart a live recording.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const remaining = Math.max(0, MAX_RECORDING_MS - elapsed);
  const nearLimit = !!recording && remaining <= RECORDING_WARN_MS;
  const clock = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const weekStartDay = appState?.settings.weekResetDay ?? 1;
  const ctx = {
    habits: habits.map((h) => ({ id: h.id, name: h.name, polarity: h.polarity })),
    rewards: rewards.map((r) => ({ id: r.id, name: r.name })),
    today: todayStr(),
    tomorrow: addDays(todayStr(), 1),
    // Anchors so a deadline like "this week" resolves to a real date rather
    // than collapsing to tomorrow.
    todayName: dayNames[new Date().getDay()],
    weekEnd: addDays(weekStartOf(todayStr(), weekStartDay), 6),
    nextWeekEnd: addDays(weekStartOf(todayStr(), weekStartDay), 13),
    weekStartDay,
  };

  /** Commands act on rows that exist, so they see tasks as well as habits. */
  const cmdCtx = {
    habits: habits.map((h) => ({ id: h.id, name: h.name, polarity: h.polarity })),
    tasks: upcomingTasks.map((t) => ({ id: t.id, name: t.name })),
  };

  /** The two pipelines share this shell and nothing else — different prompt,
      different validation, different commit path. */
  const runParse = async (text: string) => {
    setTranscript(text);
    // The AI pass is a network call; show it rather than appearing frozen.
    setPhase(useAi ? 'thinking' : 'preview');

    if (mode === 'command') {
      const out = await parseCommands(text, cmdCtx, { useAi });
      setCommands(out.items);
      setItems([]);
      setSource(out.source);
      setFallbackReason(out.fallbackReason);
      if (out.items.length === 0) {
        toast.info("Couldn't turn that into a change. Try “move gym to the top”.");
      }
      setPhase('preview');
      return;
    }

    const out = await parseIntents(text, ctx, { useAi });
    setItems(out.items);
    setCommands([]);
    setSource(out.source);
    setFallbackReason(out.fallbackReason);
    if (useAi && out.source === 'rules' && out.fallbackReason) {
      toast.info('Smart parsing unavailable — sorted it on-device instead. Check the rows below.');
    }
    setPhase('preview');
  };

  /** Errors surface as a toast only — showing the same text twice is noise. */
  const failVoice = (e: unknown) => {
    const msg = e instanceof VoiceError
      ? e.message
      : 'Voice failed. Type it below instead.';
    toast.error(msg, {
      label: 'Type it',
      onClick: () => document.querySelector<HTMLInputElement>('[data-testid=voice-text]')?.focus(),
    });
    if (!(e instanceof VoiceError)) console.error('voice:', e);
    setPhase('idle');
  };

  /**
   * Groq path: record locally, then upload the clip. Preferred over Web Speech
   * because Web Speech depends on reaching Google's own servers, which is the
   * failure users actually hit.
   */
  /** Stop capture, upload the clip, and parse whatever came back. */
  const finishRecording = async (rec: Recording) => {
    setRecording(null);
    setPhase('thinking');
    try {
      const clip = await rec.stop();
      const text = await transcribe(clip);
      await runParse(text);
    } catch (e) {
      failVoice(e);
    }
  };

  const toggleRecording = async () => {
    if (recording) {
      await finishRecording(recording);
      return;
    }

    try {
      setPhase('listening');
      const rec = await startRecording({
        onAutoStop: () => {
          toast.info(
            `Recording stopped at the ${Math.round(MAX_RECORDING_MS / 1000)}s limit — `
              + 'transcribing what was captured.',
          );
          void finishRecording(rec);
        },
      });
      setRecording(rec);
    } catch (e) {
      failVoice(e);
    }
  };

  /** Web Speech path: one-shot, browser-managed. */
  const listen = async () => {
    setPhase('listening');
    try {
      const text = await startListening();
      if (!text.trim()) {
        toast.error("Didn't catch anything. Try again, or type it below.", {
          label: 'Type it',
          onClick: () =>
            document.querySelector<HTMLInputElement>('[data-testid=voice-text]')?.focus(),
        });
        setPhase('idle');
        return;
      }
      await runParse(text);
    } catch (e) {
      failVoice(e);
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
      if (kind === 'new-habit') {
        return { ...it, kind, refId: null, dueDate: null, polarity: it.polarity ?? 'good' };
      }
      const h = ctx.habits.find((x) => it.raw.toLowerCase().includes(x.name.toLowerCase()));
      // Nothing existing matches, so asking for "Habit" means they want a NEW
      // one — otherwise the row would be stuck permanently unresolvable.
      if (!h) {
        return {
          ...it,
          kind: 'new-habit',
          refId: null,
          dueDate: null,
          polarity: kind === 'bad-habit' ? 'bad' : 'good',
        };
      }
      return { ...it, kind, refId: h.id, dueDate: null };
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

  const runCommands = async () => {
    setSaving(true);
    try {
      const { done, failed, navigateTo: target } = await applyCommands(commands);
      if (failed > 0) {
        toast.error(`${done} change${done === 1 ? '' : 's'} applied, ${failed} failed.`);
      } else {
        toast.success(`${done} change${done === 1 ? '' : 's'} applied.`);
      }
      // Navigate through the store: this modal is mounted by whichever screen
      // the user was on, which has no access to the app-level screen state.
      if (target) { navigateTo(target); onNavigate?.(target); }
      onClose();
    } catch {
      setSaving(false);
      toast.error('Could not apply those changes. Nothing was altered — try again.');
    }
  };

  /** An item that needs a ref but has none can't be committed. */
  const unresolved = items.filter(
    // A new habit has no ref by definition — it does not exist yet.
    (it) => it.kind !== 'task' && it.kind !== 'new-habit' && !it.refId,
  );

  /*
   * A new BAD habit with no stated limit. Defaulting to 0 would silently make
   * every single rep cost the overage penalty, which is a big hidden decision
   * to take on someone's behalf — so ask instead of guessing.
   */
  const needsLimit = items.filter(
    (it) => it.kind === 'new-habit'
      && it.polarity === 'bad'
      && (it.dailyAllowance === null || it.dailyAllowance === undefined),
  );
  const canCommit = mode === 'command'
    ? commands.length > 0
    : items.length > 0 && unresolved.length === 0 && needsLimit.length === 0;

  return (
    <Modal title="Voice" onClose={() => { stopListening(); onClose(); }} testId="voice-modal">
      {phase === 'thinking' && (
        <p className="voice__thinking" data-testid="voice-thinking">Making sense of that…</p>
      )}

      {phase !== 'preview' && phase !== 'thinking' && (
        <>
          {/* Two pipelines, chosen explicitly. Auto-detecting would risk
              reading "gym" (log a rep) as "move gym" (reorder), and a wrong
              ledger entry is the one mistake FORGE must not make. */}
          <div className="seg" style={{ marginBottom: 14 }}>
            <button type="button" data-testid="vmode-log"
                    className={'seg__opt' + (mode === 'log' ? ' seg__opt--on' : '')}
                    onClick={() => setMode('log')}>Log my day</button>
            <button type="button" data-testid="vmode-command"
                    className={'seg__opt' + (mode === 'command' ? ' seg__opt--on' : '')}
                    onClick={() => setMode('command')}>Command</button>
          </div>

          {useGroqStt && phase !== 'listening' && (
            <p className="voice__limit" data-testid="rec-limit">
              You can speak for up to {Math.round(MAX_RECORDING_MS / 1000)} seconds.
            </p>
          )}

          {useGroqStt || supported ? (
            <button className={'btn btn--primary' + (phase === 'listening' ? ' btn--rec' : '')}
                    data-testid="voice-mic"
                    onClick={() => void (useGroqStt ? toggleRecording() : listen())}
                    disabled={!useGroqStt && phase === 'listening'}>
              {phase === 'listening'
                ? (useGroqStt
                    ? (
                      <>
                        Stop &amp; transcribe
                        {/* Counts DOWN: what matters is how long you have left,
                            not how long you've been going. */}
                        <span className={'btn__clock num' + (nearLimit ? ' btn__clock--low' : '')}
                              data-testid="rec-clock">
                          {clock(remaining)}
                        </span>
                      </>
                    )
                    : 'Listening…')
                : <><IconMic size={18} /> Start speaking</>}
            </button>
          ) : (
            <p className="reward__note" data-testid="voice-unsupported">
              Speech recognition isn't available in this browser — type it instead.
            </p>
          )}

          {nearLimit && (
            <p className="voice__warn" data-testid="rec-warn">
              {clock(remaining)} left — recording stops and transcribes automatically.
            </p>
          )}

          <label className="field" style={{ marginTop: 16 }}>
            <span className="field__label">Or type it</span>
            <input className="input" data-testid="voice-text"
                   placeholder={mode === 'command'
                     ? 'move gym to the top, archive TV'
                     : 'tomorrow gym, read 20 pages, no TV'}
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
                  }}>{mode === 'command' ? 'Preview changes' : 'Preview items'}</button>

          <p className="voice__note" data-testid="voice-note">
            You will see exactly what will happen, and can edit it, before anything is saved.
          </p>
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

          {mode === 'command' && commands.length === 0 && (
            <p className="empty" data-testid="cmd-empty">
              Nothing actionable in that. Try “move gym to the top”,
              “archive TV” or “go to stats”.
            </p>
          )}

          {mode === 'command' && commands.map((c) => (
            <div className="vrow crow" key={c.id} data-testid={`crow-${c.id}`}
                 data-kind={c.kind}>
              <span className="crow__kind">{c.kind}</span>
              <span className="crow__label" data-testid={`clabel-${c.id}`}>{c.label}</span>
              <button className="task__del" aria-label="Remove"
                      data-testid={`cdrop-${c.id}`}
                      onClick={() => setCommands((p) => p.filter((x) => x.id !== c.id))}>✕</button>
            </div>
          ))}

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
                <span className="vrow__due">
                  {it.dueDate === ctx.today ? 'today'
                    : it.dueDate === ctx.tomorrow ? 'tmrw'
                    : it.dueDate.slice(5)}
                  {it.dueTime && <span className="vrow__time"> {it.dueTime}</span>}
                </span>
              )}

              {/* Where it goes in the user's Google account. Suggested by the
                  model, but never written without them confirming here. */}
              {it.kind === 'task' && googleReady && (
                <span className="vrow__dest">
                  {(['calendar', 'tasks'] as const).map((t) => {
                    const on = (it.syncTargets ?? []).includes(t);
                    return (
                      <button
                        key={t}
                        className={'vrow__destbtn' + (on ? ' vrow__destbtn--on' : '')}
                        data-testid={`vdest-${t}-${it.id}`}
                        aria-pressed={on}
                        title={t === 'calendar'
                          ? 'Add to Google Calendar'
                          : 'Add to Google Tasks'}
                        onClick={() => setItems((prev) => prev.map((x) => {
                          if (x.id !== it.id) return x;
                          const cur = x.syncTargets ?? [];
                          return {
                            ...x,
                            syncTargets: on
                              ? cur.filter((v) => v !== t)
                              : [...cur, t],
                          };
                        }))}
                      >
                        {t === 'calendar' ? 'Cal' : 'Tasks'}
                      </button>
                    );
                  })}
                </span>
              )}
              {it.count > 1 && it.kind !== 'new-habit' && (
                <span className="vrow__count num" data-testid={`vcount-${it.id}`}>
                  ×{it.count}
                </span>
              )}
              {it.kind === 'new-habit' && it.polarity === 'bad' && (
                <span className="vrow__limit">
                  <input
                    className="vrow__limitinput"
                    type="number"
                    min={0}
                    max={99}
                    placeholder="?"
                    value={it.dailyAllowance ?? ''}
                    data-testid={`vlimit-${it.id}`}
                    aria-label={`How many ${it.text} are allowed per day`}
                    title="How many a day are allowed before it costs extra?"
                    onChange={(e) => {
                      const raw = e.target.value;
                      setItems((prev) => prev.map((x) => (x.id === it.id
                        ? {
                          ...x,
                          dailyAllowance: raw === ''
                            ? null
                            : Math.max(0, Math.min(99, Number(raw))),
                        }
                        : x)));
                    }}
                  />
                  <span className="vrow__limitlabel">/day</span>
                </span>
              )}
              {it.kind === 'new-habit' && (
                <button
                  className={'vrow__pol' + (it.polarity === 'bad' ? ' vrow__pol--bad' : '')}
                  data-testid={`vpol-${it.id}`}
                  title="Switch between building this up and cutting it down"
                  onClick={() => setItems((prev) => prev.map((x) => (
                    x.id === it.id
                      ? { ...x, polarity: x.polarity === 'bad' ? 'good' : 'bad' }
                      : x)))}
                >
                  {it.polarity === 'bad' ? 'break' : 'build'}
                </button>
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

          {needsLimit.length > 0 && (
            <p className="voice__ask" data-testid="voice-needslimit">
              How many a day is your limit for 
              {needsLimit.map((x) => x.text).join(', ')}? Enter 0 to allow none.
            </p>
          )}

          {unresolved.length > 0 && (
            <p className="voice__err" data-testid="voice-unresolved">
              {unresolved.length} item(s) don't match a known habit or reward — change
              them to Task or remove them.
            </p>
          )}

          <button className="btn btn--primary" disabled={!canCommit || saving}
                  data-testid="voice-ok"
                  onClick={() => void (mode === 'command' ? runCommands() : commit())}>
            {mode === 'command'
              ? `OK — apply ${commands.length} change${commands.length === 1 ? '' : 's'}`
              : `OK — commit ${items.length} item${items.length === 1 ? '' : 's'}`}
          </button>
          <button className="btn btn--ghost" data-testid="voice-back"
                  onClick={() => setPhase('idle')}>Start over</button>
        </>
      )}
    </Modal>
  );
}
