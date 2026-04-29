import { Component, inject, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { MatrixPollData } from '@bk2/chat-data-access';
import { PollCreateForm } from '@bk2/chat-ui';

@Component({
  selector: 'bk-poll-create-modal',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent, PollCreateForm,
    IonContent
  ],
  template: `
    <bk-header title="@chat.survey.title" [isModal]="true" />
    @if (formValid()) {
      <bk-change-confirmation
        [showCancel]="true"
        okLabel="@chat.survey.create"
        (cancelClicked)="cancel()"
        (okClicked)="save()"
      />
    }
    <ion-content class="ion-no-padding">
      <bk-poll-create-form
        [formData]="formData()"
        (formDataChange)="onFormDataChange($event)"
        (valid)="formValid.set($event)"
      />
    </ion-content>
  `
})
export class PollCreateModal {
  private readonly modalController = inject(ModalController);

  protected formData = signal<MatrixPollData>({ kind: 'disclosed', question: '', answers: [] });
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
