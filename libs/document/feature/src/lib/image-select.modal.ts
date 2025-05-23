import { AsyncPipe } from '@angular/common';
import { Component, inject, input, signal } from '@angular/core';
import { IonButton, IonContent, IonIcon, ModalController, Platform } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared/pipes';
import { getImgixUrlWithAutoParams } from '@bk2/shared/util';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared/ui';
import { TranslatePipe } from '@bk2/shared/i18n';
import { newImage } from '@bk2/cms/section/util';
import { pickPhoto } from '@bk2/document/util';
import { DocumentUploadService, ImageConfigFormComponent } from '@bk2/document/ui';
import { ModelType, UserModel } from '@bk2/shared/models';

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
  private readonly documentUploadService = inject(DocumentUploadService);

  public key = input.required<string>();     // usually the key of a section
  public modelType = input(ModelType.Section); // the model type of the key
  public currentUser = input<UserModel | undefined>(); // the current user

  protected vm = signal(newImage());
  protected validChange = signal(false);

  // select a photo from the camera or the photo library
  protected async pickImage() {
    const _file = await pickPhoto(this.platform);
    const _key = this.key();
    if (_file && _key) {
      // upload the file to the storage
      const _path = await this.documentUploadService.uploadFileToModel(_file, this.modelType(), _key);
      if (_path) {
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
