import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { MemberFeeModel } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import {
  BexioPosition, MEMBERSHIP_I18N_KEYS, MembershipI18n, MemberFeeUploadFormModel, newMemberFeeUploadFormModel,
} from '@okr/relationship-membership-util';

import { MemberFeeUploadForm } from './member-fee-upload.form';

/**
 * Review a member's fee invoice before sending it to Bexio.
 * Dismisses with `{ header, footer }` and role 'confirm'; the header's close button cancels.
 */
@Component({
  selector: 'okr-member-fee-upload-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Header, ChangeConfirmation, MemberFeeUploadForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: i18n.memberFee_upload_label() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-member-fee-upload-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n"
          [memberName]="memberName()"
          [positions]="positions()"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class MemberFeeUploadModal {
  private readonly modalController = inject(ModalController);
  // direct inject, no store: the member-fee store opens this modal
  protected readonly i18n = inject(I18nService).translateAll(MEMBERSHIP_I18N_KEYS) as MembershipI18n;

  public fee = input.required<MemberFeeModel>();
  public positions = input.required<BexioPosition[]>();

  protected readonly memberName = computed(() => this.fee().member?.label ?? '');

  // Seeded true: the untouched texts (empty header, default footer) are themselves a valid
  // submission, so the send banner shows from the start — as the old always-enabled send button did.
  protected formDirty = signal(true);
  protected formValid = signal(false);
  protected readonly formData = signal<MemberFeeUploadFormModel>(newMemberFeeUploadFormModel());
  protected showForm = signal(true);

  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.cancel(),
    save: this.i18n.memberFee_upload_send(),
  } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    const { header, footer } = this.formData();
    await dismissOverlay(this.modalController, { header, footer }, 'confirm');
  }

  protected onFormDataChange(formData: MemberFeeUploadFormModel): void {
    this.formData.set(formData);
  }

  /** revert to the default texts; they stay sendable, so the banner remains (see formDirty) */
  public cancel(): void {
    this.formDirty.set(true);
    this.formData.set(newMemberFeeUploadFormModel());
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);   // fresh form → clears stale Vest state
  }
}
