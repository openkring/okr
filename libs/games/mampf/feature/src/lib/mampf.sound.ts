import { MampfEvent } from '@okr/games-mampf-util';

/** Mampf's own start jingle as MIDI note numbers; the last note is held. */
const JINGLE = [72, 76, 79, 76, 77, 81, 84, 81, 79, 76, 72, 76, 74, 79, 84];
const NOTE_S = 0.12;
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/**
 * Every sound is synthesized with WebAudio — no audio files, no dependency.
 *
 * Browsers only allow audio after a user gesture, so `unlock()` must run inside the «Start»
 * (or «Weiter») tap. Until then, and while muted, every call is a silent no-op.
 */
export class MampfSound {
  private ctx: AudioContext | null = null;
  private siren: { osc: OscillatorNode; lfo: OscillatorNode } | null = null;
  private dotHigh = false;
  private muted = false;

  public unlock(): void {
    if (typeof AudioContext === 'undefined') return;
    this.ctx ??= new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.stopSiren();
  }

  public onEvent(event: MampfEvent): void {
    switch (event.type) {
      case 'dot':
        this.dotHigh = !this.dotHigh;
        this.tone(this.dotHigh ? 520 : 390, 0, 0.06, 'square', 0.04);
        break;
      case 'pellet':
        this.tone(260, 0, 0.12, 'square', 0.05);
        break;
      case 'frightStart':
        this.startSiren();
        break;
      case 'ghostEaten':
        this.sweep(200, 1200, 0.25, 'square', 0.06);
        break;
      case 'extraLife':
        [880, 1320, 1760].forEach((f, i) => this.tone(f, i * 0.1, 0.1, 'sine', 0.08));
        break;
      case 'died':
        this.stopSiren();
        this.sweep(800, 80, 1.2, 'triangle', 0.1);
        break;
      case 'frightEnd':
      case 'levelClear':
      case 'gameOver':
        this.stopSiren();
        break;
    }
  }

  /** The fright siren again, after a pause in the middle of a fright. */
  public resumeSiren(): void {
    this.startSiren();
  }

  public jingle(): void {
    JINGLE.forEach((note, i) =>
      this.tone(hz(note), i * NOTE_S, i === JINGLE.length - 1 ? NOTE_S * 3 : NOTE_S * 0.9, 'square', 0.05));
  }

  public stopSiren(): void {
    if (!this.siren) return;
    try {
      this.siren.osc.stop();
      this.siren.lfo.stop();
    } catch {
      // already stopped
    }
    this.siren = null;
  }

  public close(): void {
    this.stopSiren();
    void this.ctx?.close();
    this.ctx = null;
  }

  private live(): AudioContext | null {
    return this.muted || !this.ctx || this.ctx.state === 'closed' ? null : this.ctx;
  }

  private startSiren(): void {
    const ctx = this.live();
    if (!ctx) return;
    this.stopSiren();
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 300;
    lfo.frequency.value = 6;
    depth.gain.value = 80;
    gain.gain.value = 0.04;
    lfo.connect(depth).connect(osc.frequency);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    lfo.start();
    this.siren = { osc, lfo };
  }

  private tone(freq: number, delay: number, dur: number, type: OscillatorType, volume: number): void {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private sweep(from: number, to: number, dur: number, type: OscillatorType, volume: number): void {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
}
