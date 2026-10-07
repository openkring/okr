import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
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
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      <okr-poll-create-form
        [formData]="formData()"
        [i18n]="store.i18n"
        (formDataChange)="onFormDataChange($event)"
        (valid)="formValid.set($event)"
        [quickEntryResolver]="resolveQuickEntry"
        [lockedAnswers]="lockedAnswers()"
        [lockMultiple]="lockMultiple()"
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

  /** Edit mode: the running poll to change. Unset = create a new poll. */
  public readonly poll = input<MatrixPollData | undefined>();
  /** Edit mode, once votes exist: answers that must stay as they are (see PollCreateForm). */
  public readonly lockedAnswers = input<string[]>([]);
  /** Edit mode, once votes exist on a multiple-choice poll: keep it multiple choice. */
  public readonly lockMultiple = input(false);

  protected readonly headerTitle = computed(() => this.poll() ? this.store.i18n.survey_edit() : this.store.i18n.survey_title());

  protected formData = linkedSignal<MatrixPollData>(() => this.poll() ?? { question: '', answers: [] });
  protected formValid = signal(false);
  // A new poll is saveable as soon as it is valid; an edit only once something actually changed.
  protected readonly showConfirmation = computed(() => this.formValid() && (!this.poll() || !samePoll(this.poll(), this.formData())));

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

function samePoll(a: MatrixPollData | undefined, b: MatrixPollData): boolean {
  return !!a && a.question === b.question && (a.maxSelections ?? 1) === (b.maxSelections ?? 1)
    && a.answers.length === b.answers.length && a.answers.every((answer, i) => answer === b.answers[i]);
}
