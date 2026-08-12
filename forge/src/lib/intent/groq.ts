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
- "habit"     : they did a GOOD habit that already exists. refId must be a known good habit.
- "bad-habit" : they mention a known BAD habit, either doing it ("smoked twice") or avoiding it ("no TV").
- "task"      : a one-off to-do. Anything not matching a known habit or reward is a task.
- "redeem"    : they consumed a known reward ("I ate the cheesecake").

Rules:
- refId MUST be an id from the supplied lists, or null. Never invent ids.
- If nothing matches, kind is "task" and refId is null.
- dueDate applies to tasks only. "today" -> the given today, "tomorrow" -> the given tomorrow, otherwise null.
- count = reps mentioned ("smoked twice" -> 2, "three coffees" -> 3). Default 1.
- avoided = true ONLY when they say they did NOT do a bad habit ("no TV", "skipped the beer", "didn't smoke").
  If they actually did the bad habit, avoided is false.
- text = a short label in the user's own words, for a confirmation row.
- Never invent items the user did not say. Never merge two distinct items.

Respond with ONLY this JSON shape:
{"items":[{"kind":"habit|bad-habit|task|redeem","text":string,"refId":string|null,"dueDate":string|null,"count":number,"avoided":boolean}]}`;

type RawItem = {
  kind?: string;
  text?: string;
  refId?: string | null;
  dueDate?: string | null;
  count?: number;
  avoided?: boolean;
};

const KINDS: IntentKind[] = ['habit', 'bad-habit', 'task', 'redeem'];

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

    // Verify the reference actually exists, and that it matches the kind.
    if (kind === 'redeem') {
      if (!refId || !rewardById.has(refId)) { kind = 'task'; refId = null; }
    } else if (kind === 'habit' || kind === 'bad-habit') {
      const h = refId ? habitById.get(refId) : undefined;
      if (!h) {
        kind = 'task';
        refId = null;
      } else {
        // Trust the habit's own polarity over the model's classification.
        kind = h.polarity === 'bad' ? 'bad-habit' : 'habit';
      }
    }

    const count = Number.isFinite(r.count) ? Math.max(1, Math.min(50, Math.round(r.count!))) : 1;
    const avoided = kind === 'bad-habit' ? r.avoided === true : false;

    let dueDate: string | null = null;
    if (kind === 'task') {
      const d = typeof r.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.dueDate)
        ? r.dueDate
        : null;
      dueDate = d ?? ctx.tomorrow;
    }

    return { id, kind, text, refId, dueDate, raw: text, count, avoided };
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
    tomorrow: ctx.tomorrow,
    goodHabits: ctx.habits.filter((h) => h.polarity !== 'bad')
      .map((h) => ({ id: h.id, name: h.name })),
    badHabits: ctx.habits.filter((h) => h.polarity === 'bad')
      .map((h) => ({ id: h.id, name: h.name })),
    rewards: ctx.rewards.map((r) => ({ id: r.id, name: r.name })),
    transcript,
  }, signal);
  return coerceItems(json, ctx);
}
