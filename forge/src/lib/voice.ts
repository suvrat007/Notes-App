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

/**
 * Error carrying both the raw Web Speech code (for debugging) and text a
 * person can act on. The raw codes are enum values like `network` and
 * `not-allowed` — never show them to the user.
 */
export class VoiceError extends Error {
  /** Declared as a field, not a parameter property — this project builds
      with `erasableSyntaxOnly`, which disallows the shorthand. */
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'VoiceError';
    this.code = code;
  }
}

/**
 * Web Speech in Chrome is a CLOUD service: audio goes to Google's servers and
 * the transcript comes back. That makes `network` the expected failure the
 * moment FORGE is used offline — which is most of the time, by design.
 */
export function describeVoiceError(code: string): string {
  switch (code) {
    case 'network':
      return 'Voice needs an internet connection — your browser sends the audio '
        + 'off to be transcribed. Everything else in FORGE works offline; type it below instead.';
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access is blocked. Allow it in your browser\'s site '
        + 'settings, or type it below.';
    case 'audio-capture':
      return 'No microphone found. Plug one in, or type it below.';
    case 'no-speech':
      return 'Didn\'t catch anything. Try again, or type it below.';
    case 'aborted':
      return 'Listening stopped.';
    case 'language-not-supported':
      return 'That language isn\'t supported for dictation. Type it below instead.';
    default:
      return 'Voice failed (' + code + '). Type it below instead.';
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
      const code = e.error || 'speech-error';
      reject(new VoiceError(code, describeVoiceError(code)));
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
    } catch {
      settled = true;
      active = null;
      reject(new VoiceError('start-failed',
        'Could not start listening. Type it below instead.'));
    }
  });
}
