/**
 * Thin wrapper over the Web Speech API. This is the ONLY part of FORGE that
 * may touch the network (recognition is cloud-backed in Chrome), and it is
 * always optional — `isVoiceSupported()` gates a typed-input fallback.
 */

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type Ctor = new () => SpeechRecognitionLike;

function getCtor(): Ctor | null {
  const w = window as unknown as {
    SpeechRecognition?: Ctor;
    webkitSpeechRecognition?: Ctor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isVoiceSupported(): boolean {
  return getCtor() !== null;
}

export class VoiceUnsupportedError extends Error {
  constructor() {
    super('Speech recognition is not available in this browser.');
    this.name = 'VoiceUnsupportedError';
  }
}

let active: SpeechRecognitionLike | null = null;

/** Cancel an in-flight recognition session. */
export function stopListening(): void {
  if (active) {
    active.abort();
    active = null;
  }
}

/**
 * Listen once and resolve with the transcript.
 * Rejects with VoiceUnsupportedError where the API is missing.
 */
export function startListening(lang = 'en-US'): Promise<string> {
  const Ctor = getCtor();
  if (!Ctor) return Promise.reject(new VoiceUnsupportedError());

  stopListening();

  return new Promise<string>((resolve, reject) => {
    const rec = new Ctor();
    active = rec;
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;

    let transcript = '';
    let settled = false;

    rec.onresult = (e) => {
      const parts: string[] = [];
      for (let i = 0; i < e.results.length; i++) {
        const alt = e.results[i][0];
        if (alt?.transcript) parts.push(alt.transcript);
      }
      transcript = parts.join(' ').trim();
    };

    rec.onerror = (e) => {
      if (settled) return;
      settled = true;
      active = null;
      reject(new Error(e.error || 'speech-error'));
    };

    // `onend` is the reliable completion signal — onresult may never fire
    // if the user says nothing, and we still need to settle the promise.
    rec.onend = () => {
      if (settled) return;
      settled = true;
      active = null;
      resolve(transcript);
    };

    try {
      rec.start();
    } catch (err) {
      settled = true;
      active = null;
      reject(err instanceof Error ? err : new Error('speech-start-failed'));
    }
  });
}
