import { Component, computed, inject, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';

import { MatrixPollData } from '@bk2/chat-data-access';
import { PollCreateForm } from '@bk2/chat-ui';

import { MatrixChatStore } from './matrix-chat.store';

@Component({
  selector: 'bk-poll-create-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, PollCreateForm,
    IonContent
  ],
  template: `
    <bk-header [i18n]="{ title: store.i18n.survey_title()}" [isModal]="true" />
    @if (formValid()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      <bk-poll-create-form
        [formData]="formData()"
        [i18n]="store.i18n"
        (formDataChange)="onFormDataChange($event)"
        (valid)="formValid.set($event)"
      />
    </ion-content>
  `
})
export class PollCreateModal {
  private readonly modalController = inject(ModalController);
  protected readonly store = inject(MatrixChatStore);

  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save()} as ChangeConfirmationI18n));

  protected formData = signal<MatrixPollData>({ question: '', answers: [] });
  protected formValid = signal(false);

  protected onFormDataChange(data: MatrixPollData): void {
    this.formData.set(data);
  }

  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }
}
