import { Component, computed, inject, input, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { ContractDocState, ContractDocumentRef, ContractDocumentRole } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';

import { CONTRACT_I18N_KEYS, ContractDocumentUploadData, ContractI18n, newContractDocumentUploadData } from '@okr/business-contract-util';

import { ContractDocumentUploadForm } from './contract-document-upload.form';

/** What the upload modal dismisses with (`role: 'confirm'`); the caller runs the upload. */
export interface ContractDocumentUploadResult {
  file: File;
  role: ContractDocumentRole;
  title: string;
  docState: ContractDocState;
  priorVersionKey?: string;
}

/**
 * "Datei hinzufügen" (spec 1.5 §7): collects one file and its metadata. It uploads nothing itself —
 * the dossier owns the service call, so this modal stays presentational.
 */
@Component({
  selector: 'okr-contract-document-upload-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, ContractDocumentUploadForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: i18n.upload() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (saveClicked)="save()" (cancelClicked)="cancel()" />
    }
    <ion-content class="ion-no-padding">
      <okr-contract-document-upload-form [formData]="formData()" (formDataChange)="formData.set($event)"
        [i18n]="i18n" [documents]="documents()" [readOnly]="false" [showForm]="showForm()"
        (fileSelected)="file.set($event)" (dirty)="formDirty.set($event)" (valid)="formValid.set($event)" />
    </ion-content>
  `,
})
export class ContractDocumentUploadModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(CONTRACT_I18N_KEYS) as ContractI18n;

  /** the dossier's current files, offered as "replaces" */
  public readonly documents = input<ContractDocumentRef[]>([]);

  public formData = signal<ContractDocumentUploadData>(newContractDocumentUploadData());
  protected readonly file = signal<File | undefined>(undefined);
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showForm = signal(true);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty() && !!this.file());

  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.cancel(), save: this.i18n.save(),
  } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    const file = this.file();
    if (!file) return;
    const { role, title, docState, priorVersionKey } = this.formData();
    const result: ContractDocumentUploadResult = {
      file, role, title: title.trim(), docState, ...(priorVersionKey ? { priorVersionKey } : {}),
    };
    await dismissOverlay(this.modalController, result, 'confirm');
  }

  /** revert + force a fresh form: clears the Vest state and the native file input */
  public cancel(): void {
    this.formDirty.set(false);
    this.file.set(undefined);
    this.formData.set(newContractDocumentUploadData());
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }
}
