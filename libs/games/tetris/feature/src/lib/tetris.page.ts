import { Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, signal, viewChild } from '@angular/core';
import { IonButton, IonContent } from '@ionic/angular/standalone';

import { Header } from '@okr/shared-ui';
import { fill } from '@okr/shared-util-core';
import {
  COLS,
  ClearEvent,
  HIDDEN_ROWS,
  PIECE_TYPES,
  Piece,
  PieceType,
  SHAPES,
  TetrisState,
  VISIBLE_ROWS,
  cellsOf,
  dropY,
} from '@okr/games-tetris-util';

import { TetrisAction, TetrisStore } from './tetris.store';

/** Pieces shown in the "next" preview. */
const PREVIEW = 3;
/** How long the score pop-up after a line clear stays. */
const CLEAR_SHOWN_MS = 1400;
/** A touch that moved less than this and ended faster than `TAP_MS` counts as a tap. */
const TAP_PX = 10;
const TAP_MS = 250;
/** A swipe faster than this (px/ms) straight down drops the piece; straight up holds it. */
const FLICK_SPEED = 0.6;

type Colors = { well: string; grid: string; ghost: string; pieces: Record<PieceType, string> };

type Gesture = { id: number; x0: number; y0: number; t0: number; ax: number; ay: number; moved: boolean };

/** Keyboard → input. `e.key` (the label on the key), so QWERTZ `z` is still the key marked Z. */
const KEYS: Record<string, TetrisAction> = {
  ArrowLeft: 'left', a: 'left',
  ArrowRight: 'right', d: 'right',
  ArrowDown: 'down', s: 'down',
  ArrowUp: 'rotate', x: 'rotate', w: 'rotate',
  z: 'rotateCcw', y: 'rotateCcw', Control: 'rotateCcw',
  ' ': 'hardDrop',
  c: 'hold', Shift: 'hold',
};

/**
 * Blöckli — falling blocks on a canvas.
 *
 * THE LOOP LIVES HERE, NOT IN THE TEMPLATE. One `requestAnimationFrame` loop advances the store
 * and redraws the well and the two previews straight onto their canvases, and only when the game
 * state object changed. Nothing the loop touches is bound in the template, so a falling piece
 * causes no change detection at all; the HUD reads number-valued computeds that change a few
 * times per piece at most.
 *
 * The loop runs while the page is on screen: it starts after the first render and on
 * `ionViewDidEnter`, and stops on `ionViewWillLeave` (Ionic keeps a left page alive in its stack)
 * and on destroy. Leaving the page or hiding the tab pauses the game.
 *
 * Input: keyboard on the document; on the well, drag to move, tap to rotate, flick down to drop,
 * flick up to hold; on coarse pointers an on-screen pad whose left/right/down repeat while held.
 */
@Component({
  selector: 'okr-tetris-page',
  standalone: true,
  providers: [TetrisStore],
  imports: [Header, IonContent, IonButton],
  host: {
    '(document:keydown)': 'onKeyDown($event)',
    '(document:keyup)': 'onKeyUp($event)',
    '(document:visibilitychange)': 'onVisibility()',
  },
  template: `
    <okr-header [i18n]="{ title: store.i18n.title() }" />
    <ion-content class="ion-padding">
      <div class="tt-wrap">
        <div class="tt-play">

          <div class="tt-well">
            <canvas #wellCanvas
              [attr.aria-label]="store.i18n.board_label()"
              role="img"
              (pointerdown)="onPointerDown($event)"
              (pointermove)="onPointerMove($event)"
              (pointerup)="onPointerUp($event)"
              (pointercancel)="gesture = null"></canvas>

            @if (clearText(); as text) {
              <div class="tt-pop" aria-live="polite">{{ text }}</div>
            }

            @if (!store.running()) {
              <div class="tt-overlay">
                @switch (store.status()) {
                  @case ('ready') {
                    <p>{{ store.i18n.ready() }}</p>
                    <ion-button (click)="store.newGame()">{{ store.i18n.start() }}</ion-button>
                  }
                  @case ('paused') {
                    <p class="tt-overlay-title">{{ store.i18n.paused() }}</p>
                    <ion-button (click)="store.resume()">{{ store.i18n.resume() }}</ion-button>
                    <ion-button fill="clear" (click)="store.newGame()">{{ store.i18n.restart() }}</ion-button>
                  }
                  @case ('over') {
                    <p class="tt-overlay-title">{{ store.i18n.over() }}</p>
                    <p>{{ overScore() }}</p>
                    @if (store.newBest()) {
                      <p class="tt-best">{{ store.i18n.new_best() }}</p>
                    }
                    <ion-button (click)="store.newGame()">{{ store.i18n.again() }}</ion-button>
                  }
                }
              </div>
            }
          </div>

          <aside class="tt-side">
            <div class="tt-box">
              <span class="tt-label">{{ store.i18n.hold() }}</span>
              <canvas #holdCanvas class="tt-preview hold" aria-hidden="true"></canvas>
            </div>
            <div class="tt-box">
              <span class="tt-label">{{ store.i18n.next() }}</span>
              <canvas #nextCanvas class="tt-preview next" aria-hidden="true"></canvas>
            </div>
            <dl class="tt-stats">
              <dt>{{ store.i18n.score() }}</dt><dd>{{ store.score() }}</dd>
              <dt>{{ store.i18n.level() }}</dt><dd>{{ store.level() }}</dd>
              <dt>{{ store.i18n.lines() }}</dt><dd>{{ store.lines() }}</dd>
              <dt>{{ store.i18n.best() }}</dt><dd>{{ store.best() }}</dd>
            </dl>
            @if (store.running()) {
              <ion-button size="small" fill="outline" expand="block" (click)="store.pause()">{{ store.i18n.pause() }}</ion-button>
            }
          </aside>
        </div>

        <div class="tt-pad">
          <button type="button" [attr.aria-label]="store.i18n.hold_action()" (pointerdown)="tap($event, 'hold')">⇄</button>
          <button type="button" [attr.aria-label]="store.i18n.rotate_ccw()" (pointerdown)="tap($event, 'rotateCcw')">↺</button>
          <button type="button" [attr.aria-label]="store.i18n.rotate()" (pointerdown)="tap($event, 'rotate')">↻</button>
          <button type="button" [attr.aria-label]="store.i18n.hard_drop()" (pointerdown)="tap($event, 'hardDrop')">⤓</button>
          <button type="button" [attr.aria-label]="store.i18n.left()"
            (pointerdown)="hold($event, 'left')" (pointerup)="store.release('left')"
            (pointercancel)="store.release('left')" (pointerleave)="store.release('left')">←</button>
          <button type="button" [attr.aria-label]="store.i18n.soft_drop()"
            (pointerdown)="hold($event, 'down')" (pointerup)="store.release('down')"
            (pointercancel)="store.release('down')" (pointerleave)="store.release('down')">↓</button>
          <button type="button" class="wide" [attr.aria-label]="store.i18n.right()"
            (pointerdown)="hold($event, 'right')" (pointerup)="store.release('right')"
            (pointercancel)="store.release('right')" (pointerleave)="store.release('right')">→</button>
        </div>

        <details class="tt-rules">
          <summary>{{ store.i18n.rules_title() }}</summary>
          <ul>
            <li>{{ store.i18n.rules_goal() }}</li>
            <li>{{ store.i18n.rules_keys() }}</li>
            <li>{{ store.i18n.rules_touch() }}</li>
            <li>{{ store.i18n.rules_hold() }}</li>
            <li>{{ store.i18n.rules_score() }}</li>
          </ul>
        </details>
      </div>
    </ion-content>
  `,
  styles: [`
    /* The well stays dark in both themes: the coloured blocks read best on a dark ground. */
    :host {
      --tt-well: #14161b;
      --tt-grid: rgba(255, 255, 255, 0.05);
      --tt-ghost: rgba(255, 255, 255, 0.28);
      --tt-I: #4cc9d9;
      --tt-J: #4f7fe0;
      --tt-L: #ec9a3c;
      --tt-O: #e9cf4a;
      --tt-S: #5dbb63;
      --tt-T: #a66ad8;
      --tt-Z: #e2574c;
    }
    .tt-wrap { max-width: 34rem; margin-inline: auto; display: grid; gap: 0.75rem; }
    .tt-play { display: grid; grid-template-columns: auto minmax(5.5rem, 7rem); gap: 0.75rem; justify-content: center; align-items: start; }

    .tt-well {
      position: relative;
      aspect-ratio: 1 / 2;
      /* as tall as the screen allows, minus header, padding and (on touch) the pad */
      width: min(calc(100vw - 9.5rem), calc((100dvh - 11rem) / 2), 22rem);
      border-radius: 6px;
      overflow: hidden;
      background: var(--tt-well);
      box-shadow: 0 0 0 1px var(--ion-color-medium-tint);
    }
    @media (pointer: coarse) {
      .tt-well { width: min(calc(100vw - 9.5rem), calc((100dvh - 19rem) / 2), 22rem); }
    }
    .tt-well canvas { display: block; width: 100%; height: 100%; touch-action: none; user-select: none; -webkit-user-select: none; }

    .tt-overlay {
      position: absolute; inset: 0;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.25rem;
      padding: 1rem; text-align: center; text-wrap: balance;
      background: color-mix(in srgb, var(--tt-well) 82%, transparent);
      color: #f2f2f2;
    }
    .tt-overlay p { margin: 0 0 0.5rem; }
    .tt-overlay-title { font-size: 1.3rem; font-weight: 700; }
    .tt-best { color: var(--tt-O); font-weight: 600; }

    .tt-pop {
      position: absolute; left: 0; right: 0; top: 38%;
      text-align: center; font-weight: 800; font-size: 1.1rem; color: #fff;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
      pointer-events: none;
      animation: tt-rise ${CLEAR_SHOWN_MS}ms ease-out forwards;
    }
    @keyframes tt-rise {
      from { transform: translateY(0); opacity: 1; }
      70% { opacity: 1; }
      to { transform: translateY(-2rem); opacity: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .tt-pop { animation: none; }
    }

    .tt-side { display: grid; gap: 0.6rem; min-width: 0; }
    .tt-box { display: grid; gap: 0.25rem; }
    .tt-label, .tt-stats dt {
      color: var(--ion-color-medium); font-size: 0.7rem;
      text-transform: uppercase; letter-spacing: 0.07em;
    }
    .tt-preview { display: block; width: 100%; border-radius: 4px; background: var(--tt-well); }
    .tt-preview.hold { aspect-ratio: 2 / 1; }
    .tt-preview.next { aspect-ratio: 4 / 7; }
    .tt-stats { margin: 0; display: grid; gap: 0.1rem; }
    .tt-stats dd {
      margin: 0 0 0.35rem; font-size: 1.15rem; font-weight: 700;
      font-variant-numeric: tabular-nums; color: var(--ion-text-color);
    }

    .tt-pad { display: none; }
    @media (pointer: coarse) {
      .tt-pad {
        display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem;
        max-width: 24rem; width: 100%; margin-inline: auto;
        touch-action: none; user-select: none; -webkit-user-select: none;
      }
    }
    .tt-pad button {
      height: 3rem; border-radius: 8px; border: none;
      font-size: 1.4rem; line-height: 1;
      background: var(--ion-color-light); color: var(--ion-color-light-contrast);
    }
    .tt-pad button:active { background: var(--ion-color-light-shade); }
    .tt-pad button.wide { grid-column: span 2; }

    .tt-rules { border-top: 1px solid var(--ion-color-light-shade); padding-top: 0.75rem; }
    .tt-rules summary { cursor: pointer; font-weight: 600; color: var(--ion-text-color); }
    .tt-rules ul { padding-left: 1.2em; margin: 0.5rem 0 0; display: grid; gap: 0.25rem; }
  `],
})
export class TetrisPage {
  protected readonly store = inject(TetrisStore);
  private readonly host = inject(ElementRef<HTMLElement>);

  private readonly wellRef = viewChild.required<ElementRef<HTMLCanvasElement>>('wellCanvas');
  private readonly holdRef = viewChild.required<ElementRef<HTMLCanvasElement>>('holdCanvas');
  private readonly nextRef = viewChild.required<ElementRef<HTMLCanvasElement>>('nextCanvas');

  private raf = 0;
  private lastTime = 0;
  private drawn: TetrisState | null = null;
  private colors: Colors | null = null;
  private resize: ResizeObserver | null = null;
  protected gesture: Gesture | null = null;

  /** The clear currently shown in the pop-up; cleared again after `CLEAR_SHOWN_MS`. */
  private readonly shownClear = signal<ClearEvent | null>(null);

  protected readonly clearText = computed(() => {
    const clear = this.shownClear();
    if (!clear) return '';
    const i18n = this.store.i18n;
    const label = [i18n.clear_1, i18n.clear_2, i18n.clear_3, i18n.clear_4][clear.lines - 1]();
    const parts = [clear.backToBack ? i18n.clear_b2b() : label];
    if (clear.combo > 0) parts.push(fill(i18n.clear_combo(), { count: clear.combo }));
    return `${parts.join(' · ')}  +${clear.points}`;
  });

  protected readonly overScore = computed(() => fill(this.store.i18n.over_score(), { score: this.store.score() }));

  constructor() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A game restored from storage carries its last clear; do not replay that pop-up on load.
    const restored = this.store.lastClear()?.id;
    effect(() => {
      const clear = this.store.lastClear();
      if (!clear || (clear.id === restored && this.store.game().pieces === clear.id)) return;
      this.shownClear.set(clear);
      clearTimeout(timer);
      timer = setTimeout(() => this.shownClear.set(null), CLEAR_SHOWN_MS);
    });

    afterNextRender(() => {
      this.resize = new ResizeObserver(() => this.redraw());
      for (const ref of [this.wellRef(), this.holdRef(), this.nextRef()]) this.resize.observe(ref.nativeElement);
      this.start();
    });

    inject(DestroyRef).onDestroy(() => {
      clearTimeout(timer);
      this.stop();
      this.resize?.disconnect();
      this.store.pause();
    });
  }

  // ---- Ionic view lifecycle ---------------------------------------------------------------------

  ionViewDidEnter(): void {
    this.start();
  }

  ionViewWillLeave(): void {
    this.store.pause();
    this.stop();
  }

  // ---- loop ------------------------------------------------------------------------------------

  private start(): void {
    if (this.raf) return;
    this.lastTime = performance.now();
    const loop = (now: number) => {
      this.store.frame(now - this.lastTime, now);
      this.lastTime = now;
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Forces a full repaint on the next frame (new size, or theme may have changed). */
  private redraw(): void {
    this.drawn = null;
    this.colors = null;
  }

  private draw(): void {
    const game = this.store.game();
    if (game === this.drawn) return;
    this.drawn = game;
    this.colors ??= this.readColors();
    this.drawWell(game, this.colors);
    this.drawPreview(this.holdRef().nativeElement, game.hold ? [game.hold] : [], this.colors, game.holdUsed);
    this.drawPreview(this.nextRef().nativeElement, game.queue.slice(0, PREVIEW), this.colors, false);
  }

  private readColors(): Colors {
    const css = getComputedStyle(this.host.nativeElement);
    const v = (name: string) => css.getPropertyValue(name).trim();
    return {
      well: v('--tt-well'),
      grid: v('--tt-grid'),
      ghost: v('--tt-ghost'),
      pieces: Object.fromEntries(PIECE_TYPES.map(t => [t, v(`--tt-${t}`)])) as Record<PieceType, string>,
    };
  }

  /** Sizes the canvas backing store to its CSS box × device pixel ratio; returns the context. */
  private context(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return w > 0 && h > 0 ? canvas.getContext('2d') : null;
  }

  private drawWell(game: TetrisState, colors: Colors): void {
    const canvas = this.wellRef().nativeElement;
    const ctx = this.context(canvas);
    if (!ctx) return;
    const size = canvas.width / COLS;
    ctx.fillStyle = colors.well;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.drawGrid(ctx, size, colors.grid);

    for (let y = HIDDEN_ROWS; y < HIDDEN_ROWS + VISIBLE_ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const cell = game.board[y * COLS + x];
        if (cell) this.block(ctx, x * size, (y - HIDDEN_ROWS) * size, size, colors.pieces[cell]);
      }
    }

    const piece = game.active;
    if (!piece) return;
    const ghost: Piece = { ...piece, y: dropY(game.board, piece) };
    ctx.strokeStyle = colors.ghost;
    ctx.lineWidth = Math.max(1, size * 0.08);
    for (const [x, y] of cellsOf(ghost)) {
      if (y < HIDDEN_ROWS) continue;
      const inset = ctx.lineWidth / 2 + size * 0.06;
      ctx.strokeRect(x * size + inset, (y - HIDDEN_ROWS) * size + inset, size - 2 * inset, size - 2 * inset);
    }
    for (const [x, y] of cellsOf(piece)) {
      if (y >= HIDDEN_ROWS) this.block(ctx, x * size, (y - HIDDEN_ROWS) * size, size, colors.pieces[piece.type]);
    }
  }

  private drawGrid(ctx: CanvasRenderingContext2D, size: number, color: string): void {
    const { width, height } = ctx.canvas;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < COLS; x++) {
      ctx.moveTo(Math.round(x * size) + 0.5, 0);
      ctx.lineTo(Math.round(x * size) + 0.5, height);
    }
    for (let y = 1; y < VISIBLE_ROWS; y++) {
      ctx.moveTo(0, Math.round(y * size) + 0.5);
      ctx.lineTo(width, Math.round(y * size) + 0.5);
    }
    ctx.stroke();
  }

  /** Pieces stacked vertically, each centred in a 4 × 2 cell slot (hold: one slot, next: three). */
  private drawPreview(canvas: HTMLCanvasElement, types: PieceType[], colors: Colors, dimmed: boolean): void {
    const ctx = this.context(canvas);
    if (!ctx) return;
    ctx.fillStyle = colors.well;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const size = canvas.width / 5;
    const slot = canvas.height / Math.max(types.length, 1);
    ctx.globalAlpha = dimmed ? 0.35 : 1;
    types.forEach((type, i) => {
      const cells = SHAPES[type][0];
      const xs = cells.map(([x]) => x);
      const ys = cells.map(([, y]) => y);
      const w = (Math.max(...xs) - Math.min(...xs) + 1) * size;
      const h = (Math.max(...ys) - Math.min(...ys) + 1) * size;
      const ox = (canvas.width - w) / 2 - Math.min(...xs) * size;
      const oy = i * slot + (slot - h) / 2 - Math.min(...ys) * size;
      for (const [x, y] of cells) this.block(ctx, ox + x * size, oy + y * size, size, colors.pieces[type]);
    });
    ctx.globalAlpha = 1;
  }

  /** One square with a thin gap and a lighter top edge, so stacked blocks stay readable. */
  private block(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
    const gap = Math.max(1, size * 0.06);
    ctx.fillStyle = color;
    ctx.fillRect(x + gap, y + gap, size - 2 * gap, size - 2 * gap);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.fillRect(x + gap, y + gap, size - 2 * gap, Math.max(1, size * 0.14));
  }

  // ---- keyboard ----------------------------------------------------------------------------------

  private static isTyping(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
  }

  protected onKeyDown(e: KeyboardEvent): void {
    if (e.metaKey || e.altKey || TetrisPage.isTyping(e.target)) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

    if (key === 'p' || key === 'Escape') {
      e.preventDefault();
      this.store.togglePause();
      return;
    }
    if (key === 'Enter' && !this.store.running()) {
      e.preventDefault();
      if (this.store.status() === 'paused') this.store.resume();
      else this.store.newGame();
      return;
    }
    const action = KEYS[key];
    if (!action || !this.store.running()) return;
    e.preventDefault();   // arrows and space would scroll the content
    if (!e.repeat) this.store.press(action);   // held keys repeat in the store, not by the OS
  }

  protected onKeyUp(e: KeyboardEvent): void {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const action = KEYS[key];
    if (action) this.store.release(action);
  }

  protected onVisibility(): void {
    if (document.hidden) this.store.pause();
  }

  // ---- touch pad ---------------------------------------------------------------------------------

  protected tap(e: PointerEvent, action: TetrisAction): void {
    e.preventDefault();
    this.store.act(action);
  }

  protected hold(e: PointerEvent, action: TetrisAction): void {
    e.preventDefault();
    this.store.press(action);
  }

  // ---- gestures on the well ------------------------------------------------------------------------

  protected onPointerDown(e: PointerEvent): void {
    if (!this.store.running() || this.gesture) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    this.gesture = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, ax: e.clientX, ay: e.clientY, moved: false };
  }

  /** Every cell width dragged sideways moves one column; every cell dragged down drops one row. */
  protected onPointerMove(e: PointerEvent): void {
    const g = this.gesture;
    if (g?.id !== e.pointerId) return;
    const cell = this.wellRef().nativeElement.clientWidth / COLS;
    while (e.clientX - g.ax >= cell) { this.store.act('right'); g.ax += cell; g.moved = true; }
    while (g.ax - e.clientX >= cell) { this.store.act('left'); g.ax -= cell; g.moved = true; }
    // A fast flick is a hard drop, decided on release — do not soft-drop it row by row first.
    const speed = (e.clientY - g.y0) / Math.max(1, e.timeStamp - g.t0);
    while (e.clientY - g.ay >= cell && speed < FLICK_SPEED) { this.store.act('down'); g.ay += cell; g.moved = true; }
  }

  protected onPointerUp(e: PointerEvent): void {
    const g = this.gesture;
    this.gesture = null;
    if (g?.id !== e.pointerId) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    const dt = e.timeStamp - g.t0;
    const cell = this.wellRef().nativeElement.clientWidth / COLS;
    const vertical = Math.abs(dy) > 2 * Math.abs(dx);

    if (!g.moved && Math.abs(dx) < TAP_PX && Math.abs(dy) < TAP_PX && dt < TAP_MS) {
      this.store.act('rotate');
    } else if (vertical && dy > 2 * cell && dy / dt >= FLICK_SPEED) {
      this.store.act('hardDrop');
    } else if (vertical && -dy > 2 * cell && -dy / dt >= FLICK_SPEED) {
      this.store.act('hold');
    }
  }
}
