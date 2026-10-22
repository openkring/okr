import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular';

import { LONG_NAME_LENGTH } from '@okr/shared-constants';
import { TripModel } from '@okr/shared-models';
import { DateInput, DateInputI18n, ErrorNote, TextInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean } from '@okr/shared-util-core';

import { DiaryI18n, diaryTripValidations } from '@okr/content-diary-util';

/** Name and from/to dates of a trip (spec 1.114 §4); a trip is also a filter for diary entries. */
@Component({
  selector: 'okr-diary-trip-form',
  standalone: true,
  imports: [TextInput, DateInput, ErrorNote, IonCard, IonCardContent, IonGrid, IonRow, IonCol],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <okr-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)"
                    [autofocus]="true" [maxLength]="longNameLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="nameErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="startI18n()" [storeDate]="startDate()"
                    (storeDateChange)="onFieldChange('startDate', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="startErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="endI18n()" [storeDate]="endDate()"
                    (storeDateChange)="onFieldChange('endDate', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="endErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class DiaryTripForm {
  // inputs
  public readonly i18n = input.required<DiaryI18n>();
  public formData = model.required<TripModel>();
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected readonly tripForm = form(this.formData, (path) => validateVestTree(path, diaryTripValidations as any));
  private readonly validationResult = vestErrors(this.tripForm);
  protected readonly nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected readonly startErrors = computed(() => this.validationResult().getErrors('startDate'));
  protected readonly endErrors = computed(() => this.validationResult().getErrors('endDate'));

  constructor() {
    effect(() => this.valid.emit(this.tripForm().valid()));
  }

  /** kept in step with the cap the Vest suite enforces on the name */
  protected readonly longNameLength = LONG_NAME_LENGTH;

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly name = computed(() => this.formData()?.name ?? '');
  protected readonly startDate = computed(() => this.formData()?.startDate ?? '');
  protected readonly endDate = computed(() => this.formData()?.endDate ?? '');

  protected readonly nameI18n = computed(() => ({
    name: 'name', label: this.i18n().albums_trip_name(), placeholder: '',
  } as TextInputI18n));
  protected readonly startI18n = computed(() => ({
    name: 'startDate', label: this.i18n().albums_range_from(), placeholder: '',
  } as DateInputI18n));
  protected readonly endI18n = computed(() => ({
    name: 'endDate', label: this.i18n().albums_range_to(), placeholder: '',
  } as DateInputI18n));

  protected onFieldChange(fieldName: 'name' | 'startDate' | 'endDate', fieldValue: string): void {
    const value = fieldValue ?? '';
    if (this.formData()?.[fieldName] === value) return;
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: value }));
  }
}
