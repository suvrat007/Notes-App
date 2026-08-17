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
/*
 * Groq retires models, and when it does the old id stops existing rather than
 * degrading — the request 404s and every spoken update fails at once. The
 * llama pair that used to be here went exactly that way. If parsing suddenly
 * stops working, check this against the account's /v1/models list first.
 */
const CHAT_MODEL = 'openai/gpt-oss-120b';
const FALLBACK_MODEL = 'openai/gpt-oss-20b';

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

const SYSTEM = `You turn a spoken daily log into JSON for Forge, a habit + task tracker.

Two kinds of sentence arrive together and must be told apart:
an UPDATE reports what already happened; a PLAN sets something up for later.
"I did three of the five PDFs" is an update. "I need to read five PDFs" is a
plan. Past tense, "did", "finished", "managed", "only got through" => update.

KINDS
habit      a rep of an EXISTING habit that HAPPENED (refId required, from the list)
progress   work done on an EXISTING task (refId required, from the task list).
           count = units finished TODAY, not the running total. "I did 5 of the 8"
           => count 5. "finished it" / "all of them" => count = whatever remains.
skipped    something explicitly NOT done: "I didn't run", "no gym today",
           "didn't manage the reading". refId when it names something on either
           list. NOTHING is written for these; they are shown so the user can
           see they were understood, and so a mishearing is visible.
task       a NEW one-off with a finish line
new-habit  ongoing behaviour NOT in the list yet; refId null, set name + polarity
new-reward a treat to work TOWARDS, not something done; set name + damagePct

ONE SENTENCE THAT BOTH SETS UP AND REPORTS
A sentence can create a thing and log work against it in the same breath:
"start working 8 hours a day for a week, I did 6 today". The thing does not
exist yet, so there is no refId to point a separate habit item at. Emit ONE
new-habit and put the work already done in logNow:
  targetReps 56, targetPeriodWeeks 1, dailyTarget 8, unit "hours", logNow 6.
Never emit a second item for the same work - that would create it twice or
log against nothing. Only the amount stated as ALREADY DONE goes in logNow.

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
refId          only from the supplied lists, else null. Never invent one. A habit refId
               for kind habit/skipped-habit, a TASK refId for kind progress.
count          habit: reps done ("smoked twice"=2). task: units to finish. Default 1.
polarity       new-habit only: "good" or "bad".
dailyAllowance new-habit + bad: per-day limit before the extra penalty. null if unstated. NEVER guess.
targetReps     new-habit + good: reps per targetPeriodWeeks (1=week 4=month 12=quarter).
logNow         new-habit only: how much of it was ALREADY DONE today, when the same
  sentence sets the thing up and reports against it. 0 when nothing was
  reported as done. Never larger than what was actually stated.
dailyTarget    new-habit + good: reps expected in ONE DAY, when the sentence caps or
  sets a per-day amount. "gym 5 times a week, once a day" => targetReps 5,
  dailyTarget 1. "2 leetcode questions every day" => dailyTarget 2, targetReps 14.
  "8 hours of work a day" => dailyTarget 8, unit "hours", targetReps 56.
  0 when no per-day amount was stated.
               "five times a week"=5/1. No goal => 0/1.
damagePct      new-reward only: 20, 40, 60, 80 or 100 by how big a deal it is.
               a coffee=20, a night out=40, a day off=60-80, a whole week off=100.
dueDate        tasks only, YYYY-MM-DD from the anchors given. A stated day carries
               forward to later items until a different one appears. If no timing was
               stated at all, use today, someone speaking into a daily tracker means now.

deadline       tasks only. Set ONLY when a DEADLINE was stated: "by Friday", "before the
               weekend", "by the end of the week". This is the LAST day it may be done,
               not the day it happens. null when no deadline was given.
cadence        tasks with count>1. "daily" when the units are explicitly spread one per
               day ("walk every day for a week", "one chapter a day"). "anytime" when
               they can be done together ("read 5 pdfs"). null when it was not stated,
               which asks the user rather than guessing.

MEASURED GOALS
A goal with a QUANTITY is one goal measured in units, not that many separate
goals. "Run 10 kilometres this week" is ONE new-habit: targetReps 10, unit
"km", targetPeriodWeeks 1. It is NOT ten runs and NOT a task. Same shape for
"ten questions every month" (targetReps 10, unit "questions", period 4) and
"read 50 pages a week" (50, "pages", 1).
- unit is the thing being counted, lowercase and short: km, pages, questions,
  minutes, reps. Leave it empty when the thing counted is just doing it once
  ("gym five times a week" => targetReps 5, unit "").
- REPORTING progress on one of these is kind habit with its refId and
  count = the amount done: "I ran four kilometres" => count 4, not 1.
  "I did three questions" against a questions goal => count 3.
- Going OVER the target is allowed and normal. Never clamp the count to what
  is left; report what was actually done.

SWAPS
"I could not run 8 so I ran 5 and did 1000 skips instead" is a swap, not a
failure. Emit BOTH halves:
  1. kind habit, refId of the goal that was cut, count = what WAS done (5),
     and newTarget = that same number. newTarget tells the app to lower THIS
     period only, so the week reads as met at 5 instead of failed at 8.
  2. the substitute as its own item: an existing habit => kind habit with its
     refId and count; something new => new-habit with the count as targetReps.
Only set newTarget when the speaker says they FELL SHORT and did something
else instead. Doing less with no substitute is a plain habit log, and doing
MORE is never a swap.

Never invent items. Never merge two distinct items.

Respond with ONLY this JSON:
{"items":[{"kind":"habit|progress|skipped|task|new-habit|new-reward","text":string,"refId":string|null,"name":string|null,"polarity":"good|bad|null","count":number,"dailyAllowance":number|null,"targetReps":number,"dailyTarget":number,"logNow":number,"targetPeriodWeeks":number,"unit":string,"damagePct":number,"dueDate":string|null,"deadline":string|null,"cadence":"daily|anytime|null","newTarget":number|null}]}`;

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
    // Without the day's tasks there is no id to hang progress on, and every
    // "I did three of them" would create a second copy of a task that exists.
    `Today's tasks (use these refIds for kind progress): ${JSON.stringify(
      (ctx.tasks || []).map((t) => ({
        refId: t._id, title: t.title,
        done: t.doneCount ?? 0, target: t.targetCount ?? 1,
      })),
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
  // 404 means the model is gone, not that the sentence was bad, so the
  // smaller one is worth trying before giving up on the whole feature.
  if (res.status === 429 || res.status === 404) res = await chatJSON(messages, FALLBACK_MODEL);

  if (!res.ok) {
    if (res.status === 401) throw new VoiceError('auth', 'The Groq API key was rejected.');
    if (res.status === 429) throw new VoiceError('rate-limit', 'AI parsing is rate-limited. Try again shortly.');
    // Naming the cause, because "could not understand that" sends people
    // looking at their own sentence for a fault that is not there.
    if (res.status === 404) {
      throw new VoiceError('model-gone',
        `The AI model "${CHAT_MODEL}" is no longer available on this Groq account.`);
    }
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

const KINDS = ['habit', 'progress', 'skipped', 'task', 'new-habit', 'new-reward'];

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
  const taskById = new Map((ctx.tasks || []).map((t) => [String(t._id), t]));

  return list.slice(0, 15).map((r, i) => {
    const kind = KINDS.includes(r.kind) ? r.kind : 'task';

    /*
     * Progress points at a TASK, everything else at a habit, so the id is
     * checked against the right list. An id that matches neither is dropped:
     * logging work against the wrong thing is worse than asking again.
     */
    const wantsTask = kind === 'progress';
    const pool = wantsTask ? taskById : byId;
    const refId = typeof r.refId === 'string' && pool.has(r.refId) ? r.refId : null;

    // A habit the model could not point at does not exist yet — offer to
    // create it rather than silently turning it into a to-do. Progress with
    // no task behind it becomes a new task, which is the honest reading of
    // "I did some of X" when X is not on the list.
    let finalKind = kind;
    if (kind === 'habit' && !refId) finalKind = 'new-habit';
    if (kind === 'progress' && !refId) finalKind = 'task';

    const label = String(r.name || r.text || '').trim().slice(0, 60);
    const task = wantsTask && refId ? taskById.get(refId) : null;

    return {
      id: `v${i}`,
      kind: finalKind,
      text: label || 'Untitled',
      refId,
      /* What the row will become if applied, so the preview can say it
         plainly instead of making the user do the arithmetic. */
      taskBefore: task ? (task.doneCount ?? 0) : null,
      taskTarget: task ? (task.targetCount ?? 1) : null,
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
      // Reps expected in a single day, which is a different promise from the
      // period goal: "5 a week, once a day" is both, and means neither alone.
      dailyTarget: Number.isFinite(r.dailyTarget)
        ? Math.max(0, Math.min(99, Math.round(r.dailyTarget)))
        : 0,
      /*
       * Work already done, reported in the same sentence that set the thing
       * up. It cannot be a separate `habit` item because the habit has no id
       * until it is created, so it rides along and is logged straight after.
       */
      logNow: Number.isFinite(r.logNow)
        ? Math.max(0, Math.min(999, Math.round(r.logNow)))
        : 0,
      targetPeriodWeeks: [1, 2, 4, 12].includes(Number(r.targetPeriodWeeks))
        ? Number(r.targetPeriodWeeks) : 1,
      // Short, lowercase, and only ever a label: it is never parsed as a number.
      unit: String(r.unit || '').trim().toLowerCase().slice(0, 16),
      newTarget: Number.isFinite(Number(r.newTarget)) && Number(r.newTarget) >= 0
        ? Math.round(Number(r.newTarget))
        : null,
      damagePct: [20, 40, 60, 80, 100].includes(Number(r.damagePct))
        ? Number(r.damagePct) : 20,
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(r.dueDate || '')
        ? r.dueDate
        : new Date().toLocaleDateString('en-CA'),
      /*
       * A deadline is not a scheduled day. "Finish the report by Friday" means
       * it is owed every day between now and Friday, so it is kept apart from
       * the day the task starts on.
       */
      deadline: /^\d{4}-\d{2}-\d{2}$/.test(r.deadline || '') ? r.deadline : null,
      // null means "they never said", which the preview turns into a question.
      cadence: r.cadence === 'daily' || r.cadence === 'anytime' ? r.cadence : null,
    };
  });
}
