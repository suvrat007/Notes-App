/**
 * Command parsing: Groq first, a small rules parser as the offline fallback.
 *
 * The rules parser covers only the unambiguous shapes ("go to stats",
 * "move gym to the top", "archive gym"). It deliberately does NOT guess at
 * anything fuzzier — a mis-parsed command mutates real records, so silence is
 * better than a wrong action.
 */
import { chatJSON, isGroqConfigured } from './groq';
import {
  COMMAND_SYSTEM, coerceCommands,
  type Command, type CommandContext, type MoveTo, type ScreenName,
} from './commands';

export interface CommandOutcome {
  items: Command[];
  source: 'groq' | 'rules';
  fallbackReason?: string;
}

const SCREEN_WORDS: Record<string, ScreenName> = {
  home: 'home', today: 'home', dashboard: 'home',
  roadmap: 'roadmap', pace: 'roadmap',
  stats: 'stats', statistics: 'stats', charts: 'stats', analytics: 'stats',
  profile: 'profile', rank: 'profile', rewards: 'profile', settings: 'profile',
  manage: 'manage', organise: 'manage', organize: 'manage', reorder: 'manage',
};

/** Longest name first, so "read 20 pages" beats a bare "read". */
function matchRef(text: string, refs: { id: string; name: string }[]) {
  const lower = text.toLowerCase();
  return [...refs]
    .sort((a, b) => b.name.length - a.name.length)
    .find((r) => r.name.trim() && lower.includes(r.name.toLowerCase())) ?? null;
}

export function parseCommandsRules(text: string, ctx: CommandContext): Command[] {
  const out: Command[] = [];
  const clauses = text.split(/,|;|\.|\band\b|\bthen\b/gi).map((s) => s.trim()).filter(Boolean);

  clauses.forEach((clause, i) => {
    const lower = clause.toLowerCase();
    const id = `r${i}`;

    // navigate — "go to stats", "open the roadmap"
    if (/\b(go to|open|show|switch to)\b/.test(lower)) {
      const word = Object.keys(SCREEN_WORDS).find((w) => new RegExp(`\\b${w}\\b`).test(lower));
      if (word) {
        const screen = SCREEN_WORDS[word];
        out.push({ id, kind: 'navigate', refId: null, refName: '', screen,
                   label: `Open ${screen}` });
        return;
      }
    }

    const habit = matchRef(clause, ctx.habits);
    const task = matchRef(clause, ctx.tasks);
    const ref = habit ?? task;
    if (!ref) return;

    // move — "move gym to the top", "push read down"
    if (/\b(move|put|push|shift|send)\b/.test(lower)) {
      let to: MoveTo | null = null;
      if (/\b(top|first|start|beginning)\b/.test(lower)) to = 'top';
      else if (/\b(bottom|last|end)\b/.test(lower)) to = 'bottom';
      else if (/\bup\b|\bhigher\b/.test(lower)) to = 'up';
      else if (/\bdown\b|\blower\b/.test(lower)) to = 'down';
      if (to) {
        out.push({ id, kind: 'move', refId: ref.id, refName: ref.name, to,
                   relativeToId: null, label: `Move ${ref.name} ${to}` });
        return;
      }
    }

    // archive (habits) / delete (tasks)
    if (/\b(archive|retire|remove|delete|get rid of)\b/.test(lower)) {
      if (habit) {
        out.push({ id, kind: 'archive', refId: habit.id, refName: habit.name,
                   label: `Archive ${habit.name}` });
      } else if (task) {
        out.push({ id, kind: 'delete', refId: task.id, refName: task.name,
                   label: `Delete ${task.name}` });
      }
    }
  });

  return out;
}

export async function parseCommands(
  text: string,
  ctx: CommandContext,
  opts: { useAi?: boolean } = {},
): Promise<CommandOutcome> {
  const rules = () => parseCommandsRules(text, ctx);

  if (opts.useAi === false) return { items: rules(), source: 'rules' };
  if (!isGroqConfigured()) {
    return { items: rules(), source: 'rules', fallbackReason: 'no API key configured' };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { items: rules(), source: 'rules', fallbackReason: 'offline' };
  }

  try {
    const json = await chatJSON(COMMAND_SYSTEM, {
      habits: ctx.habits.map((h) => ({ id: h.id, name: h.name })),
      tasks: ctx.tasks.map((t) => ({ id: t.id, name: t.name })),
      instruction: text,
    });
    const items = coerceCommands(json, ctx);
    if (items.length === 0) {
      const fallback = rules();
      if (fallback.length > 0) {
        return { items: fallback, source: 'rules', fallbackReason: 'AI found nothing' };
      }
    }
    return { items, source: 'groq' };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.warn('[commands] Groq failed, using rules parser:', reason);
    return { items: rules(), source: 'rules', fallbackReason: reason.slice(0, 80) };
  }
}
