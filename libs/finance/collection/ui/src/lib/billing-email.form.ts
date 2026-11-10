// libs/finance/collection/ui/src/lib/billing-email.form.ts
import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular';

import { EmailInput, EmailInputI18n, ErrorNote } from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { BILLING_EMAIL_LENGTH, BillingEmailFormModel, billingEmailValidations, CollectionI18n } from '@okr/finance-collection-util';

/** The billing e-mail of the subscription. The parent modal drives saving. */
@Component({
  selector: 'okr-billing-email-form',
  standalone: true,
  imports: [EmailInput, ErrorNote, IonCard, IonCardContent, IonGrid, IonRow, IonCol],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <okr-email [i18n]="emailI18n()" [value]="email()" (valueChange)="onFieldChange('email', $event)"
                    [maxLength]="emailLength" [autofocus]="true" [copyable]="false" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="emailErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class BillingEmailForm {
  // inputs
  public readonly i18n = input.required<CollectionI18n>();
  public formData = model.required<BillingEmailFormModel>();
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // signal form — wraps formData with Vest validation; the note reads the same run back
  protected readonly emailForm = form(this.formData, (path) => validateVestTree(path, billingEmailValidations));
  private readonly validationResult = vestErrors(this.emailForm);
  protected readonly emailErrors = computed(() => this.validationResult().getErrors('email'));

  constructor() {
    effect(() => this.valid.emit(this.emailForm().valid()));
  }

  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly emailLength = BILLING_EMAIL_LENGTH;

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly email = computed(() => this.formData()?.email ?? '');
  protected readonly emailI18n = computed(() => ({
    name: 'billingEmail',
    label: this.i18n().abo_email_label(),
    placeholder: this.i18n().abo_email_placeholder(),
    helper: this.i18n().abo_email_helper(),
  } as EmailInputI18n));

  protected onFieldChange(fieldName: keyof BillingEmailFormModel, fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
