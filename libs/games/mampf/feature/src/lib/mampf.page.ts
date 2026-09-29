import { Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, viewChild } from '@angular/core';
import { IonButton, IonContent } from '@ionic/angular/standalone';

import { Header } from '@okr/shared-ui';
import { fill } from '@okr/shared-util-core';
import { Dir, GameState, newGame, ownsKeyboard, step, swipeDirection } from '@okr/games-mampf-util';

import { MampfLoop } from './mampf.loop';
import { MampfRenderer, Pose, poses } from './mampf.renderer';
import { MampfSound } from './mampf.sound';
import { MampfStore } from './mampf.store';

/** Keyboard → direction. `e.key`, so the letters work on QWERTZ and QWERTY alike. */
const KEYS: Record<string, Dir> = {
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
};
/** A finger must travel this far (CSS px) before it counts as a swipe. */
const SWIPE_PX = 24;

/**
 * Mampf — a maze-chase game on one canvas.
 *
 * THE LOOP LIVES HERE, NOT IN THE TEMPLATE. `MampfLoop` calls `tick()` 60 times a second, which
 * runs the pure engine `step()` on the mutable `GameState` held in this class, and `render()`
 * once per frame, which draws straight onto the canvas. Nothing the loop touches is bound in the
 * template; the HUD only changes when `store.sync()` is called for an event.
 *
 * Leaving the page (`ionViewWillLeave` — Ionic keeps it alive in its stack), hiding the tab and
 * P/Esc pause the game; it never resumes by itself.
 */
@Component({
  selector: 'okr-mampf-page',
  standalone: true,
  providers: [MampfStore],
  imports: [Header, IonContent, IonButton],
  host: {
    '(document:keydown)': 'onKeyDown($event)',
    '(document:visibilitychange)': 'onVisibility()',
  },
  template: `
    <okr-header [i18n]="{ title: store.i18n.title() }" />
    <ion-content class="ion-padding">
      <div class="mf-wrap">

        <div class="mf-hud">
          <span><small>{{ store.i18n.hud_score() }}</small><b>{{ store.score() }}</b></span>
          <span><small>{{ store.i18n.hud_high() }}</small><b>{{ store.highScore() }}</b></span>
          <span><small>{{ store.i18n.hud_level() }}</small><b>{{ store.level() }}</b></span>
          <span class="mf-lives" role="img" [attr.aria-label]="livesLabel()">
            @for (life of spareLives(); track $index) {
              <i class="mf-life"></i>
            }
          </span>
        </div>

        <div class="mf-board" #board>
          <canvas #canvas
            role="img"
            [attr.aria-label]="store.i18n.canvas_label()"
            (pointerdown)="onPointerDown($event)"
            (pointermove)="onPointerMove($event)"
            (pointerup)="swipe = null"
            (pointercancel)="swipe = null"></canvas>

          @switch (store.status()) {
            @case ('idle') {
              <div class="mf-overlay">
                <p>{{ store.i18n.overlay_idle() }}</p>
                <ion-button (click)="start()">{{ store.i18n.start() }}</ion-button>
              </div>
            }
            @case ('ready') {
              <div class="mf-overlay passive" aria-live="polite">
                <p class="mf-big">{{ store.i18n.overlay_ready() }}</p>
                <p>{{ levelText() }}</p>
              </div>
            }
            @case ('paused') {
              <div class="mf-overlay">
                <p class="mf-big">{{ store.i18n.overlay_paused() }}</p>
                <ion-button (click)="resume()">{{ store.i18n.resume() }}</ion-button>
                <ion-button fill="clear" (click)="start()">{{ store.i18n.restart() }}</ion-button>
              </div>
            }
            @case ('gameOver') {
              <div class="mf-overlay" aria-live="polite">
                <p class="mf-big">{{ store.i18n.overlay_over() }}</p>
                <p>{{ scoreText() }}</p>
                @if (store.newHigh() && store.score() > 0) {
                  <p class="mf-high">{{ store.i18n.overlay_new_high() }}</p>
                }
                <ion-button (click)="start()">{{ store.i18n.again() }}</ion-button>
              </div>
            }
          }
        </div>

        @if (store.dpad()) {
          <div class="mf-pad">
            <button type="button" class="up" [attr.aria-label]="store.i18n.dir_up()" (pointerdown)="press($event, 'up')">▲</button>
            <button type="button" class="left" [attr.aria-label]="store.i18n.dir_left()" (pointerdown)="press($event, 'left')">◀</button>
            <button type="button" class="right" [attr.aria-label]="store.i18n.dir_right()" (pointerdown)="press($event, 'right')">▶</button>
            <button type="button" class="down" [attr.aria-label]="store.i18n.dir_down()" (pointerdown)="press($event, 'down')">▼</button>
          </div>
        }

        <div class="mf-controls">
          @if (running()) {
            <ion-button size="small" (click)="pause()">{{ store.i18n.pause() }}</ion-button>
          }
          <ion-button size="small" fill="outline" (click)="store.toggleMute()">
            {{ store.muted() ? store.i18n.sound_on() : store.i18n.sound_off() }}
          </ion-button>
          <ion-button size="small" fill="outline" (click)="store.toggleDpad()">
            {{ store.dpad() ? store.i18n.dpad_off() : store.i18n.dpad_on() }}
          </ion-button>
        </div>
        <p class="mf-hint">{{ store.dpad() ? store.i18n.hint_touch() : store.i18n.hint_keys() }}</p>

        <details class="mf-rules">
          <summary>{{ store.i18n.rules_title() }}</summary>
          <ul>
            <li>{{ store.i18n.rules_goal() }}</li>
            <li>{{ store.i18n.rules_pellet() }}</li>
            <li>{{ store.i18n.rules_lives() }}</li>
            <li><i class="mf-ghost chaser"></i>{{ store.i18n.ghost_chaser() }}</li>
            <li><i class="mf-ghost ambusher"></i>{{ store.i18n.ghost_ambusher() }}</li>
            <li><i class="mf-ghost fickle"></i>{{ store.i18n.ghost_fickle() }}</li>
            <li><i class="mf-ghost shy"></i>{{ store.i18n.ghost_shy() }}</li>
          </ul>
        </details>
      </div>
    </ion-content>
  `,
  styles: [`
    .mf-wrap { max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; gap: 0.75rem; }

    .mf-hud { display: flex; align-items: flex-end; gap: 1.25rem; color: var(--ion-text-color); }
    .mf-hud span { display: flex; flex-direction: column; line-height: 1.1; }
    .mf-hud small { font-size: 0.75rem; color: var(--ion-color-medium); }
    .mf-hud b { font-size: 1.2rem; font-variant-numeric: tabular-nums; }
    .mf-hud .mf-lives { flex-direction: row; gap: 0.3rem; margin-left: auto; min-height: 1rem; }
    .mf-life {
      width: 1rem; height: 1rem; border-radius: 50%;
      background: conic-gradient(from 60deg, transparent 0 60deg, var(--ion-color-secondary) 60deg);
    }

    .mf-board {
      position: relative; width: 100%; aspect-ratio: 28 / 31; max-height: 70vh;
      display: flex; align-items: center; justify-content: center;
    }
    .mf-board canvas { display: block; touch-action: none; }

    .mf-overlay {
      position: absolute; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 0.5rem; padding: 1rem; text-align: center;
      color: var(--ion-text-color);
      background: color-mix(in srgb, var(--ion-background-color, #fff) 78%, transparent);
    }
    .mf-overlay.passive { background: transparent; pointer-events: none; }
    .mf-overlay p { margin: 0; }
    .mf-big { font-size: 1.6rem; font-weight: 700; color: var(--ion-color-secondary); }
    .mf-high { font-weight: 600; color: var(--ion-color-success); }

    .mf-pad {
      display: grid; grid-template-columns: repeat(3, 3.5rem); grid-template-rows: repeat(3, 3rem);
      gap: 0.35rem; justify-content: center;
    }
    .mf-pad button {
      border: none; border-radius: 8px; font-size: 1.3rem; line-height: 1; touch-action: none;
      background: var(--ion-color-light); color: var(--ion-color-light-contrast);
    }
    .mf-pad button:active { background: var(--ion-color-light-shade); }
    .mf-pad .up { grid-column: 2; grid-row: 1; }
    .mf-pad .left { grid-column: 1; grid-row: 2; }
    .mf-pad .right { grid-column: 3; grid-row: 2; }
    .mf-pad .down { grid-column: 2; grid-row: 3; }

    .mf-controls { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; }
    .mf-hint { margin: 0; text-align: center; font-size: 0.85rem; color: var(--ion-color-medium); }

    .mf-rules { border-top: 1px solid var(--ion-color-light-shade); padding-top: 0.75rem; }
    .mf-rules summary { cursor: pointer; font-weight: 600; color: var(--ion-text-color); }
    .mf-rules ul { padding-left: 1.2em; margin: 0.5rem 0 0; display: grid; gap: 0.35rem; }
    .mf-ghost { display: inline-block; width: 0.8rem; height: 0.8rem; border-radius: 50% 50% 2px 2px; margin-right: 0.4rem; vertical-align: -0.05rem; }
    .mf-ghost.chaser { background: #e53935; }
    .mf-ghost.ambusher { background: #ec6fb4; }
    .mf-ghost.fickle { background: #1fc3d6; }
    .mf-ghost.shy { background: #ff9f1c; }
  `],
})
export class MampfPage {
  protected readonly store = inject(MampfStore);
  private readonly host = inject(ElementRef<HTMLElement>);

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly boardRef = viewChild.required<ElementRef<HTMLElement>>('board');

  /** The running game, mutated in place by `step()`. Before the first start: a still preview. */
  private game: GameState | null = null;
  private readonly preview = newGame(0);
  /** Input collected since the last tick; the engine keeps it buffered after that. */
  private want: Dir | null = null;
  private prev: Pose[] | null = null;

  private renderer: MampfRenderer | null = null;
  private readonly sound = new MampfSound();
  private readonly loop = new MampfLoop(() => this.tick(), alpha => this.render(alpha));
  private resize: ResizeObserver | null = null;
  private reducedMotion = false;
  /** False while Ionic keeps the page in its stack behind another one. */
  private active = false;
  protected swipe: { id: number; x: number; y: number } | null = null;

  protected readonly running = computed(() =>
    ['ready', 'playing', 'dying', 'levelClear'].includes(this.store.status()));
  protected readonly spareLives = computed(() => Array.from({ length: Math.max(0, this.store.lives() - 1) }));
  protected readonly livesLabel = computed(() =>
    fill(this.store.i18n.hud_lives(), { count: Math.max(0, this.store.lives() - 1) }));
  protected readonly levelText = computed(() => fill(this.store.i18n.overlay_level(), { level: this.store.level() }));
  protected readonly scoreText = computed(() => fill(this.store.i18n.overlay_score(), { score: this.store.score() }));

  constructor() {
    effect(() => this.sound.setMuted(this.store.muted()));

    const motion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    const dark = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
    const onMotion = () => { this.reducedMotion = !!motion?.matches; };
    const onTheme = () => {
      this.renderer?.invalidate();
      this.render(0);
    };

    afterNextRender(() => {
      this.active = true;
      onMotion();
      motion?.addEventListener('change', onMotion);
      dark?.addEventListener('change', onTheme);
      this.renderer = new MampfRenderer(this.canvasRef().nativeElement, this.host.nativeElement);
      this.resize = new ResizeObserver(() => this.fit());
      this.resize.observe(this.boardRef().nativeElement);
      this.fit();
    });

    inject(DestroyRef).onDestroy(() => {
      this.loop.stop();
      this.resize?.disconnect();
      motion?.removeEventListener('change', onMotion);
      dark?.removeEventListener('change', onTheme);
      this.sound.close();
      this.store.persist();
    });
  }

  // ---- Ionic view lifecycle ---------------------------------------------------------------------

  ionViewDidEnter(): void {
    this.active = true;
  }

  ionViewWillLeave(): void {
    this.active = false;
    this.pause();
  }

  // ---- game control -----------------------------------------------------------------------------

  protected start(): void {
    this.sound.unlock();
    this.loop.stop();
    this.game = newGame(Math.floor(Math.random() * 2 ** 32));
    this.want = null;
    this.prev = null;
    this.store.begin();
    this.store.sync(this.game);
    this.sound.jingle();
    this.loop.start();
  }

  protected pause(): void {
    if (!this.loop.running) return;
    this.loop.stop();
    this.sound.stopSiren();
    this.store.markPaused();
  }

  protected resume(): void {
    if (!this.game || this.store.status() !== 'paused') return;
    this.sound.unlock();
    this.store.sync(this.game);
    if (this.game.frightTicks > 0) this.sound.resumeSiren();
    this.loop.start();
  }

  private tick(): void {
    const game = this.game;
    if (!game) return;
    this.prev = poses(game);
    const events = step(game, this.want);
    this.want = null;
    for (const event of events) this.sound.onEvent(event);
    if (events.length || game.status !== this.store.status()) this.store.sync(game);
    if (game.status === 'gameOver') this.loop.stop();
  }

  private render(alpha: number): void {
    this.renderer?.draw(this.game ?? this.preview, this.prev, alpha, this.reducedMotion, performance.now());
  }

  private fit(): void {
    const board = this.boardRef().nativeElement;
    this.renderer?.resize(board.clientWidth, board.clientHeight);
    this.render(0);
  }

  // ---- input ------------------------------------------------------------------------------------

  protected press(event: PointerEvent, dir: Dir): void {
    event.preventDefault();
    this.want = dir;
  }

  protected onPointerDown(event: PointerEvent): void {
    this.swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
    (event.target as Element).setPointerCapture?.(event.pointerId);
  }

  protected onPointerMove(event: PointerEvent): void {
    const s = this.swipe;
    if (!s || s.id !== event.pointerId) return;
    const dir = swipeDirection(event.clientX - s.x, event.clientY - s.y, SWIPE_PX);
    if (!dir) return;
    this.want = dir;
    // re-anchor, so one continuous finger can steer through several turns
    this.swipe = { id: s.id, x: event.clientX, y: event.clientY };
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (!this.active) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    const dir = KEYS[event.key];
    if (dir) {
      event.preventDefault();
      this.want = dir;
      return;
    }
    if (event.key === 'p' || event.key === 'P' || event.key === 'Escape') {
      event.preventDefault();
      if (this.store.status() === 'paused') this.resume();
      else this.pause();
      return;
    }
    if ((event.key === ' ' || event.key === 'Enter') && ownsKeyboard(target, this.boardRef().nativeElement)) {
      const status = this.store.status();
      if (status === 'idle' || status === 'gameOver') {
        event.preventDefault();
        this.start();
      } else if (status === 'paused') {
        event.preventDefault();
        this.resume();
      }
    }
  }

  protected onVisibility(): void {
    if (document.hidden) this.pause();
  }
}
