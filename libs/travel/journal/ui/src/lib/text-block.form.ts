import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent } from '@ionic/angular';

import { DESCRIPTION_LENGTH } from '@okr/shared-constants';
import { ErrorNote, TextareaInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean } from '@okr/shared-util-core';
import { JournalI18n, TextBlockFormModel, textBlockValidations } from '@okr/travel-journal-util';

/** The text of one journal block as plain text; paragraphs are separated by an empty line. */
@Component({
  selector: 'okr-text-block-form',
  standalone: true,
  imports: [TextareaInput, ErrorNote, IonCard, IonCardContent],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <okr-textarea-input [i18n]="textI18n()" [value]="text()" (valueChange)="onFieldChange('text', $event)"
              [maxLength]="descriptionLength" [rows]="10" [showHelper]="true" [readOnly]="isReadOnly()" />
            <okr-error-note [errors]="textErrors()" />
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class TextBlockForm {
  // inputs
  public readonly i18n = input.required<JournalI18n>();
  public formData = model.required<TextBlockFormModel>();
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly textForm = form(this.formData, (path) => validateVestTree(path, textBlockValidations as any));
  private readonly validationResult = vestErrors(this.textForm);

  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly descriptionLength = DESCRIPTION_LENGTH;

  public constructor() {
    effect(() => this.valid.emit(this.textForm().valid()));
  }

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly text = computed(() => this.formData()?.text ?? '');
  protected readonly textErrors = computed(() => this.validationResult().getErrors('text'));
  protected readonly textI18n = computed(() => ({
    name: 'text', label: this.i18n().text_form_text_label(), placeholder: this.i18n().text_form_text_ph(),
    helper: this.i18n().text_form_text_helper(),
  } as TextInputI18n));

  protected onFieldChange(fieldName: keyof TextBlockFormModel, fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
