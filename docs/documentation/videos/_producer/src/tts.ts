import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface TtsResult {
  /** Absolute path to the mp3, or null when no key is configured (silent draft). */
  audioPath: string | null;
  durationInSeconds: number;
}

/** Rough estimate for silent drafts: slow German narration ≈ 2.3 words/second. */
export function estimateDuration(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(2.5, words / 2.3);
}

/**
 * Synthesize `text` to `outMp3` with Azure Speech. Results are cached: if the
 * mp3 and its sidecar exist and the (voice, text) hash matches, synthesis is
 * skipped. Without SPEECH_KEY/SPEECH_REGION it returns a silent estimate so the
 * pipeline still produces a timed (but voiceless) draft.
 */
export async function synthesize(text: string, voice: string, outMp3: string): Promise<TtsResult> {
  const key = process.env.SPEECH_KEY;
  const region = process.env.SPEECH_REGION;
  const sidecar = `${outMp3}.json`;
  const hash = createHash('sha1').update(`${voice}\n${text}`).digest('hex');

  if (existsSync(outMp3) && existsSync(sidecar)) {
    try {
      const meta = JSON.parse(readFileSync(sidecar, 'utf8'));
      if (meta.hash === hash) {
        return { audioPath: outMp3, durationInSeconds: meta.durationInSeconds };
      }
    } catch {
      /* fall through and re-synthesize */
    }
  }

  if (!key || !region) {
    return { audioPath: null, durationInSeconds: estimateDuration(text) };
  }

  mkdirSync(dirname(outMp3), { recursive: true });
  const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechSynthesisVoiceName = voice;
  speechConfig.speechSynthesisOutputFormat =
    sdk.SpeechSynthesisOutputFormat.Audio24Khz96KBitRateMonoMp3;

  const audioConfig = sdk.AudioConfig.fromAudioFileOutput(outMp3);
  const synth = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

  const result = await new Promise<sdk.SpeechSynthesisResult>((resolve, reject) => {
    synth.speakTextAsync(
      text,
      (r) => {
        synth.close();
        resolve(r);
      },
      (e) => {
        synth.close();
        reject(new Error(String(e)));
      },
    );
  });

  if (result.reason !== sdk.ResultReason.SynthesizingAudioCompleted) {
    throw new Error(`Azure TTS failed for "${text.slice(0, 40)}…": ${result.errorDetails}`);
  }

  // audioDuration is in ticks of 100 nanoseconds.
  const durationInSeconds = result.audioDuration / 10_000_000;
  writeFileSync(sidecar, JSON.stringify({ hash, durationInSeconds }));
  return { audioPath: outMp3, durationInSeconds };
}
