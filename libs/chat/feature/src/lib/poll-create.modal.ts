import { Component, computed, inject, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';

import { MatrixPollData } from '@okr/chat-data-access';
import { PollCreateForm } from '@okr/chat-ui';

import { MatrixChatStore } from './matrix-chat.store';

@Component({
  selector: 'okr-poll-create-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, PollCreateForm,
    IonContent
  ],
  template: `
    <okr-header [i18n]="{ title: store.i18n.survey_title()}" [isModal]="true" />
    @if (formValid()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      <okr-poll-create-form
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
