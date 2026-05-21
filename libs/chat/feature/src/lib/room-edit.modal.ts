import { Component, computed, inject, input, linkedSignal, model, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { ENV } from '@bk2/shared-config';
import { I18nService } from '@bk2/shared-i18n';
import { MatrixRoom, UserModel } from '@bk2/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { safeStructuredClone } from '@bk2/shared-util-core';

import { RoomEditForm } from '@bk2/chat-ui';
import { PFX } from './scope';

@Component({
  selector: 'bk-room-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, RoomEditForm,
    IonContent
],
  template: `
    <bk-header [i18n]="{ title: header() }" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(currentUser(); as currentUser) {
        @if(formData(); as formData) {
          <bk-room-edit-form
            [formData]="formData"
            (formDataChange)="onFormDataChange($event)"
            [currentUser]="currentUser"
            [showForm]="showForm()"
            (dirty)="formDirty.set($event)"
            (valid)="formValid.set($event)"
          />
        }
      }
    </ion-content>
  `
})
export class RoomEditModal {
  private modalController = inject(ModalController);
  protected readonly env = inject(ENV);
  private readonly i18nService = inject(I18nService);
  private readonly confirmI18n = this.i18nService.translateAll({
    changeConfirmation_ok:           PFX + 'changeConfirmation.ok',
    changeConfirmation_cancel:       PFX + 'changeConfirmation.cancel',
    changeConfirmation_confirmation: PFX + 'changeConfirmation.confirmation',
  });
  protected readonly changeConfirmationI18n = computed(() => ({
    ok: this.confirmI18n.changeConfirmation_ok(),
    cancel: this.confirmI18n.changeConfirmation_cancel(),
    confirmation: this.confirmI18n.changeConfirmation_confirmation(),
  } as ChangeConfirmationI18n));

// inputs
  public room = model.required<MatrixRoom>();
  public currentUser = input.required<UserModel>();
  public header = input.required<string>();

// signals
  protected formDirty = signal(true);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  public formData = linkedSignal(() => safeStructuredClone(this.room()));
  protected showForm = signal(true);

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');  
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.room()));  // reset the form
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: MatrixRoom): void {
    this.formData.set(formData);
  }
}
