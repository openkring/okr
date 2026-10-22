import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { MatrixChatI18n, MessageEditFormModel } from '@okr/chat-util';

import { MessageEditForm } from './message-edit.form';

/**
 * «Mitteilung ändern»: edits the text of an own message. Dismisses with the new text (role
 * `confirm`); the caller sends the edit. The labels come from the chat store (`store.i18n`).
 */
@Component({
  selector: 'okr-message-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, MessageEditForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: i18n().msg_update_header() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-message-edit-form
          [formData]="formData"
          (formDataChange)="formData$.set($event)"
          [i18n]="i18n()"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class MessageEditModal {
  private readonly modalController = inject(ModalController);

  public readonly i18n = input.required<MatrixChatI18n>();
  /** The current text of the message. */
  public readonly body = input.required<string>();

  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected readonly formData$ = linkedSignal<MessageEditFormModel>(() => ({ body: this.body() }));
  protected readonly formData = this.formData$.asReadonly();
  protected showForm = signal(true);

  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n().cancel(),
    save: this.i18n().save(),
  } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData().body.trim(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData$.set({ body: this.body() });
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);   // fresh form → clears stale Vest state
  }
}
