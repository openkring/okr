import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular';

import { ErrorNote, TextInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean } from '@okr/shared-util-core';
import { JOURNAL_LABEL_MAX, JOURNAL_SUBTITLE_MAX, JOURNAL_TITLE_MAX, JournalFormModel, JournalI18n, journalValidations } from '@okr/travel-journal-util';

import { BookCoverChoice } from './journal-book-settings.form';

/** «Reisetagebuch ändern» (spec 1.154): title, subtitle, cover photo with its caption and the last-page text. The parent modal saves. */
@Component({
  selector: 'okr-journal-form',
  standalone: true,
  imports: [TextInput, ErrorNote, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonGrid, IonRow, IonCol],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    .covers { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 6px; padding: 8px 16px 16px; }
    .cover { aspect-ratio: 3 / 2; border-radius: 6px; overflow: hidden; border: 2px solid transparent; background: var(--ion-color-light);
      cursor: pointer; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; color: var(--ion-color-medium); }
    .cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .cover.selected { border-color: var(--ion-color-tertiary); }
  `],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="titleI18n()" [value]="title()" (valueChange)="onFieldChange('title', $event)"
                    [autofocus]="true" [maxLength]="titleMax" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="titleErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="subTitleI18n()" [value]="subTitle()" (valueChange)="onFieldChange('subTitle', $event)"
                    [maxLength]="subTitleMax" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="subTitleErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <ion-card>
          <ion-card-header><ion-card-title>{{ i18n().edit_cover() }}</ion-card-title></ion-card-header>
          <ion-card-content class="ion-no-padding">
            <div class="covers">
              <button type="button" class="cover" [class.selected]="coverImageKey() === ''" [disabled]="isReadOnly()"
                (click)="onFieldChange('coverImageKey', '')">{{ i18n().edit_cover_auto() }}</button>
              @for (c of covers(); track c.key) {
                <button type="button" class="cover" [class.selected]="coverImageKey() === c.key" [disabled]="isReadOnly()"
                  (click)="onFieldChange('coverImageKey', c.key)">
                  @if (c.url) { <img [src]="c.url" alt="" loading="lazy" /> }
                </button>
              }
            </div>
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="coverLabelI18n()" [value]="coverLabel()" (valueChange)="onFieldChange('coverLabel', $event)"
                    [maxLength]="labelMax" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="coverLabelErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="lastPageLabelI18n()" [value]="lastPageLabel()" (valueChange)="onFieldChange('lastPageLabel', $event)"
                    [maxLength]="labelMax" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="lastPageLabelErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class JournalForm {
  // inputs
  public readonly i18n = input.required<JournalI18n>();
  public formData = model.required<JournalFormModel>();
  public readonly covers = input<BookCoverChoice[]>([]);
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly journalForm = form(this.formData, (path) => validateVestTree(path, journalValidations as any));
  private readonly validationResult = vestErrors(this.journalForm);

  /** the caps the Vest suite enforces */
  protected readonly titleMax = JOURNAL_TITLE_MAX;
  protected readonly subTitleMax = JOURNAL_SUBTITLE_MAX;
  protected readonly labelMax = JOURNAL_LABEL_MAX;

  public constructor() {
    effect(() => this.valid.emit(this.journalForm().valid()));
  }

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly title = computed(() => this.formData()?.title ?? '');
  protected readonly subTitle = computed(() => this.formData()?.subTitle ?? '');
  protected readonly coverImageKey = computed(() => this.formData()?.coverImageKey ?? '');
  protected readonly coverLabel = computed(() => this.formData()?.coverLabel ?? '');
  protected readonly lastPageLabel = computed(() => this.formData()?.lastPageLabel ?? '');

  protected readonly titleErrors = computed(() => this.validationResult().getErrors('title'));
  protected readonly subTitleErrors = computed(() => this.validationResult().getErrors('subTitle'));
  protected readonly coverLabelErrors = computed(() => this.validationResult().getErrors('coverLabel'));
  protected readonly lastPageLabelErrors = computed(() => this.validationResult().getErrors('lastPageLabel'));

  protected readonly titleI18n = computed(() => ({
    name: 'title', label: this.i18n().edit_title_label(), placeholder: this.i18n().edit_title_ph(), helper: '',
  } as TextInputI18n));
  protected readonly subTitleI18n = computed(() => ({
    name: 'subTitle', label: this.i18n().edit_subtitle_label(), placeholder: this.i18n().edit_subtitle_ph(), helper: '',
  } as TextInputI18n));
  protected readonly coverLabelI18n = computed(() => ({
    name: 'coverLabel', label: this.i18n().edit_cover_label_label(), placeholder: '', helper: this.i18n().edit_cover_label_helper(),
  } as TextInputI18n));
  protected readonly lastPageLabelI18n = computed(() => ({
    name: 'lastPageLabel', label: this.i18n().edit_last_page_label(), placeholder: '', helper: this.i18n().edit_last_page_helper(),
  } as TextInputI18n));

  protected onFieldChange(fieldName: keyof JournalFormModel, fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
