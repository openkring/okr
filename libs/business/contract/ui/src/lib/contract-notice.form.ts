import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';

import { DateInput, DateInputI18n, ErrorNote, StringSelect, StringSelectI18n } from '@okr/shared-ui';
import { validateVestTree } from '@okr/shared-util-angular';
import { coerceBoolean } from '@okr/shared-util-core';

import { ContractI18n, ContractNoticeData, contractNoticeValidations } from '@okr/business-contract-util';

/**
 * "Kündigung erfassen": when and by whom notice was given. `effectiveEnd` is computed by the parent
 * from the contract's terms and shown read-only, so the user sees the consequence while typing.
 */
@Component({
  selector: 'okr-contract-notice-form',
  standalone: true,
  imports: [DateInput, StringSelect, ErrorNote, IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonItem, IonLabel],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="noticeGivenDateI18n()" [storeDate]="noticeGivenDate()"
                    (storeDateChange)="onFieldChange('noticeGivenDate', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="noticeGivenDateErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="noticeGivenByI18n()" [selectedString]="noticeGivenBy()"
                    (selectedStringChange)="onFieldChange('noticeGivenBy', $event)"
                    [stringList]="noticeBy" [labels]="noticeByLabels()" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="noticeGivenByErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <ion-item lines="none">
                    <ion-label>{{ i18n().notice_effectiveEnd() }}: <strong>{{ effectiveEnd() }}</strong></ion-label>
                  </ion-item>
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class ContractNoticeForm {
  protected readonly noticeBy = ['us', 'them'];

  public readonly i18n = input.required<ContractI18n>();
  public formData = model.required<ContractNoticeData>();
  /** the resulting end date, already formatted for display ('' while unknown) */
  public readonly effectiveEnd = input('');
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected readonly noticeForm = form(this.formData, (path) =>
    validateVestTree(path, contractNoticeValidations as any),
  );
  private readonly validationResult = computed(() => contractNoticeValidations(this.formData()));
  protected noticeGivenDateErrors = computed(() => this.validationResult().getErrors('noticeGivenDate'));
  protected noticeGivenByErrors = computed(() => this.validationResult().getErrors('noticeGivenBy'));

  constructor() {
    effect(() => this.valid.emit(this.noticeForm().valid()));
  }

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly noticeGivenDate = computed(() => this.formData()?.noticeGivenDate ?? '');
  protected readonly noticeGivenBy = computed(() => this.formData()?.noticeGivenBy ?? '');

  protected noticeGivenDateI18n = computed(() => ({
    name: 'noticeGivenDate', label: this.i18n().notice_date(), placeholder: '',
  } as DateInputI18n));
  protected noticeGivenByI18n = computed(() => ({
    name: 'noticeGivenBy', label: this.i18n().notice_by(),
  } as StringSelectI18n));
  protected noticeByLabels = computed(() => [this.i18n().notice_byUs(), this.i18n().notice_byThem()]);

  protected onFieldChange(fieldName: keyof ContractNoticeData, fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
