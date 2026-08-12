/**
 * Voice pipeline #2 — OPERATING the app, as opposed to logging data.
 *
 * Pipeline #1 (`groq.ts`) answers "what did I do today?" and produces ledger
 * entries. This one answers "change the app for me" and produces commands
 * against existing records: reorder, rename, archive, retarget, navigate.
 *
 * They are deliberately separate prompts. A single prompt trying to do both
 * confuses "gym" (log a rep) with "move gym up" (reorder), and the cost of
 * that mistake is a wrong ledger entry — the one thing FORGE must not get
 * wrong. Commands are also destructive in a way logs are not, so they get
 * their own confirm step.
 */
import type { NamedRef } from '../../engine/parseVoice';

export type CommandKind =
  | 'move'      // reposition a habit or task
  | 'rename'
  | 'archive'   // habits (keeps history)
  | 'delete'    // tasks
  | 'retarget'  // change a habit's goal
  | 'navigate'
  | 'setting';

export type MoveTo = 'top' | 'bottom' | 'up' | 'down';
export type ScreenName = 'home' | 'roadmap' | 'stats' | 'profile' | 'manage';

export interface Command {
  id: string;
  kind: CommandKind;
  /** Habit or task id this acts on; null for navigate/setting. */
  refId: string | null;
  /** What the row is called, for the confirmation line. */
  refName: string;
  /** move */
  to?: MoveTo;
  /** move: reposition relative to this other row instead of an absolute slot. */
  relativeToId?: string | null;
  /** rename */
  newName?: string;
  /** retarget */
  targetReps?: number;
  targetPeriodWeeks?: number;
  /** navigate */
  screen?: ScreenName;
  /** setting */
  settingKey?: 'negativeFloor' | 'aiParsing';
  settingValue?: boolean;
  /** Human-readable summary shown in the confirm list. */
  label: string;
}

export interface CommandContext {
  habits: NamedRef[];
  tasks: NamedRef[];
}

export const COMMAND_SYSTEM = `You turn a spoken instruction into COMMANDS that operate a habit-tracking app called FORGE. You are NOT logging what the user did today — a separate system does that. You only rearrange, rename, retire or navigate.

Command kinds:
- "move"     : reposition a habit or task. Set "to" to one of top|bottom|up|down, OR set relativeToId to place it directly after another row.
- "rename"   : change a habit's name. Requires newName.
- "archive"  : retire a HABIT (history is kept). Only for habits.
- "delete"   : remove a TASK. Only for tasks.
- "retarget" : change a habit's goal. Set targetReps and targetPeriodWeeks (1=week, 2=fortnight, 4=month, 8=2 months, 12=quarter).
- "navigate" : open a screen. screen is one of home|roadmap|stats|profile|manage.
- "setting"  : toggle a setting. settingKey is negativeFloor or aiParsing; settingValue is true/false.

Rules:
- refId MUST come from the supplied habits/tasks lists. Never invent one.
- Use "archive" for habits and "delete" for tasks — never the other way round.
- If the instruction does not clearly match a known row, omit it entirely rather than guessing.
- label: a short plain-English description of the change, e.g. "Move Gym to the top".
- Return an empty items array if nothing is actionable.

Respond with ONLY this JSON shape:
{"items":[{"kind","refId","to","relativeToId","newName","targetReps","targetPeriodWeeks","screen","settingKey","settingValue","label"}]}`;

const KINDS: CommandKind[] = [
  'move', 'rename', 'archive', 'delete', 'retarget', 'navigate', 'setting',
];
const MOVES: MoveTo[] = ['top', 'bottom', 'up', 'down'];
const SCREENS: ScreenName[] = ['home', 'roadmap', 'stats', 'profile', 'manage'];

type RawCmd = Record<string, unknown>;

/**
 * Validate model output into commands we are willing to execute.
 *
 * Commands mutate existing records, so this is stricter than the logging
 * pipeline: anything that fails a check is DROPPED rather than degraded.
 * A wrong task is easy to fix; a wrongly-archived habit is not.
 */
export function coerceCommands(raw: unknown, ctx: CommandContext): Command[] {
  const list = (raw as { items?: RawCmd[] })?.items;
  if (!Array.isArray(list)) throw new Error('no items array');

  const habitById = new Map(ctx.habits.map((h) => [h.id, h]));
  const taskById = new Map(ctx.tasks.map((t) => [t.id, t]));
  const out: Command[] = [];

  list.slice(0, 15).forEach((r, i) => {
    const kind = KINDS.includes(r.kind as CommandKind) ? (r.kind as CommandKind) : null;
    if (!kind) return;

    const refId = typeof r.refId === 'string' && r.refId ? r.refId : null;
    const habit = refId ? habitById.get(refId) : undefined;
    const task = refId ? taskById.get(refId) : undefined;
    const label = typeof r.label === 'string' && r.label.trim()
      ? r.label.trim().slice(0, 100)
      : kind;

    const base = { id: `c${i}`, kind, refId, refName: habit?.name ?? task?.name ?? '', label };

    switch (kind) {
      case 'navigate': {
        const screen = SCREENS.includes(r.screen as ScreenName) ? (r.screen as ScreenName) : null;
        if (!screen) return;
        out.push({ ...base, refId: null, screen });
        return;
      }

      case 'setting': {
        const key = r.settingKey === 'negativeFloor' || r.settingKey === 'aiParsing'
          ? r.settingKey : null;
        if (key === null || typeof r.settingValue !== 'boolean') return;
        out.push({ ...base, refId: null, settingKey: key, settingValue: r.settingValue });
        return;
      }

      case 'archive': {
        // Habits only — archiving a task is meaningless and deleting one by
        // mistake would be unrecoverable.
        if (!habit) return;
        out.push(base);
        return;
      }

      case 'delete': {
        if (!task) return;
        out.push(base);
        return;
      }

      case 'rename': {
        const newName = typeof r.newName === 'string' ? r.newName.trim().slice(0, 60) : '';
        if (!habit || !newName) return;
        out.push({ ...base, newName });
        return;
      }

      case 'retarget': {
        if (!habit) return;
        const reps = Number(r.targetReps);
        if (!Number.isFinite(reps) || reps < 0 || reps > 500) return;
        const weeksRaw = Number(r.targetPeriodWeeks);
        const weeks = [1, 2, 4, 8, 12].includes(weeksRaw) ? weeksRaw : 1;
        out.push({
          ...base,
          targetReps: Math.round(reps),
          targetPeriodWeeks: weeks,
        });
        return;
      }

      case 'move': {
        if (!habit && !task) return;
        const rel = typeof r.relativeToId === 'string' ? r.relativeToId : null;
        // A relative move must reference a row of the SAME list, or the
        // reorder would splice a task into the habit order.
        const relValid = rel
          ? (habit ? habitById.has(rel) : taskById.has(rel)) && rel !== refId
          : false;
        const to = MOVES.includes(r.to as MoveTo) ? (r.to as MoveTo) : null;
        if (!relValid && !to) return;
        out.push({ ...base, to: to ?? undefined, relativeToId: relValid ? rel : null });
        return;
      }
    }
  });

  return out;
}

/**
 * Apply a move to an id list, returning the new order. Pure, so the ordering
 * rules are testable without a database.
 */
export function applyMove(
  ids: string[],
  id: string,
  to: MoveTo | undefined,
  relativeToId: string | null | undefined,
): string[] {
  const from = ids.indexOf(id);
  if (from < 0) return ids;

  const rest = ids.filter((x) => x !== id);

  if (relativeToId) {
    const anchor = rest.indexOf(relativeToId);
    if (anchor < 0) return ids;
    // "Put X after Y" — the common phrasing.
    return [...rest.slice(0, anchor + 1), id, ...rest.slice(anchor + 1)];
  }

  switch (to) {
    case 'top': return [id, ...rest];
    case 'bottom': return [...rest, id];
    case 'up': {
      const target = Math.max(0, from - 1);
      return [...rest.slice(0, target), id, ...rest.slice(target)];
    }
    case 'down': {
      const target = Math.min(rest.length, from + 1);
      return [...rest.slice(0, target), id, ...rest.slice(target)];
    }
    default: return ids;
  }
}
