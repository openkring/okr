import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { FootprintFormModel, JOURNAL_I18N_KEYS, JournalI18n, newFootprintFormModel } from '@okr/travel-journal-util';

import { FootprintForm } from './footprint.form';

/** Edits a footprint; dismisses with the edited FootprintFormModel and role 'confirm'. */
@Component({
  selector: 'okr-footprint-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, FootprintForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: i18n.footprint_form_title() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-footprint-form
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
export class FootprintEditModal {
  private readonly modalController = inject(ModalController);
  // direct inject, no store: the journal store opens this modal
  protected readonly i18n = inject(I18nService).translateAll(JOURNAL_I18N_KEYS) as JournalI18n;

  public readonly footprint = input<FootprintFormModel>(newFootprintFormModel());

  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected readonly formData$ = linkedSignal(() => ({ ...this.footprint() }));
  protected readonly formData = this.formData$.asReadonly();
  protected showForm = signal(true);

  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.cancel(),
    save: this.i18n.save(),
  } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    const data = this.formData();
    await dismissOverlay(this.modalController, { ...data, title: data.title.trim(), placeName: data.placeName.trim() }, 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData$.set({ ...this.footprint() });
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0); // fresh form → clears stale Vest state
  }
}
