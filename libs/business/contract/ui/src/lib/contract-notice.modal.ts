import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { ContractModel, ContractState } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { convertDateFormatToString, DateFormat, getTodayStr } from '@okr/shared-util-core';

import { CONTRACT_I18N_KEYS, ContractI18n, ContractNoticeData, computeEffectiveEndDate } from '@okr/business-contract-util';

import { ContractNoticeForm } from './contract-notice.form';

/** What the notice modal dismisses with (`role: 'confirm'`); the store merges it into the contract. */
export interface ContractNoticeResult {
  noticeGivenDate: string;
  noticeGivenBy: 'us' | 'them';
  effectiveEndDate: string;
  state: ContractState;
}

/** "Kündigung erfassen" (spec 1.5 §8): notice date + who, live effective end date, state → noticeGiven. */
@Component({
  selector: 'okr-contract-notice-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, ContractNoticeForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: i18n.notice_title() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (saveClicked)="save()" (cancelClicked)="cancel()" />
    }
    <ion-content class="ion-no-padding">
      <okr-contract-notice-form [formData]="formData()" (formDataChange)="formData.set($event)"
        [i18n]="i18n" [effectiveEnd]="effectiveEndView()" [readOnly]="false" [showForm]="showForm()"
        (dirty)="formDirty.set($event)" (valid)="formValid.set($event)" />
    </ion-content>
  `,
})
export class ContractNoticeModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(CONTRACT_I18N_KEYS) as ContractI18n;

  public readonly contract = input.required<ContractModel>();

  /** starts from what is already recorded, else today / us */
  public formData = linkedSignal<ContractNoticeData>(() => this.initial());
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showForm = signal(true);
  // a pre-filled valid default is saveable without touching it
  protected showConfirmation = computed(() => this.formValid() && (this.formDirty() || !this.contract().noticeGivenDate));

  protected readonly effectiveEndDate = computed(() => {
    const { noticeGivenDate, noticeGivenBy } = this.formData();
    if (!noticeGivenDate || !noticeGivenBy) return '';
    return computeEffectiveEndDate(this.contract(), noticeGivenDate, noticeGivenBy);
  });
  protected readonly effectiveEndView = computed(() =>
    this.effectiveEndDate() ? convertDateFormatToString(this.effectiveEndDate(), DateFormat.StoreDate, DateFormat.ViewDate, false) : '');

  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.cancel(), save: this.i18n.save(),
  } as ChangeConfirmationI18n));

  private initial(): ContractNoticeData {
    const c = this.contract();
    return {
      noticeGivenDate: c.noticeGivenDate || getTodayStr(DateFormat.StoreDate),
      noticeGivenBy: c.noticeGivenBy || 'us',
    };
  }

  public async save(): Promise<void> {
    const { noticeGivenDate, noticeGivenBy } = this.formData();
    if (!noticeGivenBy) return;
    const result: ContractNoticeResult = {
      noticeGivenDate, noticeGivenBy, effectiveEndDate: this.effectiveEndDate(), state: 'noticeGiven',
    };
    await dismissOverlay(this.modalController, result, 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(this.initial());
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }
}
