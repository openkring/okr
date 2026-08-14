import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { AgendaItem, MeetingModel, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';

import { MEETING_I18N_KEYS, MeetingI18n } from '@okr/content-meeting-util';
import { MeetingForm } from './meeting.form';

/**
 * Container for the meeting form. Presentational: it takes the meeting as an
 * input and dismisses the edited copy — no store, no service.
 *
 * `addTask` is dismissed with its own role so the calling store can open the task
 * modal with the agenda item's title and the meeting back-link.
 */
@Component({
  selector: 'okr-meeting-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, MeetingForm,
    IonContent
  ],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-meeting-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser()"
          [allTags]="allTags()"
          [showForm]="showForm()"
          [readOnly]="isReadOnly()"
          [minutesMode]="isMinutesMode()"
          [i18n]="i18n"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
          (addTask)="requestTask($event)"
        />
      }
    </ion-content>
  `
})
export class MeetingEditModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(MEETING_I18N_KEYS) as MeetingI18n;

  // inputs
  public readonly meeting = input.required<MeetingModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly allTags = input('');
  public readonly readOnly = input(true);
  /** true when the modal is opened to write the minutes rather than to prepare the agenda */
  public readonly minutesMode = input(false);

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly isMinutesMode = computed(() => coerceBoolean(this.minutesMode()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.meeting()));
  protected showForm = signal(true);

  // derived
  protected readonly headerTitle = computed(() => {
    if (this.isReadOnly()) return this.i18n.view_label();
    return this.meeting().okey ? this.i18n.edit_label() : this.i18n.create_label();
  });
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.changeConfirmation_cancel(),
    save: this.i18n.changeConfirmation_ok(),
  } as ChangeConfirmationI18n));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.meeting()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  /** Hand the agenda item back to the store, together with the edits made so far. */
  protected async requestTask(item: AgendaItem): Promise<void> {
    await this.modalController.dismiss({ meeting: this.formData(), agendaItem: item }, 'addTask');
  }

  protected onFormDataChange(formData: MeetingModel): void {
    this.formData.set(formData);
  }
}
