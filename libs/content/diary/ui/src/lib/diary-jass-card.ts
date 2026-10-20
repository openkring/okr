import { Component, computed, input } from '@angular/core';

import { DiaryI18n, isJassSchneider, JassDiaryResult, jassTally, jassVerdict } from '@okr/content-diary-util';

/** viewBox of one chalk Z */
const Z_W = 160;
const Z_H = 56;
const TOP_Y = 8;
const BOTTOM_Y = 48;
/** strokes drawn on the top bar at most; more are written as '+n' */
const MAX_HUNDREDS = 40;

interface ZStroke { x1: number; y1: number; x2: number; y2: number; }

/**
 * A Jass result from the diary, drawn as a small Jasstafel (spec 1.67 §11): a slate in a wooden
 * frame, one chalk «Z» per side — hundreds as strokes on the top bar, fifties as crosses on the
 * diagonal, twenties on the bottom bar — a crown for the winner, «Schneider» for a side that did
 * not reach half the winner's points, and a tagline on how the game went.
 */
@Component({
  selector: 'okr-diary-jass-card',
  standalone: true,
  styles: [`
    :host { display: block; padding: 8px 16px; }
    .frame { max-width: 480px; border-radius: 10px; padding: 8px;
      background: repeating-linear-gradient(100deg, #8a5a2b 0 6px, #7a4e24 6px 9px, #93623a 9px 14px);
      box-shadow: 0 2px 6px rgba(0, 0, 0, .35); }
    .slate { border-radius: 4px; padding: 12px 14px 10px; color: #f4f1e8;
      background: radial-gradient(ellipse at 30% 20%, #3f5a49 0%, #2c4236 55%, #22352b 100%);
      font-family: 'Chalkboard SE', 'Chalkduster', 'Comic Sans MS', 'Segoe Print', cursive;
      text-shadow: 0 0 1px rgba(255, 255, 255, .45); }
    .title { font-size: 0.85rem; letter-spacing: .08em; text-transform: uppercase; opacity: .75; }
    .side { display: grid; grid-template-columns: 1fr auto; align-items: center; column-gap: 10px; margin-top: 8px; }
    .names { font-size: 1.05rem; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .crown { width: 22px; height: 16px; flex: none; }
    .score { font-size: 1.6rem; font-weight: 700; justify-self: end; }
    .loser .score { opacity: .8; }
    .schneider { font-size: .75rem; padding: 0 6px; border: 1.5px dashed #f4f1e8; border-radius: 10px; transform: rotate(-4deg); }
    svg.z { grid-column: 1 / -1; width: 100%; max-width: 320px; height: auto; }
    svg.z line, svg.z polyline { stroke: #f4f1e8; stroke-linecap: round; fill: none; }
    svg.z text { fill: #f4f1e8; font-size: 11px; font-family: inherit; }
    .tagline { margin-top: 10px; font-size: .95rem; font-style: italic; }
    .stats { margin-top: 6px; font-size: .8rem; opacity: .8; }
  `],
  template: `
    <div class="frame" role="img" [attr.aria-label]="ariaLabel()">
      <div class="slate">
        <div class="title">Jass · {{ result().variant }}</div>
        @for (side of sides(); track $index) {
          <div class="side" [class.loser]="!side.isWinner">
            <div class="names">
              @if (side.isWinner) {
                <svg class="crown" viewBox="0 0 22 16" aria-hidden="true">
                  <path d="M2 14 L1 4 L7 9 L11 2 L15 9 L21 4 L20 14 Z" fill="#f2c94c" stroke="#b8860b" stroke-width="1" />
                </svg>
              }
              <span>{{ side.names }}</span>
              @if (side.schneider) { <span class="schneider">{{ i18n().jass_schneider() }}</span> }
            </div>
            <div class="score">{{ side.score }}</div>
            <svg class="z" [attr.viewBox]="viewBox" aria-hidden="true">
              <polyline [attr.points]="zPoints" stroke-width="2.5" />
              @for (s of side.strokes; track $index) {
                <line [attr.x1]="s.x1" [attr.y1]="s.y1" [attr.x2]="s.x2" [attr.y2]="s.y2" stroke-width="1.6" />
              }
              @if (side.more) { <text [attr.x]="zWidth - 22" y="22">+{{ side.more }}</text> }
              @if (side.rest) { <text [attr.x]="zWidth - 18" [attr.y]="bottomY + 2">{{ side.rest }}</text> }
            </svg>
          </div>
        }
        <div class="tagline">{{ tagline() }}</div>
        <div class="stats">{{ stats() }}</div>
      </div>
    </div>
  `,
})
export class DiaryJassCard {
  public readonly result = input.required<JassDiaryResult>();
  public readonly i18n = input.required<DiaryI18n>();

  protected readonly viewBox = `0 0 ${Z_W} ${Z_H}`;
  protected readonly zWidth = Z_W;
  protected readonly bottomY = BOTTOM_Y;
  /** the Z itself: top bar, diagonal, bottom bar (rest number sits right of the bottom bar) */
  protected readonly zPoints = `4,${TOP_Y} ${Z_W - 28},${TOP_Y} 4,${BOTTOM_Y} ${Z_W - 28},${BOTTOM_Y}`;

  protected readonly sides = computed(() => {
    const r = this.result();
    return r.sides.map((side, i) => ({ ...side, schneider: isJassSchneider(r, i), ...zStrokes(side.score) }));
  });

  protected readonly tagline = computed(() => {
    const i = this.i18n();
    return { draw: i.jass_draw, match: i.jass_match, close: i.jass_close, clear: i.jass_clear, rout: i.jass_rout }[jassVerdict(this.result())]();
  });

  protected readonly stats = computed(() => {
    const r = this.result();
    const per = (f: (s: JassDiaryResult['sides'][number]) => number) => r.sides.map(f).join(' : ');
    return [`${r.weisLabel} ${per(s => s.weis)}`, `${r.matchesLabel} ${per(s => s.matches)}`, r.handsLabel, r.duration]
      .filter(Boolean).join(' · ');
  });

  protected readonly ariaLabel = computed(() =>
    `Jass ${this.result().variant}: ${this.result().sides.map(s => `${s.names} ${s.score}`).join(', ')}. ${this.tagline()}`);
}

/** The chalk marks of one score on the Z (see jassTally), as line segments in the Z's viewBox. */
function zStrokes(score: number): { strokes: ZStroke[]; more: number; rest: number } {
  const tally = jassTally(score);
  const strokes: ZStroke[] = [];
  const barEnd = Z_W - 28;

  // hundreds: tally strokes across the top bar, every fifth one slanting through the four before it
  const hundreds = Math.min(tally.hundreds, MAX_HUNDREDS);
  const step = Math.min(6, (barEnd - 12) / Math.max(hundreds, 1));
  for (let n = 0; n < hundreds; n++) {
    const x = 8 + n * step;
    if (n % 5 === 4) strokes.push({ x1: x - 4 * step - 1, y1: TOP_Y + 4, x2: x + 1, y2: TOP_Y - 4 });
    else strokes.push({ x1: x, y1: TOP_Y - 5, x2: x, y2: TOP_Y + 5 });
  }

  // fifties: crosses on the diagonal, from its middle outward
  for (let n = 0; n < tally.fifties; n++) {
    const t = 0.5 + n * 0.15;
    const x = barEnd - t * (barEnd - 4);
    const y = TOP_Y + t * (BOTTOM_Y - TOP_Y);
    strokes.push({ x1: x - 4, y1: y - 4, x2: x + 4, y2: y + 4 }, { x1: x - 4, y1: y + 4, x2: x + 4, y2: y - 4 });
  }

  // twenties: strokes across the bottom bar
  for (let n = 0; n < tally.twenties; n++) {
    const x = 8 + n * 6;
    strokes.push({ x1: x, y1: BOTTOM_Y - 5, x2: x, y2: BOTTOM_Y + 5 });
  }

  return { strokes, more: tally.hundreds - hundreds, rest: tally.rest };
}
