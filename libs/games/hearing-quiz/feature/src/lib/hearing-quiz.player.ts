import { signal } from '@angular/core';

/**
 * Plays one clip at a time for the exercise screen.
 *
 * - `playing` follows the element's `playing` / `pause` / `ended` events — never the tap — so the
 *   play button's rings only move while sound is really coming out (spec §5.2).
 * - Every clip runs through a compressor and a make-up gain (spec §4.4, decision §11.4). Clips
 *   recorded by different admins differ wildly in level, and hearing-aid users set their volume
 *   once; the compressor evens that out without any server-side processing.
 * - `level` (0..1) is the RMS of the output, read by an AnalyserNode, for the ring amplitude.
 *
 * The AudioContext is created on the first `play()` — i.e. inside a user gesture, which is what
 * Safari requires. `crossOrigin = 'anonymous'` keeps a not-prefetched (remote) clip audible through
 * the graph: the storage bucket answers CORS for GET (cors.json); without it the graph would
 * output silence for a cross-origin source.
 */
export class HearingQuizPlayer {
  public readonly playing = signal(false);
  public readonly level = signal(0);
  public readonly error = signal(false);
  /** true once the current clip has played at least once (answers unlock) */
  public readonly hasPlayed = signal(false);

  private readonly audio = new Audio();
  private context: AudioContext | undefined;
  private analyser: AnalyserNode | undefined;
  private samples: Uint8Array<ArrayBuffer> | undefined;
  private frame = 0;

  constructor() {
    this.audio.crossOrigin = 'anonymous';
    this.audio.preload = 'auto';
    this.audio.addEventListener('playing', () => {
      this.playing.set(true);
      this.hasPlayed.set(true);
      this.error.set(false);
      this.startMeter();
    });
    const stopped = () => { this.playing.set(false); this.stopMeter(); };
    this.audio.addEventListener('pause', stopped);
    this.audio.addEventListener('ended', stopped);
    this.audio.addEventListener('error', () => { stopped(); this.error.set(true); });
  }

  /** Switch to another clip; does not play it (no autoplay, spec §5.2). */
  public load(url: string): void {
    this.audio.pause();
    this.playing.set(false);
    this.hasPlayed.set(false);
    this.error.set(false);
    this.level.set(0);
    this.audio.src = url;
    this.audio.load();
  }

  /** Play from the start; a replay while playing restarts the clip. */
  public async play(): Promise<void> {
    this.ensureGraph();
    try {
      if (this.context?.state === 'suspended') await this.context.resume();
      if (this.error()) this.audio.load();
      this.audio.currentTime = 0;
      await this.audio.play();
    } catch {
      this.error.set(true);
      this.playing.set(false);
    }
  }

  public stop(): void {
    this.audio.pause();
  }

  public destroy(): void {
    this.stop();
    this.stopMeter();
    this.audio.removeAttribute('src');
    this.audio.load();
    void this.context?.close();
    this.context = undefined;
  }

  private ensureGraph(): void {
    if (this.context || typeof AudioContext === 'undefined') return;
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaElementSource(this.audio);
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -30;
      compressor.knee.value = 20;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.2;
      const gain = ctx.createGain();
      gain.gain.value = 1.8; // make-up gain after compression
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(compressor).connect(gain).connect(analyser).connect(ctx.destination);
      this.context = ctx;
      this.analyser = analyser;
      this.samples = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    } catch {
      // No Web Audio: the element still plays directly, just without normalisation and meter.
      this.context = undefined;
    }
  }

  private startMeter(): void {
    this.stopMeter();
    const tick = () => {
      if (this.analyser && this.samples) {
        this.analyser.getByteTimeDomainData(this.samples);
        let sum = 0;
        for (const s of this.samples) {
          const v = (s - 128) / 128;
          sum += v * v;
        }
        this.level.set(Math.min(1, Math.sqrt(sum / this.samples.length) * 3));
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private stopMeter(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.level.set(0);
  }
}
