import { Component, computed, inject, input, signal } from '@angular/core';
import { IonButton, IonContent, IonIcon, ModalController, Platform } from '@ionic/angular/standalone';

import { ENV } from '@bk2/shared-config';
import { IMAGE_CONFIG_SHAPE, ImageConfig, UserModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { ChangeConfirmation, ChangeConfirmationI18n, Header, ImageConfigEdit } from '@bk2/shared-ui';
import { coerceBoolean, getImgixUrlWithAutoParams } from '@bk2/shared-util-core';

import { UploadService } from '@bk2/avatar-data-access';
import { getDocumentStoragePath, pickPhoto } from '@bk2/document-util';

import { DocumentStore } from './document.store';


/**
 * This modal requests a user to select an image file and provide some metadata about the image.
 */
@Component({
  selector: 'bk-image-select-modal',
  standalone: true,
  imports: [
    SvgIconPipe,
    Header, ChangeConfirmation, ImageConfigEdit,
    IonContent, IonButton, IonIcon
  ],
  providers: [DocumentStore],
  template: `
      <bk-header [i18n]="{ title: store.i18n.image_select() }" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
      }
      <ion-content class="ion-no-padding">
        <ion-button (click)="pickImage()">
          <ion-icon slot="start" src="{{'camera' | svgIcon }}" />
          {{ store.i18n.upload_single() }}
        </ion-button>
        <bk-image-config
          [formData]="formData()" (formDataChange)="onFormDataChange($event)"
           [i18n]="store.i18n"
          [readOnly]="isReadOnly()"
        />
      </ion-content>
  `
})
export class ImageSelectModal {
  protected readonly store = inject(DocumentStore);
  private readonly modalController = inject(ModalController);
  private readonly platform = inject(Platform);
  private readonly uploadService = inject(UploadService);
  private readonly env = inject(ENV);

  // inputs
  public key = input.required<string>();     // usually the key of a section
  public modelType = input('section'); // the model type of the key
  public currentUser = input<UserModel | undefined>(); // the current user
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ok: this.store.i18n.ok(), cancel: this.store.i18n.cancel(), confirmation: this.store.i18n.save()} as ChangeConfirmationI18n));
  public formData = signal<ImageConfig>(IMAGE_CONFIG_SHAPE);

 /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.modalController.dismiss(this.formData(), 'confirm');  
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(IMAGE_CONFIG_SHAPE);  // reset the form
  }

  protected onFormDataChange(formData: ImageConfig): void {
    this.formData.set(formData);
  }

  // select a photo from the camera or the photo library and upload it to the storage
  protected async pickImage(): Promise<void> {
    const file = await pickPhoto(this.platform);
    const key = this.key();
    if (file && key) {
      const storageLocation = getDocumentStoragePath(this.env.tenantId, this.modelType(), key);
      if (storageLocation) {
        const path = storageLocation + '/' + file.name;
        const downloadUrl = await this.uploadService.uploadFile(file, path, this.store.i18n.upload_single());
        if (downloadUrl) {
          await this.uploadService.createAndSaveDocument(file, this.env.tenantId, path, downloadUrl, this.currentUser());
        }
        this.formData.update((vm) => ({
          ...vm,
          url: path,
          actionUrl: getImgixUrlWithAutoParams(path)
        }));
      }
    }
  }
}