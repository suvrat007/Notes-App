import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Mic, Square, Loader2 } from 'lucide-react';
import api from '../utils/api';
import {
  startRecording, transcribe, parseSpokenDay, isRecordingSupported, isGroqConfigured,
  MAX_RECORDING_MS, RECORDING_WARN_MS, VoiceError,
} from '../utils/voice';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const KIND_LABEL = {
  habit: 'Habit rep',
  task: 'Task',
  'new-habit': 'New habit',
  'new-reward': 'New reward',
};

const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Say your day; see exactly what will happen; then confirm.
 *
 * The preview is the whole point. Speech recognition mis-hears, and a wrong
 * habit rep is a wrong entry in the ledger the game is scored on — so nothing
 * is written until the user has looked at it and said yes.
 */
const VoiceModal = ({ habits = [], onClose, refreshData, showToast }) => {
  const [phase, setPhase] = useState('idle'); // idle | listening | thinking | preview | saving
  const [transcript, setTranscript] = useState('');
  const [items, setItems] = useState([]);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [recording, setRecording] = useState(null);
  const [elapsed, setElapsed] = useState(0);

  const canRecord = isRecordingSupported();

  // Live countdown, or the hard cap arrives with no warning.
  useEffect(() => {
    if (!recording) { setElapsed(0); return; }
    const tick = () => setElapsed(Date.now() - recording.startedAt);
    tick();
    const id = window.setInterval(tick, 250);
    return () => clearInterval(id);
  }, [recording]);

  const remaining = Math.max(0, MAX_RECORDING_MS - elapsed);
  const nearLimit = !!recording && remaining <= RECORDING_WARN_MS;

  const fail = (e) => {
    setError(e instanceof VoiceError ? e.message : 'Something went wrong. Type it instead.');
    setPhase('idle');
    setRecording(null);
  };

  const runParse = async (text) => {
    setTranscript(text);
    setPhase('thinking');
    try {
      const parsed = await parseSpokenDay(text, { habits });
      if (parsed.length === 0) {
        setError("Couldn't find anything to log in that. Try naming what you did.");
        setPhase('idle');
        return;
      }
      setItems(parsed);
      setPhase('preview');
    } catch (e) {
      fail(e);
    }
  };

  const finish = async (rec) => {
    setRecording(null);
    setPhase('thinking');
    try {
      const clip = await rec.stop();
      const text = await transcribe(clip);
      await runParse(text);
    } catch (e) {
      fail(e);
    }
  };

  const toggleRecording = async () => {
    setError('');
    if (recording) { await finish(recording); return; }
    try {
      setPhase('listening');
      const rec = await startRecording({
        onAutoStop: () => {
          showToast?.('Stopped at the 60s limit — transcribing what was captured.');
          void finish(rec);
        },
      });
      setRecording(rec);
    } catch (e) {
      fail(e);
    }
  };

  const setItem = (id, patch) =>
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  /** A bad habit with no stated limit must be answered before anything saves. */
  const needsLimit = items.some(
    (i) => i.kind === 'new-habit' && i.polarity === 'bad' && i.dailyAllowance === null,
  );

  const commit = async () => {
    setPhase('saving');
    try {
      for (const it of items) {
        if (it.kind === 'habit' && it.refId) {
          for (let i = 0; i < it.count; i++) {
            await api.post(`/habits/${it.refId}/log`, {});
          }
        } else if (it.kind === 'new-habit') {
          await api.post('/habits', {
            name: it.text,
            polarity: it.polarity,
            dailyAllowance: it.polarity === 'bad' ? (it.dailyAllowance ?? 0) : 0,
            targetReps: it.polarity === 'good' ? it.targetReps : 0,
            targetPeriodWeeks: it.targetPeriodWeeks,
          });
        } else if (it.kind === 'new-reward') {
          await api.post('/rewards', { name: it.text, damagePct: it.damagePct });
        } else {
          await api.post('/tasks', {
            title: it.text,
            type: 'occasional',
            targetCount: it.count,
            baseReward: 10,
            targetDate: it.dueDate,
          });
        }
      }
      await refreshData();
      showToast?.(`Logged ${items.length} item${items.length === 1 ? '' : 's'}`);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save all of that.');
      setPhase('preview');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-5">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-[#16191e] border border-white/10 rounded-2xl p-7 w-full max-w-[460px] relative max-h-[88vh] overflow-y-auto"
        data-testid="voice-modal"
      >
        <button
          onClick={() => { recording?.cancel(); onClose(); }}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/60 hover:text-white transition-colors"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <h2 className="font-heading font-bold text-lg text-white mb-1">SPEAK YOUR DAY</h2>
        <p className="text-xs text-white/50 mb-6">
          Say what you did. You'll see exactly what happens before anything saves.
        </p>

        {error && (
          <p className="text-focus-red text-xs mb-5" data-testid="voice-error">{error}</p>
        )}

        {phase !== 'preview' && (
          <>
            {canRecord ? (
              <>
                <Button
                  type="button"
                  onClick={toggleRecording}
                  disabled={phase === 'thinking'}
                  data-testid="voice-mic"
                  className={`w-full h-14 rounded-xl font-bold tracking-widest text-xs ${
                    recording
                      ? 'bg-focus-red hover:bg-focus-red text-white'
                      : 'bg-[#c0b3a5] hover:bg-[#cfc4b8] text-black'
                  }`}
                >
                  {phase === 'thinking' ? (
                    <><Loader2 size={16} className="mr-2 animate-spin" /> THINKING...</>
                  ) : recording ? (
                    <><Square size={14} className="mr-2" /> STOP · {clock(elapsed)}</>
                  ) : (
                    <><Mic size={16} className="mr-2" /> START SPEAKING</>
                  )}
                </Button>
                {/* The cap is stated BEFORE the first tap, not sprung at the
                    end of it. Someone planning to reel off a whole day needs
                    to know they have a minute before they start talking. */}
                {recording ? (
                  <div className="mt-3" data-testid="rec-clock">
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-[width] duration-200 ${
                          nearLimit ? 'bg-focus-red' : 'bg-[#c0b3a5]'
                        }`}
                        style={{ width: `${(remaining / MAX_RECORDING_MS) * 100}%` }}
                      />
                    </div>
                    <p className={`text-[10px] mt-2 text-center ${nearLimit ? 'text-focus-red font-bold' : 'text-white/40'}`}>
                      {clock(remaining)} left — recording stops and transcribes automatically.
                    </p>
                  </div>
                ) : phase !== 'thinking' && (
                  <p className="text-[10px] mt-2 text-center text-white/40" data-testid="rec-limit">
                    You can speak for up to {Math.round(MAX_RECORDING_MS / 1000)} seconds.
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-white/50 mb-4" data-testid="voice-unavailable">
                {isGroqConfigured()
                  ? 'This browser has no microphone available. Type it instead.'
                  : 'Set VITE_GROQ_API_KEY to enable speech. You can still type it.'}
              </p>
            )}

            <div className="mt-6">
              <label className="text-[10px] font-bold text-white/60 tracking-widest uppercase">
                Or type it
              </label>
              <div className="flex gap-2 mt-2">
                <Input
                  type="text"
                  placeholder="went to the gym twice, read 20 pages"
                  data-testid="voice-text"
                  className="bg-[#0d0f12] border-white/10 text-white placeholder:text-white/30 h-11 flex-1"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && typed.trim()) runParse(typed.trim()); }}
                />
                <Button
                  type="button"
                  disabled={!typed.trim() || phase === 'thinking'}
                  onClick={() => runParse(typed.trim())}
                  data-testid="voice-parse-typed"
                  className="h-11 px-4 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-md"
                >
                  PREVIEW
                </Button>
              </div>
            </div>
          </>
        )}

        {phase === 'preview' && (
          <>
            <p className="text-xs text-white/50 italic mb-4" data-testid="voice-transcript">
              “{transcript}”
            </p>

            <div className="space-y-2.5">
              {items.map((it) => (
                <div key={it.id}
                     className="bg-black/40 border border-white/5 rounded-xl p-3"
                     data-testid={`vrow-${it.id}`} data-kind={it.kind}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[9px] font-black tracking-widest uppercase text-[#c0b3a5] shrink-0">
                      {KIND_LABEL[it.kind]}
                    </span>
                    <input
                      className="flex-1 min-w-0 bg-transparent text-sm text-white font-bold outline-none"
                      value={it.text}
                      data-testid={`vtext-${it.id}`}
                      onChange={(e) => setItem(it.id, { text: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => setItems((p) => p.filter((x) => x.id !== it.id))}
                      className="text-white/30 hover:text-focus-red shrink-0"
                      aria-label="Drop this"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-white/50">
                    {it.count > 1 && <span>×{it.count}</span>}
                    {it.kind === 'task' && <span>due {it.dueDate}</span>}
                    {it.kind === 'new-habit' && (
                      <span className={it.polarity === 'bad' ? 'text-focus-red' : 'text-[#c0b3a5]'}>
                        {it.polarity === 'bad' ? 'break' : 'build'}
                      </span>
                    )}
                    {it.kind === 'new-habit' && it.polarity === 'good' && it.targetReps > 0 && (
                      <span>goal {it.targetReps}/period</span>
                    )}
                    {it.kind === 'new-reward' && <span>{it.damagePct}% damage</span>}

                    {/* Never guessed. An invented limit silently changes what
                        every future slip costs. */}
                    {it.kind === 'new-habit' && it.polarity === 'bad' && (
                      <span className="flex items-center gap-1.5">
                        daily limit
                        <input
                          type="number" min={0}
                          data-testid={`vlimit-${it.id}`}
                          placeholder="?"
                          value={it.dailyAllowance ?? ''}
                          onChange={(e) => setItem(it.id, {
                            dailyAllowance: e.target.value === '' ? null : Number(e.target.value),
                          })}
                          className="w-12 bg-[#0d0f12] border border-white/10 rounded px-1.5 py-0.5 text-white text-[10px]"
                        />
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {needsLimit && (
              <p className="text-[11px] text-focus-red mt-4" data-testid="voice-needslimit">
                Set a daily limit for the habit you want to break — how many before it starts costing extra?
              </p>
            )}

            <Button
              type="button"
              disabled={items.length === 0 || needsLimit || phase === 'saving'}
              onClick={commit}
              data-testid="voice-ok"
              className="w-full h-12 mt-6 bg-[#c0b3a5] hover:bg-[#cfc4b8] text-black font-bold tracking-widest text-xs rounded-xl disabled:opacity-40"
            >
              {phase === 'saving' ? 'SAVING...' : `OK — APPLY ${items.length} ITEM${items.length === 1 ? '' : 'S'}`}
            </Button>
            <button
              type="button"
              onClick={() => { setPhase('idle'); setItems([]); setTranscript(''); }}
              className="w-full h-11 mt-3 border border-white/10 text-white/60 rounded-xl text-xs font-bold tracking-widest hover:text-white transition-colors"
              data-testid="voice-restart"
            >
              START OVER
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default VoiceModal;
