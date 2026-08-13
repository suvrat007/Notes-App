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
import { LOG_SYSTEM as SYSTEM } from './prompts';

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

/** Best extraction quality; also the first model to hit a free-tier limit. */
export const GROQ_MODEL = 'llama-3.3-70b-versatile';

/**
 * Used only when the primary model is rate-limited. It has a far larger
 * free-tier allowance, and a slightly weaker parse the user can correct in the
 * preview beats silently dropping to the keyword parser — which loses counts,
 * polarity, times and dates entirely.
 */
export const GROQ_FALLBACK_MODEL = 'llama-3.1-8b-instant';

const TIMEOUT_MS = 8000;

export function groqKey(): string {
  return (import.meta.env.VITE_GROQ_API_KEY ?? '').trim();
}

export function isGroqConfigured(): boolean {
  return groqKey().length > 0;
}


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
  dailyAllowance?: number | null;
  targetReps?: number;
  targetPeriodWeeks?: number;
  dueTime?: string | null;
  syncTargets?: unknown;
  horizon?: string;
  damagePct?: number;
};

const KINDS: IntentKind[] = ['habit', 'bad-habit', 'task', 'redeem', 'new-habit', 'new-reward'];

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
    } else if (kind === 'new-reward') {
      // A reward being created does not point at anything yet.
      refId = null;
    }

    // A name the user would recognise on a habit card.
    const createName = kind === 'new-habit' || kind === 'new-reward'
      ? (String(r.createName ?? '').trim() || text).slice(0, 60)
      : undefined;

    /*
     * NOT YET WIRED: `engine/extract.ts` determines counts, dates, times and
     * recurrence deterministically and is proven against 30+ asserts plus an
     * end-to-end test (v28) that feeds a stubbed model deliberately wrong
     * values and checks we override them.
     *
     * The remaining gap is which TEXT it runs on. All we receive per item is
     * the model's paraphrased label, and a stray number or weekday in a
     * paraphrase can override correctly-parsed data. The prompt needs to echo
     * each item's SOURCE FRAGMENT before the override can be trusted, so it is
     * left out of the live path until then.
     */
    const count = Number.isFinite(r.count)
      ? Math.max(1, Math.min(50, Math.round(r.count!)))
      : 1;
    const avoided = kind === 'bad-habit' ? r.avoided === true : false;

    // A clock time only if it is a real one — a malformed value would become
    // a bogus calendar event in the user's actual account.
    const modelTime = typeof r.dueTime === 'string'
      && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.dueTime)
      ? r.dueTime
      : null;
    const dueTime = modelTime;

    const syncTargets = Array.isArray(r.syncTargets)
      ? (r.syncTargets as unknown[])
        .filter((t): t is 'calendar' | 'tasks' => t === 'calendar' || t === 'tasks')
        // De-duplicate: ["tasks","tasks"] must not queue two pushes.
        .filter((t, idx, arr) => arr.indexOf(t) === idx)
      : [];

    const horizon = ['daily', 'weekly', 'monthly'].includes(String(r.horizon))
      ? (r.horizon as 'daily' | 'weekly' | 'monthly')
      : ('once' as const);

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
      // Our own resolution wins whenever the fragment actually stated a date.
      dueDate = plausible ? raw : ctx.tomorrow;
    }

    return {
      id,
      kind,
      text: kind === 'new-habit' || kind === 'new-reward' ? createName! : text,
      refId,
      dueDate,
      raw: text,
      count,
      avoided,
      ...(kind === 'task' ? { dueTime, syncTargets, horizon } : {}),
      // Rewards are priced as a share of everything earned, never in stars.
      // Anything off the tier ladder falls back to the gentlest one.
      ...(kind === 'new-reward'
        ? { damagePct: [20, 40, 60, 80, 100].includes(Number(r.damagePct))
            ? Number(r.damagePct) : 20 }
        : {}),
      ...(kind === 'new-habit'
        ? {
          polarity,
          doneToday: r.doneToday === true,
          // null is meaningful: it means "they never said", which the preview
          // turns into a question rather than inventing a limit.
          dailyAllowance: polarity === 'bad' && Number.isFinite(r.dailyAllowance)
            ? Math.max(0, Math.min(99, Math.round(r.dailyAllowance as number)))
            : null,
          targetReps: polarity === 'good' && Number.isFinite(r.targetReps)
            ? Math.max(0, Math.min(500, Math.round(r.targetReps as number)))
            : 0,
          targetPeriodWeeks: [1, 2, 4, 8, 12].includes(Number(r.targetPeriodWeeks))
            ? Number(r.targetPeriodWeeks)
            : 1,
        }
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

  const call = (model: string) => fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    signal: controller.signal,
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: JSON.stringify(payload) },
      ],
    }),
  });

  try {
    let res = await call(GROQ_MODEL);

    /*
     * 429 means the daily or per-minute allowance for the big model is spent.
     * Retry once on the smaller model rather than surrendering to the keyword
     * parser: a slightly rougher AI parse still carries counts, polarity,
     * times and dates, all of which the rules parser loses completely.
     */
    if (res.status === 429) {
      console.warn('[groq] %s rate-limited, retrying on %s', GROQ_MODEL, GROQ_FALLBACK_MODEL);
      res = await call(GROQ_FALLBACK_MODEL);
    }

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
