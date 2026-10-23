import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { htmlToPlainText, JOURNAL_I18N_KEYS, JournalI18n, plainTextToHtml, TextBlockFormModel } from '@okr/travel-journal-util';

import { TextBlockForm } from './text-block.form';

/** Writes or edits a text block; dismisses with `{ html }` and role 'confirm'. */
@Component({
  selector: 'okr-text-block-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, TextBlockForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: i18n.text_form_title() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-text-block-form
          [formData]="formData"
          (formDataChange)="formData$.set($event)"
          [i18n]="i18n"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class TextBlockEditModal {
  private readonly modalController = inject(ModalController);
  // direct inject, no store: the journal pages open this modal
  protected readonly i18n = inject(I18nService).translateAll(JOURNAL_I18N_KEYS) as JournalI18n;

  /** The block's current HTML; empty for a new block. */
  public readonly html = input('');

  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected readonly formData$ = linkedSignal<TextBlockFormModel>(() => ({ text: htmlToPlainText(this.html()) }));
  protected readonly formData = this.formData$.asReadonly();
  protected showForm = signal(true);

  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.cancel(),
    save: this.i18n.save(),
  } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, { html: plainTextToHtml(this.formData().text) }, 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData$.set({ text: htmlToPlainText(this.html()) });
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0); // fresh form → clears stale Vest state
  }
}
