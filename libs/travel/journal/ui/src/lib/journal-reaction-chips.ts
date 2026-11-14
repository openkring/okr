import { Component, input, output } from '@angular/core';

import { ReactionSummary } from '@okr/travel-journal-util';

/**
 * The emoji reactions of a section or image (spec 1.154 §7): one chip per emoji with its count, the reader's own
 * highlighted; a tap toggles that emoji, «＋» asks the host for the quick row. Presentational — the host writes.
 * Styled like the chat's reaction chips (matrix-message-list).
 */
@Component({
  selector: 'okr-journal-reaction-chips',
  standalone: true,
  styles: [`
    :host { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    button { font: inherit; cursor: pointer; }
    button:disabled { cursor: default; }
    .chip {
      display: inline-flex; align-items: center; gap: 4px; height: 28px; padding: 0 10px; border-radius: 14px;
      font-size: 0.9rem; color: var(--ion-text-color);
      background: var(--ion-color-light-shade); border: 1px solid var(--ion-background-color, #fff);
    }
    .chip.mine { background: rgba(var(--ion-color-primary-rgb), 0.18); color: var(--ion-color-primary); border-color: var(--ion-color-primary); }
    .add {
      width: 28px; height: 28px; border-radius: 50%; padding: 0; font-size: 1.1rem; line-height: 1;
      color: var(--ion-color-medium); background: transparent; border: 1px dashed var(--ion-color-medium);
    }
  `],
  template: `
    @for (chip of chips(); track chip.emoji) {
      <button type="button" class="chip" [class.mine]="chip.mine" [disabled]="!canReact()" [attr.aria-pressed]="chip.mine"
        (click)="toggled.emit(chip.emoji)">
        <span>{{ chip.emoji }}</span><span>{{ chip.count }}</span>
      </button>
    }
    @if (canReact()) {
      <button type="button" class="add" [attr.aria-label]="addLabel()" (click)="addClicked.emit()">＋</button>
    }
  `,
})
export class JournalReactionChips {
  public readonly chips = input<ReactionSummary[]>([]);
  /** false shows the chips without the controls */
  public readonly canReact = input(true);
  /** accessible name of «＋» */
  public readonly addLabel = input('');
  public readonly toggled = output<string>();
  public readonly addClicked = output<void>();
}
