import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { AccountModel, CostCenterModel, OcrRuleModel, VatCodeModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { coerceBoolean } from '@okr/shared-util-core';

import { fromOcrRuleFormModel, OCR_RULE_I18N_KEYS, OcrRuleFormModel, OcrRuleI18n, toOcrRuleFormModel } from '@okr/finance-ocr-rule-util';

import { OcrRuleForm } from './ocr-rule.form';

/** Edits one OCR rule; dismisses with the edited OcrRuleModel and role 'confirm'. */
@Component({
  selector: 'okr-ocr-rule-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, OcrRuleForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-ocr-rule-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [accounts]="accounts()"
          [vatCodes]="vatCodes()"
          [costCenters]="costCenters()"
          [costCentersEnabled]="costCentersEnabled()"
          [showForm]="showForm()"
          [readOnly]="isReadOnly()"
          [i18n]="i18n"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class OcrRuleEditModal {
  private readonly modalController = inject(ModalController);
  // direct inject, no store: the store opens this modal, importing it back would be circular
  protected readonly i18n = inject(I18nService).translateAll(OCR_RULE_I18N_KEYS) as OcrRuleI18n;

  public readonly rule = input.required<OcrRuleModel>();
  public readonly readOnly = input<boolean>(true);
  public readonly accounts = input<AccountModel[]>([]);
  public readonly vatCodes = input<VatCodeModel[]>([]);
  public readonly costCenters = input<CostCenterModel[]>([]);
  /** false while cost centers are managed elsewhere (externally managed ledger): the field is hidden */
  public readonly costCentersEnabled = input(false);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected readonly headerTitle = computed(() => this.isReadOnly()
    ? this.i18n.edit_title_ro()
    : (this.rule().okey ? this.i18n.edit_title() : this.i18n.edit_title_new()));

  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => toOcrRuleFormModel(this.rule()));
  protected showForm = signal(true);

  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.cancel(),
    save: this.i18n.save(),
  } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, fromOcrRuleFormModel(this.formData()), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(toOcrRuleFormModel(this.rule()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);   // fresh form → clears stale Vest state
  }

  protected onFormDataChange(formData: OcrRuleFormModel): void {
    this.formData.set(formData);
  }
}
