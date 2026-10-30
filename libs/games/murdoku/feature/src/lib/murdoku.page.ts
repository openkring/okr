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
} from '@ionic/angular';

import { Header } from '@okr/shared-ui';
import { fill } from '@okr/shared-util-core';
import { FURNITURE, Furniture, MurdokuDifficulty, colLabel, coordLabel, isBlocking } from '@okr/games-murdoku-util';

import { MurdokuStore } from './murdoku.store';

type PersonView = { p: number; initial: string; name: string; color: string; victim: boolean };
type CellView = {
  i: number;
  room: string;
  /** Room name, shown in the room's first (top-left) square only. */
  roomLabel: string | null;
  furniture: Furniture | null;
  person: (PersonView & { locked: boolean; clash: boolean }) | null;
  marked: boolean;
  classes: string;
  label: string;
};
type CardView = PersonView & { role: string; killer: boolean; at: string | null; placed: boolean; clues: string[] };

/**
 * Murdoku — a murder on a floor plan. Place every person so that each row and column holds one,
 * nobody stands on blocking furniture and every statement is true; the killer is then the only
 * other person in the victim's room. Same frame as Sudoku (`libs/games/sudoku`): status line,
 * a settings card, a square CSS grid of `<button>` squares, then the dossier of statements and
 * the guide and solving tips.
 *
 * Pick a person (tray or dossier card), then tap a square; tap a placed person to pick them up.
 * «Markieren» or a right-click crosses squares out. Rows and columns turn green once taken and
 * red on a clash; there is no other live checking — the statements are the puzzle.
 */
@Component({
  selector: 'okr-murdoku-page',
  standalone: true,
  providers: [MurdokuStore],
  imports: [
    Header,
    IonContent, IonCard, IonCardContent, IonGrid, IonRow, IonCol,
    IonSelect, IonSelectOption, IonButton,
  ],
  template: `
    <okr-header [i18n]="{ title: store.i18n.title() }" />
    <ion-content class="ion-padding">
      <div class="mk-wrap">

        <p class="mk-status" role="status" aria-live="polite" [class.done]="store.phase() === 'closed'">{{ store.statusText() }}</p>

        <ion-card class="mk-setup">
          <ion-card-content>
            <p class="mk-desc">{{ store.i18n.desc() }}</p>
            <ion-grid class="ion-no-padding">
              <ion-row class="ion-align-items-center">
                <ion-col size="12" size-md="6">
                  <ion-select
                    [label]="store.i18n.difficulty_label()"
                    interface="popover"
                    [value]="store.difficulty()"
                    (ionChange)="store.newGame($any($event.detail.value))">
                    @for (level of levels; track level.value) {
                      <ion-select-option [value]="level.value">{{ level.label() }}</ion-select-option>
                    }
                  </ion-select>
                </ion-col>
                <ion-col size="12" size-md="6" class="mk-stats">{{ store.statsText() }}</ion-col>
              </ion-row>
            </ion-grid>
            <div class="mk-buttons">
              <ion-button fill="outline" [disabled]="!store.playing()" (click)="store.hint()">{{ store.i18n.hint() }}</ion-button>
              <ion-button fill="outline" [disabled]="!store.playing()" (click)="store.clear()">{{ store.i18n.clear() }}</ion-button>
              <ion-button fill="outline" color="danger" [disabled]="!store.playing()" (click)="store.giveUp()">
                {{ store.confirmGiveUp() ? store.i18n.give_up_confirm() : store.i18n.give_up() }}
              </ion-button>
              <ion-button fill="solid" (click)="store.newGame()">{{ store.i18n.new_game() }}</ion-button>
            </div>
          </ion-card-content>
        </ion-card>

        <div class="mk-layout">
          <section class="mk-board-col">
            <div class="mk-board" [style.--mk-n]="store.puzzle().n">
              <span class="mk-axis" aria-hidden="true">{{ store.i18n.compass() }}↑</span>
              @for (col of axis(); track col) {
                <span class="mk-axis" [class]="lineClass(store.lines().cols[col])" aria-hidden="true">{{ colName(col) }}</span>
              }
              @for (row of axis(); track row) {
                <span class="mk-axis" [class]="lineClass(store.lines().rows[row])" aria-hidden="true">{{ row + 1 }}</span>
                @for (cell of cells().slice(row * store.puzzle().n, (row + 1) * store.puzzle().n); track cell.i) {
                  <button type="button" [class]="cell.classes" [style.--mk-room]="cell.room" [attr.aria-label]="cell.label"
                    (click)="store.tapCell(cell.i)" (contextmenu)="onRightClick($event, cell.i)">
                    @if (cell.roomLabel) { <span class="mk-room-label">{{ cell.roomLabel }}</span> }
                    @if (cell.furniture) {
                      <svg class="mk-furniture" viewBox="0 0 24 24" aria-hidden="true">
                        @switch (cell.furniture) {
                          @case ('chair') { <path d="M7 3v18M7 12h10v9M7 3h3" /> }
                          @case ('bed') { <path d="M3 6v13M3 14h18v5M7 14v-3h5v3" /> }
                          @case ('rug') { <rect x="6" y="5" width="12" height="14" rx="1" /><path d="M9 9h6M9 12h6M9 15h6M8 5V3M12 5V3M16 5V3M8 21v-2M12 21v-2M16 21v-2" /> }
                          @case ('table') { <path d="M3 9h18M5 9v10M19 9v10M5 13h14" /> }
                          @case ('plant') { <path d="M8 15h8l-1.2 6H9.2zM12 15V9M12 11C9 11 7 9 7 6c3 0 5 2 5 5zM12 9c0-3 2-5 5-5 0 3-2 5-5 5z" /> }
                          @case ('shelf') { <rect x="5" y="3" width="14" height="18" /><path d="M5 9h14M5 15h14M8 9V5M10 9V5.5M13 9V6M8 15v-4M11 15v-3.5M15 15v-4" /> }
                        }
                      </svg>
                    }
                    @if (cell.person; as person) {
                      <span class="mk-token" [class.victim]="person.victim" [class.locked]="person.locked" [class.clash]="person.clash"
                        [style.--mk-pc]="person.color">{{ person.initial }}</span>
                    } @else if (cell.marked) {
                      <span class="mk-mark" aria-hidden="true">✕</span>
                    }
                  </button>
                }
              }
            </div>

            <div class="mk-tray">
              <div class="mk-chips">
                @for (card of cards(); track card.p) {
                  <button type="button" class="mk-chip" [class.victim]="card.victim" [class.placed]="card.placed"
                    [style.--mk-pc]="card.color" [attr.aria-pressed]="isSelected(card.p)" [attr.aria-label]="card.name + ', ' + card.role"
                    [title]="card.name" [disabled]="!store.playing()" (click)="store.select(card.p)">{{ card.initial }}</button>
                }
              </div>
              <ion-button size="small" [fill]="store.markMode() ? 'solid' : 'outline'" [attr.aria-pressed]="store.markMode()"
                [disabled]="!store.playing()" (click)="store.toggleMarkMode()">✕ {{ store.i18n.mark() }}</ion-button>
            </div>

            <div class="mk-legend">
              <div class="mk-legend-group">
                <strong>{{ store.i18n.legend_rooms() }}</strong>
                @for (room of rooms(); track room.i) {
                  <span class="mk-legend-item"><span class="mk-swatch" [style.background]="room.color"></span>{{ room.name }}</span>
                }
              </div>
              <div class="mk-legend-group">
                <strong>{{ store.i18n.legend_furniture() }}</strong>
                @for (f of furnitureLegend(); track f.type) {
                  <span class="mk-legend-item">
                    <svg class="mk-legend-icon" viewBox="0 0 24 24" aria-hidden="true">
                      @switch (f.type) {
                        @case ('chair') { <path d="M7 3v18M7 12h10v9M7 3h3" /> }
                        @case ('bed') { <path d="M3 6v13M3 14h18v5M7 14v-3h5v3" /> }
                        @case ('rug') { <rect x="6" y="5" width="12" height="14" rx="1" /> }
                        @case ('table') { <path d="M3 9h18M5 9v10M19 9v10M5 13h14" /> }
                        @case ('plant') { <path d="M8 15h8l-1.2 6H9.2zM12 15V9M12 11C9 11 7 9 7 6c3 0 5 2 5 5zM12 9c0-3 2-5 5-5 0 3-2 5-5 5z" /> }
                        @case ('shelf') { <rect x="5" y="3" width="14" height="18" /><path d="M5 9h14M5 15h14" /> }
                      }
                    </svg>{{ f.name }}
                  </span>
                }
                <span class="mk-legend-item"><span class="mk-swatch mk-hatch"></span>{{ store.i18n.legend_blocked() }}</span>
              </div>
            </div>
          </section>

          <section class="mk-dossier">
            @if (!store.playing()) {
              <div class="mk-verdict">
                @switch (store.phase()) {
                  @case ('accuse') {
                    <h2>{{ store.i18n.accuse_title() }}</h2>
                    <p>{{ accuseText() }}</p>
                    <div class="mk-buttons">
                      @for (card of suspects(); track card.p) {
                        <ion-button fill="outline" (click)="store.accuse(card.p)">{{ card.name }}</ion-button>
                      }
                    </div>
                  }
                  @case ('closed') {
                    <h2>{{ store.i18n.closed_title() }}</h2>
                    <p>{{ closedText() }}</p>
                    <ion-button fill="solid" (click)="store.newGame()">{{ store.i18n.next_case() }}</ion-button>
                  }
                  @case ('revealed') {
                    <h2>{{ store.i18n.revealed_title() }}</h2>
                    <p>{{ closedText() }}</p>
                    <ion-button fill="solid" (click)="store.newGame()">{{ store.i18n.next_case() }}</ion-button>
                  }
                }
              </div>
            }

            <h2 class="mk-heading">{{ store.i18n.statements() }}</h2>
            <div class="mk-cards">
              @for (card of cards(); track card.p) {
                <button type="button" class="mk-card" [attr.aria-pressed]="isSelected(card.p)" [disabled]="!store.playing()"
                  (click)="store.select(card.p)">
                  <span class="mk-card-head">
                    <span class="mk-mini" [class.victim]="card.victim" [style.--mk-pc]="card.color">{{ card.initial }}</span>
                    <span class="mk-name">{{ card.name }}</span>
                    <span class="mk-role" [class.killer]="card.killer">{{ card.role }}@if (card.at) { · {{ card.at }} }</span>
                  </span>
                  <ul>
                    @for (clue of card.clues; track $index) { <li>{{ clue }}</li> }
                  </ul>
                </button>
              }
            </div>
          </section>
        </div>

        <ion-card class="mk-help">
          <ion-card-content>
            <details open>
              <summary>{{ store.i18n.guide_title() }}</summary>
              <p>{{ store.i18n.guide_goal() }}</p>
              <h3>{{ store.i18n.guide_rules() }}</h3>
              <ol>
                <li>{{ store.i18n.guide_rule_rows() }}</li>
                <li>{{ store.i18n.guide_rule_furniture() }}</li>
                <li>{{ store.i18n.guide_rule_clues() }}</li>
                <li>{{ store.i18n.guide_rule_killer() }}</li>
              </ol>
              <h3>{{ store.i18n.guide_controls() }}</h3>
              <ul>
                <li>{{ store.i18n.guide_place() }}</li>
                <li>{{ store.i18n.guide_mark() }}</li>
                <li>{{ store.i18n.guide_hint() }}</li>
                <li>{{ store.i18n.guide_finish() }}</li>
              </ul>
            </details>
          </ion-card-content>
        </ion-card>

        <ion-card class="mk-help">
          <ion-card-content>
            <details>
              <summary>{{ store.i18n.tips_title() }}</summary>
              <ol>
                <li>{{ store.i18n.tip_start() }}</li>
                <li>{{ store.i18n.tip_blocked() }}</li>
                <li>{{ store.i18n.tip_lines() }}</li>
                <li>{{ store.i18n.tip_last() }}</li>
                <li>{{ store.i18n.tip_alone() }}</li>
                <li>{{ store.i18n.tip_victim() }}</li>
                <li>{{ store.i18n.tip_compare() }}</li>
                <li>{{ store.i18n.tip_negative() }}</li>
                <li>{{ store.i18n.tip_assume() }}</li>
              </ol>
            </details>
          </ion-card-content>
        </ion-card>
      </div>
    </ion-content>
  `,
  styles: [`
    :host {
      --mk-wall: #22303f;
      --mk-line: #b8c3ce;
      --mk-ink: #18222e;
      --mk-muted: #5b6875;
      --mk-hatch: rgba(34, 48, 63, 0.3);
      --mk-token-ink: #ffffff;
      --mk-select: #e2b336;
      --mk-ok: #2c7a4b;
      --mk-bad: #c0392b;
      --mk-card: #ffffff;
      --mk-r0: #dbe7f3; --mk-r1: #f2e0d1; --mk-r2: #daebdc; --mk-r3: #e9dbea; --mk-r4: #f0e8c8; --mk-r5: #d3eae9;
      --mk-p0: #2f6fb2; --mk-p1: #c2552b; --mk-p2: #2c8655; --mk-p3: #8a43a8; --mk-p4: #9c7206; --mk-p5: #bc3676;
    }
    @media (prefers-color-scheme: dark) {
      :host {
        --mk-wall: #a9c3de;
        --mk-line: #2c4460;
        --mk-ink: #dce6f0;
        --mk-muted: #93a6ba;
        --mk-hatch: rgba(169, 195, 222, 0.26);
        --mk-token-ink: #0d1926;
        --mk-select: #f0c94e;
        --mk-ok: #6fd39a;
        --mk-bad: #ff7b6c;
        --mk-card: #1b2026;
        --mk-r0: #1a3150; --mk-r1: #3a2a22; --mk-r2: #1c392a; --mk-r3: #35254a; --mk-r4: #38331a; --mk-r5: #16393c;
        --mk-p0: #71a9e8; --mk-p1: #f08b5e; --mk-p2: #62cb8f; --mk-p3: #c38de2; --mk-p4: #e2b53c; --mk-p5: #f27db0;
      }
    }

    .mk-wrap { max-width: 64rem; margin: 0 auto; }
    .mk-status { min-height: 2.8em; margin: 0.25rem 0 0.75rem; font-weight: 500; text-align: center; }
    .mk-status.done { color: var(--mk-ok); }
    .mk-setup { margin: 0 0 1rem; }
    .mk-desc { margin: 0 0 0.5rem; color: var(--ion-color-medium); }
    .mk-stats { color: var(--ion-color-medium); font-size: 0.9rem; font-variant-numeric: tabular-nums; padding: 0.5rem 0; }
    .mk-buttons { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.75rem; }

    .mk-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1.5rem; }
    @media (min-width: 900px) { .mk-layout { grid-template-columns: minmax(0, 32rem) minmax(0, 1fr); align-items: start; } }

    /*
     * Tracks are minmax(0, 1fr), never bare 1fr: with auto minimums Chromium sizes the columns
     * from the buttons' min-content and the board overflows (see the Sudoku page).
     */
    .mk-board {
      display: grid; grid-template-columns: 1.5rem repeat(var(--mk-n), minmax(0, 1fr));
      width: 100%; max-width: 32rem; user-select: none; touch-action: manipulation;
    }
    .mk-axis {
      display: flex; align-items: center; justify-content: center; padding: 2px 0;
      font-size: 0.75rem; color: var(--mk-muted); font-variant-numeric: tabular-nums;
    }
    .mk-axis.ok { color: var(--mk-ok); font-weight: 600; }
    .mk-axis.bad { color: var(--mk-bad); font-weight: 600; }

    .cell {
      position: relative; aspect-ratio: 1; min-width: 0; padding: 0; overflow: hidden; cursor: pointer;
      background: var(--mk-room); color: var(--mk-ink); container-type: inline-size;
      border: 0; border-top: 1px solid var(--mk-line); border-left: 1px solid var(--mk-line);
    }
    .cell.wt { border-top: 3px solid var(--mk-wall); }
    .cell.wl { border-left: 3px solid var(--mk-wall); }
    .cell.wr { border-right: 3px solid var(--mk-wall); }
    .cell.wb { border-bottom: 3px solid var(--mk-wall); }
    .cell.blocked { cursor: not-allowed; background-image: repeating-linear-gradient(45deg, var(--mk-hatch) 0 1.5px, transparent 1.5px 7px); }
    .cell:focus-visible { outline: 2px solid var(--mk-select); outline-offset: -3px; z-index: 1; }
    .cell:not(.blocked):hover { box-shadow: inset 0 0 0 2px var(--ion-color-primary); }

    .mk-room-label {
      position: absolute; left: 3px; right: 3px; top: 1px; text-align: left; pointer-events: none;
      font-size: clamp(0.5rem, 12cqw, 0.7rem); line-height: 1.2; letter-spacing: 0.02em; text-transform: uppercase;
      color: var(--mk-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .mk-furniture {
      position: absolute; width: 46cqw; height: 46cqw; left: 27cqw; top: 30cqw; pointer-events: none;
      fill: none; stroke: var(--mk-wall); stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round;
    }
    .has-person .mk-furniture { width: 28cqw; height: 28cqw; left: auto; top: auto; right: 4cqw; bottom: 4cqw; opacity: 0.75; }
    .mk-token {
      position: absolute; left: 50%; top: 54%; transform: translate(-50%, -50%); pointer-events: none;
      width: 58cqw; height: 58cqw; border-radius: 50%; display: grid; place-items: center;
      font-size: 32cqw; font-weight: 700; line-height: 1; color: var(--mk-token-ink); background: var(--mk-pc);
    }
    .mk-token.victim { background: transparent; color: var(--mk-ink); border: 2.5px dashed var(--mk-ink); }
    .mk-token.locked::after { content: ''; position: absolute; inset: -5px; border-radius: 50%; border: 2px solid var(--mk-select); }
    .mk-token.clash { outline: 3px solid var(--mk-bad); outline-offset: 2px; }
    .mk-mark { position: absolute; inset: 0; display: grid; place-items: center; font-size: 38cqw; color: var(--mk-muted); pointer-events: none; }

    .mk-tray { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem 1rem; margin-top: 0.75rem; max-width: 32rem; }
    .mk-chips { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .mk-chip {
      width: 2.6rem; height: 2.6rem; border-radius: 50%; border: 0; padding: 0; cursor: pointer;
      font-size: 1.2rem; font-weight: 700; color: var(--mk-token-ink); background: var(--mk-pc);
    }
    .mk-chip.victim { background: transparent; color: var(--mk-ink); border: 2.5px dashed var(--mk-ink); }
    .mk-chip.placed { opacity: 0.35; }
    .mk-chip[aria-pressed='true'] { outline: 3px solid var(--mk-select); outline-offset: 3px; opacity: 1; }
    .mk-chip:disabled { cursor: default; }

    .mk-legend { display: flex; flex-direction: column; gap: 0.4rem; margin-top: 1rem; font-size: 0.85rem; color: var(--ion-color-medium); max-width: 32rem; }
    .mk-legend-group { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 0.9rem; }
    .mk-legend-group strong { color: var(--mk-ink); font-weight: 600; margin-right: 0.25rem; }
    .mk-legend-item { display: inline-flex; align-items: center; gap: 0.35rem; }
    .mk-legend-icon { width: 1.1rem; height: 1.1rem; fill: none; stroke: var(--mk-wall); stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
    .mk-swatch { display: inline-block; width: 0.9rem; height: 0.9rem; border: 1.5px solid var(--mk-wall); border-radius: 2px; }
    .mk-hatch { display: inline-block; width: 0.9rem; height: 0.9rem; background: repeating-linear-gradient(45deg, var(--mk-hatch) 0 1.5px, transparent 1.5px 5px); }

    .mk-dossier { display: flex; flex-direction: column; gap: 0.75rem; min-width: 0; }
    .mk-heading { margin: 0; font-size: 1.1rem; }
    .mk-verdict { border: 2px solid var(--mk-select); border-radius: 8px; padding: 0.75rem 1rem; }
    .mk-verdict h2 { margin: 0 0 0.25rem; font-size: 1.3rem; }
    .mk-verdict p { margin: 0 0 0.5rem; }
    .mk-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr)); gap: 0.6rem; }
    .mk-card {
      display: flex; flex-direction: column; gap: 0.35rem; min-width: 0; text-align: left; cursor: pointer;
      padding: 0.6rem 0.75rem; border-radius: 8px; border: 1.5px solid var(--mk-line); background: var(--mk-card); color: var(--mk-ink);
      font: inherit;
    }
    .mk-card:disabled { cursor: default; }
    .mk-card[aria-pressed='true'] { border-color: var(--mk-select); box-shadow: inset 4px 0 0 var(--mk-select); }
    .mk-card-head { display: flex; align-items: center; gap: 0.6rem; }
    .mk-mini {
      flex: none; width: 1.75rem; height: 1.75rem; border-radius: 50%; display: grid; place-items: center;
      font-weight: 700; color: var(--mk-token-ink); background: var(--mk-pc);
    }
    .mk-mini.victim { background: transparent; color: var(--mk-ink); border: 2px dashed var(--mk-ink); }
    .mk-name { font-weight: 600; }
    .mk-role { margin-left: auto; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--mk-muted); white-space: nowrap; }
    .mk-role.killer { color: var(--mk-bad); font-weight: 600; }
    .mk-card ul { margin: 0; padding-left: 1.1rem; font-size: 0.92rem; }

    .mk-help { margin: 1.5rem 0 0; }
    .mk-help + .mk-help { margin-top: 0.75rem; }
    .mk-help summary { cursor: pointer; font-weight: 600; font-size: 1.05rem; color: var(--ion-text-color); }
    .mk-help h3 { margin: 0.9rem 0 0.25rem; font-size: 0.95rem; color: var(--ion-text-color); }
    .mk-help p, .mk-help li { max-width: 65ch; line-height: 1.5; }
    .mk-help ol, .mk-help ul { padding-left: 1.25rem; margin: 0.25rem 0 0; display: flex; flex-direction: column; gap: 0.3rem; }
  `],
})
export class MurdokuPage {
  protected readonly store = inject(MurdokuStore);

  protected readonly levels: { value: MurdokuDifficulty; label: () => string }[] = [
    { value: 'easy', label: this.store.i18n.difficulty_easy },
    { value: 'medium', label: this.store.i18n.difficulty_medium },
    { value: 'hard', label: this.store.i18n.difficulty_hard },
  ];

  protected readonly axis = computed((): number[] => Array.from({ length: this.store.puzzle().n }, (_, i) => i));

  protected colName(col: number): string {
    return colLabel(col);
  }

  protected lineClass(count: number): string {
    if (count > 1) return 'mk-axis bad';
    if (count === 1) return 'mk-axis ok';
    return 'mk-axis';
  }

  protected isSelected(p: number): boolean {
    return this.store.playing() && !this.store.markMode() && this.store.selected() === p;
  }

  private person(p: number): PersonView {
    const puzzle = this.store.puzzle();
    return { p, initial: puzzle.names[p][0], name: puzzle.names[p], color: `var(--mk-p${p % 6})`, victim: p === puzzle.victim };
  }

  protected readonly cells = computed((): CellView[] => {
    const puzzle = this.store.puzzle(), n = puzzle.n, i18n = this.store.i18n;
    const roomName = this.store.roomName();
    const occupant = new Map<number, number>();
    this.store.placement().forEach((c, p) => { if (c !== null) occupant.set(c, p); });
    const locked = new Set(this.store.locked()), clash = this.store.conflicts(), marks = new Set(this.store.marks());
    const first = new Map<number, number>();
    puzzle.rooms.forEach((room, c) => { if (!first.has(room)) first.set(room, c); });

    return puzzle.rooms.map((room, i) => {
      const r = Math.floor(i / n), c = i % n, f = puzzle.furniture[i], p = occupant.get(i);
      const classes = ['cell'];
      if (r === 0 || puzzle.rooms[i - n] !== room) classes.push('wt');
      if (c === 0 || puzzle.rooms[i - 1] !== room) classes.push('wl');
      if (c === n - 1) classes.push('wr');
      if (r === n - 1) classes.push('wb');
      if (isBlocking(f)) classes.push('blocked');
      if (p !== undefined) classes.push('has-person');

      const parts = [fill(i18n.cell_label(), { at: coordLabel(i, n), room: roomName(room) })];
      if (f) parts.push(i18n[`furniture_${f}`]());
      if (p !== undefined) parts.push(puzzle.names[p]);
      else if (marks.has(i)) parts.push(i18n.cell_marked());

      return {
        i,
        room: `var(--mk-r${room % 6})`,
        roomLabel: first.get(room) === i ? roomName(room) : null,
        furniture: f,
        person: p === undefined ? null : { ...this.person(p), locked: locked.has(p), clash: clash.has(p) },
        marked: marks.has(i),
        classes: classes.join(' '),
        label: parts.join(', '),
      };
    });
  });

  protected readonly cards = computed((): CardView[] => {
    const puzzle = this.store.puzzle(), i18n = this.store.i18n, text = this.store.clueText();
    const done = this.store.phase() === 'closed' || this.store.phase() === 'revealed';
    const placement = this.store.placement();
    return this.store.order().map(p => {
      const killer = done && p === puzzle.killer;
      const cell = placement[p];
      let role = i18n.role_suspect();
      if (p === puzzle.victim) role = i18n.role_victim();
      else if (killer) role = i18n.role_killer();
      return {
        ...this.person(p),
        role,
        killer,
        placed: cell !== null,
        at: cell === null ? null : coordLabel(cell, puzzle.n),
        clues: puzzle.clues.filter(c => c.p === p).map(text),
      };
    });
  });

  protected readonly suspects = computed((): CardView[] => this.cards().filter(c => !c.victim));

  protected readonly rooms = computed(() =>
    this.store.puzzle().roomIds.map((_, i) => ({ i, name: this.store.roomName()(i), color: `var(--mk-r${i % 6})` })));

  protected readonly furnitureLegend = computed(() => {
    const used = new Set(this.store.puzzle().furniture);
    return FURNITURE.filter(f => used.has(f)).map(f => ({
      type: f, name: this.store.i18n[`furniture_${f}`](),
    }));
  });

  protected readonly accuseText = computed((): string => {
    const puzzle = this.store.puzzle();
    return fill(this.store.i18n.accuse_text(), { victim: puzzle.names[puzzle.victim] });
  });

  protected readonly closedText = computed((): string => {
    const puzzle = this.store.puzzle();
    return fill(this.store.i18n.closed_text(), {
      killer: puzzle.names[puzzle.killer],
      victim: puzzle.names[puzzle.victim],
      room: this.store.roomName()(puzzle.rooms[puzzle.solution[puzzle.victim]]),
    });
  });

  protected onRightClick(event: MouseEvent, cell: number): void {
    event.preventDefault();
    this.store.toggleMark(cell);
  }
}
