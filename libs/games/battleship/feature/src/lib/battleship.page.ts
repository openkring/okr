import { Component, computed, inject } from '@angular/core';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCheckbox,
  IonCol,
  IonContent,
  IonGrid,
  IonRow,
  IonSelect,
  IonSelectOption,
} from '@ionic/angular/standalone';

import { Header } from '@okr/shared-ui';
import {
  AiLevel,
  BATTLESHIP_COLS,
  BATTLESHIP_SIZE,
  Board,
  FLEET,
  coordLabel,
  isSunk,
} from '@okr/games-battleship-util';

import { BattleshipStore, shipName } from './battleship.store';

type CellView = { r: number; c: number; label: string; classes: string; disabled: boolean };
type FleetRow = { name: string; len: number; pips: boolean[]; sunk: boolean; current: boolean; placed: boolean };

const INDEXES = Array.from({ length: BATTLESHIP_SIZE }, (_, i) => i);

/**
 * Schiffli versenken — a port of the standalone prototype (`libs/games/battleship`, 2026-09).
 *
 * Both boards are an 11×11 CSS grid: one row and one column of coordinate labels, then 10×10
 * `<button>` cells. Buttons rather than divs so a keyboard can place ships and shoot; a cell that
 * means nothing right now is `disabled`, which is also what keeps a finished cell from being
 * shot twice.
 *
 * `R` rotates the next ship during setup, as in the prototype — the listener ignores key presses
 * aimed at a form control, so typing into the select does not rotate anything.
 */
@Component({
  selector: 'okr-battleship-page',
  standalone: true,
  providers: [BattleshipStore],
  imports: [
    Header,
    IonContent, IonCard, IonCardContent, IonGrid, IonRow, IonCol,
    IonSelect, IonSelectOption, IonButton, IonCheckbox,
  ],
  host: { '(document:keydown)': 'onKey($event)' },
  template: `
    <okr-header [i18n]="{ title: store.i18n.title() }" />
    <ion-content class="ion-padding">
      <div class="bs-wrap">

        <p class="bs-status" role="status" aria-live="polite">{{ store.statusText() }}</p>

        @if (store.phase() === 'setup') {
          <ion-card class="bs-setup">
            <ion-card-content>
              <ion-grid class="ion-no-padding">
                <ion-row class="ion-align-items-center">
                  <ion-col size="12" size-md="4">
                    <ion-checkbox
                      labelPlacement="end"
                      [checked]="store.allowTouch()"
                      (ionChange)="store.setAllowTouch($event.detail.checked)">
                      {{ store.i18n.opt_allow_touch() }}
                    </ion-checkbox>
                  </ion-col>
                  <ion-col size="12" size-md="4">
                    <ion-checkbox
                      labelPlacement="end"
                      [checked]="store.extraShot()"
                      (ionChange)="store.setExtraShot($event.detail.checked)">
                      {{ store.i18n.opt_extra_shot() }}
                    </ion-checkbox>
                  </ion-col>
                  <ion-col size="12" size-md="4">
                    <ion-select
                      [label]="store.i18n.level_label()"
                      interface="popover"
                      [value]="store.level()"
                      (ionChange)="store.setLevel($any($event.detail.value))">
                      @for (level of levels; track level.value) {
                        <ion-select-option [value]="level.value">{{ level.label() }}</ion-select-option>
                      }
                    </ion-select>
                  </ion-col>
                </ion-row>
              </ion-grid>

              <div class="bs-buttons">
                <ion-button fill="outline" (click)="store.rotate()">
                  {{ store.i18n.rotate() }} (R) {{ store.horizontal() ? '↔' : '↕' }}
                </ion-button>
                <ion-button fill="outline" (click)="store.randomize()">{{ store.i18n.random() }}</ion-button>
                <ion-button fill="clear" (click)="store.resetSetup()">{{ store.i18n.reset() }}</ion-button>
                <ion-button fill="solid" [disabled]="!store.fleetPlaced()" (click)="store.startBattle()">
                  {{ store.i18n.start() }}
                </ion-button>
              </div>
            </ion-card-content>
          </ion-card>
        }

        <div class="bs-boards">
          <section class="bs-board-wrap">
            <h2>{{ store.i18n.own_fleet() }}</h2>
            <div class="bs-board" (mouseleave)="store.setHover(null)">
              <span class="bs-label"></span>
              @for (c of indexes; track c) { <span class="bs-label">{{ cols[c] }}</span> }
              @for (row of playerCells(); track $index) {
                <span class="bs-label">{{ $index + 1 }}</span>
                @for (cell of row; track cell.c) {
                  <button
                    type="button"
                    [class]="cell.classes"
                    [disabled]="cell.disabled"
                    [attr.aria-label]="cell.label"
                    (mouseenter)="store.setHover([cell.r, cell.c])"
                    (click)="store.placeAt(cell.r, cell.c)"></button>
                }
              }
            </div>
            <ul class="bs-fleet">
              @for (ship of playerFleet(); track $index) {
                <li [class.current]="ship.current" [class.placed]="ship.placed" [class.sunk]="ship.sunk">
                  <span>{{ ship.name }}</span>
                  <span class="bs-pips">
                    @for (hit of ship.pips; track $index) { <i [class.hit]="hit"></i> }
                  </span>
                </li>
              }
            </ul>
          </section>

          @if (store.phase() !== 'setup') {
            <section class="bs-board-wrap">
              <h2>{{ store.i18n.enemy_fleet() }}</h2>
              <div class="bs-board">
                <span class="bs-label"></span>
                @for (c of indexes; track c) { <span class="bs-label">{{ cols[c] }}</span> }
                @for (row of enemyCells(); track $index) {
                  <span class="bs-label">{{ $index + 1 }}</span>
                  @for (cell of row; track cell.c) {
                    <button
                      type="button"
                      [class]="cell.classes"
                      [disabled]="cell.disabled"
                      [attr.aria-label]="cell.label"
                      (click)="store.shootAt(cell.r, cell.c)"></button>
                  }
                }
              </div>
              <ul class="bs-fleet">
                @for (ship of enemyFleet(); track $index) {
                  <li [class.sunk]="ship.sunk">
                    <span>{{ ship.name }}</span>
                    <span class="bs-pips">
                      @for (hit of ship.pips; track $index) { <i></i> }
                    </span>
                  </li>
                }
              </ul>
            </section>
          }
        </div>

        @if (store.phase() === 'over') {
          <div class="bs-again">
            <ion-button fill="solid" (click)="store.resetSetup()">{{ store.i18n.again() }}</ion-button>
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: [`
    :host {
      --bs-water: #dcecf7;
      --bs-water-hover: #c4ddf0;
      --bs-ship: #6b7785;
      --bs-hit: #e0463a;
      --bs-sunk: #8e1f17;
      --bs-miss: #7c95ab;
      --bs-ok: #3aa864;
      --bs-bad: #e0463a;
      --bs-accent: var(--ion-color-primary);
    }
    @media (prefers-color-scheme: dark) {
      :host {
        --bs-water: #16324a;
        --bs-water-hover: #1d4160;
        --bs-ship: #8a96a3;
        --bs-hit: #ff5d4f;
        --bs-sunk: #b3342a;
        --bs-miss: #6d8aa3;
      }
    }

    .bs-wrap { max-width: 60rem; margin: 0 auto; }
    .bs-status { min-height: 2.8em; margin: 0.25rem 0 0.75rem; font-weight: 500; text-align: center; }
    .bs-setup { margin: 0 0 1rem; }
    .bs-buttons { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.75rem; }

    .bs-boards { display: flex; flex-wrap: wrap; gap: 1.5rem; justify-content: center; }
    .bs-board-wrap { width: min(100%, 26rem); }
    h2 { margin: 0 0 0.5rem; font-size: 1.05rem; color: var(--ion-color-medium); font-weight: 600; }

    .bs-board {
      display: grid;
      grid-template-columns: repeat(11, 1fr);
      gap: 2px;
      width: 100%;
      aspect-ratio: 1;
      user-select: none;
      touch-action: manipulation;
    }
    .bs-label { display: grid; place-items: center; font-size: 0.75rem; color: var(--ion-color-medium); }

    .cell {
      position: relative; padding: 0; border: 0; border-radius: 3px;
      background: var(--bs-water); aspect-ratio: 1; cursor: pointer;
    }
    .cell:disabled { cursor: default; opacity: 1; }
    .cell:not(:disabled):hover { background: var(--bs-water-hover); }
    .cell.ship { background: var(--bs-ship); }
    .cell.ship.revealed { background: transparent; outline: 2px dashed var(--bs-ship); outline-offset: -3px; }
    .cell.miss::after, .cell.blocked::after {
      content: ""; position: absolute; inset: 38%; border-radius: 50%; background: var(--bs-miss);
    }
    .cell.blocked::after { opacity: 0.4; }
    .cell.hit { background: var(--bs-hit); }
    .cell.hit::after, .cell.sunk::after {
      content: "✕"; position: absolute; inset: 0; display: grid; place-items: center;
      color: #fff; font-size: 0.8em; font-weight: 700;
    }
    .cell.sunk { background: var(--bs-sunk); }
    .cell.last { box-shadow: 0 0 0 2px var(--bs-accent); z-index: 1; }
    .cell.preview-ok { background: var(--bs-ok); }
    .cell.preview-bad { background: var(--bs-bad); opacity: 0.7; }

    .bs-fleet { list-style: none; margin: 0.6rem 0 0; padding: 0; font-size: 0.9rem; }
    .bs-fleet li { display: flex; justify-content: space-between; align-items: center; padding: 3px 6px; border-radius: 6px; }
    .bs-fleet li.current { background: var(--bs-water); font-weight: 600; }
    .bs-fleet li.placed, .bs-fleet li.sunk { color: var(--ion-color-medium); }
    .bs-fleet li.sunk { text-decoration: line-through; }
    .bs-pips { display: flex; gap: 3px; }
    .bs-pips i { width: 12px; height: 12px; border-radius: 2px; background: var(--bs-ship); }
    .bs-pips i.hit, .bs-fleet li.sunk .bs-pips i { background: var(--bs-hit); }

    .bs-again { display: flex; justify-content: center; margin-top: 1rem; }
  `],
})
export class BattleshipPage {
  protected readonly store = inject(BattleshipStore);

  protected readonly indexes = INDEXES;
  protected readonly cols = BATTLESHIP_COLS;
  protected readonly levels: { value: AiLevel; label: () => string }[] = [
    { value: 'easy', label: this.store.i18n.level_easy },
    { value: 'normal', label: this.store.i18n.level_normal },
    { value: 'hard', label: this.store.i18n.level_hard },
  ];

  protected readonly playerCells = computed((): CellView[][] => {
    const board = this.store.player();
    const k = this.store.playerKnowledge();
    const preview = this.store.preview();
    const last = this.store.lastAiShot();
    const setup = this.store.phase() === 'setup';
    return INDEXES.map(r => INDEXES.map(c => {
      const classes = ['cell'];
      if (board.cells[r][c].ship !== -1) classes.push('ship');
      if (k[r][c] !== 'unknown') classes.push(k[r][c]);
      if (preview?.cells.has(r * BATTLESHIP_SIZE + c)) classes.push(preview.ok ? 'preview-ok' : 'preview-bad');
      if (last && last[0] === r && last[1] === c) classes.push('last');
      return { r, c, label: coordLabel(r, c), classes: classes.join(' '), disabled: !setup };
    }));
  });

  protected readonly enemyCells = computed((): CellView[][] => {
    const enemy = this.store.enemy();
    const k = this.store.enemyKnowledge();
    if (!enemy || !k) return [];
    const reveal = this.store.phase() === 'over';
    const canShoot = this.store.phase() === 'battle' && this.store.turn() === 'player';
    const last = this.store.lastPlayerShot();
    return INDEXES.map(r => INDEXES.map(c => {
      const s = k[r][c];
      const classes = ['cell'];
      if (s === 'miss' || s === 'hit' || s === 'blocked') classes.push(s);
      if (s === 'sunk') classes.push('sunk', 'ship');
      const cell = enemy.cells[r][c];
      if (reveal && cell.ship !== -1 && !cell.shot) classes.push('ship', 'revealed');
      if (last && last[0] === r && last[1] === c) classes.push('last');
      return { r, c, label: coordLabel(r, c), classes: classes.join(' '), disabled: !canShoot || s !== 'unknown' };
    }));
  });

  protected readonly playerFleet = computed(() => this.fleetRows(this.store.player(), true));
  protected readonly enemyFleet = computed(() => {
    const enemy = this.store.enemy();
    return enemy ? this.fleetRows(enemy, false) : [];
  });

  protected onKey(event: KeyboardEvent): void {
    if (this.store.phase() !== 'setup' || (event.key !== 'r' && event.key !== 'R')) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, select, textarea, ion-select, ion-input, ion-textarea')) return;
    this.store.rotate();
  }

  /** One row per fleet ship; on the own board the pips show where the ship has been hit. */
  private fleetRows(board: Board, own: boolean): FleetRow[] {
    const setup = this.store.phase() === 'setup';
    return FLEET.map((spec, i) => {
      const ship = board.ships[i];
      return {
        name: shipName(this.store.i18n, spec.id),
        len: spec.len,
        pips: Array.from({ length: spec.len }, (_, p) => !!ship && own && !setup && p < ship.hits),
        sunk: !!ship && isSunk(ship),
        current: own && setup && i === this.store.placeIdx(),
        placed: own && setup && !!ship,
      };
    });
  }
}
