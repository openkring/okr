import { afterNextRender, Component, computed, DestroyRef, ElementRef, inject, input, output, signal } from '@angular/core';

import { JassChalkUnit, JassStrokes } from '@okr/games-jasstafel-util';

import { JASS_CHALK_STYLES } from './jass-chalk.scss';

const W = 320;
/** the Z runs from X0 to X1; the remainder is written right of it */
const X0 = 16;
const X1 = 272;
/** vertical stroke length (owner: one third longer than the first version's 20) */
const V = 27;
/** the "vertical" strokes lean slightly, as drawn by hand */
const TILT = 3;
/** distance between the strokes of a bundle, and between bundles */
const STEP = 7;
const BUNDLE = 4 * STEP + 12;
const PER_ROW = Math.floor((X1 - X0) / BUNDLE);

type Line = { x1: number; y1: number; x2: number; y2: number };

/** 100s or 20s: bundles of four vertical strokes crossed by a fifth, diagonal one. */
function tally(count: number, lineY: number, rowDir: 1 | -1): Line[] {
  const lines: Line[] = [];
  for (let b = 0; b * 5 < count; b++) {
    const inBundle = Math.min(5, count - b * 5);
    const x = X0 + 8 + (b % PER_ROW) * BUNDLE;
    const y = lineY + rowDir * Math.floor(b / PER_ROW) * (V + 8);
    for (let i = 0; i < Math.min(4, inBundle); i++) {
      lines.push({ x1: x + i * STEP, y1: y + V / 2, x2: x + i * STEP + TILT, y2: y - V / 2 });
    }
    if (inBundle === 5) lines.push({ x1: x - 4, y1: y + V / 2 - 3, x2: x + 3 * STEP + 4, y2: y - V / 2 + 3 });
  }
  return lines;
}

/**
 * One side's score chalked on a Jasstafel Z: 100s on the top line, 50s as diagonal strokes in the
 * middle (two make a cross = 100), 20s on the bottom line, and the remainder below 20 as a number
 * right of the Z. Tapping the top, middle or bottom band adds one 100, 50 or 20 (`tapped`).
 *
 * The drawing fills its box: the viewBox keeps a fixed width and takes its height from the box's
 * aspect ratio (ResizeObserver), so strokes keep their size on a tall phone half or a wide tablet.
 */
@Component({
  selector: 'okr-jass-chalk-z',
  standalone: true,
  styles: [JASS_CHALK_STYLES, `
    :host { flex: 1; }
    svg { width: 100%; height: 100%; display: block; }
    .tap { fill: transparent; cursor: pointer; }
    .tap:active { fill: rgba(242, 240, 230, 0.08); }
    .rest { fill: var(--jass-chalk); font-size: 24px; text-anchor: middle; dominant-baseline: middle; }
  `],
  template: `
    <svg [attr.viewBox]="'0 0 ' + w + ' ' + h()" preserveAspectRatio="xMidYMid meet" role="img" [attr.aria-label]="ariaLabel()">
      <defs>
        <!-- userSpaceOnUse: a region from each stroke's bounding box collapses to width 0 on a
             vertical line, and the browser then drops the line altogether -->
        <filter id="jass-rough" filterUnits="userSpaceOnUse" x="-20" y="-20" [attr.width]="w + 40" [attr.height]="h() + 40"><feTurbulence baseFrequency="0.9" numOctaves="1" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" /></filter>
      </defs>
      <path class="jass-chalk" [attr.d]="zPath()" opacity="0.5" />
      @for (l of strokeLines(); track $index) {
        <line class="jass-chalk" [attr.x1]="l.x1" [attr.y1]="l.y1" [attr.x2]="l.x2" [attr.y2]="l.y2" />
      }
      @if (strokes().rest) {
        <text class="rest" [attr.x]="(x1 + w) / 2" [attr.y]="bottomY()">{{ strokes().rest }}</text>
      }
      <!-- tap bands: top line = 100, diagonal = 50, bottom line = 20 -->
      <rect class="tap" x="0" y="0" [attr.width]="w" [attr.height]="band1()" role="button"
        [attr.aria-label]="tapLabel() + ' +100'" (click)="tapped.emit(100)" />
      <rect class="tap" x="0" [attr.y]="band1()" [attr.width]="w" [attr.height]="band2() - band1()" role="button"
        [attr.aria-label]="tapLabel() + ' +50'" (click)="tapped.emit(50)" />
      <rect class="tap" x="0" [attr.y]="band2()" [attr.width]="w" [attr.height]="h() - band2()" role="button"
        [attr.aria-label]="tapLabel() + ' +20'" (click)="tapped.emit(20)" />
    </svg>
  `,
})
export class JassChalkZ {
  public readonly strokes = input.required<JassStrokes>();
  /** the total, read out to screen readers */
  public readonly points = input(0);
  /** prefix for the tap bands' accessible names, e.g. «Weis» */
  public readonly tapLabel = input('+');
  public readonly tapped = output<JassChalkUnit>();

  protected readonly w = W;
  protected readonly x1 = X1;
  /** viewBox height: the box's aspect ratio applied to the fixed width, never flatter than 160 */
  protected readonly h = signal(160);

  protected readonly topY = computed(() => Math.round(this.h() * 0.16));
  protected readonly bottomY = computed(() => Math.round(this.h() * 0.84));
  protected readonly midY = computed(() => (this.topY() + this.bottomY()) / 2);
  protected readonly band1 = computed(() => (this.topY() + this.midY()) / 2);
  protected readonly band2 = computed(() => (this.midY() + this.bottomY()) / 2);

  protected readonly zPath = computed(() => `M${X0} ${this.topY()} H${X1} L${X0} ${this.bottomY()} H${X1}`);
  protected readonly ariaLabel = computed(() => String(this.points()));

  protected readonly strokeLines = computed<Line[]>(() => {
    const s = this.strokes();
    const lines = [...tally(s.hundreds, this.topY(), 1), ...tally(s.twenties, this.bottomY(), -1)];
    // 50s: diagonal strokes in a row across the middle; every second one crosses the first to an X
    const pairs = Math.ceil(s.fifties / 2);
    const size = 22;
    const pitch = size + 12;
    const perRow = Math.max(1, Math.floor((X1 - X0) / pitch));
    const startX = (X0 + X1) / 2 - (Math.min(pairs, perRow) * pitch - 12) / 2;
    for (let i = 0; i < s.fifties; i++) {
      const p = Math.floor(i / 2);
      const x = startX + (p % perRow) * pitch;
      const y = this.midY() - size / 2 + Math.floor(p / perRow) * (size + 8);
      lines.push(i % 2 === 0
        ? { x1: x, y1: y + size, x2: x + size, y2: y }
        : { x1: x, y1: y, x2: x + size, y2: y + size });
    }
    return lines;
  });

  constructor() {
    const host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) this.h.set(Math.max(160, Math.round(W * height / width)));
      });
      observer.observe(host);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
