import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { IonButton, IonContent, IonIcon, ModalController, Platform } from '@ionic/angular/standalone';

import { ENV } from '@bk2/shared-config';
import { TranslatePipe } from '@bk2/shared-i18n';
import { Image, newImage, UserModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { coerceBoolean, getImgixUrlWithAutoParams } from '@bk2/shared-util-core';

import { UploadService } from '@bk2/avatar-data-access';

import { ImageConfigFormComponent } from '@bk2/document-ui';
import { getDocumentStoragePath, pickPhoto } from '@bk2/document-util';

/**
 * This modal requests a user to select an image file and provide some metadata about the image.
 */
@Component({
  selector: 'bk-image-select-modal',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    HeaderComponent, ChangeConfirmationComponent, ImageConfigFormComponent,
    IonContent, IonButton, IonIcon
  ],
  template: `
      <bk-header title="{{ '@content.section.operation.selectImage.title' | translate | async }}" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
      } 
      <ion-content no-padding>
        <ion-button (click)="pickImage()">
          <ion-icon slot="start" src="{{'camera' | svgIcon }}" />
          {{ '@content.section.operation.selectImage.upload' | translate | async }}
        </ion-button>
        <bk-image-config-form
          [formData]="formData()"
          [currentUser]="currentUser()"
          [readOnly]="isReadOnly()"
          (formDataChange)="onFormDataChange($event)"
        />
      </ion-content>
  `
})
export class ImageSelectModalComponent {
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
  public formData = signal(newImage());

 /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.modalController.dismiss(this.formData(), 'confirm');  
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(newImage());  // reset the form
  }

  protected onFormDataChange(formData: Image): void {
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
        await this.uploadService.uploadFile(file, path, '@document.operation.upload.single.title');
        this.formData.update((vm) => ({
          ...vm,
          url: path,
          actionUrl: getImgixUrlWithAutoParams(path)
        }));
      }
    }
  }
}