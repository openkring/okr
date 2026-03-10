import { AsyncPipe } from '@angular/common';
import { Component, inject, input, model } from '@angular/core';
import {
  ActionSheetController, ActionSheetOptions,
  IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle,
  IonIcon, IonItem, IonLabel, IonList, ModalController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addCircle, image as imageIcon } from 'ionicons/icons';

import { TranslatePipe } from '@bk2/shared-i18n';
import { ImageConfig, ImageType } from '@bk2/shared-models';
import { UploadEntry } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { UploadService } from '@bk2/avatar-data-access';

import { ImageEditModalComponent } from './image-edit.modal';

const IMAGE_MIMETYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

@Component({
  selector: 'bk-images-config',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonList, IonItem, IonLabel, IonButtons, IonButton, IonIcon,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .image-list-header { display: flex; justify-content: space-between; align-items: center; }
    ion-item { --min-height: 44px; }
    .image-meta { font-size: 0.8rem; color: var(--ion-color-medium); }
  `],
  template: `
    <ion-card>
      <ion-card-header>
        <div class="image-list-header">
          <ion-card-title>{{ title() | translate | async }}</ion-card-title>
          @if(!readOnly()) {
            <ion-buttons>
              <ion-button (click)="addImages()">
                <ion-icon slot="icon-only" name="add-circle" />
              </ion-button>
            </ion-buttons>
          }
        </div>
      </ion-card-header>
      <ion-card-content class="ion-no-padding">
        <ion-list lines="inset">
          @if(images().length === 0) {
            <ion-item>
              <ion-label color="medium">{{ '@content.section.images.empty' | translate | async }}</ion-label>
            </ion-item>
          }
          @for(img of images(); track $index) {
            <ion-item (click)="showActions(img, $index)" [button]="!readOnly()">
              <ion-icon name="image" slot="start" color="medium" />
              <ion-label>
                <p>{{ img.label || img.url }}</p>
                <p class="image-meta">{{ typeName(img.type) }}{{ img.altText ? ' · ' + img.altText : '' }}</p>
              </ion-label>
            </ion-item>
          }
        </ion-list>
      </ion-card-content>
    </ion-card>
  `
})
export class ImagesConfigComponent {
  private readonly uploadService = inject(UploadService);
  private readonly modalController = inject(ModalController);
  private readonly actionSheetController = inject(ActionSheetController);

  // inputs
  public images = model.required<ImageConfig[]>();
  public storagePath = input.required<string>();
  public readOnly = input(true);
  public title = input('@content.section.images.title');

  constructor() {
    addIcons({ addCircle, image: imageIcon });
  }

  protected typeName(type: ImageType): string {
    return ImageType[type] ?? 'Image';
  }

  protected async addImages(): Promise<void> {
    const files = await this.uploadService.pickMultipleFiles(IMAGE_MIMETYPES);
    if (!files.length) return;

    const basePath = this.storagePath();
    const uploads: UploadEntry[] = files.map(f => ({
      file: f,
      fullPath: `${basePath}/${f.name}`,
    }));

    const urls = await this.uploadService.uploadFiles(uploads, '@content.section.images.upload');
    if (!urls) return;

    const newImages: ImageConfig[] = files.map((f, i) => ({
      label: f.name.replace(/\.[^.]+$/, ''),
      type: ImageType.Image,
      url: `${basePath}/${f.name}`,
      actionUrl: '',
      altText: f.name.replace(/\.[^.]+$/, ''),
      overlay: '',
    }));

    this.images.update(imgs => [...imgs, ...newImages]);
  }

  protected async showActions(img: ImageConfig, index: number): Promise<void> {
    if (this.readOnly()) return;
    const options: ActionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    options.buttons.push(createActionSheetButton('image.edit', ''));
    options.buttons.push(createActionSheetButton('image.delete', ''));
    options.buttons.push(createActionSheetButton('cancel', ''));

    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;

    switch (data.action) {
      case 'image.edit':
        await this.editImage(img, index);
        break;
      case 'image.delete':
        this.images.update(imgs => imgs.filter((_, idx) => idx !== index));
        break;
    }
  }

  private async editImage(img: ImageConfig, index: number): Promise<void> {
    const modal = await this.modalController.create({
      component: ImageEditModalComponent,
      componentProps: { 
        formData: { ...img },
        readOnly: this.readOnly()
      },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm' && data) {
      this.images.update(imgs => imgs.map((item, i) => i === index ? data as ImageConfig : item));
    }
  }
}
