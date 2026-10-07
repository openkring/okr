import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent } from '@ionic/angular/standalone';

import { DESCRIPTION_LENGTH } from '@okr/shared-constants';
import { NotesInput, NotesInputI18n } from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';
import { validateVestTree } from '@okr/shared-util-angular';
import { BillI18n, BillQrScanFormModel, billQrScanValidations } from '@okr/finance-bill-util';

/** The raw content of a Swiss QR-bill. The parent modal processes it via its change-confirmation. */
@Component({
  selector: 'okr-bill-qr-scan-form',
  standalone: true,
  imports: [NotesInput, IonCard, IonCardContent],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <okr-notes-input [i18n]="qrContentI18n()" [value]="qrContent()"
              (valueChange)="onFieldChange('qrContent', $event)" [rows]="10" [autoGrow]="false" [embedded]="true" [fieldStyle]="true"
              [maxLength]="descriptionLength" [errors]="qrContentErrors()" [readOnly]="isReadOnly()" />
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class BillQrScanForm {
  // inputs
  public readonly i18n = input.required<BillI18n>();
  public formData = model.required<BillQrScanFormModel>();
  public readonly readOnly = input(false);
  public readonly showForm = input(true);
  /** i18n key of the last processing failure, shown under the field; '' when there is none */
  public readonly processError = input('');

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly qrScanForm = form(this.formData, (path) => validateVestTree(path, billQrScanValidations as any));

  constructor() {
    effect(() => this.valid.emit(this.qrScanForm().valid()));
  }

  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly descriptionLength = DESCRIPTION_LENGTH;

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly qrContent = computed(() => this.formData()?.qrContent ?? '');
  protected readonly qrContentErrors = computed(() => {
    const errors = this.qrScanForm.qrContent().errors().map(e => e.message ?? '');
    return this.processError() ? [...errors, this.processError()] : errors;
  });
  protected readonly qrContentI18n = computed(() => ({
    name: 'qrContent',
    label: this.i18n().qr_content_label(),
    placeholder: this.i18n().qr_content_placeholder(),
  } as NotesInputI18n));

  protected onFieldChange(fieldName: keyof BillQrScanFormModel, fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
