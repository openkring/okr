import { Component, computed, inject, input, signal } from '@angular/core';
import { IonButton, IonContent, IonIcon, ModalController, Platform } from '@ionic/angular/standalone';
import { signalStore, withProps } from '@ngrx/signals';

import { ENV } from '@bk2/shared-config';
import { I18nService } from '@bk2/shared-i18n';
import { IMAGE_CONFIG_SHAPE, ImageConfig, UserModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { ChangeConfirmation, ChangeConfirmationI18n, Header, ImageConfigEdit, ImageConfigI18n } from '@bk2/shared-ui';
import { coerceBoolean, getImgixUrlWithAutoParams } from '@bk2/shared-util-core';

import { UploadService } from '@bk2/avatar-data-access';
import { getDocumentStoragePath, pickPhoto } from '@bk2/document-util';

import { PFX } from './scope';

const ImageSelectStore = signalStore(
  withProps(() => ({ i18nService: inject(I18nService) })),
  withProps(store => ({
    i18n: store.i18nService.translateAll({
      title:                 PFX + 'image.add',
      upload:                PFX + 'image.upload',
      imgLabel_label:        PFX + 'imageConfig.label.label',
      imgLabel_placeholder:  PFX + 'imageConfig.label.placeholder',
      imgLabel_helper:       PFX + 'imageConfig.label.helper',
      imgUrl_label:          PFX + 'imageConfig.url.label',
      imgUrl_placeholder:    PFX + 'imageConfig.url.placeholder',
      imgUrl_helper:         PFX + 'imageConfig.url.helper',
      imgActionUrl_label:    PFX + 'imageConfig.actionUrl.label',
      imgActionUrl_placeholder: PFX + 'imageConfig.actionUrl.placeholder',
      imgActionUrl_helper:   PFX + 'imageConfig.actionUrl.helper',
      imgAltText_label:      PFX + 'imageConfig.altText.label',
      imgAltText_placeholder: PFX + 'imageConfig.altText.placeholder',
      imgAltText_helper:     PFX + 'imageConfig.altText.helper',
      imgOverlay_label:      PFX + 'imageConfig.overlay.label',
      imgOverlay_placeholder: PFX + 'imageConfig.overlay.placeholder',
      imgOverlay_helper:     PFX + 'imageConfig.overlay.helper',
      ok:                    '@ok',
      cancel:                '@cancel',
      save:                  '@save.label',
    }),
  })),
);

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
  providers: [ImageSelectStore],
  template: `
      <bk-header [i18n]="{ title: store.i18n.title() }" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
      }
      <ion-content class="ion-no-padding">
        <ion-button (click)="pickImage()">
          <ion-icon slot="start" src="{{'camera' | svgIcon }}" />
          {{ store.i18n.upload() }}
        </ion-button>
        <bk-image-config [formData]="formData()" [i18n]="imageConfigI18n()" (formDataChange)="onFormDataChange($event)" [readOnly]="isReadOnly()" />
      </ion-content>
  `
})
export class ImageSelectModal {
  protected readonly store = inject(ImageSelectStore);
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

  protected imageConfigI18n = computed(() => ({
    label:     { name: 'label',     label: this.store.i18n.imgLabel_label(),     placeholder: this.store.i18n.imgLabel_placeholder(),     helper: this.store.i18n.imgLabel_helper()     },
    url:       { name: 'url',       label: this.store.i18n.imgUrl_label(),       placeholder: this.store.i18n.imgUrl_placeholder(),       helper: this.store.i18n.imgUrl_helper()       },
    actionUrl: { name: 'actionUrl', label: this.store.i18n.imgActionUrl_label(), placeholder: this.store.i18n.imgActionUrl_placeholder(), helper: this.store.i18n.imgActionUrl_helper() },
    altText:   { name: 'altText',   label: this.store.i18n.imgAltText_label(),   placeholder: this.store.i18n.imgAltText_placeholder(),   helper: this.store.i18n.imgAltText_helper()   },
    overlay:   { name: 'overlay',   label: this.store.i18n.imgOverlay_label(),   placeholder: this.store.i18n.imgOverlay_placeholder(),   helper: this.store.i18n.imgOverlay_helper()   },
  } as ImageConfigI18n));

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
        const downloadUrl = await this.uploadService.uploadFile(file, path, '@document.operation.upload.single.title');
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