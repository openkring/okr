import { Component, computed, inject, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { ChangeConfirmation, ChangeConfirmationI18n, DateTimeSelectModal, Header } from '@okr/shared-ui';
import { ModelSelectService } from '@okr/shared-feature';
import { dismissOverlay, QuickEntryResolver } from '@okr/shared-util-angular';
import { formatDateToken } from '@okr/shared-util-core';

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
        [quickEntryResolver]="resolveQuickEntry"
      />
    </ion-content>
  `
})
export class PollCreateModal {
  private readonly modalController = inject(ModalController);
  private readonly modelSelectService = inject(ModelSelectService);
  protected readonly store = inject(MatrixChatStore);

  /**
   * Quick entry for survey answers, mirroring the chat message input:
   * '//' opens the date picker, '!!' the location picker. Unlike the message input -
   * which sends a picked location as a separate structured event - a survey answer is
   * plain text, so the location's name is inserted inline. '@' is not offered here.
   */
  protected readonly resolveQuickEntry: QuickEntryResolver = async (trigger) => {
    if (trigger === 'date') {
      const modal = await this.modalController.create({ component: DateTimeSelectModal });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<string>();
      return role === 'confirm' && data ? formatDateToken(data) : null;
    }
    if (trigger === 'location') {
      const result = await this.modelSelectService.selectLocation('', true, true);
      if (result?.kind === 'predefined') return result.location.name;
      if (result?.kind === 'custom') return result.label;
      return null;
    }
    return null;
  };

  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save()} as ChangeConfirmationI18n));

  protected formData = signal<MatrixPollData>({ question: '', answers: [] });
  protected formValid = signal(false);

  protected onFormDataChange(data: MatrixPollData): void {
    this.formData.set(data);
  }

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    await dismissOverlay(this.modalController, null, 'cancel');
  }
}
