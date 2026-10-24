import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent } from '@ionic/angular';

import { ErrorNote, TextareaInput, TextInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { JournalI18n, NOTICE_SUBJECT_MAX, NOTICE_TEXT_MAX, NoticeFormModel, noticeValidations } from '@okr/travel-journal-util';

/** The author's message to the guests (plan 8): subject and text, prefilled with the proposal. */
@Component({
  selector: 'okr-notice-form',
  standalone: true,
  imports: [TextInput, TextareaInput, ErrorNote, IonCard, IonCardContent],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    .recipients { margin: 12px 16px 0; font-size: 0.85rem; color: var(--ion-color-medium); }
  `],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            @if (recipients()) { <p class="recipients">{{ recipients() }}</p> }
            <okr-text-input [i18n]="subjectI18n()" [value]="formData().subject" (valueChange)="onFieldChange('subject', $event)"
              [maxLength]="subjectMax" [autofocus]="true" [readOnly]="false" />
            <okr-error-note [errors]="subjectErrors()" />
            <okr-textarea-input [i18n]="textI18n()" [value]="formData().text" (valueChange)="onFieldChange('text', $event)"
              [maxLength]="textMax" [rows]="12" [showHelper]="true" [readOnly]="false" />
            <okr-error-note [errors]="textErrors()" />
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class NoticeForm {
  public readonly i18n = input.required<JournalI18n>();
  public formData = model.required<NoticeFormModel>();
  /** Who receives it, as one line (counts per channel). */
  public readonly recipients = input('');
  public readonly showForm = input(true);

  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly noticeForm = form(this.formData, (path) => validateVestTree(path, noticeValidations as any));
  private readonly validationResult = vestErrors(this.noticeForm);

  /** kept in step with the caps the Vest suite (and the server) enforce */
  protected readonly subjectMax = NOTICE_SUBJECT_MAX;
  protected readonly textMax = NOTICE_TEXT_MAX;

  public constructor() {
    effect(() => this.valid.emit(this.noticeForm().valid()));
  }

  protected readonly subjectErrors = computed(() => this.validationResult().getErrors('subject'));
  protected readonly textErrors = computed(() => this.validationResult().getErrors('text'));
  protected readonly subjectI18n = computed(() => ({
    name: 'subject', label: this.i18n().notice_subject_label(), placeholder: this.i18n().notice_subject_ph(), helper: '',
  } as TextInputI18n));
  protected readonly textI18n = computed(() => ({
    name: 'text', label: this.i18n().notice_text_label(), placeholder: this.i18n().notice_text_ph(), helper: this.i18n().notice_text_helper(),
  } as TextInputI18n));

  protected onFieldChange(fieldName: keyof NoticeFormModel, fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
