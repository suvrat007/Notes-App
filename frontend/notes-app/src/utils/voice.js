/**
 * Speak your day, and let the app work out what you meant.
 *
 * Two Groq calls: Whisper turns the clip into text, then a chat model turns the
 * text into structured habits and tasks. Both run in the BROWSER, which is
 * deliberate — the key is already a public client-side key, and routing audio
 * through our own server would add a hop and a storage question for no gain.
 *
 * Everything it produces is a PREVIEW. Nothing is created until the user says
 * so, because a mis-heard word should cost a glance, never a wrong entry in a
 * ledger the whole game is scored on.
 */

const CHAT_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const STT_ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';

const STT_MODEL = 'whisper-large-v3-turbo';
/** Best quality; the 8b model is the fallback when this one is rate-limited. */
const CHAT_MODEL = 'llama-3.3-70b-versatile';
const FALLBACK_MODEL = 'llama-3.1-8b-instant';

/** A forgotten recording should not run forever. Shown as a countdown. */
export const MAX_RECORDING_MS = 60_000;
export const RECORDING_WARN_MS = 15_000;

export const groqKey = () => (import.meta.env.VITE_GROQ_API_KEY || '').trim();
export const isGroqConfigured = () => groqKey().length > 0;

export class VoiceError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function isRecordingSupported() {
  return (
    isGroqConfigured()
    && typeof MediaRecorder !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
  );
}

/** A container Groq accepts that this browser can actually produce. */
function pickMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  return candidates.find((t) => MediaRecorder.isTypeSupported?.(t));
}

/**
 * Start recording. Returns a handle; call stop() to get the clip.
 * MUST come from a user gesture — the mic permission prompt requires one.
 */
export async function startRecording({ onAutoStop } = {}) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    if (e?.name === 'NotAllowedError') {
      throw new VoiceError('denied', "Microphone access is blocked. Allow it in your browser's site settings, or type it instead.");
    }
    throw new VoiceError('no-mic', 'No microphone available. Type it instead.');
  }

  const mimeType = pickMimeType();
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  const release = () => stream.getTracks().forEach((t) => t.stop());

  rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const stopped = new Promise((resolve) => {
    rec.onstop = () => {
      release();
      resolve(new Blob(chunks, { type: mimeType ?? 'audio/webm' }));
    };
  });

  rec.start();
  const startedAt = Date.now();
  const guard = window.setTimeout(() => {
    if (rec.state === 'recording') {
      rec.stop();
      // Tell the caller, or the UI keeps inviting speech into a dead recorder.
      onAutoStop?.();
    }
  }, MAX_RECORDING_MS);

  return {
    startedAt,
    stop: () => {
      clearTimeout(guard);
      if (rec.state === 'recording') rec.stop();
      return stopped;
    },
    cancel: () => {
      clearTimeout(guard);
      rec.onstop = null;   // so `stopped` never resolves into a transcribe
      if (rec.state === 'recording') rec.stop();
      release();
    },
  };
}

/** Send a clip to Whisper. */
export async function transcribe(clip) {
  if (clip.size < 1200) {
    // Silence or a mis-tap. The API would bill for nothing.
    throw new VoiceError('no-speech', "Didn't catch anything. Try again, or type it instead.");
  }

  const form = new FormData();
  form.append('file', clip, 'speech.webm');
  form.append('model', STT_MODEL);
  form.append('response_format', 'json');
  form.append('temperature', '0');

  let res;
  try {
    res = await fetch(STT_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey()}` },
      body: form,
    });
  } catch {
    throw new VoiceError('network', 'Could not reach the transcription service. Check your connection, or type it instead.');
  }

  if (!res.ok) {
    if (res.status === 401) throw new VoiceError('auth', 'The Groq API key was rejected.');
    if (res.status === 429) throw new VoiceError('rate-limit', 'Transcription is rate-limited right now. Try again shortly.');
    throw new VoiceError('stt-failed', `Transcription failed (${res.status}).`);
  }

  const json = await res.json().catch(() => null);
  const text = String(json?.text ?? '').trim();
  // Whisper emits bare punctuation for silence.
  if (!text || !/[a-z0-9]/i.test(text)) {
    throw new VoiceError('no-speech', "Didn't catch anything. Try again, or type it instead.");
  }
  return text;
}

const SYSTEM = `You turn a spoken daily log into JSON for Focus, a habit + task tracker.

KINDS
habit      a rep of an EXISTING habit (refId required, from the list given)
task       a one-off with a finish line
new-habit  ongoing behaviour NOT in the list yet; refId null, set name + polarity
new-reward a treat to work TOWARDS, not something done; set name + damagePct

HABIT vs TASK
- Explicit wins: "as a habit", "daily", "every day" => habit. Always honour it.
- Never-finished (eat healthy, gym, quit smoking) => habit.
  Has an end state (finish 3 videos, call the bank) => task.
- A count of deliverables ("three videos") => TASK with count.
- A count over a PERIOD with no single deliverable ("ten workouts this week",
  "run 5 times a week") => new-habit with targetReps/targetPeriodWeeks, NOT a
  task. They may do several in a day and none the next; only a period goal says that.
- Matches an existing habit => habit with its refId. "Matches" means the SAME
  behaviour, not a loosely related one; otherwise new-habit with refId null.

GOOD vs BAD
- Framed as stopping/avoiding/cutting down ("I don't want to X", "quit X",
  "no more X") => polarity "bad". Never a task, never good.
- Name it after the BEHAVIOUR with the negation stripped:
  "I don't want to smoke" => "smoking".

FIELDS
refId          only from the supplied list, else null. Never invent one.
count          habit: reps done ("smoked twice"=2). task: units to finish. Default 1.
polarity       new-habit only: "good" or "bad".
dailyAllowance new-habit + bad: per-day limit before the extra penalty. null if unstated. NEVER guess.
targetReps     new-habit + good: reps per targetPeriodWeeks (1=week 4=month 12=quarter).
               "five times a week"=5/1. No goal => 0/1.
damagePct      new-reward only: 20, 40, 60, 80 or 100 by how big a deal it is.
               a coffee=20, a night out=40, a day off=60-80, a whole week off=100.
dueDate        tasks only, YYYY-MM-DD from the anchors given. A stated day carries
               forward to later items until a different one appears. If no timing was
               stated at all, use today, someone speaking into a daily tracker means now.

Never invent items. Never merge two distinct items.

Respond with ONLY this JSON:
{"items":[{"kind":"habit|task|new-habit|new-reward","text":string,"refId":string|null,"name":string|null,"polarity":"good|bad|null","count":number,"dailyAllowance":number|null,"targetReps":number,"targetPeriodWeeks":number,"damagePct":number,"dueDate":string|null}]}`;

async function chatJSON(messages, model) {
  const res = await fetch(CHAT_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${groqKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0,
      // Groq's JSON mode refuses unless the word appears in the messages;
      // guaranteeing it here means no caller can trip over that rule.
      response_format: { type: 'json_object' },
    }),
  });
  return res;
}

/**
 * Turn a transcript into a preview list.
 *
 * Falls back to the smaller model on a rate limit rather than failing: a slower
 * answer beats telling someone their day could not be logged.
 */
export async function parseSpokenDay(text, ctx) {
  if (!isGroqConfigured()) throw new VoiceError('no-key', 'AI parsing is not configured.');

  const today = new Date().toLocaleDateString('en-CA');
  const user = [
    `Today is ${today}.`,
    `Existing habits (use these refIds): ${JSON.stringify(
      (ctx.habits || []).map((h) => ({ refId: h._id, name: h.name, polarity: h.polarity })),
    )}`,
    '',
    `Transcript: "${text}"`,
    'Respond with json.',
  ].join('\n');

  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: user },
  ];

  let res = await chatJSON(messages, CHAT_MODEL);
  if (res.status === 429) res = await chatJSON(messages, FALLBACK_MODEL);

  if (!res.ok) {
    if (res.status === 401) throw new VoiceError('auth', 'The Groq API key was rejected.');
    if (res.status === 429) throw new VoiceError('rate-limit', 'AI parsing is rate-limited. Try again shortly.');
    throw new VoiceError('parse-failed', `Could not understand that (${res.status}).`);
  }

  const json = await res.json().catch(() => null);
  const raw = json?.choices?.[0]?.message?.content;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new VoiceError('parse-failed', 'The AI returned something unreadable. Try again.');
  }

  return coerce(parsed, ctx);
}

const KINDS = ['habit', 'task', 'new-habit', 'new-reward'];

/**
 * Validate the model's output into things we are willing to create.
 *
 * Anything that fails a check is DROPPED rather than guessed at. A wrong task
 * is a nuisance; a wrong habit rep is a wrong entry in the ledger the whole
 * game is scored on.
 */
function coerce(raw, ctx) {
  const list = Array.isArray(raw?.items) ? raw.items : [];
  const byId = new Map((ctx.habits || []).map((h) => [String(h._id), h]));

  return list.slice(0, 15).map((r, i) => {
    const kind = KINDS.includes(r.kind) ? r.kind : 'task';
    const refId = typeof r.refId === 'string' && byId.has(r.refId) ? r.refId : null;

    // A habit the model could not point at does not exist yet — offer to
    // create it rather than silently turning it into a to-do.
    const finalKind = kind === 'habit' && !refId ? 'new-habit' : kind;
    const label = String(r.name || r.text || '').trim().slice(0, 60);

    return {
      id: `v${i}`,
      kind: finalKind,
      text: label || 'Untitled',
      refId,
      count: Math.max(1, Math.min(50, Math.round(Number(r.count) || 1))),
      polarity: r.polarity === 'bad' ? 'bad' : 'good',
      // null is meaningful: it means "they never said", which the preview
      // turns into a question rather than inventing a limit.
      dailyAllowance: Number.isFinite(r.dailyAllowance)
        ? Math.max(0, Math.min(99, Math.round(r.dailyAllowance)))
        : null,
      targetReps: Number.isFinite(r.targetReps)
        ? Math.max(0, Math.min(500, Math.round(r.targetReps)))
        : 0,
      targetPeriodWeeks: [1, 2, 4, 12].includes(Number(r.targetPeriodWeeks))
        ? Number(r.targetPeriodWeeks) : 1,
      damagePct: [20, 40, 60, 80, 100].includes(Number(r.damagePct))
        ? Number(r.damagePct) : 20,
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(r.dueDate || '')
        ? r.dueDate
        : new Date().toLocaleDateString('en-CA'),
    };
  });
}
