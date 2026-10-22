import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular';

import { DateInput, DateInputI18n, ErrorNote } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';

import { DiaryDateRange, DiaryI18n, diaryDateRangeValidations } from '@okr/content-diary-util';

/** Optional from/to bounds (StoreDates, `''` = open) — used for a trip-free date filter. */
@Component({
  selector: 'okr-diary-date-range-form',
  standalone: true,
  imports: [DateInput, ErrorNote, IonGrid, IonRow, IonCol, IonCard, IonCardContent],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="fromI18n()" [storeDate]="from()"
                    (storeDateChange)="onFieldChange('from', $event)" [readOnly]="false" />
                  <okr-error-note [errors]="fromErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="toI18n()" [storeDate]="to()"
                    (storeDateChange)="onFieldChange('to', $event)" [readOnly]="false" />
                  <okr-error-note [errors]="toErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class DiaryDateRangeForm {
  // inputs
  public readonly i18n = input.required<DiaryI18n>();
  public formData = model.required<DiaryDateRange>();
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected readonly rangeForm = form(this.formData, (path) =>
    validateVestTree(path, diaryDateRangeValidations as any));
  private readonly validationResult = vestErrors(this.rangeForm);
  protected readonly fromErrors = computed(() => this.validationResult().getErrors('from'));
  protected readonly toErrors = computed(() => this.validationResult().getErrors('to'));

  constructor() {
    effect(() => this.valid.emit(this.rangeForm().valid()));
  }

  protected readonly from = computed(() => this.formData()?.from ?? '');
  protected readonly to = computed(() => this.formData()?.to ?? '');

  protected readonly fromI18n = computed(() => ({
    name: 'from', label: this.i18n().albums_range_from(), placeholder: '',
  } as DateInputI18n));
  protected readonly toI18n = computed(() => ({
    name: 'to', label: this.i18n().albums_range_to(), placeholder: '',
  } as DateInputI18n));

  protected onFieldChange(fieldName: keyof DiaryDateRange, fieldValue: string): void {
    const value = fieldValue ?? '';
    if (this.formData()?.[fieldName] === value) return;
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: value }));
  }
}
