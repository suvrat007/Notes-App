/**
 * Speech-to-text via Groq Whisper.
 *
 * This exists because Chrome's Web Speech API is not on-device: it ships your
 * audio to Google's servers, and when that path is blocked — a Chromium build
 * without Google's keys, a privacy browser, a firewall, a region — it fails
 * with a bare `network` error that the app cannot do anything about.
 *
 * Recording locally and posting the clip to Groq removes that dependency
 * entirely, and reuses the key already configured for intent parsing.
 * Still a network call, so Web Speech and typing remain as fallbacks.
 */
import { groqKey, isGroqConfigured } from '../intent/groq';
import { VoiceError } from '../voice';

const ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';
export const STT_MODEL = 'whisper-large-v3-turbo';

/** Stop capturing after this long, so a forgotten session can't run forever. */
const MAX_RECORDING_MS = 60_000;

export function isGroqSttAvailable(): boolean {
  return (
    isGroqConfigured()
    && typeof MediaRecorder !== 'undefined'
    && typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
  );
}

/** Pick a container Groq accepts that this browser can actually produce. */
function pickMimeType(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  return candidates.find((t) => MediaRecorder.isTypeSupported?.(t));
}

export interface Recording {
  /** Stop capture and resolve the clip. */
  stop: () => Promise<Blob>;
  /** Abandon the capture and release the microphone. */
  cancel: () => void;
}

/**
 * Begin capturing from the microphone. Resolves once recording has actually
 * started, so the UI never says "listening" before it is.
 */
export async function startRecording(): Promise<Recording> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    const name = (e as { name?: string })?.name ?? '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new VoiceError(
        'not-allowed',
        'Microphone access is blocked. Allow it in your browser\'s site settings, '
          + 'or type it below.',
      );
    }
    if (name === 'NotFoundError') {
      throw new VoiceError('audio-capture', 'No microphone found. Plug one in, or type it below.');
    }
    throw new VoiceError('mic-failed', 'Could not open the microphone. Type it below instead.');
  }

  const mimeType = pickMimeType();
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const release = () => stream.getTracks().forEach((t) => t.stop());

  const stopped = new Promise<Blob>((resolve) => {
    rec.onstop = () => {
      release();
      resolve(new Blob(chunks, { type: mimeType ?? 'audio/webm' }));
    };
  });

  rec.start();
  const guard = window.setTimeout(() => {
    if (rec.state === 'recording') rec.stop();
  }, MAX_RECORDING_MS);

  return {
    stop: () => {
      clearTimeout(guard);
      if (rec.state === 'recording') rec.stop();
      return stopped;
    },
    cancel: () => {
      clearTimeout(guard);
      // Drop the handler first so `stopped` never resolves into a transcribe.
      rec.onstop = null;
      if (rec.state === 'recording') rec.stop();
      release();
    },
  };
}

/** Send a clip to Groq Whisper. Throws VoiceError; callers fall back. */
export async function transcribe(clip: Blob, signal?: AbortSignal): Promise<string> {
  if (clip.size < 1200) {
    // A clip this short is silence or a mis-tap; the API would bill for nothing.
    throw new VoiceError('no-speech', "Didn't catch anything. Try again, or type it below.");
  }

  const form = new FormData();
  form.append('file', clip, 'speech.webm');
  form.append('model', STT_MODEL);
  form.append('response_format', 'json');
  // Nudges Whisper away from hallucinating punctuation-only output on noise.
  form.append('temperature', '0');

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey()}` },
      body: form,
      signal,
    });
  } catch {
    throw new VoiceError(
      'network',
      'Could not reach the transcription service. Check your connection, or type it below.',
    );
  }

  if (!res.ok) {
    if (res.status === 401) {
      throw new VoiceError('auth', 'The Groq API key was rejected. Type it below instead.');
    }
    if (res.status === 429) {
      throw new VoiceError('rate-limit', 'Transcription is rate-limited right now. Try again shortly, or type it below.');
    }
    throw new VoiceError('stt-failed', `Transcription failed (${res.status}). Type it below instead.`);
  }

  const json = await res.json().catch(() => null);
  const text = String((json as { text?: string })?.text ?? '').trim();

  // Whisper emits bare punctuation for silence — treat that as nothing heard.
  if (!text || !/[a-z0-9]/i.test(text)) {
    throw new VoiceError('no-speech', "Didn't catch anything. Try again, or type it below.");
  }
  return text;
}
