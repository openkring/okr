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
import {
  COORDS,
  MILLS_BY_POINT,
  POINTS,
  Player,
  STONES_PER_PLAYER,
  canFly,
  opponent,
  phaseOf,
  stoneCount,
  stonesOnBoard,
} from '@okr/games-muehle-util';

import { MuehleMode, MuehleStore } from './muehle.store';

/** SVG centre of a board point: a 7×7 grid of 100-unit cells inside a 700-unit viewBox. */
const px = (p: number) => 50 + COORDS[p][0] * 100;
const py = (p: number) => 50 + COORDS[p][1] * 100;

const ALL_POINTS = Array.from({ length: POINTS }, (_, p) => p);

type MillLine = { x1: number; y1: number; x2: number; y2: number };

/**
 * The Mühle board — a port of the standalone prototype (`libs/games/muehle`, 2026-09) onto the
 * Ionic shell. The board is ONE SVG: lines, stones, hints and the transparent hit circles all
 * share the 700-unit viewBox, so nothing can drift out of registration at any screen size.
 *
 * Every point carries a hit circle; only the ones that mean something right now are focusable
 * buttons (`active`), which is what gives keyboard users the same "where can I tap" hints the
 * rings give everyone else.
 */
@Component({
  selector: 'okr-muehle-page',
  standalone: true,
  providers: [MuehleStore],
  imports: [
    Header,
    IonContent, IonCard, IonCardContent, IonGrid, IonRow, IonCol,
    IonSelect, IonSelectOption, IonButton,
  ],
  template: `
    <okr-header [i18n]="{ title: store.i18n.title() }" />
    <ion-content class="ion-padding">
      <ion-card class="mu-card">
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

          <div class="mu-status" [class.alert]="store.pending() && !store.current().result" role="status" aria-live="polite">
            @if (store.thinking()) {
              <span class="mu-spinner" aria-hidden="true"></span>
            } @else {
              <span class="mu-dot" [class]="'mu-dot ' + statusColor()"></span>
            }
            <span>{{ statusText() }}</span>
          </div>

          <div class="mu-frame">
            <svg class="mu-board" viewBox="0 0 700 700" [attr.aria-label]="store.i18n.board_label()">
              <defs>
                <radialGradient id="mu-gw" cx="38%" cy="32%" r="75%">
                  <stop offset="0%" class="mu-gw-0" />
                  <stop offset="70%" class="mu-gw-0" />
                  <stop offset="100%" class="mu-gw-1" />
                </radialGradient>
                <radialGradient id="mu-gb" cx="38%" cy="32%" r="75%">
                  <stop offset="0%" class="mu-gb-0" />
                  <stop offset="45%" class="mu-gb-1" />
                  <stop offset="100%" class="mu-gb-2" />
                </radialGradient>
              </defs>

              <g class="mu-lines">
                <rect x="50" y="50" width="600" height="600" />
                <rect x="150" y="150" width="400" height="400" />
                <rect x="250" y="250" width="200" height="200" />
                <path d="M350 50V250M350 450V650M50 350H250M450 350H650" />
              </g>

              @for (p of points; track p) {
                <circle class="mu-node" [attr.cx]="px(p)" [attr.cy]="py(p)" r="9" />
              }

              @for (line of mills(); track $index) {
                <line class="mu-mill" [attr.x1]="line.x1" [attr.y1]="line.y1" [attr.x2]="line.x2" [attr.y2]="line.y2" />
              }

              @for (p of points; track p) {
                @if (shown()[p]; as color) {
                  <g class="mu-stone" [class.W]="color === 'W'" [class.B]="color === 'B'">
                    <circle class="body" [attr.cx]="px(p)" [attr.cy]="py(p)" r="33" />
                    <circle class="groove" [attr.cx]="px(p)" [attr.cy]="py(p)" r="20" />
                  </g>
                }
              }

              @if (ghost(); as g) {
                <g class="mu-stone ghost" [class.W]="g.color === 'W'" [class.B]="g.color === 'B'">
                  <circle class="body" [attr.cx]="px(g.point)" [attr.cy]="py(g.point)" r="33" />
                  <circle class="groove" [attr.cx]="px(g.point)" [attr.cy]="py(g.point)" r="20" />
                </g>
              }

              @if (store.lastMove(); as last) {
                @if (!store.pending()) {
                  <circle class="mu-last" [attr.cx]="px(last.to)" [attr.cy]="py(last.to)" r="43" />
                }
              }

              @for (p of hints().removable; track p) {
                <circle class="mu-removable" [attr.cx]="px(p)" [attr.cy]="py(p)" r="42" />
              }
              @if (hints().selected !== null) {
                <circle class="mu-sel" [attr.cx]="px(hints().selected!)" [attr.cy]="py(hints().selected!)" r="41" />
              }
              @for (p of hints().targets; track p) {
                <circle class="mu-target" [attr.cx]="px(p)" [attr.cy]="py(p)" r="13" />
              }

              @for (p of points; track p) {
                @if (hints().active.has(p)) {
                  <circle
                    class="mu-hit active"
                    [attr.cx]="px(p)" [attr.cy]="py(p)" r="48"
                    tabindex="0"
                    role="button"
                    [attr.aria-label]="pointLabel(p)"
                    (click)="store.tap(p)"
                    (keydown.enter)="store.tap(p)"
                    (keydown.space)="$event.preventDefault(); store.tap(p)" />
                } @else {
                  <circle class="mu-hit" [attr.cx]="px(p)" [attr.cy]="py(p)" r="48" (click)="store.tap(p)" />
                }
              }
            </svg>
          </div>

          <div class="mu-trays">
            @for (tray of trays(); track tray.player) {
              <div class="mu-tray" [class.turn]="tray.turn">
                <div class="mu-tray-head">
                  <span class="mu-tray-name">{{ tray.name }}</span>
                  <span class="mu-tray-who">{{ tray.who }}</span>
                </div>
                <div class="mu-pips">
                  @for (pip of tray.inHand; track $index) {
                    <span class="mu-pip" [class.W]="tray.player === 'W'" [class.B]="tray.player === 'B'"></span>
                  }
                </div>
                <div class="mu-tray-meta">{{ tray.meta }}</div>
              </div>
            }
          </div>

          <div class="mu-actions">
            <ion-button fill="clear" [disabled]="!store.canUndo()" (click)="store.undo()">
              {{ store.i18n.undo() }}
            </ion-button>
            <ion-button fill="solid" (click)="store.newGame()">
              {{ store.i18n.restart() }}
            </ion-button>
          </div>

          <details class="mu-rules">
            <summary>{{ store.i18n.rules_title() }}</summary>
            <ul>
              <li>{{ store.i18n.rules_place() }}</li>
              <li>{{ store.i18n.rules_move() }}</li>
              <li>{{ store.i18n.rules_mill() }}</li>
              <li>{{ store.i18n.rules_fly() }}</li>
              <li>{{ store.i18n.rules_end() }}</li>
            </ul>
          </details>

        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
  styles: [`
    :host {
      --mu-board: #dcbc8c;
      --mu-board-edge: #b48a55;
      --mu-line: #3a2816;
      --mu-stone-w: #f7f2e7;
      --mu-stone-w-shade: #cfc4ad;
      --mu-stone-b: #2a2d33;
      --mu-stone-b-shade: #0d0e10;
      --mu-stone-rim: #2a1d10;
      --mu-accent: var(--ion-color-danger);
      --mu-hint: var(--ion-color-success);
    }
    @media (prefers-color-scheme: dark) {
      :host {
        --mu-board: #6e4c2c;
        --mu-board-edge: #4b3219;
        --mu-line: #ecd8b4;
        --mu-stone-w: #f3ede0;
        --mu-stone-w-shade: #b9ae98;
        --mu-stone-b: #25282d;
        --mu-stone-b-shade: #070809;
        --mu-stone-rim: #d9c49e;
      }
    }

    .mu-card { max-width: 36rem; margin-inline: auto; }

    .mu-status {
      display: flex; align-items: center; gap: 0.6rem;
      min-height: 3em; margin: 0.75rem 0;
      font-weight: 500; text-wrap: balance;
    }
    .mu-status.alert { color: var(--mu-accent); }
    .mu-dot { flex: none; width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid var(--mu-stone-rim); }
    .mu-dot.W { background: var(--mu-stone-w); }
    .mu-dot.B { background: var(--mu-stone-b); }
    .mu-spinner {
      flex: none; width: 16px; height: 16px; border-radius: 50%;
      border: 2px solid var(--ion-color-light-shade); border-top-color: var(--mu-hint);
      animation: mu-spin 0.8s linear infinite;
    }
    @keyframes mu-spin { to { transform: rotate(360deg); } }

    .mu-frame {
      background: var(--mu-board);
      border: 1px solid var(--mu-board-edge);
      border-radius: 6px;
      box-shadow: inset 0 0 0 6px color-mix(in srgb, var(--mu-board-edge) 35%, transparent);
      padding: 2.5%;
    }
    .mu-board { display: block; width: 100%; height: auto; touch-action: manipulation; user-select: none; -webkit-user-select: none; }
    .mu-lines { stroke: var(--mu-line); stroke-width: 5; fill: none; stroke-linecap: square; }
    .mu-node { fill: var(--mu-line); }
    .mu-hit { fill: transparent; outline: none; }
    .mu-hit.active { cursor: pointer; }
    .mu-hit.active:focus-visible { stroke: var(--mu-hint); stroke-width: 4; stroke-dasharray: 6 5; }
    .mu-target { fill: var(--mu-hint); opacity: 0.85; pointer-events: none; }
    .mu-stone { pointer-events: none; }
    .mu-stone .body { stroke: var(--mu-stone-rim); stroke-width: 2; }
    .mu-stone.W .body { fill: url(#mu-gw); }
    .mu-stone.B .body { fill: url(#mu-gb); }
    .mu-stone .groove { fill: none; stroke-width: 2; opacity: 0.35; }
    .mu-stone.W .groove { stroke: var(--mu-stone-w-shade); }
    .mu-stone.B .groove { stroke: #6a6f78; }
    .mu-stone.ghost { opacity: 0.35; }
    .mu-gw-0 { stop-color: var(--mu-stone-w); }
    .mu-gw-1 { stop-color: var(--mu-stone-w-shade); }
    .mu-gb-0 { stop-color: #5b606a; }
    .mu-gb-1 { stop-color: var(--mu-stone-b); }
    .mu-gb-2 { stop-color: var(--mu-stone-b-shade); }
    .mu-sel { fill: none; stroke: var(--mu-hint); stroke-width: 5; pointer-events: none; }
    .mu-removable {
      fill: none; stroke: var(--mu-accent); stroke-width: 5; stroke-dasharray: 10 7;
      pointer-events: none; animation: mu-march 1s linear infinite;
    }
    .mu-last { fill: none; stroke: var(--mu-line); stroke-width: 2.5; opacity: 0.6; pointer-events: none; }
    .mu-mill { stroke: var(--mu-accent); stroke-width: 9; stroke-linecap: round; opacity: 0.85; pointer-events: none; }
    @keyframes mu-march { to { stroke-dashoffset: -17; } }
    @media (prefers-reduced-motion: reduce) {
      .mu-removable, .mu-spinner { animation: none; }
    }

    .mu-trays { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-top: 1rem; }
    .mu-tray {
      border: 1px solid var(--ion-color-light-shade); border-radius: 6px;
      padding: 0.6rem 0.75rem; display: grid; gap: 0.35rem; min-width: 0;
    }
    .mu-tray.turn { border-color: var(--mu-hint); box-shadow: 0 0 0 1px var(--mu-hint); }
    .mu-tray-head { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; }
    .mu-tray-name { font-weight: 700; color: var(--ion-text-color); }
    .mu-tray-who, .mu-tray-meta { color: var(--ion-color-medium); font-size: 0.8rem; }
    .mu-tray-who { text-transform: uppercase; letter-spacing: 0.07em; }
    .mu-tray-meta { font-variant-numeric: tabular-nums; }
    .mu-pips { display: flex; flex-wrap: wrap; gap: 4px; min-height: 14px; }
    .mu-pip { width: 14px; height: 14px; border-radius: 50%; border: 1.5px solid var(--mu-stone-rim); }
    .mu-pip.W { background: var(--mu-stone-w); }
    .mu-pip.B { background: var(--mu-stone-b); }

    .mu-actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 0.75rem; }

    .mu-rules { border-top: 1px solid var(--ion-color-light-shade); padding-top: 0.75rem; margin-top: 0.5rem; }
    .mu-rules summary { cursor: pointer; font-weight: 600; color: var(--ion-text-color); }
    .mu-rules ul { padding-left: 1.2em; margin: 0.5rem 0 0; display: grid; gap: 0.25rem; }
  `],
})
export class MuehlePage {
  protected readonly store = inject(MuehleStore);

  protected readonly points = ALL_POINTS;
  protected readonly px = px;
  protected readonly py = py;

  /** The board as displayed: includes the provisional step while a removal is pending. */
  protected readonly shown = computed(() => {
    const state = this.store.current();
    const pending = this.store.pending();
    const board = state.board.slice();
    if (pending) {
      if (pending.from !== null) board[pending.from] = null;
      board[pending.to] = state.turn;
    }
    return board;
  });

  /** The faded stone left behind at the origin of a pending step. */
  protected readonly ghost = computed(() => {
    const pending = this.store.pending();
    return pending && pending.from !== null ? { point: pending.from, color: this.store.current().turn } : null;
  });

  /** Mills just closed — by the last move, or by the step waiting for its removal. */
  protected readonly mills = computed((): MillLine[] => {
    const state = this.store.current();
    const last = this.store.lastMove();
    const pending = this.store.pending();
    const sources: { board: readonly (Player | null)[]; at: number }[] = [];
    if (last && last.remove !== null) sources.push({ board: state.board, at: last.to });
    if (pending) sources.push({ board: this.shown(), at: pending.to });

    const lines: MillLine[] = [];
    for (const { board, at } of sources) {
      const owner = board[at];
      for (const m of MILLS_BY_POINT[at]) {
        if (m.every(q => board[q] === owner)) {
          lines.push({ x1: px(m[0]), y1: py(m[0]), x2: px(m[2]), y2: py(m[2]) });
        }
      }
    }
    return lines;
  });

  /** Which points are tappable right now, and which rings mark them. */
  protected readonly hints = computed(() => {
    const active = new Set<number>();
    const removable: number[] = [];
    const targets: number[] = [];
    let selected: number | null = null;
    if (!this.store.humanTurn()) return { active, removable, targets, selected };

    const state = this.store.current();
    const moves = this.store.moves();
    const pending = this.store.pending();
    if (pending) {
      for (const m of moves) {
        if (m.from === pending.from && m.to === pending.to && m.remove !== null) {
          active.add(m.remove);
          removable.push(m.remove);
        }
      }
      active.add(pending.to);
    } else if (phaseOf(state) === 'placing') {
      ALL_POINTS.filter(p => state.board[p] === null).forEach(p => active.add(p));
    } else {
      for (const m of moves) if (m.from !== null) active.add(m.from);
      selected = this.store.selected();
      if (selected !== null) {
        for (const m of moves) {
          if (m.from === selected && !active.has(m.to)) {
            active.add(m.to);
            targets.push(m.to);
          }
        }
      }
    }
    return { active, removable, targets, selected };
  });

  /** Colour of the dot next to the status line: the winner once over, else the side to move. */
  protected readonly statusColor = computed(() => {
    const result = this.store.current().result;
    return result?.kind === 'win' ? result.winner : this.store.current().turn;
  });

  protected readonly statusText = computed(() => {
    const i18n = this.store.i18n;
    const state = this.store.current();
    const mode = this.store.mode();
    const result = state.result;

    if (result) {
      if (result.kind === 'draw') return i18n.status_draw();
      const winner = result.winner;
      const who = mode === 'human'
        ? fill(i18n.status_win_named(), { name: this.nameOf(winner) })
        : winner === this.store.human() ? i18n.status_win_you() : i18n.status_win_computer();
      const reason = result.reason === 'no-moves' ? i18n.reason_no_moves() : i18n.reason_two_stones();
      return `${who} ${fill(reason, { name: this.nameOf(opponent(winner)) })}`;
    }
    if (this.store.thinking()) return fill(i18n.status_thinking(), { name: this.nameOf(state.turn) });

    const who = mode === 'human' ? this.nameOf(state.turn) : i18n.status_you();
    if (this.store.pending()) return i18n.status_remove();
    if (phaseOf(state) === 'placing') return fill(i18n.status_place(), { who, count: state.inHand[state.turn] });
    const flying = canFly(state);
    if (this.store.selected() !== null) return fill(flying ? i18n.status_target_fly() : i18n.status_target(), { who });
    return fill(flying ? i18n.status_select_fly() : i18n.status_select(), { who });
  });

  protected readonly trays = computed(() => {
    const state = this.store.current();
    const mode = this.store.mode();
    const i18n = this.store.i18n;
    return (['W', 'B'] as Player[]).map(player => ({
      player,
      name: this.nameOf(player),
      who: mode === 'human' ? i18n.who_player() : player === this.store.human() ? i18n.who_you() : i18n.who_computer(),
      turn: !state.result && state.turn === player,
      inHand: Array.from({ length: state.inHand[player] }),
      meta: fill(i18n.tray_meta(), {
        onBoard: stonesOnBoard(state, player),
        lost: STONES_PER_PLAYER - stoneCount(state, player),
      }),
    }));
  });

  protected onMode(mode: MuehleMode): void {
    if (mode !== this.store.mode()) this.store.newGame(mode, this.store.human());
  }

  protected onColor(human: Player): void {
    if (human !== this.store.human()) this.store.newGame(this.store.mode(), human);
  }

  protected pointLabel(p: number): string {
    const color = this.shown()[p];
    return `${p + 1}${color ? ' · ' + this.nameOf(color) : ''}`;
  }

  private nameOf(player: Player): string {
    return player === 'W' ? this.store.i18n.white() : this.store.i18n.black();
  }
}
