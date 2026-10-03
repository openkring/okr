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
import { BOXES, PEERS, SudokuDifficulty, coordLabel, maskDigits } from '@okr/games-sudoku-util';

import { SudokuStore } from './sudoku.store';

type CellView = { i: number; value: number; notes: number[]; label: string; classes: string };
type DigitView = { digit: number; label: string; done: boolean };

const NOTE_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * Sudoku — fill the board so every row, column and 3×3 box holds 1 to 9 once. Same frame as
 * Bimaru (`libs/games/bimaru`): status line, a settings card, a square CSS grid of `<button>`
 * cells, and a number pad below it.
 *
 * Tap a cell to select it, then a digit on the pad. On a keyboard: digits, arrows, Backspace,
 * and N for notes. The row, column and box of the selected cell are shaded, as is every cell
 * holding the same digit; a digit that breaks a rule turns red at once, while «Prüfen» compares
 * against the solution.
 */
@Component({
  selector: 'okr-sudoku-page',
  standalone: true,
  providers: [SudokuStore],
  imports: [
    Header,
    IonContent, IonCard, IonCardContent, IonGrid, IonRow, IonCol,
    IonSelect, IonSelectOption, IonButton,
  ],
  host: { '(document:keydown)': 'onKey($event)' },
  template: `
    <okr-header [i18n]="{ title: store.i18n.title() }" />
    <ion-content class="ion-padding">
      <div class="sd-wrap">

        <p class="sd-status" role="status" aria-live="polite" [class.solved]="store.solved()">{{ store.statusText() }}</p>

        <ion-card class="sd-setup">
          <ion-card-content>
            <p class="sd-desc">{{ store.i18n.desc() }}</p>
            <ion-grid class="ion-no-padding">
              <ion-row class="ion-align-items-center">
                <ion-col size="12" size-md="5">
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
              </ion-row>
            </ion-grid>

            <div class="sd-buttons">
              <ion-button fill="outline" [disabled]="!store.history().length || store.solved()" (click)="store.undo()">
                {{ store.i18n.undo() }}
              </ion-button>
              <ion-button fill="outline" [disabled]="store.solved()" (click)="store.hint()">{{ store.i18n.hint() }}</ion-button>
              <ion-button fill="outline" [disabled]="store.solved()" (click)="store.check()">{{ store.i18n.check() }}</ion-button>
              <ion-button fill="solid" (click)="store.newGame()">{{ store.i18n.new_game() }}</ion-button>
            </div>
          </ion-card-content>
        </ion-card>

        <section class="sd-board-wrap">
          <div class="sd-board">
            @for (box of boxes(); track $index) {
              <div class="sd-box">
                @for (cell of box; track cell.i) {
                  <button type="button" [class]="cell.classes" [attr.aria-label]="cell.label"
                    [attr.aria-pressed]="store.selected() === cell.i" (click)="store.select(cell.i)">
                    @if (cell.value) {
                      {{ cell.value }}
                    } @else if (cell.notes.length) {
                      <span class="sd-notes" aria-hidden="true">
                        @for (n of noteSlots; track n) { <i>{{ cell.notes.includes(n) ? n : '' }}</i> }
                      </span>
                    }
                  </button>
                }
              </div>
            }
          </div>

          <div class="sd-pad">
            @for (d of digits(); track d.digit) {
              <button type="button" class="sd-digit" [class.done]="d.done" [attr.aria-label]="d.label"
                [disabled]="store.solved()" (click)="store.input(d.digit)">{{ d.digit }}</button>
            }
          </div>
          <div class="sd-tools">
            <ion-button fill="outline" [disabled]="store.solved()" (click)="store.erase()">{{ store.i18n.erase() }}</ion-button>
            <ion-button [fill]="store.notesMode() ? 'solid' : 'outline'" [attr.aria-pressed]="store.notesMode()"
              [disabled]="store.solved()" (click)="store.toggleNotesMode()">{{ store.i18n.notes() }}</ion-button>
          </div>
        </section>
      </div>
    </ion-content>
  `,
  styles: [`
    :host {
      --sd-line: #3f4a56;
      --sd-cell: #ffffff;
      --sd-peer: #eef2f5;
      --sd-same: #d6e4f0;
      --sd-selected: #b9d3ea;
      --sd-given: #1f262d;
      --sd-entry: #2b6cb0;
      --sd-note: #6b7785;
      --sd-ok: #3aa864;
      --sd-bad: #e0463a;
    }
    @media (prefers-color-scheme: dark) {
      :host {
        --sd-line: #8a96a3;
        --sd-cell: #1b2026;
        --sd-peer: #232a31;
        --sd-same: #22374a;
        --sd-selected: #2c4a66;
        --sd-given: #e6ebf0;
        --sd-entry: #7fb6ea;
        --sd-note: #8a96a3;
        --sd-bad: #ff5d4f;
      }
    }

    .sd-wrap { max-width: 32rem; margin: 0 auto; }
    .sd-status { min-height: 2.8em; margin: 0.25rem 0 0.75rem; font-weight: 500; text-align: center; }
    .sd-status.solved { color: var(--sd-ok); }
    .sd-setup { margin: 0 0 1rem; }
    .sd-desc { margin: 0 0 0.5rem; color: var(--ion-color-medium); }
    .sd-buttons { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.75rem; }

    .sd-board-wrap { width: min(100%, 30rem); margin: 0 auto; }
    /*
     * Tracks are minmax(0, 1fr), never bare 1fr (= minmax(auto, 1fr)): with auto minimums
     * Chromium sizes the columns from the buttons' min-content and the board overflows to the
     * right and over the number pad. The height comes from the square cells alone; the board
     * itself has no aspect-ratio, which would fight the cells' own.
     */
    .sd-board {
      display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 2px;
      padding: 2px; background: var(--sd-line); border-radius: 4px;
      user-select: none; touch-action: manipulation;
    }
    .sd-box { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; min-width: 0; }

    .cell {
      position: relative; display: grid; place-items: center; min-width: 0; padding: 0; border: 0;
      background: var(--sd-cell); aspect-ratio: 1; cursor: pointer;
      font-size: clamp(1rem, 5.5vw, 1.6rem); color: var(--sd-entry); font-variant-numeric: tabular-nums;
    }
    .cell.peer { background: var(--sd-peer); }
    .cell.same { background: var(--sd-same); }
    .cell.selected { background: var(--sd-selected); }
    .cell.given { color: var(--sd-given); font-weight: 600; }
    .cell.hinted { color: var(--sd-given); font-style: italic; }
    .cell.conflict { color: var(--sd-bad); }
    .cell.wrong { box-shadow: inset 0 0 0 2px var(--sd-bad); }
    .cell:focus-visible { outline: 2px solid var(--sd-entry); outline-offset: -2px; z-index: 1; }

    .sd-notes {
      position: absolute; inset: 2px; display: grid;
      grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr);
      font-size: clamp(0.45rem, 2vw, 0.65rem); line-height: 1; color: var(--sd-note);
    }
    .sd-notes i { display: grid; place-items: center; font-style: normal; }

    .sd-pad { display: grid; grid-template-columns: repeat(9, minmax(0, 1fr)); gap: 4px; margin-top: 1rem; }
    .sd-digit {
      min-width: 0; padding: 0.6rem 0; border: 1px solid var(--sd-line); border-radius: 6px;
      background: var(--sd-cell); color: var(--sd-entry); font-size: 1.25rem; cursor: pointer;
    }
    .sd-digit:hover:not(:disabled) { background: var(--sd-peer); }
    .sd-digit.done { opacity: 0.35; }
    .sd-tools { display: flex; justify-content: center; gap: 0.25rem; margin-top: 0.5rem; }
  `],
})
export class SudokuPage {
  protected readonly store = inject(SudokuStore);
  protected readonly noteSlots = NOTE_SLOTS;

  protected readonly levels: { value: SudokuDifficulty; label: () => string }[] = [
    { value: 'easy', label: this.store.i18n.difficulty_easy },
    { value: 'medium', label: this.store.i18n.difficulty_medium },
    { value: 'hard', label: this.store.i18n.difficulty_hard },
  ];

  /** The cells grouped by box, the order the board draws them in. */
  protected readonly boxes = computed((): CellView[][] => {
    const values = this.store.values();
    const notes = this.store.notes();
    const givens = this.store.puzzle().givens;
    const hinted = new Set(this.store.hinted());
    const conflicts = this.store.conflicts();
    const wrong = this.store.wrong();
    const selected = this.store.selected();
    const peers = new Set(selected === null ? [] : PEERS[selected]);
    const sameDigit = selected === null ? 0 : values[selected];
    const i18n = this.store.i18n;

    return BOXES.map(box => box.map(i => {
      const value = values[i];
      const classes = ['cell'];
      if (givens[i]) classes.push('given');
      else if (hinted.has(i)) classes.push('hinted');
      if (i === selected) classes.push('selected');
      else if (sameDigit && value === sameDigit) classes.push('same');
      else if (peers.has(i)) classes.push('peer');
      if (conflicts.has(i)) classes.push('conflict');
      if (wrong.has(i)) classes.push('wrong');

      const marks = value ? [] : maskDigits(notes[i]);
      let content = i18n.cell_empty();
      if (value) content = String(value);
      else if (marks.length) content = fill(i18n.cell_notes(), { list: marks.join(', ') });
      return { i, value, notes: marks, label: fill(i18n.cell_label(), { at: coordLabel(i), value: content }), classes: classes.join(' ') };
    }));
  });

  protected readonly digits = computed((): DigitView[] => {
    const counts = this.store.counts();
    const label = this.store.i18n.digit_label();
    return NOTE_SLOTS.map(digit => ({ digit, label: fill(label, { digit }), done: counts[digit] >= 9 }));
  });

  /**
   * Ionic keeps a page in the DOM after navigating away from it, so the document listener stays
   * attached; it only acts while this page is the visible one.
   */
  private active = false;

  public ionViewDidEnter(): void {
    this.active = true;
  }

  public ionViewWillLeave(): void {
    this.active = false;
  }

  protected onKey(event: KeyboardEvent): void {
    if (!this.active) return;
    // leave typing in the difficulty select and other inputs alone
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, ion-select, ion-popover')) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    const key = event.key;
    if (key >= '1' && key <= '9') this.store.input(Number(key));
    else if (key === 'Backspace' || key === 'Delete' || key === '0') this.store.erase();
    else if (key === 'ArrowUp') this.store.move(-1, 0);
    else if (key === 'ArrowDown') this.store.move(1, 0);
    else if (key === 'ArrowLeft') this.store.move(0, -1);
    else if (key === 'ArrowRight') this.store.move(0, 1);
    else if (key === 'n' || key === 'N') this.store.toggleNotesMode();
    else return;
    event.preventDefault();
  }
}
