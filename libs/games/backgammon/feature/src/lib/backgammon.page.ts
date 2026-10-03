import { Component, computed, inject } from '@angular/core';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCol,
  IonContent,
  IonGrid,
  IonRow,
  IonSelect,
  IonSelectOption,
} from '@ionic/angular/standalone';

import { Header } from '@okr/shared-ui';
import { fill } from '@okr/shared-util-core';
import { BgFrom, BgTo, CHECKERS, POINTS, Player, countAt, notation, opponent, pipCount } from '@okr/games-backgammon-util';

import { BackgammonMode, BackgammonStore } from './backgammon.store';

/*
 * Board geometry, in viewBox units. Twelve columns of `PW`, the bar in the middle, the bear-off
 * tray on the right. Each half is `HALF` high; a point is a triangle a little shorter than that,
 * and up to five checkers of radius `R` stack along it.
 */
const PW = 64;
const BAR_W = 64;
const X0 = 16;
const BAR_X = X0 + 6 * PW;
const TRAY_X = X0 + 12 * PW + BAR_W + 16;
const TRAY_W = 72;
const VB_W = TRAY_X + TRAY_W + 16;
const Y_TOP = 34;
const Y_BOT = 706;
const VB_H = Y_BOT + 34;
const MID = (Y_TOP + Y_BOT) / 2;
const PT_H = 270;
const R = 27;
const MAX_STACK = 5;
const DIE = 52;

/** Left edge of column `c` (0–11, left to right), skipping the bar. */
const colX = (c: number) => X0 + c * PW + (c >= 6 ? BAR_W : 0);

/** Geometry of the point shown at view index `v` (0 = the bottom player's ace point, bottom right). */
type PointGeom = { v: number; x: number; bottom: boolean; poly: string; labelY: number; hitY: number };
const GEOM: PointGeom[] = Array.from({ length: POINTS }, (_, v) => {
  const bottom = v < 12;
  const x = colX(bottom ? 11 - v : v - 12);
  const base = bottom ? Y_BOT : Y_TOP;
  const tip = bottom ? Y_BOT - PT_H : Y_TOP + PT_H;
  return {
    v, x, bottom,
    poly: `${x},${base} ${x + PW},${base} ${x + PW / 2},${tip}`,
    labelY: bottom ? Y_BOT + 24 : Y_TOP - 11,
    hitY: bottom ? MID : Y_TOP,
  };
});

const slotY = (bottom: boolean, k: number) => (bottom ? Y_BOT - R - k * 2 * R : Y_TOP + R + k * 2 * R);

/** Pip positions on a die face, as offsets from its top-left corner. */
const PIPS: Record<number, [number, number][]> = (() => {
  const l = 14, c = 26, r = 38;
  return {
    1: [[c, c]],
    2: [[l, l], [r, r]],
    3: [[l, l], [c, c], [r, r]],
    4: [[l, l], [r, l], [l, r], [r, r]],
    5: [[l, l], [r, l], [c, c], [l, r], [r, r]],
    6: [[l, l], [r, l], [l, c], [r, c], [l, r], [r, r]],
  };
})();

type Checker = { key: string; cx: number; cy: number; color: Player; count: number | null };

/**
 * The backgammon board. Like Mühle it is ONE SVG — points, checkers, dice, hints and the
 * transparent hit areas share the viewBox, so nothing drifts out of registration.
 *
 * The board is drawn from the bottom player's side: White in a two-player game, otherwise the
 * person's own colour, so their home board is always bottom right and they move anticlockwise.
 * Only the points, the bar and the tray that mean something right now are focusable buttons.
 */
@Component({
  selector: 'okr-backgammon-page',
  standalone: true,
  providers: [BackgammonStore],
  imports: [
    Header,
    IonContent, IonCard, IonCardContent, IonGrid, IonRow, IonCol,
    IonSelect, IonSelectOption, IonButton,
  ],
  template: `
    <okr-header [i18n]="{ title: store.i18n.title() }" />
    <ion-content class="ion-padding">
      <ion-card class="bg-card">
        <ion-card-content>

          <ion-grid class="ion-no-padding">
            <ion-row>
              <ion-col size="6">
                <ion-select
                  [label]="store.i18n.opponent_label()"
                  labelPlacement="stacked"
                  interface="popover"
                  [value]="store.mode()"
                  (ionChange)="onMode($any($event.detail.value))">
                  <ion-select-option value="easy">{{ store.i18n.opponent_easy() }}</ion-select-option>
                  <ion-select-option value="medium">{{ store.i18n.opponent_medium() }}</ion-select-option>
                  <ion-select-option value="hard">{{ store.i18n.opponent_hard() }}</ion-select-option>
                  <ion-select-option value="human">{{ store.i18n.opponent_human() }}</ion-select-option>
                </ion-select>
              </ion-col>
              <ion-col size="6">
                <ion-select
                  [label]="store.i18n.color_label()"
                  labelPlacement="stacked"
                  interface="popover"
                  [disabled]="store.mode() === 'human'"
                  [value]="store.human()"
                  (ionChange)="onColor($any($event.detail.value))">
                  <ion-select-option value="W">{{ store.i18n.color_white() }}</ion-select-option>
                  <ion-select-option value="B">{{ store.i18n.color_black() }}</ion-select-option>
                </ion-select>
              </ion-col>
            </ion-row>
          </ion-grid>

          <div class="bg-status" role="status" aria-live="polite">
            @if (store.thinking()) {
              <span class="bg-spinner" aria-hidden="true"></span>
            } @else {
              <span [class]="'bg-dot ' + statusColor()"></span>
            }
            <span>{{ statusText() }}</span>
          </div>
          <div class="bg-info">{{ infoText() }}</div>

          <div class="bg-frame">
            <svg class="bg-board" [attr.viewBox]="'0 0 ' + vbW + ' ' + vbH" [attr.aria-label]="store.i18n.board_label()">
              <defs>
                <radialGradient id="bg-gw" cx="38%" cy="32%" r="75%">
                  <stop offset="0%" class="bg-gw-0" />
                  <stop offset="70%" class="bg-gw-0" />
                  <stop offset="100%" class="bg-gw-1" />
                </radialGradient>
                <radialGradient id="bg-gb" cx="38%" cy="32%" r="75%">
                  <stop offset="0%" class="bg-gb-0" />
                  <stop offset="45%" class="bg-gb-1" />
                  <stop offset="100%" class="bg-gb-2" />
                </radialGradient>
              </defs>

              <rect class="bg-field" [attr.x]="x0" [attr.y]="yTop" [attr.width]="12 * pw + barW" [attr.height]="yBot - yTop" />
              <rect class="bg-bar" [attr.x]="barX" [attr.y]="yTop" [attr.width]="barW" [attr.height]="yBot - yTop" />
              <rect class="bg-tray" [class.target]="hints().targets.has('off')"
                [attr.x]="trayX" [attr.y]="yTop" [attr.width]="trayW" [attr.height]="yBot - yTop" rx="4" />

              @for (g of geom; track g.v) {
                <polygon class="bg-point" [class.a]="g.v % 2 === 0" [class.b]="g.v % 2 === 1" [attr.points]="g.poly" />
                <text class="bg-num" [attr.x]="g.x + pw / 2" [attr.y]="g.labelY">{{ g.v + 1 }}</text>
              }

              @for (c of checkers(); track c.key) {
                <g class="bg-checker" [class.W]="c.color === 'W'" [class.B]="c.color === 'B'">
                  <circle class="body" [attr.cx]="c.cx" [attr.cy]="c.cy" [attr.r]="r - 1" />
                  <circle class="groove" [attr.cx]="c.cx" [attr.cy]="c.cy" [attr.r]="r - 9" />
                  @if (c.count !== null) {
                    <text class="count" [attr.x]="c.cx" [attr.y]="c.cy + 8">{{ c.count }}</text>
                  }
                </g>
              }

              @for (s of offStacks(); track s.key) {
                <rect class="bg-off" [class.W]="s.color === 'W'" [class.B]="s.color === 'B'"
                  [attr.x]="trayX + 8" [attr.y]="s.y" [attr.width]="trayW - 16" height="11" rx="2" />
              }

              @for (h of rings(); track h.key) {
                <circle [class]="'bg-ring ' + h.kind" [attr.cx]="h.cx" [attr.cy]="h.cy" [attr.r]="h.kind === 'target' ? 11 : r + 3" />
              }

              @for (d of dice(); track $index) {
                <g class="bg-die" [class.used]="d.used" [class.blank]="d.value === 0">
                  <rect [attr.x]="d.x" [attr.y]="mid - die / 2" [attr.width]="die" [attr.height]="die" rx="9" />
                  @for (p of pips(d.value); track $index) {
                    <circle [attr.cx]="d.x + p[0]" [attr.cy]="mid - die / 2 + p[1]" r="5" />
                  }
                </g>
              }

              @for (g of geom; track g.v) {
                @if (hints().active.has(idxOf(g.v))) {
                  <rect class="bg-hit active" [attr.x]="g.x" [attr.y]="g.hitY" [attr.width]="pw" [attr.height]="(yBot - yTop) / 2"
                    tabindex="0" role="button" [attr.aria-label]="pointLabel(idxOf(g.v))"
                    (click)="store.tap(idxOf(g.v))"
                    (keydown.enter)="store.tap(idxOf(g.v))"
                    (keydown.space)="$event.preventDefault(); store.tap(idxOf(g.v))" />
                } @else {
                  <rect class="bg-hit" [attr.x]="g.x" [attr.y]="g.hitY" [attr.width]="pw" [attr.height]="(yBot - yTop) / 2"
                    (click)="store.tap(idxOf(g.v))" />
                }
              }
              @if (hints().active.has('bar')) {
                <rect class="bg-hit active" [attr.x]="barX" [attr.y]="yTop" [attr.width]="barW" [attr.height]="yBot - yTop"
                  tabindex="0" role="button" [attr.aria-label]="store.i18n.bar_label()"
                  (click)="store.tap('bar')" (keydown.enter)="store.tap('bar')"
                  (keydown.space)="$event.preventDefault(); store.tap('bar')" />
              }
              @if (hints().active.has('off')) {
                <rect class="bg-hit active" [attr.x]="trayX" [attr.y]="yTop" [attr.width]="trayW" [attr.height]="yBot - yTop"
                  tabindex="0" role="button" [attr.aria-label]="store.i18n.off_label()"
                  (click)="store.tap('off')" (keydown.enter)="store.tap('off')"
                  (keydown.space)="$event.preventDefault(); store.tap('off')" />
              }
              @if (store.canRoll()) {
                <rect class="bg-hit active" [attr.x]="diceArea().x" [attr.y]="mid - die" [attr.width]="diceArea().w" [attr.height]="die * 2"
                  tabindex="0" role="button" [attr.aria-label]="store.i18n.roll()"
                  (click)="store.roll()" (keydown.enter)="store.roll()"
                  (keydown.space)="$event.preventDefault(); store.roll()" />
              }
            </svg>
          </div>

          <div class="bg-trays">
            @for (tray of trays(); track tray.player) {
              <div class="bg-tray-card" [class.turn]="tray.turn">
                <div class="bg-tray-head">
                  <span class="bg-tray-name"><span [class]="'bg-dot ' + tray.player"></span>{{ tray.name }}</span>
                  <span class="bg-tray-who">{{ tray.who }}</span>
                </div>
                <div class="bg-tray-meta">{{ tray.meta }}</div>
                <div class="bg-tray-meta">{{ tray.score }}</div>
              </div>
            }
          </div>

          <div class="bg-actions">
            <ion-button fill="clear" [disabled]="!store.canUndo()" (click)="store.undo()">
              {{ store.i18n.undo() }}
            </ion-button>
            <ion-button fill="clear" (click)="store.newGame()">
              {{ store.i18n.restart() }}
            </ion-button>
            @if (store.canRoll()) {
              <ion-button fill="solid" (click)="store.roll()">{{ store.i18n.roll() }}</ion-button>
            } @else {
              <ion-button fill="solid" [disabled]="!store.canEndTurn()" (click)="store.endTurn()">
                {{ store.i18n.end_turn() }}
              </ion-button>
            }
          </div>

          <details class="bg-rules">
            <summary>{{ store.i18n.rules_title() }}</summary>
            <ul>
              <li>{{ store.i18n.rules_goal() }}</li>
              <li>{{ store.i18n.rules_move() }}</li>
              <li>{{ store.i18n.rules_hit() }}</li>
              <li>{{ store.i18n.rules_must() }}</li>
              <li>{{ store.i18n.rules_bear() }}</li>
              <li>{{ store.i18n.rules_score() }}</li>
            </ul>
          </details>

        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
  styles: [`
    :host {
      --bg-wood: #b4895a;
      --bg-felt: #e6d2a8;
      --bg-bar-wood: #9a7046;
      --bg-pt-a: #8c3b2a;
      --bg-pt-b: #3f5a4a;
      --bg-num: #f3e6cc;
      --bg-stone-w: #f7f2e7;
      --bg-stone-w-shade: #cfc4ad;
      --bg-stone-b: #2a2d33;
      --bg-stone-b-shade: #0d0e10;
      --bg-stone-rim: #2a1d10;
      --bg-hint: var(--ion-color-success);
    }
    @media (prefers-color-scheme: dark) {
      :host {
        --bg-wood: #4b3219;
        --bg-felt: #6e4c2c;
        --bg-bar-wood: #3b2713;
        --bg-pt-a: #b0573f;
        --bg-pt-b: #6f8f74;
        --bg-num: #ecd8b4;
        --bg-stone-rim: #d9c49e;
      }
    }

    .bg-card { max-width: 48rem; margin-inline: auto; }

    .bg-status {
      display: flex; align-items: center; gap: 0.6rem;
      min-height: 2.4em; margin: 0.75rem 0 0;
      font-weight: 500;
    }
    .bg-info { min-height: 1.4em; margin-bottom: 0.5rem; color: var(--ion-color-medium); font-size: 0.85rem; }
    .bg-dot { display: inline-block; flex: none; width: 14px; height: 14px; border-radius: 50%; border: 1.5px solid var(--bg-stone-rim); vertical-align: -2px; margin-right: 0.4rem; }
    .bg-status .bg-dot { width: 16px; height: 16px; margin-right: 0; }
    .bg-dot.W { background: var(--bg-stone-w); }
    .bg-dot.B { background: var(--bg-stone-b); }
    .bg-spinner {
      flex: none; width: 16px; height: 16px; border-radius: 50%;
      border: 2px solid var(--ion-color-light-shade); border-top-color: var(--bg-hint);
      animation: bg-spin 0.8s linear infinite;
    }
    @keyframes bg-spin { to { transform: rotate(360deg); } }

    .bg-frame { background: var(--bg-wood); border-radius: 6px; padding: 1%; }
    .bg-board { display: block; width: 100%; height: auto; touch-action: manipulation; user-select: none; -webkit-user-select: none; }
    .bg-field { fill: var(--bg-felt); }
    .bg-bar { fill: var(--bg-bar-wood); }
    .bg-tray { fill: var(--bg-bar-wood); stroke-width: 4; }
    .bg-tray.target { stroke: var(--bg-hint); }
    .bg-point.a { fill: var(--bg-pt-a); }
    .bg-point.b { fill: var(--bg-pt-b); }
    .bg-num { fill: var(--bg-num); font-size: 18px; text-anchor: middle; }

    .bg-checker { pointer-events: none; }
    .bg-checker .body { stroke: var(--bg-stone-rim); stroke-width: 2; }
    .bg-checker.W .body { fill: url(#bg-gw); }
    .bg-checker.B .body { fill: url(#bg-gb); }
    .bg-checker .groove { fill: none; stroke-width: 2; opacity: 0.35; }
    .bg-checker.W .groove { stroke: var(--bg-stone-w-shade); }
    .bg-checker.B .groove { stroke: #6a6f78; }
    .bg-checker .count { font-size: 22px; font-weight: 700; text-anchor: middle; }
    .bg-checker.W .count { fill: var(--bg-stone-b); }
    .bg-checker.B .count { fill: var(--bg-stone-w); }
    .bg-gw-0 { stop-color: var(--bg-stone-w); }
    .bg-gw-1 { stop-color: var(--bg-stone-w-shade); }
    .bg-gb-0 { stop-color: #5b606a; }
    .bg-gb-1 { stop-color: var(--bg-stone-b); }
    .bg-gb-2 { stop-color: var(--bg-stone-b-shade); }
    .bg-off { stroke: var(--bg-stone-rim); stroke-width: 1; }
    .bg-off.W { fill: var(--bg-stone-w); }
    .bg-off.B { fill: var(--bg-stone-b); }

    .bg-ring { fill: none; pointer-events: none; stroke: var(--bg-hint); }
    .bg-ring.source { stroke-width: 3; stroke-dasharray: 7 5; }
    .bg-ring.selected { stroke-width: 6; }
    .bg-ring.target { fill: var(--bg-hint); stroke: none; opacity: 0.9; }

    .bg-die rect { fill: #fbf8f1; stroke: #2a1d10; stroke-width: 2; }
    .bg-die circle { fill: #2a1d10; }
    .bg-die.used { opacity: 0.35; }
    .bg-die.blank rect { fill: transparent; stroke: var(--bg-hint); stroke-dasharray: 6 5; }

    .bg-hit { fill: transparent; outline: none; }
    .bg-hit.active { cursor: pointer; }
    .bg-hit.active:focus-visible { stroke: var(--bg-hint); stroke-width: 4; stroke-dasharray: 6 5; }
    @media (prefers-reduced-motion: reduce) { .bg-spinner { animation: none; } }

    .bg-trays { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-top: 1rem; }
    .bg-tray-card {
      border: 1px solid var(--ion-color-light-shade); border-radius: 6px;
      padding: 0.6rem 0.75rem; display: grid; gap: 0.3rem; min-width: 0;
    }
    .bg-tray-card.turn { border-color: var(--bg-hint); box-shadow: 0 0 0 1px var(--bg-hint); }
    .bg-tray-head { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; }
    .bg-tray-name { font-weight: 700; color: var(--ion-text-color); }
    .bg-tray-who, .bg-tray-meta { color: var(--ion-color-medium); font-size: 0.8rem; }
    .bg-tray-meta { font-variant-numeric: tabular-nums; }

    .bg-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: flex-end; margin-top: 0.75rem; }

    .bg-rules { border-top: 1px solid var(--ion-color-light-shade); padding-top: 0.75rem; margin-top: 0.5rem; }
    .bg-rules summary { cursor: pointer; font-weight: 600; color: var(--ion-text-color); }
    .bg-rules ul { padding-left: 1.2em; margin: 0.5rem 0 0; display: grid; gap: 0.25rem; }
  `],
})
export class BackgammonPage {
  protected readonly store = inject(BackgammonStore);

  protected readonly geom = GEOM;
  protected readonly pw = PW;
  protected readonly r = R;
  protected readonly die = DIE;
  protected readonly x0 = X0;
  protected readonly barX = BAR_X;
  protected readonly barW = BAR_W;
  protected readonly trayX = TRAY_X;
  protected readonly trayW = TRAY_W;
  protected readonly yTop = Y_TOP;
  protected readonly yBot = Y_BOT;
  protected readonly mid = MID;
  protected readonly vbW = VB_W;
  protected readonly vbH = VB_H;

  /** The side drawn at the bottom: the person against the computer, else White. */
  protected readonly bottom = computed((): Player => (this.store.mode() !== 'human' && this.store.human() === 'B' ? 'B' : 'W'));

  /** Board index ↔ view index: the board is mirrored when Black sits at the bottom. */
  protected idxOf(v: number): number {
    return this.bottom() === 'B' ? POINTS - 1 - v : v;
  }

  protected pips(value: number): [number, number][] {
    return PIPS[value] ?? [];
  }

  protected readonly checkers = computed((): Checker[] => {
    const game = this.store.game();
    const out: Checker[] = [];
    for (const g of GEOM) {
      const idx = this.idxOf(g.v);
      const n = game.points[idx];
      if (!n) continue;
      const color: Player = n > 0 ? 'W' : 'B';
      const count = Math.abs(n);
      for (let k = 0; k < Math.min(count, MAX_STACK); k++) {
        const last = k === MAX_STACK - 1 && count > MAX_STACK;
        out.push({ key: `p${g.v}-${k}`, cx: g.x + PW / 2, cy: slotY(g.bottom, k), color, count: last ? count : null });
      }
    }
    // On the bar, each side waits in the half next to where it re-enters (the far side).
    for (const color of ['W', 'B'] as Player[]) {
      const count = game.bar[color];
      const up = color === this.bottom();
      for (let k = 0; k < Math.min(count, 4); k++) {
        const cy = up ? MID - R - 14 - k * 2 * R : MID + R + 14 + k * 2 * R;
        out.push({ key: `bar-${color}-${k}`, cx: BAR_X + BAR_W / 2, cy, color, count: k === 3 && count > 4 ? count : null });
      }
    }
    return out;
  });

  /** Borne-off checkers as slabs: the bottom player's from the bottom of the tray, the other's from the top. */
  protected readonly offStacks = computed(() => {
    const game = this.store.game();
    const out: { key: string; y: number; color: Player }[] = [];
    for (const color of ['W', 'B'] as Player[]) {
      const fromBottom = color === this.bottom();
      for (let k = 0; k < game.off[color]; k++) {
        out.push({ key: `off-${color}-${k}`, color, y: fromBottom ? Y_BOT - 8 - (k + 1) * 14 : Y_TOP + 8 + k * 14 });
      }
    }
    return out;
  });

  /** What is tappable now: sources of a legal step, and the targets of the selected one. */
  protected readonly hints = computed(() => {
    const active = new Set<BgFrom | BgTo>();
    const sources = new Set<BgFrom>();
    const targets = new Set<BgTo>();
    if (!this.store.humanTurn()) return { active, sources, targets };
    const selected = this.store.selected();
    for (const s of this.store.legal()) {
      sources.add(s.from);
      active.add(s.from);
      if (s.from === selected) {
        targets.add(s.to);
        active.add(s.to);
      }
    }
    return { active, sources, targets };
  });

  /** Dashed rings on movable checkers, a solid one on the selected, dots where it can go. */
  protected readonly rings = computed(() => {
    const game = this.store.game();
    const { sources, targets } = this.hints();
    const selected = this.store.selected();
    const out: { key: string; kind: 'source' | 'selected' | 'target'; cx: number; cy: number }[] = [];
    const top = (from: BgFrom) => {
      if (from === 'bar') {
        const up = game.turn === this.bottom();
        return { cx: BAR_X + BAR_W / 2, cy: up ? MID - R - 14 : MID + R + 14 };
      }
      const g = GEOM[this.idxOf(from)];
      const n = Math.min(Math.abs(game.points[from]), MAX_STACK);
      return { cx: g.x + PW / 2, cy: slotY(g.bottom, n - 1) };
    };
    for (const from of sources) {
      out.push({ key: `s-${from}`, kind: from === selected ? 'selected' : 'source', ...top(from) });
    }
    for (const to of targets) {
      if (to === 'off') continue;
      const g = GEOM[this.idxOf(to)];
      const own = countAt(game, to, game.turn);
      out.push({ key: `t-${to}`, kind: 'target', cx: g.x + PW / 2, cy: slotY(g.bottom, Math.min(own, MAX_STACK - 1)) });
    }
    return out;
  });

  /** Where the dice sit: in the half on the right of the player to move. */
  protected readonly diceArea = computed(() => {
    const right = this.store.game().turn === this.bottom();
    const x = right ? colX(6) : colX(0);
    return { x, w: 6 * PW };
  });

  protected readonly dice = computed(() => {
    const game = this.store.game();
    const area = this.diceArea();
    let faces: { value: number; used: boolean }[];
    if (!game.rolled.length) {
      faces = this.store.canRoll() ? [{ value: 0, used: false }, { value: 0, used: false }] : [];
    } else {
      const [a, b] = game.rolled;
      const left = [...game.dice];
      faces = (a === b ? [a, a, a, a] : [a, b]).map(value => {
        const i = left.indexOf(value);
        if (i >= 0) left.splice(i, 1);
        return { value, used: i < 0 };
      });
    }
    const gap = 12;
    const width = faces.length * DIE + (faces.length - 1) * gap;
    const start = area.x + (area.w - width) / 2;
    return faces.map((f, i) => ({ ...f, x: start + i * (DIE + gap) }));
  });

  protected readonly statusColor = computed(() => this.store.game().result?.winner ?? this.store.game().turn);

  protected readonly statusText = computed(() => {
    const i18n = this.store.i18n;
    const game = this.store.game();
    const mode = this.store.mode();
    const result = game.result;

    if (result) {
      const who = mode === 'human'
        ? fill(i18n.status_win_named(), { name: this.nameOf(result.winner) })
        : result.winner === this.store.human() ? i18n.status_win_you() : i18n.status_win_computer();
      const kind = { single: i18n.kind_single, gammon: i18n.kind_gammon, backgammon: i18n.kind_backgammon }[result.kind]();
      return `${who} ${kind}`;
    }
    if (this.store.thinking()) return fill(i18n.status_thinking(), { name: this.nameOf(game.turn) });

    const who = mode === 'human' ? this.nameOf(game.turn) : i18n.status_you();
    if (!game.rolled.length) return fill(i18n.status_roll(), { who });
    const dice = game.dice.join(' · ');
    if (!this.store.legal().length) {
      if (!game.dice.length) return fill(i18n.status_done(), { who });
      return this.store.steps().length
        ? fill(i18n.status_blocked_rest(), { who })
        : fill(i18n.status_blocked(), { who, dice: game.rolled.join(' · ') });
    }
    if (this.store.selected() !== null && this.store.selected() !== 'bar') return fill(i18n.status_target(), { who });
    if (game.bar[game.turn] > 0) return fill(i18n.status_select_bar(), { who, dice });
    return fill(i18n.status_select(), { who, dice });
  });

  /** The opening roll, or what the other side just played. */
  protected readonly infoText = computed(() => {
    const i18n = this.store.i18n;
    const opening = this.store.opening();
    if (opening) return fill(i18n.info_opening(), { white: opening[0], black: opening[1] });
    const last = this.store.lastTurn();
    if (!last || this.store.game().result) return '';
    if (!last.steps.length) return fill(i18n.info_none(), { name: this.nameOf(last.player) });
    const move = notation(last.steps, last.player, { bar: i18n.notation_bar(), off: i18n.notation_off() });
    return fill(i18n.info_last(), { name: this.nameOf(last.player), move });
  });

  protected readonly trays = computed(() => {
    const game = this.store.game();
    const mode = this.store.mode();
    const i18n = this.store.i18n;
    const bottom = this.bottom();
    return [bottom, opponent(bottom)].map(player => ({
      player,
      name: this.nameOf(player),
      who: mode === 'human' ? i18n.who_player() : player === this.store.human() ? i18n.who_you() : i18n.who_computer(),
      turn: !game.result && game.turn === player,
      meta: fill(i18n.tray_meta(), { pips: pipCount(game, player), off: `${game.off[player]}/${CHECKERS}` }),
      score: fill(i18n.tray_score(), { score: this.store.score()[player] }),
    }));
  });

  protected onMode(mode: BackgammonMode): void {
    if (mode !== this.store.mode()) this.store.newGame(mode, this.store.human());
  }

  protected onColor(human: Player): void {
    if (human !== this.store.human()) this.store.newGame(this.store.mode(), human);
  }

  protected pointLabel(idx: number): string {
    const game = this.store.game();
    const n = game.points[idx];
    const label = fill(this.store.i18n.point_label(), { n: this.idxOf(idx) + 1 });
    return n ? `${label} · ${Math.abs(n)} ${this.nameOf(n > 0 ? 'W' : 'B')}` : label;
  }

  private nameOf(player: Player): string {
    return player === 'W' ? this.store.i18n.white() : this.store.i18n.black();
  }
}
