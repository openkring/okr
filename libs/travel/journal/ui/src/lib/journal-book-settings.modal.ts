import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { BOOK_I18N_KEYS, BookSettingsFormModel, bookSettingsOf, JOURNAL_I18N_KEYS, JournalBookI18n, JournalI18n } from '@okr/travel-journal-util';
import { JournalBookModel } from '@okr/shared-models';

import { BookCoverChoice, JournalBookSettingsForm } from './journal-book-settings.form';

/** Edits the book settings; dismisses with the edited BookSettingsFormModel and role 'confirm'. */
@Component({
  selector: 'okr-journal-book-settings-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, JournalBookSettingsForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: i18n.settings_title() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-journal-book-settings-form
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
export class JournalBookSettingsModal {
  private readonly modalController = inject(ModalController);
  // direct inject, no store: the book page opens this modal
  private readonly i18nService = inject(I18nService);
  protected readonly i18n = this.i18nService.translateAll(BOOK_I18N_KEYS) as JournalBookI18n;
  private readonly journalI18n = this.i18nService.translateAll(JOURNAL_I18N_KEYS) as JournalI18n;

  public readonly settings = input<BookSettingsFormModel>(bookSettingsOf(new JournalBookModel(), undefined));
  public readonly covers = input<BookCoverChoice[]>([]);

  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected readonly formData$ = linkedSignal(() => ({ ...this.settings() }));
  protected readonly formData = this.formData$.asReadonly();
  protected showForm = signal(true);

  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.journalI18n.cancel(),
    save: this.journalI18n.save(),
  } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, { ...this.formData() }, 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData$.set({ ...this.settings() });
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0); // fresh form → clears stale Vest state
  }
}
