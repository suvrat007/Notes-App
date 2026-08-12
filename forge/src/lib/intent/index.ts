/**
 * Intent parsing with graceful degradation.
 *
 * Groq gives a much better parse (it handles counts, natural phrasing and
 * avoidance), but FORGE is offline-first: the rules parser must always be able
 * to carry the feature on its own. Any failure — offline, no key, rate limit,
 * timeout, malformed JSON — silently falls back rather than surfacing an error,
 * because the user still gets a preview they can edit before anything commits.
 */
import { parseVoice, type ParsedItem, type ParseContext } from '../../engine/parseVoice';
import { parseWithGroq, isGroqConfigured } from './groq';

export type ParseSource = 'groq' | 'rules';

export interface ParseOutcome {
  items: ParsedItem[];
  source: ParseSource;
  /** Why we fell back, when we did. Shown only as a quiet hint. */
  fallbackReason?: string;
}

export async function parseIntents(
  transcript: string,
  ctx: ParseContext,
  opts: { useAi?: boolean } = {},
): Promise<ParseOutcome> {
  const rules = () => parseVoice(transcript, ctx);

  if (opts.useAi === false) return { items: rules(), source: 'rules' };
  if (!isGroqConfigured()) {
    return { items: rules(), source: 'rules', fallbackReason: 'no API key configured' };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { items: rules(), source: 'rules', fallbackReason: 'offline' };
  }

  try {
    const items = await parseWithGroq(transcript, ctx);
    // An empty result is worse than the rules parser's best guess.
    if (items.length === 0) {
      return { items: rules(), source: 'rules', fallbackReason: 'AI returned nothing' };
    }
    return { items, source: 'groq' };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.warn('[intent] Groq parse failed, using rules parser:', reason);
    return { items: rules(), source: 'rules', fallbackReason: reason.slice(0, 80) };
  }
}

export { isGroqConfigured } from './groq';
