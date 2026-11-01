/** The part of the Web Speech API's SpeechRecognition the dictation uses (lib.dom has only the events). */
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Dictation over the Web Speech API: Chrome and Safari, not Firefox nor the native app's web view —
 * `supported` is false there and the mic button is hidden. Browsers send the audio to Apple/Google.
 */
export class Dictation {
  public readonly supported = recognitionCtor() !== null;
  private recognition: Recognition | null = null;

  /**
   * Starts listening in `lang`; `onText` receives everything recognised so far (final + interim),
   * `onEnd` fires once when listening stops (silence, `stop()`, error).
   */
  public start(lang: string, onText: (text: string) => void, onEnd: () => void): void {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    this.stop();
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (event) => {
      let text = '';
      for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
      onText(text.trim());
    };
    r.onerror = () => r.stop();
    r.onend = () => {
      if (this.recognition === r) this.recognition = null;
      onEnd();
    };
    this.recognition = r;
    r.start();
  }

  public stop(): void {
    this.recognition?.stop();
  }
}

/** Read-aloud with the device's own voices (`speechSynthesis`); voices per language vary by device. */
export class ReadAloud {
  public readonly supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  public speak(text: string, lang: string, onEnd: () => void): void {
    if (!this.supported) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.onend = onEnd;
    u.onerror = onEnd;
    speechSynthesis.speak(u);
  }

  public stop(): void {
    if (this.supported) speechSynthesis.cancel();
  }
}
