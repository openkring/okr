import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { TRAINER_BILLING_I18N_KEYS, TrainerBillingI18n } from '@okr/finance-trainer-billing-util';
import { I18nService } from '@okr/shared-i18n';
import { AccountModel, CostCenterModel, TrainerAgreementModel, UserModel, VatCodeModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';

import { TrainerAgreementForm } from './trainer-agreement.form';

/**
 * Create or edit a trainer agreement (treasurer / admin, spec 1.167 §7.1). Presentational: dismisses with the edited
 * copy and role `confirm`; the caller saves it (`TrainerBillingService.saveAgreement`). The caller passes the books'
 * accounts, cost centres, VAT codes, default compensation account and the other agreements of the books.
 */
@Component({
  selector: 'okr-trainer-agreement-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, TrainerAgreementForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (saveClicked)="save()" (cancelClicked)="cancel()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-trainer-agreement-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [storedServices]="storedServices()"
          [accounts]="accounts()"
          [costCenters]="costCenters()"
          [vatCodes]="vatCodes()"
          [defaultAccountKey]="defaultAccountKey()"
          [otherAgreements]="otherAgreements()"
          [currentUser]="currentUser()"
          [readOnly]="isReadOnly()"
          [showForm]="showForm()"
          [i18n]="i18n"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class TrainerAgreementEditModal {
  private readonly modalController = inject(ModalController);
  // direct inject, no store: a store that opens this modal must not be imported back
  protected readonly i18n = inject(I18nService).translateAll(TRAINER_BILLING_I18N_KEYS) as TrainerBillingI18n;

  public readonly agreement = input.required<TrainerAgreementModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly accounts = input<AccountModel[]>([]);
  public readonly costCenters = input<CostCenterModel[]>([]);
  public readonly vatCodes = input<VatCodeModel[]>([]);
  public readonly defaultAccountKey = input('');
  public readonly otherAgreements = input<TrainerAgreementModel[]>([]);
  public readonly readOnly = input(false);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  /** the services as stored (raw documents may lack the field): their keys, units and rates stay fixed */
  protected readonly storedServices = computed(() => this.agreement().services ?? []);

  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.agreement()));
  protected showForm = signal(true);

  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly headerTitle = computed(() => {
    if (this.isReadOnly()) return this.i18n.agreement_edit_view();
    return this.agreement().okey ? this.i18n.agreement_edit_update() : this.i18n.agreement_edit_create();
  });
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.changeConfirmation_cancel(),
    save: this.i18n.changeConfirmation_ok(),
  } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.agreement()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);   // fresh form → clears stale Vest state
  }

  protected onFormDataChange(formData: TrainerAgreementModel): void {
    this.formData.set(formData);
  }
}
