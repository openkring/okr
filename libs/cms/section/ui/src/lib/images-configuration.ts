import { Component, computed, inject, input, model } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
  ActionSheetController, ActionSheetOptions,
  IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle,
  IonIcon, IonItem, IonLabel, IonList, IonReorder, IonReorderGroup, IonThumbnail,
  ItemReorderEventDetail, ModalController, ToastController
} from '@ionic/angular';

import { getDownloadURL, ref } from 'firebase/storage';

import { ENV, STORAGE } from '@okr/shared-config';
import { IMAGE_MIMETYPES } from '@okr/shared-constants';
import { ImageConfig, ImageType, UserModel } from '@okr/shared-models';
import { ErrorNote, ImageDetailModal, UploadEntry, ImgDirective } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetOptions, downloadToBrowser } from '@okr/shared-util-angular';
import { IMGIX_THUMBNAIL_PARAMS, sanitizeFileName } from '@okr/shared-util-core';
import { UploadService } from '@okr/avatar-data-access';
import { SvgIconPipe } from '@okr/shared-pipes';
import { getImageErrors, ImageDetails, ImageUploadTarget, SECTION_IMAGE_PICKER, SectionErrors, SectionI18n, SectionImagePicker, uniqueFileName } from '@okr/cms-section-util';

import { ImageEditModal } from './image-edit.modal';

@Component({
  selector: 'okr-images-config',
  standalone: true,
  imports: [
    ImgDirective, SvgIconPipe, NgTemplateOutlet,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonList, IonItem, IonLabel, IonButtons, IonButton, IonIcon,
    IonThumbnail, IonReorderGroup, IonReorder,
    ErrorNote
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .image-list-header { display: flex; justify-content: space-between; align-items: center; }
    ion-item { --min-height: 52px; }
    .image-meta { font-size: 0.8rem; color: var(--ion-color-medium); }
    ion-thumbnail { --size: 44px; --border-radius: 4px; margin-inline-end: 8px; }
    .embedded-actions { display: flex; justify-content: flex-end; }
  `],
  template: `
    @if(embedded()) {
      <!-- inside a host card (the article's «Bilder» card): no own card or title, only the add button above the list -->
      @if(!readOnly() && canAdd() && !atMax()) {
        <div class="embedded-actions">
          <ion-buttons>
            <ion-button (click)="addImages()" [attr.aria-label]="i18n().image_add_label()">
              <ion-icon slot="icon-only" src="{{'add-circle' | svgIcon }}" />
            </ion-button>
          </ion-buttons>
        </div>
      }
      <ng-container *ngTemplateOutlet="imageList" />
    } @else {
      <ion-card>
        <ion-card-header>
          <div class="image-list-header">
            <ion-card-title>{{ title() || i18n().image_edit_title_modal() }}</ion-card-title>
            @if(!readOnly() && canAdd() && !atMax()) {
              <ion-buttons>
                <ion-button (click)="addImages()">
                  <ion-icon slot="icon-only" src="{{'add-circle' | svgIcon }}" />
                </ion-button>
              </ion-buttons>
            }
          </div>
        </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ng-container *ngTemplateOutlet="imageList" />
        </ion-card-content>
      </ion-card>
    }

    <ng-template #imageList>
        <ion-list lines="inset">
          @if(images().length === 0) {
            <ion-item>
              <ion-label color="medium">{{ emptyText() || i18n().image_empty() }}</ion-label>
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
                    <img okrImg [src]="thumbnailUrl(img)" [alt]="img.altText || img.label" />
                  </ion-thumbnail>
                  <ion-label>
                    @if(picker) {
                      <p>{{ img.altText || img.label }}</p>
                    } @else {
                      <p>{{ img.label || img.url }}</p>
                      <p class="image-meta">{{ showType() ? typeName(img.type) + (img.altText ? ' · ' + img.altText : '') : img.altText }}</p>
                    }
                  </ion-label>
                </ion-item>
              }
            </ion-reorder-group>
          }
        </ion-list>
        <!-- image errors carry an images[i] index, so they are listed under the list they belong to -->
        <okr-error-note [errors]="imageErrors()" />
    </ng-template>
  `
})
export class ImagesConfiguration {
  private readonly env = inject(ENV);
  private readonly storage = inject(STORAGE);
  private readonly uploadService = inject(UploadService);
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);
  private readonly actionSheetController = inject(ActionSheetController);
  /**
   * Set by the travel journal: photos and clips come from the journal and are resolved by the picker
   * (spec 1.154). Absent in the CMS, which keeps today's upload to the public bucket unchanged.
   */
  protected readonly picker = inject(SECTION_IMAGE_PICKER, { optional: true });

  // inputs
  public images = model.required<ImageConfig[]>();
  public storagePath = input.required<string>();
  public currentUser = input<UserModel | undefined>();
  public readOnly = input(true);
  public readonly i18n = input.required<SectionI18n>();
  /** vest field name -> messages of the running section suite (see section.form.ts) */
  public readonly errors = input<SectionErrors>({});
  /** what the picker adds; and whether the add button adds several images or replaces the one image (picker and upload) */
  public readonly kind = input<'image' | 'video'>('image');
  public readonly multiple = input(true);
  /** card title and empty-list text; the image texts when unset */
  public readonly title = input('');
  public readonly emptyText = input('');
  /**
   * Travel journal: photos must come from SECTION_IMAGE_PICKER. Without one the list refuses to add, rather
   * than uploading private journal photos to the public bucket (and writing a document to Firestore).
   */
  public readonly requirePicker = input(false);
  /** picker only: the most images the list holds (a journal video's clips); the add button hides there. Unset = no cap. */
  public readonly max = input<number | undefined>();
  /** inside a host card (the article's «Bilder» card): no own card and title, only the add button and the list */
  public readonly embedded = input(false);
  /**
   * Article editor (spec 1.175 §7.6): every upload gets a storage name of its own. Otherwise a file with an equal name replaces
   * the stored one, and a published article changes before it is saved.
   */
  public readonly uniqueNames = input(false);
  /** false: the type of an image is neither shown nor offered (a mail has only pictures) */
  public readonly showType = input(true);
  /** false: nothing can be uploaded (the trial mode of the article editor); images can still be edited, sorted and removed */
  public readonly uploads = input(true);
  /**
   * Article editor: takes the uploaded images and what is found out about them later, instead of `images`. Asked for when the
   * upload starts, so it gets them even if this component shows another block or is gone by then.
   */
  public readonly uploadTarget = input<ImageUploadTarget | undefined>();

  // computed
  protected readonly imageErrors = computed(() => getImageErrors(this.errors()));
  protected readonly canAdd = computed(() => !!this.picker || (!this.requirePicker() && this.uploads()));
  protected readonly atMax = computed(() => { const max = this.max(); return max !== undefined && this.images().length >= max; });

  // constants
  private imgixBaseUrl = this.env.services.imgixBaseUrl;

  protected typeName(type: ImageType): string {
    return ImageType[type] ?? 'Image';
  }

  protected thumbnailUrl(img: ImageConfig): string {
    if (this.picker) return this.picker.thumbnailUrl(img);
    const url = img.url ?? '';
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return `${this.imgixBaseUrl}/${url}?${IMGIX_THUMBNAIL_PARAMS}`;
  }

  protected reorder(ev: CustomEvent<ItemReorderEventDetail>): void {
    // a copy: complete() also reorders the array it is given, which may belong to a step of the undo history
    this.images.set(ev.detail.complete([...this.images()]));
  }

  protected async addImages(): Promise<void> {
    if (this.readOnly()) return;
    if (this.picker) {
      await this.addPicked(this.picker);
      return;
    }
    if (this.requirePicker()) {
      console.error('ImagesConfiguration.addImages: SECTION_IMAGE_PICKER is required here but not provided; nothing is uploaded');
      return;
    }
    if (!this.uploads()) return;
    // what the host wants, as of now: it may show another block when the upload is done
    const target = this.uploadTarget();
    const uniqueNames = this.uniqueNames();
    // a single slot (the hero's cover or logo) takes one file, and that file replaces the image
    const files = this.multiple()
      ? await this.uploadService.pickMultipleFiles(IMAGE_MIMETYPES)
      : [await this.uploadService.pickFile(IMAGE_MIMETYPES)].filter((f): f is File => !!f);
    if (!files.length) return;

    const basePath = this.storagePath();
    // the storage path must be sanitized (spaces/umlauts break the image url); labels keep the raw name
    const paths = new Map(files.map(f => [f,
      `${basePath}/${uniqueNames ? uniqueFileName(f.name, crypto.randomUUID().slice(0, 8)) : sanitizeFileName(f.name)}`]));
    const pathOf = (f: File) => paths.get(f) ?? '';
    const uploads: UploadEntry[] = files.map(f => ({ file: f, fullPath: pathOf(f) }));

    const urls = await this.uploadService.uploadFiles(uploads, this.i18n().image_upload() ?? '');
    if (!urls) return;

    // only keep files whose upload to storage actually succeeded
    const uploaded = files.filter((_, idx) => !!urls[idx]);
    if (!uploaded.length) return;

    const newImages: ImageConfig[] = uploaded.map(f => ({
      label: f.name.replace(/\.[^.]+$/, ''),
      type: ImageType.Image,
      url: pathOf(f),
      actionUrl: '',
      altText: f.name.replace(/\.[^.]+$/, ''),
      overlay: '',
    }));

    // Adding the images to the section is the primary result and must not be lost
    // if the secondary DocumentModel bookkeeping fails. Update the model first.
    if (target) target.added(newImages);
    else this.images.update(imgs => this.multiple() ? [...imgs, ...newImages] : newImages.slice(0, 1));

    // Best-effort: persist a DocumentModel record per uploaded file. A failure
    // here (permission, offline, …) is logged but never discards the images above.
    const documentKeys = await Promise.all(files.map((f, idx) => {
      const downloadUrl = urls[idx];
      if (!downloadUrl) return Promise.resolve(undefined);
      return this.uploadService
        .createAndSaveDocument(f, this.env.tenantId, pathOf(f), downloadUrl, this.currentUser())
        .catch((ex: unknown) => { console.error('ImagesConfiguration.addImages: createAndSaveDocument failed', ex); return undefined; });
    }));

    // seed the attribution from each file's own IPTC/EXIF metadata; '' for the many files that carry none
    const credits = await Promise.all(files.map((f, idx) =>
      urls[idx] ? this.uploadService.readImageCredit(pathOf(f)) : Promise.resolve('')));

    // patch both back onto the images (keyed by storage path, because the list may have been
    // reordered or edited while the documents and metadata were being fetched)
    const patchByUrl = new Map<string, Partial<ImageConfig>>();
    files.forEach((f, idx) => {
      const patch: Partial<ImageConfig> = {};
      if (documentKeys[idx]) patch.documentKey = documentKeys[idx];
      if (credits[idx]) patch.credit = credits[idx];
      if (Object.keys(patch).length > 0) patchByUrl.set(pathOf(f), patch);
    });
    if (target) {
      const details = [...patchByUrl].map(([url, patch]): ImageDetails => ({ url, documentKey: patch.documentKey, credit: patch.credit }));
      if (details.length > 0) target.details(details);
    } else if (patchByUrl.size > 0) {
      this.images.update(imgs => imgs.map(img => {
        const patch = patchByUrl.get(img.url);
        if (!patch) return img;
        // never overwrite a value the user has already typed
        return {
          ...img,
          documentKey: img.documentKey || patch.documentKey || '',
          credit: img.credit || patch.credit || ''
        };
      }));
    }
  }

  /** picker: one image replaces the list, several are appended — never beyond `max` */
  private async addPicked(picker: SectionImagePicker): Promise<void> {
    const picked = await picker.pick(this.kind(), this.multiple());
    if (!picked.length) return;
    const max = this.max();
    this.images.update(imgs => {
      const next = this.multiple() ? [...imgs, ...picked] : picked.slice(0, 1);
      return max === undefined ? next : next.slice(0, max);
    });
  }

  protected async showActions(img: ImageConfig, index: number): Promise<void> {
    if (this.readOnly()) return;
    const i18n = this.i18n();
    const options: ActionSheetOptions = createActionSheetOptions(i18n.as_title());
    // a picked image is a reference (its key in label, no storage url): no storage detail, download or label edit
    if (!this.picker) {
      options.buttons.push(createActionSheetButton('image.detail', i18n.image_detail(), this.imgixBaseUrl, 'eye-on'));
      options.buttons.push(createActionSheetButton('image.download', i18n.image_download(), this.imgixBaseUrl, 'download'));
      options.buttons.push(createActionSheetButton('image.edit', i18n.image_edit_title(), this.imgixBaseUrl, 'edit'));
    }
    options.buttons.push(createActionSheetButton('image.delete', i18n.image_delete(), this.imgixBaseUrl, 'trash'));
    options.buttons.push(createActionSheetButton('cancel', i18n.cancel(), this.imgixBaseUrl, 'cancel-circle'));

    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;

    switch (data.action) {
      case 'image.detail':
        await this.showImageDetail(img);
        break;
      case 'image.download':
        await this.downloadImage(img);
        break;
      case 'image.edit':
        await this.editImage(img, index);
        break;
      case 'image.delete':
        this.images.update(imgs => imgs.filter((_, idx) => idx !== index));
        break;
    }
  }

  private async showImageDetail(img: ImageConfig): Promise<void> {
    const modal = await this.modalController.create({
      component: ImageDetailModal,
      componentProps: {
        fullPath: img.url,
        title: img.label || (img.url.split('/').pop() ?? ''),
      },
    });
    await modal.present();
    await modal.onWillDismiss();
  }

  private async downloadImage(img: ImageConfig): Promise<void> {
    // img.url is normally a relative storage path; resolve it to a download URL.
    const url = img.url.startsWith('http') ? img.url : await getDownloadURL(ref(this.storage, img.url));
    await downloadToBrowser(this.toastController, url);
  }

  private async editImage(img: ImageConfig, index: number): Promise<void> {
    const modal = await this.modalController.create({
      component: ImageEditModal,
      componentProps: {
        image: { ...img },
        showType: this.showType(),
        readOnly: this.readOnly(),
        i18n: this.i18n(),
      },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm' && data) {
      this.images.update(imgs => imgs.map((item, i) => i === index ? data as ImageConfig : item));
    }
  }
}
