import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonChip, IonLabel } from '@ionic/angular/standalone';

import { WhiteboardItem } from '@okr/shared-models';
import { DESCRIPTION_LENGTH } from '@okr/shared-constants';
import { Color, ErrorNote, NotesInput, NotesInputI18n } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean } from '@okr/shared-util-core';

import { WhiteboardI18n, whiteboardItemValidations } from '@okr/instruments-whiteboard-util';

/**
 * Pure editor for one canvas item (sticker or label): its text and — for stickers — its colour.
 * Edits a cloned copy of a single item, never the live board array, so the live Firestore stream
 * can keep updating the board underneath without wiping this form (the grid instruments' D4 trap).
 * The parent modal drives saving and deletion.
 */
@Component({
  selector: 'okr-whiteboard-item-form',
  standalone: true,
  imports: [NotesInput, Color, ErrorNote, IonChip, IonLabel],
  styles: [`.kind { margin: 8px; }`],
  template: `
    <ion-chip class="kind" color="medium">
      <ion-label>{{ item().kind === 'label' ? 'Label' : 'Sticker' }}</ion-label>
    </ion-chip>

    <okr-notes-input [i18n]="textI18n()" [value]="text()" (valueChange)="onTextChange($event)" [maxLength]="descriptionLength" [readOnly]="isReadOnly()" [errors]="textErrors()" />

    @if (item().kind === 'sticker') {
      <okr-color [label]="i18n().itemColor_label()" [hexColor]="colorHex()" (hexColorChange)="onColorChange($event)" [readOnly]="isReadOnly()" />
      <okr-error-note [errors]="colorErrors()" />
    }
  `,
})
export class WhiteboardItemForm {
  public readonly i18n = input.required<WhiteboardI18n>();
  public item = model.required<WhiteboardItem>();
  public readonly readOnly = input(false);

  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly descriptionLength = DESCRIPTION_LENGTH;

  protected readonly itemForm = form(this.item, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, whiteboardItemValidations as any));

  // per-field errors for the notes under each field
  private readonly validationResult = vestErrors(this.itemForm);
  protected readonly textErrors = computed(() => this.validationResult().getErrors('text'));
  protected readonly colorErrors = computed(() => this.validationResult().getErrors('color'));

  constructor() {
    effect(() => this.valid.emit(this.itemForm().valid()));
  }

  /** '' means "theme default"; the Color picker needs a concrete hex to display. */
  private static readonly DEFAULT_STICKER_HEX = '#fff4b8';

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly text = computed(() => this.item()?.text ?? '');
  protected readonly colorHex = computed(() => this.item()?.color || WhiteboardItemForm.DEFAULT_STICKER_HEX);

  protected textI18n = computed(() => ({
    name: 'text',
    label: this.i18n().itemText_label(),
    placeholder: this.i18n().itemText_placeholder(),
  } as NotesInputI18n));

  protected onTextChange(value: string): void {
    this.dirty.emit(true);
    this.item.update((it) => ({ ...it, text: value }));
  }

  protected onColorChange(hex: string): void {
    this.dirty.emit(true);
    this.item.update((it) => ({ ...it, color: hex }));
  }
}
