/**
 * Rules-based voice-intent parser. Pure: transcript + known names in,
 * a structured preview array out. Nothing is ever committed from here —
 * the UI shows the preview and waits for an explicit OK.
 */

export type IntentKind =
  | 'habit'      // a rep of a habit that already exists
  | 'bad-habit'  // a slip or an avoidance of an existing bad habit
  | 'task'       // a one-off to-do
  | 'redeem'     // spent stars on a reward
  | 'new-habit'; // something ongoing that is NOT yet a habit -> create it

export interface ParsedItem {
  /** Stable within one parse, so preview rows can be edited by id. */
  id: string;
  kind: IntentKind;
  /** Display text for the row. */
  text: string;
  /** Matched habit / reward id, when the kind is habit / bad-habit / redeem. */
  refId: string | null;
  /** Tasks only: YYYY-MM-DD. */
  dueDate: string | null;
  /** The raw fragment this came from, for editing. */
  raw: string;
  /** Reps mentioned ("smoked twice" -> 2). Always >= 1. */
  count: number;
  /**
   * Bad habits only: TRUE means they AVOIDED it ("no TV") and nothing should
   * be logged; FALSE means they actually did it and a penalty applies.
   */
  avoided: boolean;
  /** new-habit only: good earns stars, bad costs them. */
  polarity?: 'good' | 'bad';
  /** new-habit only: also surface it on the daily task list. */
  isRecurringTask?: boolean;
  /** new-habit only: they already did it today, so log a rep on creation. */
  doneToday?: boolean;
  /**
   * new-habit + bad only: reps allowed per day before the extra penalty.
   * `null` means the user never stated one, so the UI must ask before commit.
   */
  dailyAllowance?: number | null;
  /** new-habit + good: reps aimed for across `targetPeriodWeeks`. */
  targetReps?: number;
  /** new-habit + good: 1 = a week, 4 = a month, 12 = a quarter. */
  targetPeriodWeeks?: number;
  /** Tasks: local `HH:MM` when a time of day was spoken. */
  dueTime?: string | null;
  /**
   * Tasks: where this belongs outside FORGE. A timed commitment with other
   * people is a calendar event; an errand is a to-do. The model suggests,
   * the user confirms in the preview — it is their account being written to.
   */
  syncTargets?: Array<'calendar' | 'tasks'>;
  /** Tasks: which bucket it belongs to, and whether it repeats. */
  horizon?: 'once' | 'daily' | 'weekly' | 'monthly';
}

export interface NamedRef {
  id: string;
  name: string;
  polarity?: 'good' | 'bad';
}

/** Negation cues that flip a mention into "I avoided this". */
const NEGATIONS = ['no ', 'not ', "don't", 'dont ', 'avoid', 'skipped', 'skip ', 'without'];

/** Phrases that mean the user consumed a reward. */
const REDEEM_CUES = ['i ate', 'i had', 'i bought', 'i watched', 'i took', 'redeem', 'i used'];

/** Split a transcript into clauses on commas, "and", "then", and full stops. */
export function splitClauses(transcript: string): string[] {
  return transcript
    .split(/,|;|\.|\band\b|\bthen\b|\balso\b/gi)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Strip a leading day cue and report which one it was. */
function extractDayCue(clause: string): { cue: 'today' | 'tomorrow' | null; rest: string } {
  const lower = clause.toLowerCase();
  if (/\btomorrow\b/.test(lower)) {
    return { cue: 'tomorrow', rest: clause.replace(/\btomorrow\b/gi, '').trim() };
  }
  if (/\btoday\b|\btonight\b/.test(lower)) {
    return { cue: 'today', rest: clause.replace(/\btoday\b|\btonight\b/gi, '').trim() };
  }
  return { cue: null, rest: clause };
}

function hasNegation(clause: string): boolean {
  const lower = ' ' + clause.toLowerCase() + ' ';
  return NEGATIONS.some((n) => lower.includes(n));
}

/** Longest-name-first match so "read 20 pages" beats a bare "read". */
function matchRef(clause: string, refs: NamedRef[]): NamedRef | null {
  const lower = clause.toLowerCase();
  const sorted = [...refs].sort((a, b) => b.name.length - a.name.length);
  return sorted.find((r) => r.name.trim() && lower.includes(r.name.toLowerCase())) ?? null;
}

export interface ParseContext {
  habits: NamedRef[];
  rewards: NamedRef[];
  today: string;
  tomorrow: string;
  /** Day name of `today`, e.g. "Wednesday" — anchors relative phrasing. */
  todayName?: string;
  /** Last day of the current week, for "by the end of this week". */
  weekEnd?: string;
  /** Last day of next week. */
  nextWeekEnd?: string;
  /** 1 = Monday. Used by the in-house date extractor. */
  weekStartDay?: number;
}

/**
 * Parse a transcript into intents.
 *
 * - a clause naming a known GOOD habit        → habit rep
 * - a clause naming a known BAD habit         → bad-habit, actually done
 * - negation ("no TV") + a known habit        → bad-habit, avoided (no penalty)
 * - a redeem cue + a known reward             → redeem
 * - anything else                             → task (default due today)
 */
export function parseVoice(transcript: string, ctx: ParseContext): ParsedItem[] {
  const clauses = splitClauses(transcript);

  /*
   * A day said once governs everything after it: "tomorrow gym, read 20
   * pages" puts both on tomorrow. Only a new day cue changes it.
   */
  let carried: 'today' | 'tomorrow' | null = null;

  return clauses.map((raw, i) => {
    const id = `p${i}`;
    const { cue: stated, rest } = extractDayCue(raw);
    if (stated) carried = stated;
    const cue = carried;
    const clause = rest || raw;

    // Redemption first — "I ate the cheesecake" must not become a task.
    const lower = clause.toLowerCase();
    if (REDEEM_CUES.some((c) => lower.includes(c))) {
      const reward = matchRef(clause, ctx.rewards);
      if (reward) {
        return { id, kind: 'redeem', text: reward.name, refId: reward.id,
                 dueDate: null, raw, count: 1, avoided: false };
      }
    }

    const habit = matchRef(clause, ctx.habits);
    if (habit) {
      const negated = hasNegation(clause);
      // An explicitly-bad habit, or a negated mention of any habit, is a slip
      // note rather than an earn.
      const kind: IntentKind = habit.polarity === 'bad' || negated ? 'bad-habit' : 'habit';
      // A negated mention means it did NOT happen, so it must not be logged.
      return { id, kind, text: habit.name, refId: habit.id, dueDate: null, raw,
               count: 1, avoided: kind === 'bad-habit' && negated };
    }

    /*
     * Everything else becomes a task. An unstated day means TODAY: someone
     * speaking into a daily tracker is talking about the day they are in, and
     * filing it under tomorrow made spoken tasks vanish from the dashboard.
     */
    const dueDate = cue === 'tomorrow' ? ctx.tomorrow : ctx.today;
    return { id, kind: 'task', text: clause, refId: null, dueDate, raw,
             count: 1, avoided: false };
  });
}
