import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { FolderModel, UserModel } from '@bk2/shared-models';
import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { coerceBoolean, safeStructuredClone } from '@bk2/shared-util-core';

import { FolderForm } from '@bk2/folder-ui';
import { FOLDER_I18N_KEYS, FolderI18n } from '@bk2/folder-util';

@Component({
  selector: 'bk-folder-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, FolderForm,
    IonContent
  ],
  template: `
    <bk-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(formData(); as formData) {
        <bk-folder-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser()"
          [showForm]="showForm()"
          [readOnly]="isReadOnly()"
          [i18n]="i18n"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `
})
export class FolderEditModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(FOLDER_I18N_KEYS) as FolderI18n;
  protected readonly appStore = inject(AppStore);

  // inputs
  public readonly folder = input.required<FolderModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly readOnly = input(true);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.folder()));
  protected showForm = signal(true);

  // derived
  protected readonly headerTitle = computed(() => {
    if (this.isReadOnly()) return this.i18n.view_label();
    return this.folder().bkey ? this.i18n.edit_label() : this.i18n.create_label();
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

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.folder()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: FolderModel): void {
    this.formData.set(formData);
  }
}
