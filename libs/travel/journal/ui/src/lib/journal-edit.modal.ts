import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { JOURNAL_I18N_KEYS, JournalFormModel, JournalI18n } from '@okr/travel-journal-util';

import { BookCoverChoice } from './journal-book-settings.form';
import { JournalForm } from './journal.form';

const EMPTY: JournalFormModel = { title: '', subTitle: '', coverImageKey: '', coverLabel: '', lastPageLabel: '' };

/** «Reisetagebuch ändern»: dismisses with the edited JournalFormModel and role 'confirm'. */
@Component({
  selector: 'okr-journal-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, JournalForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: i18n.edit_title() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-journal-form
          [formData]="formData"
          (formDataChange)="formData$.set($event)"
          [i18n]="i18n"
          [covers]="covers()"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class JournalEditModal {
  private readonly modalController = inject(ModalController);
  // direct inject, no store: the list page opens this modal
  private readonly i18nService = inject(I18nService);
  protected readonly i18n = this.i18nService.translateAll(JOURNAL_I18N_KEYS) as JournalI18n;

  public readonly journal = input<JournalFormModel>(EMPTY);
  public readonly covers = input<BookCoverChoice[]>([]);

  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected readonly formData$ = linkedSignal(() => ({ ...this.journal() }));
  protected readonly formData = this.formData$.asReadonly();
  protected showForm = signal(true);

  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.cancel(),
    save: this.i18n.save(),
  } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, { ...this.formData() }, 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData$.set({ ...this.journal() });
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0); // fresh form → clears stale Vest state
  }
}
