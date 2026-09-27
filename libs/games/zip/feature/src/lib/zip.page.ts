import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCol,
  IonContent,
  IonGrid,
  IonNote,
  IonRow,
  IonSelect,
  IonSelectOption,
} from '@ionic/angular/standalone';

import { Header } from '@okr/shared-ui';
import { fill } from '@okr/shared-util-core';
import { ZIP_SIZES, ZipCell, availableCounts, cellKey, formatElapsed, isSameCell } from '@okr/games-zip-util';

import { ZipStore } from './zip.store';

/** How thick the drawn path is, as a fraction of one cell. Matches the rounded look of Zip. */
const TRAIL_WIDTH = 0.62;

/** How often the running clock re-renders. */
const TICK_MS = 1000;

/**
 * The Zip board: connect the numbers in order while filling every cell.
 *
 * ONE COORDINATE SYSTEM, AND WHY IT MATTERS. The grid lines AND the path are drawn by the same
 * SVG, over a `viewBox` measured in cells; the CSS grid on top holds only transparent hit
 * targets and the number badges. An earlier version drew the lines as per-cell CSS borders, and
 * the path could not line up with them: each 1px border consumes width inside its cell, so by
 * column six the cell centres had drifted several pixels away from the SVG's exact sixths and
 * the path visibly sat off-grid. Sharing one geometry removes the class of bug rather than
 * tuning it away — and it is also what keeps every row and column exactly equal, since the
 * overlay is `position: absolute; inset: 0` with `1fr` tracks and therefore cannot be stretched
 * by a badge that renders slightly too tall.
 *
 * Pointer input goes through ONE handler pair on the board rather than per-cell `pointerenter`
 * bindings: on touch the first element to see a `pointerdown` implicitly captures the pointer,
 * so enter/leave never fire on the cells the finger drags across and the path would stop at its
 * first cell. Hit-testing each move with `elementFromPoint` sidesteps that and behaves
 * identically for mouse and touch.
 */
@Component({
  selector: 'okr-zip-page',
  standalone: true,
  providers: [ZipStore],
  imports: [
    Header,
    IonContent, IonCard, IonCardContent, IonGrid, IonRow, IonCol,
    IonSelect, IonSelectOption, IonButton, IonNote,
  ],
  template: `
    <okr-header [i18n]="{ title: store.i18n.title() }" />
    <ion-content class="ion-padding">
      <ion-card class="zip-card">
        <ion-card-content>

          <ion-grid class="ion-no-padding">
            <ion-row>
              <ion-col size="6">
                <ion-select
                  [label]="store.i18n.size_label()"
                  labelPlacement="stacked"
                  interface="popover"
                  [value]="store.config().size"
                  (ionChange)="store.setSize($any($event.detail.value))">
                  @for (size of sizes; track size) {
                    <ion-select-option [value]="size">{{ size }} &times; {{ size }}</ion-select-option>
                  }
                </ion-select>
              </ion-col>
              <ion-col size="6">
                <ion-select
                  [label]="store.i18n.count_label()"
                  labelPlacement="stacked"
                  interface="popover"
                  [value]="store.config().count"
                  (ionChange)="store.setCount($any($event.detail.value))">
                  @for (count of counts(); track count) {
                    <ion-select-option [value]="count">{{ count }}</ion-select-option>
                  }
                </ion-select>
              </ion-col>
            </ion-row>
          </ion-grid>

          <p class="zip-desc">{{ store.i18n.desc() }}</p>

          <div class="zip-board" [class.solved]="store.solved()" [style.--zip-size]="store.puzzle().size">
            <svg
              class="zip-canvas"
              [attr.viewBox]="'0 0 ' + store.puzzle().size + ' ' + store.puzzle().size"
              preserveAspectRatio="none">
              @for (line of gridLines(); track line) {
                <line class="zip-line" [attr.x1]="line.x1" [attr.y1]="line.y1" [attr.x2]="line.x2" [attr.y2]="line.y2" />
              }
              @if (store.path().length > 1) {
                <polyline class="zip-trail" [attr.points]="trailPoints()" [attr.stroke-width]="trailWidth" />
              } @else if (store.path().length === 1) {
                <circle class="zip-start" [attr.cx]="store.path()[0].col + 0.5" [attr.cy]="store.path()[0].row + 0.5" [attr.r]="trailWidth / 2" />
              }
            </svg>

            <div
              class="zip-cells"
              (pointerdown)="onPointerDown($event)"
              (pointermove)="onPointerMove($event)"
              (pointerup)="onPointerUp()"
              (pointercancel)="onPointerUp()"
              (pointerleave)="onPointerUp()">
              @for (cell of cells(); track cellKey(cell)) {
                <div
                  class="zip-cell"
                  [attr.data-row]="cell.row"
                  [attr.data-col]="cell.col"
                  [class.blocked]="isBlocked(cell)">
                  @if (store.numberAt(cell); as num) {
                    <span class="zip-badge" [class.head]="isHead(cell)">{{ num }}</span>
                  }
                </div>
              }
            </div>
          </div>

          @if (store.solved()) {
            <div class="zip-solved" role="status">
              <span class="zip-solved-title">{{ store.i18n.solved() }}</span>
              <span class="zip-solved-detail">{{ solvedDetail() }}</span>
            </div>
          } @else {
            <div class="zip-status">
              <ion-note [color]="store.blockedLabel() ? 'danger' : undefined">
                {{ store.blockedLabel() || store.progressLabel() }}
              </ion-note>
              <ion-note class="zip-clock">{{ store.i18n.time_label() }} {{ elapsed() }}</ion-note>
            </div>
          }

          <div class="zip-actions">
            <ion-button fill="clear" [disabled]="!store.canUndo()" (click)="store.undo()">
              {{ store.i18n.undo() }}
            </ion-button>
            <ion-button fill="outline" [disabled]="store.solved()" (click)="store.hint()">
              {{ store.i18n.hint() }}
            </ion-button>
            <ion-button fill="solid" (click)="store.newGame()">
              {{ store.i18n.restart() }}
            </ion-button>
          </div>

        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
  styles: [`
    .zip-card { max-width: 32rem; margin-inline: auto; }

    .zip-desc { color: var(--ion-color-medium); font-size: 0.85rem; margin: 0.5rem 0 1rem; }

    .zip-board {
      position: relative;
      aspect-ratio: 1;
      width: 100%;
      border: 2px solid var(--ion-color-medium);
      border-radius: 0.75rem;
      overflow: hidden;
      background: var(--ion-background-color);
    }
    .zip-board.solved { border-color: var(--ion-color-success); }

    /* Grid lines and path share this one box, so they cannot drift apart. */
    .zip-canvas { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; pointer-events: none; }
    .zip-line {
      stroke: var(--ion-color-light-shade);
      stroke-width: 1;
      /* Keeps the hairline 1px at any board size — correct here, and wrong for the path below,
         which must scale with the cells. */
      vector-effect: non-scaling-stroke;
    }
    .zip-trail {
      fill: none;
      stroke: var(--ion-color-success);
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .zip-start { fill: var(--ion-color-success); }

    /* Transparent hit targets over the canvas: exactly N equal tracks, no borders to shift a
       cell centre away from the SVG's own division. */
    .zip-cells {
      position: absolute;
      inset: 0;
      z-index: 2;
      display: grid;
      grid-template-columns: repeat(var(--zip-size), 1fr);
      grid-template-rows: repeat(var(--zip-size), 1fr);
      touch-action: none;   /* or a drag scrolls the page instead of drawing */
      user-select: none;
    }

    .zip-cell {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 0;
      min-height: 0;
    }
    .zip-cell.blocked {
      background: repeating-linear-gradient(
        45deg,
        var(--ion-color-danger-tint) 0 4px,
        transparent 4px 8px
      );
    }

    .zip-badge {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 68%;
      aspect-ratio: 1;
      border-radius: 50%;
      background: var(--ion-color-dark);
      color: var(--ion-color-dark-contrast);
      font-weight: 700;
      font-size: clamp(0.7rem, 3.2vw, 1.05rem);
    }
    .zip-badge.head { box-shadow: 0 0 0 3px var(--ion-color-success); }

    .zip-status {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 0.5rem;
      min-height: 2.25rem;
      margin-top: 0.75rem;
      font-size: 0.85rem;
    }
    .zip-clock { color: var(--ion-color-medium); font-variant-numeric: tabular-nums; }

    .zip-solved {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
      min-height: 2.25rem;
      margin-top: 0.75rem;
      padding: 0.5rem 0.75rem;
      border-radius: 0.5rem;
      background: var(--ion-color-success-tint);
      color: var(--ion-color-success-contrast);
    }
    .zip-solved-title { font-weight: 700; }
    .zip-solved-detail { font-size: 0.85rem; font-variant-numeric: tabular-nums; }

    .zip-actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 0.5rem; }
  `],
})
export class ZipPage {
  protected readonly store = inject(ZipStore);

  protected readonly sizes = ZIP_SIZES;
  protected readonly trailWidth = TRAIL_WIDTH;
  protected readonly cellKey = cellKey;

  /** Re-read on every tick so the running clock advances; frozen boards ignore it. */
  private readonly now = signal(Date.now());

  /** The counts that fit the board currently selected. */
  protected readonly counts = computed(() => availableCounts(this.store.config().size));

  /** Every cell of the board in row-major order — the order the CSS grid places them in. */
  protected readonly cells = computed((): ZipCell[] => {
    const size = this.store.puzzle().size;
    return Array.from({ length: size * size }, (_, index) => ({
      row: Math.floor(index / size),
      col: index % size,
    }));
  });

  /** The interior grid lines, in cell units. The board's own border draws the outer edge. */
  protected readonly gridLines = computed(() => {
    const size = this.store.puzzle().size;
    return Array.from({ length: size - 1 }, (_, index) => index + 1).flatMap(at => [
      { x1: at, y1: 0, x2: at, y2: size },
      { x1: 0, y1: at, x2: size, y2: at },
    ]);
  });

  /** The drawn path as SVG polyline points, one per cell centre. */
  protected readonly trailPoints = computed(() =>
    this.store.path().map(cell => `${cell.col + 0.5},${cell.row + 0.5}`).join(' '),
  );

  /** The clock: running time, or the time the board was solved in. */
  protected readonly elapsed = computed(() =>
    formatElapsed((this.store.finishedAt() ?? this.now()) - this.store.startedAt()),
  );

  /** "in 2:31 · ohne Tipp" — the line under a solved board. */
  protected readonly solvedDetail = computed(() => {
    const time = fill(this.store.i18n.solved_time(), { time: this.elapsed() });
    const hints = this.store.hintsUsed() === 0
      ? this.store.i18n.solved_no_hints()
      : fill(this.store.i18n.solved_hints(), { count: this.store.hintsUsed() });
    return `${time} · ${hints}`;
  });

  /** True while a pointer is held down on the board. */
  private dragging = false;

  constructor() {
    const ticker = setInterval(() => this.now.set(Date.now()), TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(ticker));
  }

  protected isHead(cell: ZipCell): boolean {
    const head = this.store.head();
    return head !== undefined && isSameCell(head, cell);
  }

  protected isBlocked(cell: ZipCell): boolean {
    const blocked = this.store.blockedCell();
    return blocked !== undefined && isSameCell(blocked, cell);
  }

  protected onPointerDown(event: PointerEvent): void {
    this.dragging = true;
    // The refused-move hatching stays on screen until the player acts again — clearing it on
    // pointerup instead would make it invisible for a tap, which sets and ends in one gesture.
    this.store.clearBlocked();

    // Touch captures the pointer to the cell that was first pressed, which would stop every
    // later move from being hit-tested against the cell actually under the finger.
    const target = event.target as Element | null;
    if (target instanceof Element && target.hasPointerCapture?.(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }

    const cell = this.cellAt(event);
    if (cell !== undefined) {
      this.store.extend(cell);
    }
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.dragging) {
      return;
    }
    const cell = this.cellAt(event);
    if (cell !== undefined) {
      this.store.extend(cell);
    }
  }

  protected onPointerUp(): void {
    this.dragging = false;
  }

  /** The board cell under the pointer, read back off the cell's own data attributes. */
  private cellAt(event: PointerEvent): ZipCell | undefined {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const cell = element?.closest('.zip-cell');
    if (!(cell instanceof HTMLElement)) {
      return undefined;
    }

    const row = Number(cell.dataset['row']);
    const col = Number(cell.dataset['col']);
    return Number.isFinite(row) && Number.isFinite(col) ? { row, col } : undefined;
  }
}
