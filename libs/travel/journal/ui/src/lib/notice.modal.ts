import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { JOURNAL_I18N_KEYS, JournalI18n, NoticeFormModel } from '@okr/travel-journal-util';

import { NoticeForm } from './notice.form';

/**
 * Compose the message to the guests (plan 8). The proposal can be sent as it is, so the confirmation banner
 * («Senden») shows from the start; dismisses with the notice and role 'confirm'.
 */
@Component({
  selector: 'okr-notice-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, NoticeForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: i18n.notice_title() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      <okr-notice-form [formData]="formData()" (formDataChange)="formData.set($event)" [i18n]="i18n" [recipients]="recipients()"
        [showForm]="showForm()" (dirty)="formDirty.set($event)" (valid)="formValid.set($event)" />
    </ion-content>
  `,
})
export class NoticeModal {
  private readonly modalController = inject(ModalController);
  // direct inject, no store: the journal pages open this modal
  protected readonly i18n = inject(I18nService).translateAll(JOURNAL_I18N_KEYS) as JournalI18n;

  /** The proposal from the server. */
  public readonly notice = input.required<NoticeFormModel>();
  public readonly recipients = input('');

  // the proposal is sendable unchanged: «dirty» from the start
  protected formDirty = signal(true);
  protected formValid = signal(false);
  protected readonly formData = linkedSignal<NoticeFormModel>(() => ({ ...this.notice() }));
  protected showForm = signal(true);

  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.i18n.cancel(), save: this.i18n.notice_send() } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    await dismissOverlay(this.modalController, undefined, 'cancel');
  }
}
