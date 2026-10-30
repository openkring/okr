import { Component, computed, input } from '@angular/core';

import { MAHJONG_KINDS } from '@okr/games-mahjong-util';

type Dot = { x: number; y: number; r: number; color: string };
type Stick = { x: number; y: number; h: number; color: string };

/*
 * Tile faces are drawn, not taken from the Unicode mahjong block: those code points render as
 * colour emoji on some platforms and as tofu on others. The ink colours are fixed — a tile is
 * ivory in both themes.
 */
const RED = '#b23a2e';
const GREEN = '#2a7a4a';
const BLUE = '#1f4f8a';

const NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const WIND_GLYPHS: Record<string, string> = { wE: '東', wS: '南', wW: '西', wN: '北' };
const FLOWER_GLYPHS = ['梅', '蘭', '菊', '竹'];
const SEASON_GLYPHS = ['春', '夏', '秋', '冬'];
const SEASON_COLORS = [RED, BLUE, RED, BLUE];

/** Dot centres on a 40 × 52 face, with the colour of each dot (r, g, b). */
const DOTS: Record<number, [number[][], string, number]> = {
  1: [[[20, 26]], 'r', 11],
  2: [[[20, 14], [20, 38]], 'gb', 7],
  3: [[[10, 10], [20, 26], [30, 42]], 'brg', 6.2],
  4: [[[12, 14], [28, 14], [12, 38], [28, 38]], 'bggb', 6.5],
  5: [[[11, 12], [29, 12], [20, 26], [11, 40], [29, 40]], 'bgrgb', 5.8],
  6: [[[12, 10], [28, 10], [12, 26], [28, 26], [12, 42], [28, 42]], 'ggrrrr', 5.6],
  7: [[[9, 7], [20, 13], [31, 19], [13, 32], [27, 32], [13, 44], [27, 44]], 'gggrrrr', 5],
  8: [[[12, 7], [28, 7], [12, 19], [28, 19], [12, 32], [28, 32], [12, 44], [28, 44]], 'bbbbbbbb', 5],
  9: [[[9, 10], [20, 10], [31, 10], [9, 26], [20, 26], [31, 26], [9, 42], [20, 42], [31, 42]], 'bbbrrrggg', 5],
};
const INK: Record<string, string> = { r: RED, g: GREEN, b: BLUE };

/** Bamboo stick centres on a 40 × 52 face, and which of them are red. */
const BAMS: Record<number, [number[][], number[]]> = {
  2: [[[20, 14], [20, 38]], []],
  3: [[[20, 14], [12, 38], [28, 38]], [0]],
  4: [[[13, 14], [27, 14], [13, 38], [27, 38]], []],
  5: [[[11, 14], [29, 14], [20, 26], [11, 38], [29, 38]], [2]],
  6: [[[10, 14], [20, 14], [30, 14], [10, 38], [20, 38], [30, 38]], []],
  7: [[[20, 9], [10, 26], [20, 26], [30, 26], [10, 43], [20, 43], [30, 43]], [0]],
  8: [[[8, 14], [16, 14], [24, 14], [32, 14], [8, 38], [16, 38], [24, 38], [32, 38]], []],
  9: [[[10, 9], [20, 9], [30, 9], [10, 26], [20, 26], [30, 26], [10, 43], [20, 43], [30, 43]], [1, 4, 7]],
};

/**
 * The face of one mahjong tile. Sizes are in `--u`, one base pixel of the board, which the page
 * derives from the board's container width so the whole stack scales as one picture.
 */
@Component({
  selector: 'okr-mahjong-tile',
  standalone: true,
  template: `
    @switch (kind().suit) {
      @case ('dot') {
        <span class="idx">{{ kind().rank }}</span>
        <svg viewBox="0 0 40 52" aria-hidden="true">
          @for (d of dots(); track $index) {
            <circle [attr.cx]="d.x" [attr.cy]="d.y" [attr.r]="d.r" [attr.fill]="d.color" />
            <circle [attr.cx]="d.x" [attr.cy]="d.y" [attr.r]="d.r * 0.58" fill="#fffaf0" />
            <circle [attr.cx]="d.x" [attr.cy]="d.y" [attr.r]="d.r * 0.3" [attr.fill]="d.color" />
          }
        </svg>
      }
      @case ('bam') {
        <span class="idx">{{ kind().rank }}</span>
        <svg viewBox="0 0 40 52" aria-hidden="true">
          @if (kind().rank === 1) {
            <rect x="17.4" y="13" width="5.2" height="34" rx="2.6" [attr.fill]="green" />
            <path d="M20 15 C12 13 9 7 11 4 C15 6 18 9 20 15 C22 9 25 6 29 4 C31 7 28 13 20 15Z" [attr.fill]="green" />
            <circle cx="20" cy="9" r="3.4" [attr.fill]="red" />
          }
          @for (s of sticks(); track $index) {
            <rect [attr.x]="s.x - 2.6" [attr.y]="s.y - s.h / 2" width="5.2" [attr.height]="s.h" rx="2.6" [attr.fill]="s.color" />
            <rect [attr.x]="s.x - 3.4" [attr.y]="s.y - 0.9" width="6.8" height="1.8" rx="0.9" [attr.fill]="s.color" />
          }
        </svg>
      }
      @case ('char') {
        <span class="idx">{{ kind().rank }}</span>
        <span class="chr"><span class="n">{{ glyph() }}</span><span class="w">萬</span></span>
      }
      @case ('wind') {
        <span class="idx">{{ windLetter() }}</span>
        <span class="glyph">{{ glyph() }}</span>
      }
      @case ('dragon') {
        @if (kind().id === 'dW') {
          <svg viewBox="0 0 40 52" aria-hidden="true">
            <rect x="7" y="7" width="26" height="38" rx="3" fill="none" [attr.stroke]="blue" stroke-width="2.6" />
            <rect x="11.5" y="11.5" width="17" height="29" rx="1.5" fill="none" [attr.stroke]="blue" stroke-width="1.2" />
          </svg>
        } @else {
          <span class="glyph" [style.color]="kind().id === 'dR' ? red : green">{{ glyph() }}</span>
        }
      }
      @default {
        <span class="idx">{{ kind().rank }}</span>
        <span class="bloom">
          <span class="g" [style.color]="bloomColor()">{{ glyph() }}</span>
          <span class="cap">{{ caption() }}</span>
        </span>
      }
    }
  `,
  styles: [`
    :host {
      position: absolute; inset: calc(3 * var(--u)); display: grid; place-items: center; pointer-events: none;
      --mj-serif: 'Hiragino Mincho ProN', 'Songti SC', 'Noto Serif CJK SC', 'Source Han Serif', 'MS Mincho', serif;
    }
    svg { width: 100%; height: 100%; display: block; }
    .idx { position: absolute; top: 0; left: calc(3 * var(--u)); font: 700 calc(10 * var(--u)) / 1 system-ui, sans-serif; color: #8b7f66; }
    .chr { display: flex; flex-direction: column; align-items: center; line-height: 1; font-family: var(--mj-serif); font-weight: 800; }
    .chr .n { font-size: calc(23 * var(--u)); color: #1e1e1e; }
    .chr .w { font-size: calc(24 * var(--u)); color: ${RED}; margin-top: calc(5 * var(--u)); }
    .glyph { font: 800 calc(34 * var(--u)) / 1 var(--mj-serif); color: #1e1e1e; }
    .bloom { display: flex; flex-direction: column; align-items: center; gap: calc(6 * var(--u)); }
    .bloom .g { font: 800 calc(28 * var(--u)) / 1 var(--mj-serif); }
    .bloom .cap {
      font: 700 calc(8 * var(--u)) / 1 system-ui, sans-serif; letter-spacing: 0.06em; text-transform: uppercase;
      color: #8b7f66; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
  `],
})
export class MahjongTile {
  /** The kind id, e.g. `dot3`, `wN`, `f2`. */
  public readonly kindId = input.required<string>();
  /** Small caption under a flower or season, already translated. */
  public readonly caption = input('');

  protected readonly red = RED;
  protected readonly green = GREEN;
  protected readonly blue = BLUE;

  protected readonly kind = computed(() => MAHJONG_KINDS[this.kindId()]);

  protected readonly glyph = computed((): string => {
    const k = this.kind();
    switch (k.suit) {
      case 'char': return NUMERALS[k.rank - 1];
      case 'wind': return WIND_GLYPHS[k.id];
      case 'dragon': return k.id === 'dR' ? '中' : '發';
      case 'flower': return FLOWER_GLYPHS[k.rank - 1];
      case 'season': return SEASON_GLYPHS[k.rank - 1];
      default: return '';
    }
  });

  protected readonly windLetter = computed((): string => this.kind().id.slice(1));

  protected readonly bloomColor = computed((): string =>
    this.kind().suit === 'flower' ? GREEN : SEASON_COLORS[this.kind().rank - 1]);

  protected readonly dots = computed((): Dot[] => {
    const k = this.kind();
    if (k.suit !== 'dot') return [];
    const [points, colors, r] = DOTS[k.rank];
    return points.map(([x, y], i) => ({ x, y, r, color: INK[colors[i]] }));
  });

  protected readonly sticks = computed((): Stick[] => {
    const k = this.kind();
    if (k.suit !== 'bam' || k.rank === 1) return [];
    const [points, reds] = BAMS[k.rank];
    const h = k.rank === 7 || k.rank === 9 ? 14 : 20;
    return points.map(([x, y], i) => ({ x, y, h, color: reds.includes(i) ? RED : GREEN }));
  });
}
