/** One engine tick: 1/60 s. */
export const STEP_MS = 1000 / 60;
/** At most this many ticks per frame; a longer gap (debugger, slow phone) is dropped. */
const MAX_TICKS_PER_FRAME = 5;

/**
 * A fixed-timestep `requestAnimationFrame` loop: `tick()` runs at exactly 60 Hz whatever the
 * display rate, `render(alpha)` once per frame with `alpha` = how far (0…1) the clock is into
 * the next tick, for smoothing. `tick()` may call `stop()`; the frame still renders once.
 */
export class MampfLoop {
  private raf = 0;
  private last = 0;
  private acc = 0;

  constructor(
    private readonly tick: () => void,
    private readonly render: (alpha: number) => void,
  ) {}

  public get running(): boolean {
    return this.raf !== 0;
  }

  public start(): void {
    if (this.raf) return;
    this.last = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  public stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private readonly frame = (now: number): void => {
    this.acc += Math.min(now - this.last, 250);
    this.last = now;
    let ticks = 0;
    while (this.acc >= STEP_MS && ticks < MAX_TICKS_PER_FRAME && this.raf) {
      this.tick();
      this.acc -= STEP_MS;
      ticks++;
    }
    if (ticks === MAX_TICKS_PER_FRAME) this.acc = 0;
    this.render(this.acc / STEP_MS);
    if (this.raf) this.raf = requestAnimationFrame(this.frame);
  };
}
