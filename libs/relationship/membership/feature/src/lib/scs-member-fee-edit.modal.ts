import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { CategoryListModel, ScsMemberFeesModel, UserModel } from '@bk2/shared-models';
import { I18nService } from '@bk2/shared-i18n';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { getFullName, safeStructuredClone } from '@bk2/shared-util-core';
import { signalStore, withProps } from '@ngrx/signals';

import { AvatarToolbar } from '@bk2/avatar-feature';

import { ScsMemberFeeEditForm, ScsMemberFeeEditFormI18n } from '@bk2/relationship-membership-ui';
import { PFX } from './scope';

const UI = '@relationship/membership/ui.';

const ScsMemberFeeEditModalStore = signalStore(
  withProps(() => ({ i18nService: inject(I18nService) })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll({
      // ChangeConfirmation keys
      changeConfirmation_ok:           PFX + 'changeConfirmation.ok',
      changeConfirmation_cancel:       PFX + 'changeConfirmation.cancel',
      changeConfirmation_confirmation: PFX + 'changeConfirmation.confirmation',
      // ScsMemberFeeEditForm keys
      jb_label:             UI + 'jb.label',             jb_placeholder:             UI + 'jb.placeholder',             jb_helper:             UI + 'jb.helper',
      srv_label:            UI + 'srv.label',            srv_placeholder:            UI + 'srv.placeholder',            srv_helper:            UI + 'srv.helper',
      bev_label:            UI + 'bev.label',            bev_placeholder:            UI + 'bev.placeholder',            bev_helper:            UI + 'bev.helper',
      entryFee_label:       UI + 'entryFee.label',       entryFee_placeholder:       UI + 'entryFee.placeholder',       entryFee_helper:       UI + 'entryFee.helper',
      locker_label:         UI + 'locker.label',         locker_placeholder:         UI + 'locker.placeholder',         locker_helper:         UI + 'locker.helper',
      skiff_label:          UI + 'skiff.label',          skiff_placeholder:          UI + 'skiff.placeholder',          skiff_helper:          UI + 'skiff.helper',
      skiffInsurance_label: UI + 'skiffInsurance.label', skiffInsurance_placeholder: UI + 'skiffInsurance.placeholder', skiffInsurance_helper: UI + 'skiffInsurance.helper',
      rebate_label:         UI + 'rebate.label',         rebate_placeholder:         UI + 'rebate.placeholder',         rebate_helper:         UI + 'rebate.helper',
      notes_label:          UI + 'notes.label',          notes_placeholder:          UI + 'notes.placeholder',
      rebateReason_label:   UI + 'rebateReason.label',
      invoiceState_label:   UI + 'invoiceState.label',
    } satisfies Record<string, string>),
  })),
);

@Component({
  selector: 'bk-scs-member-fee-edit-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ScsMemberFeeEditModalStore],
  imports: [
    ScsMemberFeeEditForm, Header, ChangeConfirmation, AvatarToolbar,
    IonContent,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    <bk-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" [showCancel]="true" (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      <bk-avatar-toolbar
        key="{{parentKey()}}"
        [title]="memberName()"
        modelType="person"
        [readOnly]="true"
      />
      <bk-scs-member-fee-edit-form
        [formData]="formData()"
        [currentUser]="currentUser()"
        [membershipCategories]="mcat()"
        [showForm]="showForm()"
        [readOnly]="readOnly()"
        [i18n]="formI18n()"
        (dirty)="manualDirty.set($event)"
        (valid)="formValid.set($event)"
        (formDataChange)="formData.set($event)"
      />
    </ion-content>
  `
})
export class ScsMemberFeeEditModal {
  private readonly modalController = inject(ModalController);
  protected readonly store = inject(ScsMemberFeeEditModalStore);

  protected readonly changeConfirmationI18n = computed(() => ({
    ok: this.store.i18n.changeConfirmation_ok(),
    cancel: this.store.i18n.changeConfirmation_cancel(),
    confirmation: this.store.i18n.changeConfirmation_confirmation(),
  } as ChangeConfirmationI18n));

  protected readonly formI18n = computed<ScsMemberFeeEditFormI18n>(() => ({
    jb_label:             this.store.i18n.jb_label,             jb_placeholder:             this.store.i18n.jb_placeholder,             jb_helper:             this.store.i18n.jb_helper,
    srv_label:            this.store.i18n.srv_label,            srv_placeholder:            this.store.i18n.srv_placeholder,            srv_helper:            this.store.i18n.srv_helper,
    bev_label:            this.store.i18n.bev_label,            bev_placeholder:            this.store.i18n.bev_placeholder,            bev_helper:            this.store.i18n.bev_helper,
    entryFee_label:       this.store.i18n.entryFee_label,       entryFee_placeholder:       this.store.i18n.entryFee_placeholder,       entryFee_helper:       this.store.i18n.entryFee_helper,
    locker_label:         this.store.i18n.locker_label,         locker_placeholder:         this.store.i18n.locker_placeholder,         locker_helper:         this.store.i18n.locker_helper,
    skiff_label:          this.store.i18n.skiff_label,          skiff_placeholder:          this.store.i18n.skiff_placeholder,          skiff_helper:          this.store.i18n.skiff_helper,
    skiffInsurance_label: this.store.i18n.skiffInsurance_label, skiffInsurance_placeholder: this.store.i18n.skiffInsurance_placeholder, skiffInsurance_helper: this.store.i18n.skiffInsurance_helper,
    rebate_label:         this.store.i18n.rebate_label,         rebate_placeholder:         this.store.i18n.rebate_placeholder,         rebate_helper:         this.store.i18n.rebate_helper,
    notes_label:          this.store.i18n.notes_label,          notes_placeholder:          this.store.i18n.notes_placeholder,
    rebateReason_label:   this.store.i18n.rebateReason_label,
    invoiceState_label:   this.store.i18n.invoiceState_label,
  }));

  // inputs
  public fee = input.required<ScsMemberFeesModel>();
  public currentUser = input.required<UserModel>();
  public mcat = input<CategoryListModel | undefined>(undefined);
  public readOnly = input(false);

  // signals
  protected formData = linkedSignal(() => safeStructuredClone(this.fee()));
  protected showForm = signal(true);
  protected formValid = signal(false);
  protected manualDirty = signal(false);

  // computed
  protected memberKey = computed(() => this.fee()?.member?.key ?? '');
  protected memberName = computed(() => getFullName(this.fee()?.member?.name1 ?? '', this.fee()?.member?.name2 ?? '', this.currentUser()?.nameDisplay));
  protected parentKey = computed(() => `person.${this.memberKey()}`);

  protected showConfirmation = computed(() => this.formValid() && this.manualDirty());

  protected headerTitle = computed(() =>
    this.readOnly() ? '@finance.scsMemberFee.operation.view.label' : '@finance.scsMemberFee.operation.update.label'
  );

  public async save(): Promise<boolean> {
    return this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.manualDirty.set(false);
    this.formData.set(safeStructuredClone(this.fee()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }
}
