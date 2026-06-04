import { Component, computed, inject, input, linkedSignal, model, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { MatrixRoom, UserModel } from '@bk2/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { safeStructuredClone } from '@bk2/shared-util-core';

import { RoomEditForm } from '@bk2/chat-ui';
import { MatrixChatStore } from './matrix-chat.store';

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
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(currentUser(); as currentUser) {
        @if(formData(); as formData) {
          <bk-room-edit-form
            [formData]="formData"
            (formDataChange)="onFormDataChange($event)"
            [currentUser]="currentUser"
            [showForm]="showForm()"
            [i18n]="store.i18n"
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
  protected readonly store = inject(MatrixChatStore);

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

  // computes
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save()} as ChangeConfirmationI18n));

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
