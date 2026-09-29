import { Component, computed, input, output } from '@angular/core';
import { IonItem, IonLabel, IonList, IonListHeader } from '@ionic/angular/standalone';

import { CrosswordEntry, CrosswordGrid, CrosswordPlacement } from '@okr/shared-models';
import { CrosswordI18n } from '@okr/games-crossword-util';

interface ClueRow {
  placement: CrosswordPlacement;
  clue: string;
}

/**
 * Two clue lists (across/down) built from `grid().placements`, each row showing the clue number
 * and the entry's clue text. Pure/dumb — labels arrive via the `i18n` input, never TranslatePipe.
 */
@Component({
  selector: 'okr-crossword-clues',
  standalone: true,
  imports: [IonList, IonListHeader, IonItem, IonLabel],
  styles: [`
    .cw-clue-item { cursor: pointer; }
    .cw-clue-item.active { --background: var(--ion-color-primary-tint, rgba(var(--ion-color-primary-rgb), 0.12)); }
    .cw-clue-number { font-weight: 600; margin-inline-end: 6px; }
  `],
  template: `
    <ion-list>
      <ion-list-header>{{ i18n().across() }}</ion-list-header>
      @for (row of across(); track row.placement.number) {
        <ion-item
          button
          lines="none"
          class="cw-clue-item"
          [class.active]="isActive(row.placement)"
          (click)="cluePicked.emit(row.placement)"
        >
          <ion-label>
            <span class="cw-clue-number">{{ row.placement.number }}.</span>{{ row.clue }}
          </ion-label>
        </ion-item>
      }
    </ion-list>
    <ion-list>
      <ion-list-header>{{ i18n().down() }}</ion-list-header>
      @for (row of down(); track row.placement.number) {
        <ion-item
          button
          lines="none"
          class="cw-clue-item"
          [class.active]="isActive(row.placement)"
          (click)="cluePicked.emit(row.placement)"
        >
          <ion-label>
            <span class="cw-clue-number">{{ row.placement.number }}.</span>{{ row.clue }}
          </ion-label>
        </ion-item>
      }
    </ion-list>
  `,
})
export class CrosswordClues {
  public readonly grid = input.required<CrosswordGrid>();
  public readonly entries = input.required<CrosswordEntry[]>();
  public readonly i18n = input.required<CrosswordI18n>();
  public readonly activeNumber = input<number | undefined>(undefined);
  /**
   * The generator numbers by CELL, so an across and a down word starting on the same cell can
   * share a number. Without this, both clues would light up at an intersection — one of them
   * wrong. `isActive` requires both number AND direction to match.
   */
  public readonly activeDirection = input<'across' | 'down' | undefined>(undefined);

  public readonly cluePicked = output<CrosswordPlacement>();

  protected readonly across = computed<ClueRow[]>(() => this.rowsFor('across'));
  protected readonly down = computed<ClueRow[]>(() => this.rowsFor('down'));

  protected isActive(placement: CrosswordPlacement): boolean {
    return placement.number === this.activeNumber() && placement.direction === this.activeDirection();
  }

  private rowsFor(direction: 'across' | 'down'): ClueRow[] {
    const entries = this.entries();
    return this.grid().placements
      .filter(placement => placement.direction === direction)
      .map(placement => ({ placement, clue: entries[placement.entry]?.clue ?? '' }))
      .sort((a, b) => a.placement.number - b.placement.number);
  }
}
