import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonNote, IonRow } from '@ionic/angular/standalone';

import { DiaryPeriod } from '@okr/shared-models';
import { DateInput, DateInputI18n, ErrorNote } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';

import { DiaryI18n, diaryPeriodValidations } from '@okr/content-diary-util';

/**
 * Admin-only form for the travel period a diary app publishes (spec 1.77 D7): two `AppConfig`
 * fields, not a Firestore model — no `okey`/`tenants`/`tags`, no chips/notes. Both bounds are
 * optional StoreDates (`''` = open); diary-transfer columns with empty bounds inherit this period.
 */
@Component({
  selector: 'okr-diary-period-form',
  standalone: true,
  imports: [DateInput, ErrorNote, IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonItem, IonNote],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <ion-item lines="none">
                    <ion-note>{{ i18n().period_helper() }}</ion-note>
                  </ion-item>
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="travelFromI18n()" [storeDate]="travelFrom()"
                    (storeDateChange)="onFieldChange('travelFrom', $event)" [readOnly]="false" />
                  <okr-error-note [errors]="travelFromErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="travelToI18n()" [storeDate]="travelTo()"
                    (storeDateChange)="onFieldChange('travelTo', $event)" [readOnly]="false" />
                  <okr-error-note [errors]="travelToErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class DiaryPeriodForm {
  // inputs
  public readonly i18n = input.required<DiaryI18n>();
  public formData = model.required<DiaryPeriod>();
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // signal form — wraps formData with Vest validation
  protected readonly periodForm = form(this.formData, (path) =>
    validateVestTree(path, diaryPeriodValidations as any));

  private readonly validationResult = vestErrors(this.periodForm);
  protected travelFromErrors = computed(() => this.validationResult().getErrors('travelFrom'));
  protected travelToErrors = computed(() => this.validationResult().getErrors('travelTo'));

  constructor() {
    effect(() => this.valid.emit(this.periodForm().valid()));
  }

  // computed field accessors (legacy config docs lack both fields)
  protected readonly travelFrom = computed(() => this.formData()?.travelFrom ?? '');
  protected readonly travelTo = computed(() => this.formData()?.travelTo ?? '');

  protected travelFromI18n = computed(() => ({
    name: 'travelFrom',
    label: this.i18n().period_from_label(),
    placeholder: '',
  } as DateInputI18n));

  protected travelToI18n = computed(() => ({
    name: 'travelTo',
    label: this.i18n().period_to_label(),
    placeholder: '',
  } as DateInputI18n));

  protected onFieldChange(fieldName: keyof DiaryPeriod, fieldValue: string): void {
    const value = fieldValue ?? '';
    if (this.formData()?.[fieldName] === value) return;
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: value }));
  }
}
