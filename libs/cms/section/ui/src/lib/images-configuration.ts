import { Component, inject, input, model, Signal } from '@angular/core';
import {
  ActionSheetController, ActionSheetOptions,
  IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle,
  IonIcon, IonImg, IonItem, IonLabel, IonList, IonReorder, IonReorderGroup, IonThumbnail,
  ItemReorderEventDetail, ModalController
} from '@ionic/angular/standalone';

import { ENV } from '@bk2/shared-config';
import { ImageConfig, ImageType, UserModel } from '@bk2/shared-models';
import { UploadEntry } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { IMGIX_THUMBNAIL_PARAMS } from '@bk2/shared-util-core';
import { UploadService } from '@bk2/avatar-data-access';
import { SvgIconPipe } from '@bk2/shared-pipes';

import { ImageEditModal } from './image-edit.modal';

interface ImagesConfigurationI18n {
  title: Signal<string>;
  empty: Signal<string>;
  image_upload: Signal<string>;
  as_title: Signal<string>;
  image_edit: Signal<string>;
  image_delete: Signal<string>;
  cancel: Signal<string>;
}

@Component({
  selector: 'bk-images-config',
  standalone: true,
  imports: [
    SvgIconPipe,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonList, IonItem, IonLabel, IonButtons, IonButton, IonIcon,
    IonThumbnail, IonImg, IonReorderGroup, IonReorder,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .image-list-header { display: flex; justify-content: space-between; align-items: center; }
    ion-item { --min-height: 52px; }
    .image-meta { font-size: 0.8rem; color: var(--ion-color-medium); }
    ion-thumbnail { --size: 44px; --border-radius: 4px; margin-inline-end: 8px; }
  `],
  template: `
    <ion-card>
      <ion-card-header>
        <div class="image-list-header">
          <ion-card-title>{{ i18n().title() }}</ion-card-title>
          @if(!readOnly()) {
            <ion-buttons>
              <label style="display: flex; align-items: center;">
                <input type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp"
                       style="display: none;" (change)="onFilesSelected($event)">
                <ion-button>
                  <ion-icon slot="icon-only" src="{{'add-circle' | svgIcon }}" />
                </ion-button>
              </label>
            </ion-buttons>
          }
        </div>
      </ion-card-header>
      <ion-card-content class="ion-no-padding">
        <ion-list lines="inset">
          @if(images().length === 0) {
            <ion-item>
              <ion-label color="medium">{{ i18n().empty() }}</ion-label>
            </ion-item>
          } @else {
            <!-- Casting $event to $any is a temporary fix for https://github.com/ionic-team/ionic-framework/issues/24245 -->
            <ion-reorder-group [disabled]="readOnly()" (ionItemReorder)="reorder($any($event))">
              @for(img of images(); track $index) {
                <ion-item (click)="showActions(img, $index)" [button]="!readOnly()">
                  @if(!readOnly()) {
                    <ion-reorder slot="start" />
                  }
                  <ion-thumbnail slot="start">
                    <ion-img [src]="thumbnailUrl(img)" [alt]="img.altText || img.label" />
                  </ion-thumbnail>
                  <ion-label>
                    <p>{{ img.label || img.url }}</p>
                    <p class="image-meta">{{ typeName(img.type) }}{{ img.altText ? ' · ' + img.altText : '' }}</p>
                  </ion-label>
                </ion-item>
              }
            </ion-reorder-group>
          }
        </ion-list>
      </ion-card-content>
    </ion-card>
  `
})
export class ImagesConfiguration {
  private readonly env = inject(ENV);
  private readonly uploadService = inject(UploadService);
  private readonly modalController = inject(ModalController);
  private readonly actionSheetController = inject(ActionSheetController);

  // inputs
  public images = model.required<ImageConfig[]>();
  public storagePath = input.required<string>();
  public currentUser = input<UserModel | undefined>();
  public readOnly = input(true);
  public readonly i18n = input.required<ImagesConfigurationI18n>();

  // constants
  private imgixBaseUrl = this.env.services.imgixBaseUrl;

  protected typeName(type: ImageType): string {
    return ImageType[type] ?? 'Image';
  }

  protected thumbnailUrl(img: ImageConfig): string {
    const url = img.url ?? '';
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return `${this.imgixBaseUrl}/${url}?${IMGIX_THUMBNAIL_PARAMS}`;
  }

  protected reorder(ev: CustomEvent<ItemReorderEventDetail>): void {
    this.images.set(ev.detail.complete(this.images()));
  }

  protected async onFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = ''; // allow re-selecting the same files next time
    if (!files.length) return;

    const basePath = this.storagePath();
    const uploads: UploadEntry[] = files.map(f => ({
      file: f,
      fullPath: `${basePath}/${f.name}`,
    }));

    const urls = await this.uploadService.uploadFiles(uploads, this.i18n().image_upload() ?? '');
    if (!urls) return;

    const newImages: ImageConfig[] = files.map(f => ({
      label: f.name.replace(/\.[^.]+$/, ''),
      type: ImageType.Image,
      url: `${basePath}/${f.name}`,
      actionUrl: '',
      altText: f.name.replace(/\.[^.]+$/, ''),
      overlay: '',
    }));

    await Promise.all(files.map((f, idx) => {
      const downloadUrl = urls[idx];
      if (!downloadUrl) return Promise.resolve();
      return this.uploadService.createAndSaveDocument(f, this.env.tenantId, `${basePath}/${f.name}`, downloadUrl, this.currentUser());
    }));

    this.images.update(imgs => [...imgs, ...newImages]);
  }

  protected async showActions(img: ImageConfig, index: number): Promise<void> {
    if (this.readOnly()) return;
    const i18n = this.i18n();
    const options: ActionSheetOptions = createActionSheetOptions(i18n.as_title());
    options.buttons.push(createActionSheetButton('image.edit', i18n.image_edit(), this.imgixBaseUrl, 'edit'));
    options.buttons.push(createActionSheetButton('image.delete', i18n.image_delete(), this.imgixBaseUrl, 'trash'));
    options.buttons.push(createActionSheetButton('cancel', i18n.cancel(), this.imgixBaseUrl, 'cancel-circle'));

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
      component: ImageEditModal,
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
