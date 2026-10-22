import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { FileTransferLimits } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import {
  FILE_TRANSFER_I18N_KEYS, FileTransferI18n, FileTransferLimitsFormData, fromFileTransferLimitsFormData, toFileTransferLimitsFormData,
} from '@okr/content-file-transfer-util';

import { FileTransferLimitsForm } from './file-transfer-limits.form';

/**
 * Edits the tenant's transfer limits (sizes in GB) and dismisses with the edited
 * {@link FileTransferLimits} (sizes in bytes) and role 'confirm'. Saving is the caller's job.
 */
@Component({
  selector: 'okr-file-transfer-limits-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, FileTransferLimitsForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: i18n.limits_title() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-file-transfer-limits-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n"
          [tenantId]="tenantId()"
          [readOnly]="readOnly()"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class FileTransferLimitsEditModal {
  private readonly modalController = inject(ModalController);
  // direct inject, no store: a feature store opens this modal, importing it back would be circular
  protected readonly i18n = inject(I18nService).translateAll(FILE_TRANSFER_I18N_KEYS) as FileTransferI18n;

  // inputs
  /** the stored limits (app-config); missing fields fall back to DEFAULT_FILE_TRANSFER_LIMITS */
  public readonly limits = input<FileTransferLimits | undefined>(undefined);
  public readonly tenantId = input('');
  public readonly readOnly = input(false);

  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected readonly formData = linkedSignal<FileTransferLimitsFormData>(() => toFileTransferLimitsFormData(this.limits()));
  protected showForm = signal(true);

  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.cancel(),
    save: this.i18n.save(),
  } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, fromFileTransferLimitsFormData(this.formData()), 'confirm');
  }

  protected onFormDataChange(formData: FileTransferLimitsFormData): void {
    this.formData.set(formData);
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(toFileTransferLimitsFormData(this.limits()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);   // fresh form → clears stale Vest state
  }
}
