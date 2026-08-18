import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Copy, Plus, Trash2, LogOut, Trophy, Repeat, Ban, Loader2, Mic, Square } from 'lucide-react';
import api from '../utils/api';
import RankBadge from './RankBadge';
import { SkeletonRows } from './Skeleton';
import {
  parseSpokenDay, transcribe, startRecording,
  isGroqConfigured, isRecordingSupported,
  MAX_RECORDING_MS, RECORDING_WARN_MS,
} from '../utils/voice';
import { toCrewItem, describeCrewItem } from '../utils/crewItem';

const todayKey = () => new Date().toLocaleDateString('en-CA');

const MEDAL = { 1: '#e0b062', 2: '#c8ccd4', 3: '#c08457' };

/**
 * One crew: who is winning, and what everyone agreed to do.
 *
 * The board is scored on shared tasks ONLY. Counting members' personal work
 * would rank whoever set themselves the most generous rewards, which measures
 * self-assessment rather than effort — so the tasks listed underneath are
 * exactly the tasks the numbers above came from, and that is worth being able
 * to see on the same screen.
 */
const CrewDetail = ({ crewId, onClose, onChanged, showToast }) => {
  const [crew, setCrew] = useState(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [parsing, setParsing] = useState(false);
  /** The live recorder, when one is running. */
  const [recording, setRecording] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  /** What the parser made of the sentence, held until it is confirmed. */
  const [draft, setDraft] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/social/crews/${crewId}`, { params: { date: todayKey() } });
      setCrew(res.data.crew);
    } catch (err) {
      showToast?.(err.response?.data?.message || 'Could not load that crew', 'error');
      onClose();
    }
  }, [crewId, showToast, onClose]);

  useEffect(() => { load(); }, [load]);

  const act = async (fn, msg) => {
    if (busy) return false;
    setBusy(true);
    try {
      const res = await fn();
      showToast?.(msg ?? res?.data?.message ?? 'Done');
      onChanged?.();
      return true;
    } catch (err) {
      showToast?.(err.response?.data?.message || 'That did not work', 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  /**
   * A sentence becomes a draft.
   *
   * Typed and spoken input converge here on purpose: the microphone only
   * saves someone the typing, and everything after — the parse, the readback,
   * the confirmation — should be identical either way.
   */
  const makeDraft = async (said) => {
    if (!said?.trim()) return;
    setTitle(said);

    if (!isGroqConfigured()) {
      // No parser configured: take it at face value as a plain daily habit
      // rather than refusing the whole feature.
      setDraft({ kind: 'habit', title: said.trim(), polarity: 'good',
        starsPerRep: 10, dailyTarget: 0, targetReps: 0,
        targetPeriodWeeks: 1, unit: '', shortfallPenalty: 10 });
      return;
    }

    setParsing(true);
    try {
      const items = await parseSpokenDay(said, { habits: [], tasks: [] });
      const first = (items || []).map(toCrewItem).find(Boolean);
      if (!first) showToast?.('Could not make an assignment out of that', 'error');
      else setDraft(first);
    } catch (err) {
      showToast?.(err.message || 'Could not read that', 'error');
    } finally {
      setParsing(false);
    }
  };

  /** Tap to start, tap to stop. Held recordings lose whatever was said. */
  const toggleMic = async () => {
    if (recording) {
      const rec = recording;
      setRecording(null);
      setParsing(true);
      try {
        const clip = await rec.stop();
        const text = await transcribe(clip);
        await makeDraft(text);
      } catch (err) {
        showToast?.(err.message || 'Could not hear that', 'error');
      } finally {
        setParsing(false);
      }
      return;
    }
    try {
      const rec = await startRecording({
        onAutoStop: () => showToast?.('Stopped at the 60s limit.'),
      });
      setRecording(rec);
    } catch (err) {
      showToast?.(err.message || 'No microphone available', 'error');
    }
  };

  /*
   * A countdown, because recording stops itself at the cap. Without it the
   * cut-off arrives unannounced mid-sentence and the half that was still
   * being said is simply gone.
   */
  useEffect(() => {
    if (!recording) { setElapsed(0); return undefined; }
    const tick = () => setElapsed(Date.now() - recording.startedAt);
    tick();
    const id = window.setInterval(tick, 250);
    return () => clearInterval(id);
  }, [recording]);

  const remaining = Math.max(0, MAX_RECORDING_MS - elapsed);
  const nearLimit = !!recording && remaining <= RECORDING_WARN_MS;
  const clock = `${Math.floor(remaining / 60000)}:${String(Math.floor(remaining / 1000) % 60).padStart(2, '0')}`;

  /*
   * A recorder left running when the sheet closes keeps the mic light on, so
   * it is cancelled on unmount — but ONLY on unmount.
   *
   * Depending on `recording` instead meant the cleanup fired every time the
   * value changed, including the setRecording(null) at the top of the stop
   * path. That cancelled the recorder a line before it was read, and cancel()
   * detaches onstop, so the promise being awaited never resolved: the spinner
   * ran forever and not one request was ever sent. A ref keeps the latest
   * recorder reachable without making the effect depend on it.
   */
  const recRef = useRef(null);
  useEffect(() => { recRef.current = recording; }, [recording]);
  useEffect(() => () => recRef.current?.cancel?.(), []);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(crew.inviteCode);
      showToast?.('Code copied');
    } catch {
      // A device that will not allow the copy still shows the code on screen.
      showToast?.(`Invite code: ${crew.inviteCode}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-end sm:items-center justify-center z-[1000] sm:p-5"
         onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ease: 'easeOut' }}
        onClick={(ev) => ev.stopPropagation()}
        data-testid="crew-detail"
        className="bg-[#16191e] border border-white/10 rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 w-full sm:max-w-[440px] relative max-h-[88vh] overflow-y-auto"
      >
        <button onClick={onClose} aria-label="Close"
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 grid place-items-center text-white/60 hover:text-white">
          <X size={16} />
        </button>

        {!crew ? (
          <SkeletonRows rows={4} />
        ) : (
          <>
            <h2 className="font-heading font-black text-lg text-white pr-10">{crew.name}</h2>

            <button
              onClick={copyCode}
              data-testid="copy-code"
              className="mt-2 inline-flex items-center gap-2 h-8 px-3 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:text-white transition-colors"
            >
              <span className="font-mono text-sm tracking-[0.25em]">{crew.inviteCode}</span>
              <Copy size={13} />
            </button>

            {/* ---- the board ---- */}
            <div className="flex items-center justify-between mt-6 mb-2">
              <h3 className="text-[11px] font-bold text-white/50 tracking-widest uppercase">This week</h3>
              {/* A solo crew pays nothing, and "1st takes +0★" reads as a bug
                  rather than as a rule. The line under the board explains it. */}
              {crew.topPrize > 0 && (
                <span className="text-[10px] text-[#e0b062] font-bold">1st takes +{crew.topPrize}★</span>
              )}
            </div>

            <div className="space-y-2" data-testid="crew-board">
              {crew.board.map((m) => (
                <div
                  key={m.userId}
                  data-testid={`board-${m.userId}`}
                  data-place={m.place}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 border ${
                    m.isMe ? 'bg-white/[0.07] border-white/20' : 'bg-black/40 border-white/5'
                  }`}
                >
                  <span className="w-5 text-center font-heading font-black text-sm tabular-nums shrink-0"
                        style={{ color: MEDAL[m.place] ?? 'rgba(255,255,255,0.3)' }}>
                    {m.place}
                  </span>
                  <RankBadge badge={m.rank.badge} color={m.rank.color} size="sm" title={m.rank.title} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">
                      {m.fullName}{m.isMe && <span className="text-white/40 font-normal"> · you</span>}
                    </p>
                    <p className="text-[11px] text-white/45 truncate">{m.rank.title} · Level {m.rank.level}</p>
                  </div>
                  <span className="font-heading font-black text-base tabular-nums shrink-0"
                        style={{ color: MEDAL[m.place] ?? 'rgba(255,255,255,0.3)' }}>
                    {m.stars}★
                  </span>
                </div>
              ))}
            </div>

            {crew.board.length < 2 && (
              <p className="text-[11px] text-white/35 mt-2">
                Nothing is paid out until someone else joins — a crew of one has no contest to win.
              </p>
            )}

            {/* ---- shared assignment ---- */}
            <div className="flex items-center justify-between mt-6 mb-2">
              <h3 className="text-[11px] font-bold text-white/50 tracking-widest uppercase">Shared assignment</h3>
              <span className="text-[10px] text-white/30">what the board scores</span>
            </div>

            <div className="space-y-2" data-testid="shared-items">
              {crew.sharedItems.map((s) => {
                const isTask = s.kind === 'task';
                const isBad = s.polarity === 'bad';
                // A promise to stop is the opposite of a promise to do, and
                // the row should not have to be read twice to tell which.
                const Icon = isTask ? Trophy : isBad ? Ban : Repeat;
                const accent = isBad ? 'text-[#e5484d]' : 'text-[#e0b062]';
                const tile = isBad ? 'bg-[#2a1a1a]' : 'bg-[#2a2419]';
                const edge = isBad ? 'border-l-[#e5484d]' : 'border-l-[#e0b062]';
                return (
                  <div key={s._id} data-testid={`shared-${s._id}`}
                    className={`flex items-center gap-2.5 bg-black/40 border border-white/5 border-l-[3px] ${edge} rounded-xl px-3 py-2.5`}>
                    <span className={`w-8 h-8 rounded-lg ${tile} grid place-items-center shrink-0`}>
                      <Icon size={13} className={accent} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{s.title}</p>
                      <p className="text-[11px] text-white/45 truncate">{describeCrewItem(s)}</p>
                    </div>
                    <button
                      onClick={() => act(async () => {
                        const r = await api.delete(`/social/crews/${crewId}/items/${s._id}`);
                        await load();
                        return r;
                      })}
                      aria-label={`Remove ${s.title}`}
                      className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-white/40 hover:text-[#e5484d] grid place-items-center shrink-0 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}

              {crew.sharedItems.length === 0 && (
                <p className="text-xs text-white/35 bg-black/20 border border-white/5 rounded-xl px-3 py-4 text-center">
                  Nothing agreed yet. Say what everyone is doing — "gym 5 times a week, once a day" —
                  and it lands on every member's own list.
                </p>
              )}
            </div>

            {/*
              One sentence in, a real habit or task out.
              A crew agrees to things in sentences — "gym 5 times a week, once
              a day", "no smoking, 2 max this week" — and asking for that
              through eight numbered fields is how a good idea becomes
              something nobody sets up. The same parser the voice flow already
              runs does the work, and the readback below is confirmed before
              anyone is committed to it.
            */}
            <form
              className="flex gap-2 mt-3"
              onSubmit={(ev) => { ev.preventDefault(); makeDraft(title); }}
            >
              <input
                value={title}
                onChange={(ev) => { setTitle(ev.target.value); setDraft(null); }}
                placeholder={recording
                  ? `Listening… ${clock} left`
                  : 'Everyone does gym 5 times a week, once a day'}
                maxLength={160}
                disabled={!!recording}
                aria-label="What everyone is doing"
                data-testid="shared-title"
                className="flex-1 min-w-0 h-10 bg-[#0d0f12] border border-white/10 rounded-xl px-3 text-sm text-white placeholder:text-white/25 disabled:opacity-60"
              />

              {/* Say it instead of typing it. Same parse, same readback. */}
              {isRecordingSupported() && (
                <button
                  type="button"
                  onClick={toggleMic}
                  disabled={parsing}
                  data-testid="shared-mic"
                  aria-label={recording ? 'Stop recording' : 'Say what everyone is doing'}
                  aria-pressed={!!recording}
                  className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 border transition-colors disabled:opacity-30 ${
                    recording
                      ? 'bg-[#e5484d] border-[#e5484d] text-white animate-pulse'
                      : 'bg-white/5 border-white/10 text-white/70 hover:text-white'
                  }`}
                >
                  {recording ? <Square size={14} fill="currentColor" /> : <Mic size={16} />}
                </button>
              )}

              {recording && (
                <span
                  data-testid="mic-timer"
                  aria-live="polite"
                  className={`self-center text-xs font-bold tabular-nums shrink-0 ${
                    nearLimit ? 'text-[#e5484d]' : 'text-white/50'
                  }`}
                >
                  {clock}
                </span>
              )}

              <button type="submit" disabled={busy || parsing || !!recording || !title.trim()}
                data-testid="shared-add"
                aria-label="Add to the assignment"
                className="w-10 h-10 rounded-xl bg-[#e0b062] text-black grid place-items-center disabled:opacity-30 shrink-0">
                {parsing ? <Loader2 size={16} className="animate-spin" /> : <Plus size={17} />}
              </button>
            </form>

            {/* What it understood, in words, before it is real. */}
            {draft && (
              <motion.div
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                data-testid="draft-preview"
                className="mt-2 bg-black/40 border border-[#e0b062]/30 rounded-xl px-3 py-2.5"
              >
                <p className="text-sm font-bold text-white">{draft.title}</p>
                <p className="text-[11px] text-white/50 mt-0.5">{describeCrewItem(draft)}</p>
                <div className="flex gap-2 mt-2.5">
                  <button
                    data-testid="draft-confirm"
                    disabled={busy}
                    onClick={async () => {
                      const done = await act(async () => {
                        const r = await api.post(`/social/crews/${crewId}/items`,
                          { ...draft, date: todayKey() });
                        await load();
                        return r;
                      });
                      if (done) { setTitle(''); setDraft(null); }
                    }}
                    className="flex-1 h-9 rounded-lg bg-[#e0b062] text-black text-xs font-bold tracking-wider disabled:opacity-40"
                  >
                    EVERYONE GETS THIS
                  </button>
                  <button
                    onClick={() => setDraft(null)}
                    aria-label="Discard"
                    className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 text-white/50 grid place-items-center shrink-0"
                  >
                    <X size={15} />
                  </button>
                </div>
              </motion.div>
            )}

            <button
              onClick={async () => {
                if (await act(() => api.post(`/social/crews/${crewId}/leave`))) onClose();
              }}
              data-testid="crew-leave"
              className="w-full h-10 mt-5 rounded-xl border border-[#e5484d]/30 text-[#e5484d] text-xs font-bold tracking-widest flex items-center justify-center gap-2 hover:bg-[#e5484d]/10 transition-colors"
            >
              <LogOut size={14} /> LEAVE CREW
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default CrewDetail;
