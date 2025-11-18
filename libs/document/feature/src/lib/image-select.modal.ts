import { AsyncPipe } from '@angular/common';
import { Component, inject, input, signal } from '@angular/core';
import { IonButton, IonContent, IonIcon, ModalController, Platform } from '@ionic/angular/standalone';

import { ENV } from '@bk2/shared-config';
import { TranslatePipe } from '@bk2/shared-i18n';
import { newImage, UserModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { ChangeConfirmationComponent, HeaderComponent, UploadService } from '@bk2/shared-ui';
import { getImgixUrlWithAutoParams } from '@bk2/shared-util-core';

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
      @if(validChange()) {
        <bk-change-confirmation (okClicked)="save()" />
      } 
      <ion-content>
        <ion-button (click)="pickImage()">
          <ion-icon slot="start" src="{{'camera' | svgIcon }}" />
          {{ '@content.section.operation.selectImage.upload' | translate | async }}
        </ion-button>
        <bk-image-config-form [(vm)]="vm" [currentUser]="currentUser()" [readOnly]="readOnly()" (validChange)="validChange.set($event)" />
      </ion-content>
  `
})
export class ImageSelectModalComponent {
  public key = input.required<string>();     // usually the key of a section
  public modelType = input('section'); // the model type of the key
  public currentUser = input<UserModel | undefined>(); // the current user
  public readonly readOnly = input(true);

  private readonly modelController = inject(ModalController);
  private readonly platform = inject(Platform);
  private readonly uploadService = inject(UploadService);
  private readonly env = inject(ENV);

  protected vm = signal(newImage());
  protected validChange = signal(false);

  // select a photo from the camera or the photo library and upload it to the storage
  protected async pickImage(): Promise<void> {
    const file = await pickPhoto(this.platform);
    const key = this.key();
    if (file && key) {
      const storageLocation = getDocumentStoragePath(this.env.tenantId, this.modelType(), key);
      if (storageLocation) {
        const path = storageLocation + '/' + file.name;
        await this.uploadService.uploadFile(file, path, '@document.operation.upload.single.title');
        this.vm.update((vm) => ({
          ...vm,
          url: path,
          actionUrl: getImgixUrlWithAutoParams(path)
        }));
      }
    }
  }
  
  protected save() {
    this.modelController.dismiss(this.vm(), 'confirm');
  }
}