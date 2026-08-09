/**
 * Rules-based voice-intent parser. Pure: transcript + known names in,
 * a structured preview array out. Nothing is ever committed from here —
 * the UI shows the preview and waits for an explicit OK.
 */

export type IntentKind = 'habit' | 'bad-habit' | 'task' | 'redeem';

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
}

/**
 * Parse a transcript into intents.
 *
 * - a clause naming a known GOOD habit        → habit rep
 * - a clause naming a known BAD habit         → bad-habit note
 * - negation ("no TV") + a known habit        → bad-habit note
 * - a redeem cue + a known reward             → redeem
 * - anything else                             → task (default due tomorrow)
 */
export function parseVoice(transcript: string, ctx: ParseContext): ParsedItem[] {
  const clauses = splitClauses(transcript);

  return clauses.map((raw, i) => {
    const id = `p${i}`;
    const { cue, rest } = extractDayCue(raw);
    const clause = rest || raw;

    // Redemption first — "I ate the cheesecake" must not become a task.
    const lower = clause.toLowerCase();
    if (REDEEM_CUES.some((c) => lower.includes(c))) {
      const reward = matchRef(clause, ctx.rewards);
      if (reward) {
        return { id, kind: 'redeem', text: reward.name, refId: reward.id,
                 dueDate: null, raw };
      }
    }

    const habit = matchRef(clause, ctx.habits);
    if (habit) {
      const negated = hasNegation(clause);
      // An explicitly-bad habit, or a negated mention of any habit, is a slip
      // note rather than an earn.
      const kind: IntentKind = habit.polarity === 'bad' || negated ? 'bad-habit' : 'habit';
      return { id, kind, text: habit.name, refId: habit.id, dueDate: null, raw };
    }

    // Everything else becomes a task; default due date is tomorrow.
    const dueDate = cue === 'today' ? ctx.today : ctx.tomorrow;
    return { id, kind: 'task', text: clause, refId: null, dueDate, raw };
  });
}
