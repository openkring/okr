import { afterNextRender, Component, computed, DestroyRef, ElementRef, inject, input, signal } from '@angular/core';

import { toStrokes } from '@okr/games-jasstafel-util';

import { JASS_CHALK_STYLES } from './jass-chalk.scss';

const W = 320;

/**
 * One side's score the way it is chalked on a Jasstafel: a big Z whose top bar collects a cross
 * per 100, its diagonal a stroke per 50, its bottom bar a stroke per 20 — then the rest as tally
 * marks in groups of five.
 *
 * The drawing fills whatever box it gets: the viewBox keeps a fixed width of 320 units and takes
 * its height from the box's aspect ratio (measured with a ResizeObserver), so on a tall phone half
 * the Z is tall, on a wide tablet it is wide — strokes keep their size instead of being stretched.
 */
@Component({
  selector: 'okr-jass-chalk-z',
  standalone: true,
  styles: [JASS_CHALK_STYLES, `
    :host { flex: 1; }
    svg { width: 100%; height: 100%; display: block; }
  `],
  template: `
    <svg [attr.viewBox]="'0 0 ' + w + ' ' + h()" preserveAspectRatio="xMidYMid meet" role="img" [attr.aria-label]="points()">
      <defs>
        <filter id="jass-rough"><feTurbulence baseFrequency="0.9" numOctaves="1" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" /></filter>
      </defs>
      <!-- the Z -->
      <path class="jass-chalk" [attr.d]="'M20 ' + topY() + ' H300 L20 ' + bottomY() + ' H300'" opacity="0.5" />
      @for (c of hundreds(); track $index) {
        <path class="jass-chalk" [attr.d]="'M' + c.x + ' ' + c.y + ' l12 20 M' + (c.x + 12) + ' ' + c.y + ' l-12 20'" />
      }
      @for (p of fifties(); track $index) {
        <path class="jass-chalk" [attr.d]="'M' + p.x + ' ' + p.y + ' l14 10'" />
      }
      @for (x of twenties(); track $index) {
        <path class="jass-chalk" [attr.d]="'M' + x + ' ' + (bottomY() - 10) + ' v20'" />
      }
      <!-- the rest as tally marks, a diagonal through every fifth -->
      @for (g of tally(); track $index) {
        @for (i of g.strokes; track $index) {
          <path class="jass-chalk" [attr.d]="'M' + (g.x + i * 6) + ' ' + tallyY() + ' v14'" />
        }
        @if (g.strokes.length === 5) {
          <path class="jass-chalk" [attr.d]="'M' + (g.x - 3) + ' ' + (tallyY() + 12) + ' l32 -10'" />
        }
      }
    </svg>
  `,
})
export class JassChalkZ {
  public readonly points = input.required<number>();

  protected readonly w = W;
  /** viewBox height: the box's aspect ratio applied to the fixed width, never flatter than 140 */
  protected readonly h = signal(140);

  protected readonly topY = computed(() => Math.round(this.h() * 0.14));
  protected readonly bottomY = computed(() => Math.round(this.h() * 0.74));
  protected readonly tallyY = computed(() => Math.round(this.h() * 0.84));

  private readonly strokes = computed(() => toStrokes(this.points()));

  /** crosses along the top bar, 20 per row; further rows stack below it */
  protected readonly hundreds = computed(() =>
    Array.from({ length: this.strokes().hundreds }, (_, i) => ({
      x: 24 + (i % 20) * 13.5,
      y: this.topY() - 10 + Math.floor(i / 20) * 24,
    })));
  /** a stroke across the middle of the diagonal */
  protected readonly fifties = computed(() => {
    const midY = (this.topY() + this.bottomY()) / 2;
    return Array.from({ length: this.strokes().fifties }, (_, i) => ({ x: 150 - i * 18, y: midY - 5 + i * 6 }));
  });
  protected readonly twenties = computed(() =>
    Array.from({ length: this.strokes().twenties }, (_, i) => 30 + i * 12));
  protected readonly tally = computed(() => {
    const rest = this.strokes().rest;
    const groups: { x: number; strokes: number[] }[] = [];
    for (let i = 0; i < rest; i += 5) {
      groups.push({ x: 30 + groups.length * 40, strokes: Array.from({ length: Math.min(5, rest - i) }, (_, k) => k) });
    }
    return groups;
  });

  constructor() {
    const host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) this.h.set(Math.max(140, Math.round(W * height / width)));
      });
      observer.observe(host);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
