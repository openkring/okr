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
import { BIMARU_COLS, BimaruSize, coordLabel, markedSegment, segmentAt, shipGrid } from '@okr/games-bimaru-util';

import { BimaruStore, shipName } from './bimaru.store';

type CellView = { r: number; c: number; label: string; classes: string; disabled: boolean };
type CountView = { index: number; value: number; label: string; classes: string };
type FleetRow = { name: string; len: number; done: boolean };

/**
 * Bimaru — find the hidden fleet from the edge counts. Same frame as Schiffli versenken
 * (`libs/games/battleship`): status line, a settings card, a square CSS grid of `<button>` cells
 * and the fleet list below it.
 *
 * The grid is (size+1)² — the first row and column hold the counts instead of coordinates. A
 * count is a button too: tapping it fills the rest of its line with water. It turns green once
 * the line holds exactly that many ship marks and red when it holds more.
 *
 * A ship mark is drawn with the shape its neighbours give it (end, middle, submarine); a revealed
 * cell always shows its true shape.
 */
@Component({
  selector: 'okr-bimaru-page',
  standalone: true,
  providers: [BimaruStore],
  imports: [
    Header,
    IonContent, IonCard, IonCardContent, IonGrid, IonRow, IonCol,
    IonSelect, IonSelectOption, IonButton,
  ],
  template: `
    <okr-header [i18n]="{ title: store.i18n.title() }" />
    <ion-content class="ion-padding">
      <div class="bm-wrap">

        <p class="bm-status" role="status" aria-live="polite" [class.solved]="store.solved()">{{ store.statusText() }}</p>

        <ion-card class="bm-setup">
          <ion-card-content>
            <p class="bm-desc">{{ store.i18n.desc() }}</p>
            <ion-grid class="ion-no-padding">
              <ion-row class="ion-align-items-center">
                <ion-col size="12" size-md="4">
                  <ion-select
                    [label]="store.i18n.size_label()"
                    interface="popover"
                    [value]="store.size()"
                    (ionChange)="store.newGame($any($event.detail.value))">
                    @for (size of sizes; track size.value) {
                      <ion-select-option [value]="size.value">{{ size.label() }}</ion-select-option>
                    }
                  </ion-select>
                </ion-col>
              </ion-row>
            </ion-grid>

            <div class="bm-buttons">
              <ion-button fill="outline" [disabled]="!store.history().length || store.solved()" (click)="store.undo()">
                {{ store.i18n.undo() }}
              </ion-button>
              <ion-button fill="outline" [disabled]="store.solved()" (click)="store.hint()">{{ store.i18n.hint() }}</ion-button>
              <ion-button fill="outline" [disabled]="store.solved()" (click)="store.check()">{{ store.i18n.check() }}</ion-button>
              <ion-button fill="solid" (click)="store.newGame()">{{ store.i18n.new_game() }}</ion-button>
            </div>
          </ion-card-content>
        </ion-card>

        <section class="bm-board-wrap">
          <div class="bm-board" [style.grid-template-columns]="'repeat(' + (store.size() + 1) + ', 1fr)'">
            <span class="bm-label"></span>
            @for (count of colCounts(); track count.index) {
              <button type="button" [class]="count.classes" [attr.aria-label]="count.label"
                (click)="store.fillLine('col', count.index)">{{ count.value }}</button>
            }
            @for (row of cells(); track $index) {
              @let count = rowCounts()[$index];
              <button type="button" [class]="count.classes" [attr.aria-label]="count.label"
                (click)="store.fillLine('row', count.index)">{{ count.value }}</button>
              @for (cell of row; track cell.c) {
                <button
                  type="button"
                  [class]="cell.classes"
                  [disabled]="cell.disabled"
                  [attr.aria-label]="cell.label"
                  (click)="store.cycle(cell.r, cell.c)"></button>
              }
            }
          </div>

          <h2>{{ store.i18n.fleet() }}</h2>
          <ul class="bm-fleet">
            @for (ship of fleet(); track $index) {
              <li [class.done]="ship.done">
                <span>{{ ship.name }}</span>
                <span class="bm-pips">
                  @for (p of pips(ship.len); track $index) { <i></i> }
                </span>
              </li>
            }
          </ul>
        </section>
      </div>
    </ion-content>
  `,
  styles: [`
    :host {
      --bm-empty: #eef2f5;
      --bm-empty-hover: #dfe6ec;
      --bm-water: #dcecf7;
      --bm-wave: #7c95ab;
      --bm-ship: #3f4a56;
      --bm-given: #6b7785;
      --bm-ok: #3aa864;
      --bm-bad: #e0463a;
    }
    @media (prefers-color-scheme: dark) {
      :host {
        --bm-empty: #232a31;
        --bm-empty-hover: #2d363f;
        --bm-water: #16324a;
        --bm-wave: #6d8aa3;
        --bm-ship: #c9d2db;
        --bm-given: #8a96a3;
        --bm-bad: #ff5d4f;
      }
    }

    .bm-wrap { max-width: 32rem; margin: 0 auto; }
    .bm-status { min-height: 2.8em; margin: 0.25rem 0 0.75rem; font-weight: 500; text-align: center; }
    .bm-status.solved { color: var(--bm-ok); }
    .bm-setup { margin: 0 0 1rem; }
    .bm-desc { margin: 0 0 0.5rem; color: var(--ion-color-medium); }
    .bm-buttons { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.75rem; }

    .bm-board-wrap { width: min(100%, 30rem); margin: 0 auto; }
    h2 { margin: 1rem 0 0.5rem; font-size: 1.05rem; color: var(--ion-color-medium); font-weight: 600; }

    .bm-board {
      display: grid;
      gap: 2px;
      width: 100%;
      aspect-ratio: 1;
      user-select: none;
      touch-action: manipulation;
    }
    .bm-label, .count {
      display: grid; place-items: center; padding: 0; border: 0; background: transparent;
      font-size: 0.85rem; font-weight: 600; color: var(--ion-color-medium);
    }
    .count { cursor: pointer; border-radius: 3px; }
    .count:hover { background: var(--bm-empty); }
    .count.ok { color: var(--bm-ok); }
    .count.over { color: var(--bm-bad); }

    .cell {
      position: relative; padding: 0; border: 0; border-radius: 3px;
      background: var(--bm-empty); aspect-ratio: 1; cursor: pointer;
    }
    .cell:disabled { cursor: default; opacity: 1; }
    .cell:not(:disabled):hover { background: var(--bm-empty-hover); }
    .cell.water { background: var(--bm-water); }
    .cell.water::after {
      content: "≈"; position: absolute; inset: 0; display: grid; place-items: center;
      color: var(--bm-wave); font-size: 0.9em;
    }
    .cell.ship::before {
      content: ""; position: absolute; inset: 14%; border-radius: 4px; background: var(--bm-ship);
    }
    .cell.given.ship::before { background: var(--bm-given); }
    .cell.given { box-shadow: inset 0 0 0 1px var(--bm-given); }
    .cell.seg-single::before { border-radius: 50%; }
    .cell.seg-left::before { inset: 14% 0 14% 14%; border-radius: 50% 0 0 50%; }
    .cell.seg-right::before { inset: 14% 14% 14% 0; border-radius: 0 50% 50% 0; }
    .cell.seg-top::before { inset: 14% 14% 0 14%; border-radius: 50% 50% 0 0; }
    .cell.seg-bottom::before { inset: 0 14% 14% 14%; border-radius: 0 0 50% 50%; }
    .cell.seg-middle-h::before { inset: 14% 0; border-radius: 0; }
    .cell.seg-middle-v::before { inset: 0 14%; border-radius: 0; }
    .cell.seg-middle::before { border-radius: 0; }
    .cell.wrong { box-shadow: inset 0 0 0 2px var(--bm-bad); }

    .bm-fleet { list-style: none; margin: 0; padding: 0; font-size: 0.9rem; }
    .bm-fleet li { display: flex; justify-content: space-between; align-items: center; padding: 3px 6px; border-radius: 6px; }
    .bm-fleet li.done { color: var(--ion-color-medium); text-decoration: line-through; }
    .bm-pips { display: flex; gap: 3px; }
    .bm-pips i { width: 12px; height: 12px; border-radius: 2px; background: var(--bm-given); }
    .bm-fleet li.done .bm-pips i { background: var(--bm-ok); }
  `],
})
export class BimaruPage {
  protected readonly store = inject(BimaruStore);

  protected readonly sizes: { value: BimaruSize; label: () => string }[] = [
    { value: 6, label: this.store.i18n.size_small },
    { value: 8, label: this.store.i18n.size_medium },
    { value: 10, label: this.store.i18n.size_large },
  ];

  protected readonly cells = computed((): CellView[][] => {
    const puzzle = this.store.puzzle();
    const marks = this.store.marks();
    const fixed = this.store.fixedSet();
    const wrong = this.store.wrong();
    const solved = this.store.solved();
    const truth = shipGrid(puzzle.size, puzzle.ships);
    const i18n = this.store.i18n;
    return marks.map((row, r) => row.map((mark, c) => {
      const key = `${r},${c}`;
      const given = fixed.has(key);
      const classes = ['cell', mark];
      if (given) classes.push('given');
      if (wrong.has(key)) classes.push('wrong');
      if (mark === 'ship') {
        // revealed cells show their true shape; own marks the shape their neighbours allow
        const exact = given || solved;
        const segment = exact ? segmentAt(truth, r, c) : markedSegment(marks, r, c);
        if (segment === 'middle') {
          const shipAt = (rr: number, cc: number) => (exact ? !!truth[rr]?.[cc] : marks[rr]?.[cc] === 'ship');
          const horizontal = shipAt(r, c - 1) || shipAt(r, c + 1);
          const vertical = shipAt(r - 1, c) || shipAt(r + 1, c);
          classes.push(horizontal ? 'seg-middle-h' : vertical ? 'seg-middle-v' : 'seg-middle');
        } else if (segment) {
          classes.push('seg-' + segment);
        }
      }
      const state = mark === 'ship' ? i18n.cell_ship() : mark === 'water' ? i18n.cell_water() : i18n.cell_unknown();
      return { r, c, label: `${coordLabel(r, c)}: ${state}`, classes: classes.join(' '), disabled: given || solved };
    }));
  });

  protected readonly rowCounts = computed((): CountView[] =>
    this.countViews(this.store.puzzle().rowCounts, this.store.counts().rows, this.store.i18n.count_row(), i => String(i + 1)));

  protected readonly colCounts = computed((): CountView[] =>
    this.countViews(this.store.puzzle().colCounts, this.store.counts().cols, this.store.i18n.count_col(), i => BIMARU_COLS[i]));

  /** One row per fleet ship, longest first; as many of each length are ticked off as are complete on the board. */
  protected readonly fleet = computed((): FleetRow[] => {
    const left = new Map<number, number>();
    for (const len of this.store.completed()) left.set(len, (left.get(len) ?? 0) + 1);
    return this.store.puzzle().fleet.map(len => {
      const done = (left.get(len) ?? 0) > 0;
      if (done) left.set(len, (left.get(len) ?? 0) - 1);
      return { name: shipName(this.store.i18n, len), len, done };
    });
  });

  protected pips(len: number): number[] {
    return Array.from({ length: len }, (_, i) => i);
  }

  private countViews(target: readonly number[], marked: number[], label: string, name: (i: number) => string): CountView[] {
    return target.map((value, index) => {
      const classes = ['count'];
      if (marked[index] === value) classes.push('ok');
      else if (marked[index] > value) classes.push('over');
      return { index, value, label: fill(label, { n: name(index), count: value }), classes: classes.join(' ') };
    });
  }
}
