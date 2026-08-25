import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { CalEventNotifyFormData, CALEVENT_I18N_KEYS, CaleventI18n } from '@okr/calevent-util';
import { I18nService } from '@okr/shared-i18n';
import { ChangeConfirmation, Header } from '@okr/shared-ui';
import { safeStructuredClone } from '@okr/shared-util-core';

import { CalEventNotifyForm } from './calevent-notify.form';

/**
 * Container for the «Teilnehmende benachrichtigen» form.
 *
 * Presentational: it takes the prepared form data as an input and hands the edited copy back
 * through `dismiss`. The caller (CalEventStore) does the sending — which is what keeps this
 * modal out of `feature` and out of a circular import with the store that opens it.
 *
 * Injects `I18nService` directly rather than taking the store's i18n, for the same reason.
 */
@Component({
  selector: 'okr-calevent-notify-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, CalEventNotifyForm,
    IonContent,
  ],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()"
        (saveClicked)="save()" (cancelClicked)="cancel()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as data) {
        <okr-calevent-notify-form [formData]="data" (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n" [showForm]="showForm()"
          (dirty)="formDirty.set($event)" (valid)="formValid.set($event)" />
      }
    </ion-content>
  `,
})
export class CalEventNotifyModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(CALEVENT_I18N_KEYS) as CaleventI18n;

  public readonly notifyData = input.required<CalEventNotifyFormData>();
  /** Name of the event, shown in the header so the sender sees what they are broadcasting about. */
  public readonly caleventName = input('');

  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showForm = signal(true);
  public formData = linkedSignal(() => safeStructuredClone(this.notifyData()));

  protected readonly showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly headerTitle = computed(() =>
    this.caleventName() ? `${this.i18n.notify_label()} · ${this.caleventName()}` : this.i18n.notify_label());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.cancel(),
    save: this.i18n.notify_label(),
  }));

  protected onFormDataChange(data: CalEventNotifyFormData): void {
    this.formData.set(data);
  }

  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.notifyData()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }
}
