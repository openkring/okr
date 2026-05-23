import { Component, computed, inject, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { I18nService } from '@bk2/shared-i18n';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { MatrixPollData } from '@bk2/chat-data-access';
import { PollCreateForm } from '@bk2/chat-ui';
import { PFX } from './scope';

const UI = '@chat/ui.';

@Component({
  selector: 'bk-poll-create-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, PollCreateForm,
    IonContent
  ],
  template: `
    <bk-header [i18n]="{ title: '@chat.survey.title' }" [isModal]="true" />
    @if (formValid()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" [showCancel]="true" (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      <bk-poll-create-form
        [formData]="formData()"
        [i18n]="i18n"
        (formDataChange)="onFormDataChange($event)"
        (valid)="formValid.set($event)"
      />
    </ion-content>
  `
})
export class PollCreateModal {
  private readonly modalController = inject(ModalController);
  private readonly i18nService = inject(I18nService);
  protected readonly i18n = this.i18nService.translateAll({
    changeConfirmation_ok:           PFX + 'changeConfirmation.ok',
    changeConfirmation_cancel:       PFX + 'changeConfirmation.cancel',
    changeConfirmation_confirmation: PFX + 'changeConfirmation.confirmation',
    allowMultipleAnswers_label:  UI + 'allowMultipleAnswers.label',
    allowMultipleAnswers_helper: UI + 'allowMultipleAnswers.helper',
    question_label:       UI + 'survey.question.label',
    question_placeholder: UI + 'survey.question.placeholder',
    answers_title:        UI + 'survey.answer.create',
    answer_add:           UI + 'survey.answer.add',
  });
  protected readonly changeConfirmationI18n = computed(() => ({
    ok: this.i18n.changeConfirmation_ok(),
    cancel: this.i18n.changeConfirmation_cancel(),
    confirmation: this.i18n.changeConfirmation_confirmation(),
  } as ChangeConfirmationI18n));

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
