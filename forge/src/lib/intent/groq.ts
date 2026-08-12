/**
 * Groq-backed intent extraction.
 *
 * The rules parser in `engine/parseVoice.ts` remains the offline default and
 * the fallback for every failure here — this only ever *improves* a parse,
 * it can never be the reason voice stops working.
 *
 * SECURITY: Vite inlines `VITE_*` values into the client bundle. FORGE has no
 * server, so the key below ships inside the app and is readable by anyone who
 * can open it. That is acceptable only while this stays a personal install on
 * your own device. If FORGE is ever hosted publicly, move this call behind a
 * server route and delete the key from the client.
 */
import type { ParsedItem, ParseContext, IntentKind } from '../../engine/parseVoice';
import { addDays } from '../dates';

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
export const GROQ_MODEL = 'llama-3.3-70b-versatile';
const TIMEOUT_MS = 8000;

export function groqKey(): string {
  return (import.meta.env.VITE_GROQ_API_KEY ?? '').trim();
}

export function isGroqConfigured(): boolean {
  return groqKey().length > 0;
}

const SYSTEM = `You extract structured intents from a spoken daily log in FORGE, a gamified habit and task tracker.

The user speaks freely about their day. Split what they said into discrete items and classify each:
- "habit"     : a rep of a GOOD habit that ALREADY EXISTS. refId must be a known good habit.
- "bad-habit" : a known BAD habit, either doing it ("smoked twice") or avoiding it ("no TV").
- "task"      : a one-off to-do with an end state — it gets finished and is then done.
- "redeem"    : they consumed a known reward ("I ate the cheesecake").
- "new-habit" : an ONGOING behaviour they want to track repeatedly that is NOT in the habit
                lists yet. Set polarity ("good" to build, "bad" to cut down) and createName.
                refId is null — it does not exist yet.

DECIDING habit vs task — this matters more than anything else here:
- If the user explicitly calls it a habit ("as a habit", "add it to my habits", "make this a
  habit", "daily", "every day"), it is a habit. ALWAYS honour that, even if it sounds like a
  one-off. This instruction overrides every other consideration.
- Otherwise judge by whether it has a finish line:
    * A thing that is never "done" — eat healthy, sleep early, meditate, read daily,
      go to the gym regularly, stop smoking -> new-habit
    * A thing that gets completed once and is then over — finish three videos of financial
      modelling, read two PDFs of valuation, call the bank, submit the tax return -> task
- A quantity of deliverables ("three videos", "two PDFs") is a strong signal of a TASK, not a habit.
- If the behaviour already appears in the habit lists, use "habit"/"bad-habit" with its refId.
  Only use "new-habit" when nothing in the lists matches.
- Conversational filler ("I'll let you know", "so", "thank you") is NOT an item. Drop it.

DECIDING good vs bad — anything the user frames as something to STOP, CUT DOWN or STAY AWAY
FROM is a BAD habit, never a task and never a good one:
- "I don't want to do X", "I need to stop X", "I'm trying to avoid X", "I should cut down on X",
  "no more X", "I want to quit X", "X is something I'm avoiding", "less X"
  -> kind is bad-habit if X is already a known bad habit, otherwise new-habit with polarity "bad".
- The habit is named after the BEHAVIOUR, not the avoidance: "I don't want to smoke" creates a
  bad habit called "smoking" (NOT "don't smoke" and NOT "no smoking"). Strip the negation from
  createName so tapping + later means "I did the thing I was avoiding".
- Conversely, wanting MORE of something ("I want to read more", "I should sleep earlier")
  is a good habit.
- For a bad habit, set avoided=true if they are reporting they successfully stayed away from it
  today, and false if they are only declaring the intention or admitting they did it.

Rules:
- refId MUST be an id from the supplied lists, or null. Never invent ids.
- For "new-habit": refId is null, createName is a short habit name in the user's words
  ("eat healthy"), and doneToday is true only if they say they already did it today.
- dueDate applies to tasks only, and MUST be an absolute YYYY-MM-DD date you work out from the anchors provided (today, todayName, tomorrow, weekEnd, nextWeekEnd).
  Resolve deadlines to the LAST day the user has, not the first:
    "today" / "tonight"            -> today
    "tomorrow"                     -> tomorrow
    "this week" / "by the weekend" -> weekEnd
    "next week"                    -> nextWeekEnd
    "in three days"                -> today + 3 days
    "by Friday" / "on Monday"      -> the next such weekday on or after tomorrow
    "next month"                   -> today + 30 days
  A time reference CARRIES FORWARD across the whole utterance until a different one appears.
  People say the day once and then list everything under it: "Today I have to go to the gym,
  do one video, and finish three more" means ALL THREE are due today, not just the first.
  Apply the most recent stated timing to every following item.
  Only when NO timing has been stated anywhere before an item, use tomorrow.
  Never answer with a word like "this week" — always compute the date.
- count means different things per kind, and both matter:
    * habit / bad-habit : reps already done ("smoked twice" -> 2).
    * task              : how many UNITS finish it ("finish three videos" -> 3,
                          "read two PDFs" -> 2). The task is not done until all
                          of them are ticked off, so extract this carefully.
  Default 1.
- avoided = true ONLY when they say they did NOT do a bad habit ("no TV", "skipped the beer", "didn't smoke").
  If they actually did the bad habit, avoided is false.
- text = a short label in the user's own words, for a confirmation row.
- Never invent items the user did not say. Never merge two distinct items.

Respond with ONLY this JSON shape:
{"items":[{"kind":"habit|bad-habit|task|redeem|new-habit","text":string,"refId":string|null,"createName":string|null,"polarity":"good|bad|null","doneToday":boolean,"dueDate":string|null,"count":number,"avoided":boolean}]}`;

type RawItem = {
  kind?: string;
  text?: string;
  refId?: string | null;
  dueDate?: string | null;
  count?: number;
  avoided?: boolean;
  createName?: string;
  polarity?: string;
  doneToday?: boolean;
};

const KINDS: IntentKind[] = ['habit', 'bad-habit', 'task', 'redeem', 'new-habit'];

/**
 * Coerce the model's output into ParsedItems we can trust.
 *
 * An LLM can hallucinate an id, a kind, or a date, so every field is checked
 * against the context rather than believed. Anything unusable degrades to a
 * task instead of being dropped, so the user never silently loses an item.
 */
export function coerceItems(raw: unknown, ctx: ParseContext): ParsedItem[] {
  const list = (raw as { items?: RawItem[] })?.items;
  if (!Array.isArray(list)) throw new Error('no items array');

  const habitById = new Map(ctx.habits.map((h) => [h.id, h]));
  const rewardById = new Map(ctx.rewards.map((r) => [r.id, r]));

  return list.slice(0, 25).map((r, i) => {
    const id = `g${i}`;
    const text = String(r.text ?? '').trim().slice(0, 120) || 'Item';
    let kind: IntentKind = KINDS.includes(r.kind as IntentKind)
      ? (r.kind as IntentKind)
      : 'task';
    let refId = typeof r.refId === 'string' && r.refId ? r.refId : null;

    const modelPolarity = r.polarity === 'bad' ? 'bad' : 'good';
    let polarity: 'good' | 'bad' | undefined;

    // Verify the reference actually exists, and that it matches the kind.
    if (kind === 'redeem') {
      if (!refId || !rewardById.has(refId)) { kind = 'task'; refId = null; }
    } else if (kind === 'habit' || kind === 'bad-habit') {
      const h = refId ? habitById.get(refId) : undefined;
      if (!h) {
        /*
         * The model asked for a habit that does not exist. Previously this
         * became a task, which is how "as a habit, eat healthy" ended up on
         * the to-do list. Promote it to a creation instead, keeping the
         * polarity the model inferred (a bad-habit classification implies bad).
         */
        kind = 'new-habit';
        refId = null;
        polarity = r.kind === 'bad-habit' ? 'bad' : modelPolarity;
      } else {
        // Trust the habit's own polarity over the model's classification.
        kind = h.polarity === 'bad' ? 'bad-habit' : 'habit';
      }
    } else if (kind === 'new-habit') {
      refId = null;
      polarity = modelPolarity;
    }

    // A name the user would recognise on a habit card.
    const createName = kind === 'new-habit'
      ? (String(r.createName ?? '').trim() || text).slice(0, 60)
      : undefined;

    const count = Number.isFinite(r.count) ? Math.max(1, Math.min(50, Math.round(r.count!))) : 1;
    const avoided = kind === 'bad-habit' ? r.avoided === true : false;

    let dueDate: string | null = null;
    if (kind === 'task') {
      const raw = typeof r.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.dueDate)
        ? r.dueDate
        : null;
      // Trust any well-formed date inside a sane window; a deadline the user
      // actually said ("this week") must not be flattened back to tomorrow.
      // Only a missing or absurd date falls back.
      const plausible = raw
        && raw >= addDays(ctx.today, -370)
        && raw <= addDays(ctx.today, 730);
      dueDate = plausible ? raw : ctx.tomorrow;
    }

    return {
      id,
      kind,
      text: kind === 'new-habit' ? createName! : text,
      refId,
      dueDate,
      raw: text,
      count,
      avoided,
      ...(kind === 'new-habit'
        ? { polarity, doneToday: r.doneToday === true }
        : {}),
    };
  });
}

/**
 * Shared transport: one JSON-mode chat call. Both voice pipelines use this,
 * so timeout, abort, key handling and error shape stay identical between them.
 * Throws on any failure — every caller has a fallback.
 */
export async function chatJSON(
  system: string,
  payload: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  const key = groqKey();
  if (!key) throw new Error('no api key');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  signal?.addEventListener('abort', () => controller.abort());

  /*
   * JSON mode is rejected with a 400 unless the word "json" appears somewhere
   * in the messages. Enforcing it here rather than trusting each prompt to
   * remember: the failure is silent (every caller falls back), so a prompt
   * that forgets would quietly disable AI parsing with nothing to show for it.
   */
  const prompt = /json/i.test(system)
    ? system
    : `${system}\n\nRespond with JSON only.`;

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      signal: controller.signal,
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: JSON.stringify(payload) },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error('groq ' + res.status + ': ' + body.slice(0, 120));
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('no content');
    return JSON.parse(content);
  } finally {
    clearTimeout(timer);
  }
}

/** Ask Groq to structure a transcript. Throws on any failure — caller falls back. */
export async function parseWithGroq(
  transcript: string,
  ctx: ParseContext,
  signal?: AbortSignal,
): Promise<ParsedItem[]> {
  const json = await chatJSON(SYSTEM, {
    today: ctx.today,
    todayName: ctx.todayName,
    tomorrow: ctx.tomorrow,
    weekEnd: ctx.weekEnd,
    nextWeekEnd: ctx.nextWeekEnd,
    goodHabits: ctx.habits.filter((h) => h.polarity !== 'bad')
      .map((h) => ({ id: h.id, name: h.name })),
    badHabits: ctx.habits.filter((h) => h.polarity === 'bad')
      .map((h) => ({ id: h.id, name: h.name })),
    rewards: ctx.rewards.map((r) => ({ id: r.id, name: r.name })),
    transcript,
  }, signal);
  return coerceItems(json, ctx);
}
