import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular';

import { LONG_NAME_LENGTH } from '@okr/shared-constants';
import { Checkbox, CheckboxI18n, DateInput, DateInputI18n, ErrorNote, TextInput, TextInputI18n, TimeInput, TimeInputI18n } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean } from '@okr/shared-util-core';
import { FootprintFormModel, footprintValidations, JournalI18n } from '@okr/travel-journal-util';

/** Title, place, date, time and publish state of a footprint (spec 1.113 §9.2). The parent modal saves. */
@Component({
  selector: 'okr-footprint-form',
  standalone: true,
  imports: [TextInput, DateInput, TimeInput, Checkbox, ErrorNote, IonCard, IonCardContent, IonGrid, IonRow, IonCol],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="titleI18n()" [value]="title()" (valueChange)="onFieldChange('title', $event)"
                    [autofocus]="true" [maxLength]="longNameLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="titleErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="placeI18n()" [value]="placeName()" (valueChange)="onFieldChange('placeName', $event)"
                    [maxLength]="longNameLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="placeErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="dateI18n()" [storeDate]="date()" (storeDateChange)="onFieldChange('date', $event)"
                    [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="dateErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-time-input [i18n]="timeI18n()" [value]="time()" (valueChange)="onFieldChange('time', $event)"
                    [locale]="'de-ch'" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="timeErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <okr-checkbox [i18n]="publishedI18n()" [checked]="published()" (checkedChange)="onFieldChange('published', $event)"
                    [showHelper]="true" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class FootprintForm {
  // inputs
  public readonly i18n = input.required<JournalI18n>();
  public formData = model.required<FootprintFormModel>();
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly footprintForm = form(this.formData, (path) => validateVestTree(path, footprintValidations as any));
  private readonly validationResult = vestErrors(this.footprintForm);

  /** kept in step with the cap the Vest suite enforces on title and place */
  protected readonly longNameLength = LONG_NAME_LENGTH;

  public constructor() {
    effect(() => this.valid.emit(this.footprintForm().valid()));
  }

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly title = computed(() => this.formData()?.title ?? '');
  protected readonly placeName = computed(() => this.formData()?.placeName ?? '');
  protected readonly date = computed(() => this.formData()?.date ?? '');
  protected readonly time = computed(() => this.formData()?.time ?? '');
  protected readonly published = computed(() => this.formData()?.published ?? false);

  protected readonly titleErrors = computed(() => this.validationResult().getErrors('title'));
  protected readonly placeErrors = computed(() => this.validationResult().getErrors('placeName'));
  protected readonly dateErrors = computed(() => this.validationResult().getErrors('date'));
  protected readonly timeErrors = computed(() => this.validationResult().getErrors('time'));

  protected readonly titleI18n = computed(() => ({
    name: 'title', label: this.i18n().footprint_form_title_label(), placeholder: this.i18n().footprint_form_title_ph(),
    helper: this.i18n().footprint_form_title_helper(),
  } as TextInputI18n));
  protected readonly placeI18n = computed(() => ({
    name: 'placeName', label: this.i18n().footprint_form_place_label(), placeholder: this.i18n().footprint_form_place_ph(),
    helper: this.i18n().footprint_form_place_helper(),
  } as TextInputI18n));
  protected readonly dateI18n = computed(() => ({
    name: 'date', label: this.i18n().footprint_form_date_label(), placeholder: this.i18n().footprint_form_date_ph(),
  } as DateInputI18n));
  protected readonly timeI18n = computed(() => ({
    name: 'time', label: this.i18n().footprint_form_time_label(), placeholder: this.i18n().footprint_form_time_ph(),
  } as TimeInputI18n));
  protected readonly publishedI18n = computed(() => ({
    name: 'published', label: this.i18n().footprint_form_published_label(), helper: this.i18n().footprint_form_published_helper(),
  } as CheckboxI18n));

  protected onFieldChange(fieldName: keyof FootprintFormModel, fieldValue: string | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
