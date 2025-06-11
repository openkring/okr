import { AsyncPipe } from '@angular/common';
import { Component, inject, input, signal } from '@angular/core';
import { IonButton, IonContent, IonIcon, ModalController, Platform } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared/pipes';
import { getImgixUrlWithAutoParams } from '@bk2/shared/util';
import { ChangeConfirmationComponent, HeaderComponent, UploadService } from '@bk2/shared/ui';
import { TranslatePipe } from '@bk2/shared/i18n';
import { newImage } from '@bk2/cms/section/util';
import { getDocumentStoragePath, pickPhoto } from '@bk2/document/util';
import { ImageConfigFormComponent } from '@bk2/document/ui';
import { ModelType, UserModel } from '@bk2/shared/models';
import { ENV } from '@bk2/shared/config';

/**
 * This modal requests a user to select an image file and provide some metadata about the image.
 */
@Component({
  selector: 'bk-image-select-modal',
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
        <bk-image-config-form [(vm)]="vm" [currentUser]="currentUser()" (validChange)="validChange.set($event)" />
      </ion-content>
  `
})
export class ImageSelectModalComponent {
  private readonly modelController = inject(ModalController);
  private readonly platform = inject(Platform);
  private readonly uploadService = inject(UploadService);
  private readonly env = inject(ENV);

  public key = input.required<string>();     // usually the key of a section
  public modelType = input(ModelType.Section); // the model type of the key
  public currentUser = input<UserModel | undefined>(); // the current user

  protected vm = signal(newImage());
  protected validChange = signal(false);

  // select a photo from the camera or the photo library and upload it to the storage
  protected async pickImage(): Promise<void> {
    const _file = await pickPhoto(this.platform);
    const _key = this.key();
    if (_file && _key) {
      const _storageLocation = getDocumentStoragePath(this.env.owner.tenantId, this.modelType(), _key);
      if (_storageLocation) {
        const _path = _storageLocation + '/' + _file.name;
        await this.uploadService.uploadFile(_file, _path, '@document.operation.upload.single.title');
        this.vm.update((vm) => ({
          ...vm,
          url: _path,
          actionUrl: getImgixUrlWithAutoParams(_path)
        }));
      }
    }
  }
  
  protected save() {
    this.modelController.dismiss(this.vm(), 'confirm');
  }
}