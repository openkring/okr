import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { I18nTenantOverrideModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { safeStructuredClone } from '@okr/shared-util-core';
import { I18N_ENTRY_I18N_KEYS, I18nEntryFormModel, I18nEntryI18n, normalizeI18nEntry } from '@okr/i18n-util';

import { I18nEntryForm } from './i18n-entry.form';

/** Edits one I18nTenantOverrideModel; dismisses with the edited copy and role 'confirm'. */
@Component({
  selector: 'okr-i18n-override-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, I18nEntryForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: i18n.override_edit_title() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-i18n-entry-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class I18nOverrideEditModal {
  private readonly modalController = inject(ModalController);
  // direct inject, no store: the list's store must not be imported back into the modal
  protected readonly i18n = inject(I18nService).translateAll(I18N_ENTRY_I18N_KEYS) as I18nEntryI18n;

  public item = input.required<I18nTenantOverrideModel>();

  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => this.cloneItem());
  protected showForm = signal(true);

  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.cancel(),
    save: this.i18n.save(),
  } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(this.cloneItem());
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);   // fresh form → clears stale Vest state
  }

  protected onFormDataChange(formData: I18nEntryFormModel): void {
    this.formData.update((current) => ({ ...current, ...formData }));
  }

  private cloneItem(): I18nTenantOverrideModel {
    return normalizeI18nEntry(safeStructuredClone(this.item()) ?? ({} as I18nTenantOverrideModel));
  }
}
