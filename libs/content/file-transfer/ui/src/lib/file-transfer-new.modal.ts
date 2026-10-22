import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, IonItem, IonLabel, IonNote, ModalController } from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { GroupModel, PersonModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import {
  FILE_TRANSFER_I18N_KEYS, FileTransferI18n, ResolvedLimits,
} from '@okr/content-file-transfer-util';

import { FileTransferForm, FileTransferFormData, newFileTransferFormData } from './file-transfer.form';

/**
 * «Transfer senden»: collects files and recipients and dismisses with the filled-in
 * {@link FileTransferFormData} and role 'confirm'. Uploading and sending are the caller's job.
 * Started from a chat room (`chatRoomId`), the room's members come in through `preset`.
 */
@Component({
  selector: 'okr-file-transfer-new-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, FileTransferForm, IonContent, IonItem, IonLabel, IonNote],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (chatRoomId()) {
        <ion-item lines="none">
          <ion-label class="ion-text-wrap"><ion-note>{{ i18n.new_chat_hint() }}</ion-note></ion-label>
        </ion-item>
      }
      @if (formData(); as formData) {
        <okr-file-transfer-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n"
          [limits]="limits()"
          [groups]="groups()"
          [persons]="persons()"
          [tenantId]="tenantId()"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class FileTransferNewModal {
  private readonly modalController = inject(ModalController);
  // direct inject, no store: a feature store opens this modal, importing it back would be circular
  protected readonly i18n = inject(I18nService).translateAll(FILE_TRANSFER_I18N_KEYS) as FileTransferI18n;

  // inputs
  public readonly preset = input<Partial<FileTransferFormData> | undefined>(undefined);
  /** set when the transfer starts from a chat room; the caller posts the card there */
  public readonly chatRoomId = input('');
  /** the sender's limits (resolveFileTransferLimits of the tenant config and the sender) */
  public readonly limits = input.required<ResolvedLimits>();
  public readonly tenantId = input('');
  public readonly groups = input<GroupModel[]>([]);
  public readonly persons = input<PersonModel[]>([]);

  protected readonly headerTitle = computed(() => this.chatRoomId() ? this.i18n.new_title_chat() : this.i18n.new_title());

  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected readonly formData = linkedSignal(() => this.initialData());
  protected showForm = signal(true);

  // A preset (e.g. a chat room's members) already makes the form worth sending once files are
  // added, so the banner waits for the user's own change (dirty) like everywhere else.
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.cancel(),
    save: this.i18n.send(),
  } as ChangeConfirmationI18n));

  private initialData(): FileTransferFormData {
    return newFileTransferFormData(this.limits().defaultLifetimeDays, this.preset());
  }

  public async save(): Promise<void> {
    const data = this.formData();
    await dismissOverlay(this.modalController, {
      ...data,
      emails: data.emails.map(e => e.trim().toLowerCase()).filter(e => e.length > 0),
      message: data.message.trim(),
    } satisfies FileTransferFormData, 'confirm');
  }

  protected onFormDataChange(formData: FileTransferFormData): void {
    this.formData.set(formData);
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(this.initialData());
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);   // fresh form → clears stale Vest state
  }
}
