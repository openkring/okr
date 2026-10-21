import { Component, computed, input, output } from '@angular/core';

import { CrosswordEntry, CrosswordGrid } from '@okr/shared-models';
import { CellView, buildCellMap } from '@okr/games-crossword-util';

export interface CrosswordSelectedCell {
  row: number;
  col: number;
  direction: 'across' | 'down';
}

/**
 * Renders `buildCellMap` (util) as a CSS grid: one `<div>` per cell, black squares for blocked
 * cells, the clue number small in the corner. Pure/dumb — no Firestore, no i18n lookups.
 *
 * The wrapper carries `overflow-x: auto` so a wide puzzle scrolls INSIDE ITSELF; the page body
 * must never scroll sideways because of a crossword grid.
 */
@Component({
  selector: 'okr-crossword-board',
  standalone: true,
  imports: [],
  styles: [`
    .cw-scroll { overflow-x: auto; width: 100%; container-type: inline-size; }
    /* Cells share the full available width (1fr) but never shrink below 40px — below that the
       board scrolls inside .cw-scroll instead. Letters scale with the cell width (cqi). */
    .cw-grid {
      display: grid;
      width: 100%;
      min-width: max-content;
      gap: 2px;
      background: var(--ion-color-step-200, #ccc);
      border: 2px solid var(--ion-color-step-200, #ccc);
    }
    .cw-cell {
      position: relative;
      aspect-ratio: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--ion-background-color, #fff);
      color: var(--ion-text-color, #000);
      font-size: max(1.1rem, calc(50cqi / var(--cw-cols)));
      font-weight: 600;
      cursor: pointer;
      user-select: none;
    }
    .cw-grid.read-only .cw-cell {
      cursor: default;
    }
    .cw-cell.blocked {
      background: var(--ion-color-step-850, #1a1a1a);
      cursor: default;
    }
    .cw-cell.selected {
      outline: 2px solid var(--ion-color-primary);
      outline-offset: -2px;
    }
    .cw-number {
      position: absolute;
      top: 1px;
      left: 2px;
      font-size: max(0.55rem, calc(22cqi / var(--cw-cols)));
      font-weight: 400;
      color: var(--ion-color-medium);
    }
  `],
  template: `
    <div class="cw-scroll">
      <div
        class="cw-grid"
        [class.read-only]="readOnly()"
        [style.grid-template-columns]="'repeat(' + grid().cols + ', minmax(40px, 1fr))'"
        [style.--cw-cols]="grid().cols"
      >
        @for (row of cellMap(); track $index; let r = $index) {
          @for (cell of row; track $index; let c = $index) {
            <div
              class="cw-cell"
              [class.blocked]="cell.blocked"
              [class.selected]="isSelected(r, c)"
              (click)="onCellClick(r, c, cell)"
            >
              @if (!cell.blocked) {
                @if (cell.number !== undefined) {
                  <span class="cw-number">{{ cell.number }}</span>
                }
                {{ letterFor(r, c, cell) }}
              }
            </div>
          }
        }
      </div>
    </div>
  `,
})
export class CrosswordBoard {
  public readonly grid = input.required<CrosswordGrid>();
  public readonly entries = input.required<CrosswordEntry[]>();
  public readonly filled = input<Map<string, string>>(new Map());
  public readonly selected = input<CrosswordSelectedCell | undefined>(undefined);
  public readonly readOnly = input(false);

  public readonly cellPicked = output<{ row: number; col: number }>();

  protected readonly cellMap = computed<CellView[][]>(() => buildCellMap(this.grid(), this.entries()));

  protected isSelected(row: number, col: number): boolean {
    const sel = this.selected();
    return !!sel && sel.row === row && sel.col === col;
  }

  protected letterFor(row: number, col: number, cell: CellView): string {
    if (this.readOnly()) return cell.letter;
    return this.filled().get(`${row},${col}`) ?? '';
  }

  protected onCellClick(row: number, col: number, cell: CellView): void {
    if (cell.blocked || this.readOnly()) return;
    this.cellPicked.emit({ row, col });
  }
}
