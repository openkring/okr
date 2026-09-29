import { Component, computed, input } from '@angular/core';

import { toStrokes } from '@okr/games-jasstafel-util';

import { JASS_CHALK_STYLES } from './jass-chalk.scss';

/**
 * One side's score the way it is chalked on a Jasstafel: a big Z whose top bar collects a cross
 * per 100, its diagonal a stroke per 50, its bottom bar a stroke per 20 — then the rest as tally
 * marks in groups of five. An optional target is drawn as a dashed line under the Z.
 */
@Component({
  selector: 'okr-jass-chalk-z',
  standalone: true,
  styles: [JASS_CHALK_STYLES, `svg { width: 100%; height: auto; display: block; }`],
  template: `
    <svg viewBox="0 0 320 140" role="img" [attr.aria-label]="points()">
      <defs>
        <filter id="jass-rough"><feTurbulence baseFrequency="0.9" numOctaves="1" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" /></filter>
      </defs>
      <!-- the Z -->
      <path class="jass-chalk" d="M20 20 H300 L20 110 H300" opacity="0.5" />
      @for (x of hundreds(); track $index) {
        <path class="jass-chalk" [attr.d]="'M' + x + ' 10 l12 20 M' + (x + 12) + ' 10 l-12 20'" />
      }
      @for (p of fifties(); track $index) {
        <path class="jass-chalk" [attr.d]="'M' + p.x + ' ' + p.y + ' l14 10'" />
      }
      @for (x of twenties(); track $index) {
        <path class="jass-chalk" [attr.d]="'M' + x + ' 100 v20'" />
      }
      <!-- the rest as tally marks, a diagonal through every fifth -->
      @for (g of tally(); track $index) {
        @for (i of g.strokes; track $index) {
          <path class="jass-chalk" [attr.d]="'M' + (g.x + i * 6) + ' 124 v14'" />
        }
        @if (g.strokes.length === 5) {
          <path class="jass-chalk" [attr.d]="'M' + (g.x - 3) + ' 136 l32 -10'" />
        }
      }
      @if (target()) {
        <path class="jass-chalk" d="M20 132 H300" stroke-dasharray="6 8" opacity="0.4" />
      }
    </svg>
  `,
})
export class JassChalkZ {
  public readonly points = input.required<number>();
  public readonly target = input<number>();

  private readonly strokes = computed(() => toStrokes(this.points()));

  /** crosses along the top bar; wraps into a second, tighter row after 20 */
  protected readonly hundreds = computed(() =>
    Array.from({ length: this.strokes().hundreds }, (_, i) => 24 + (i % 20) * 13.5));
  /** strokes across the diagonal from (300,20) to (20,110) */
  protected readonly fifties = computed(() =>
    Array.from({ length: this.strokes().fifties }, (_, i) => ({ x: 150 - i * 18, y: 64 + i * 6 })));
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
}
