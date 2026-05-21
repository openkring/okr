import { Component, computed, inject, input, linkedSignal, model } from '@angular/core';
import {
  IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow, ModalController
} from '@ionic/angular/standalone';

import { ImageConfig, ImageType } from '@bk2/shared-models';
import { StringSelect, StringSelectI18n, TextInput, TextInputI18n, Header } from '@bk2/shared-ui';
import { I18nService } from '@bk2/shared-i18n';

import { PFX } from './scope';

const IMAGE_TYPE_NAMES = Object.keys(ImageType).filter(k => isNaN(Number(k)));

@Component({
  selector: 'bk-image-edit-modal',
  standalone: true,
  imports: [
    Header,
    TextInput, StringSelect,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol,
  ],
  template: `
    <bk-header [i18n]="{ title: title() }" [isModal]="true" [showOkButton]="true" (okClicked)="save()" />
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ '@content.section.image.edit.title' }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12">
              <bk-text-input [i18n]="labelI18n()" [value]="label()" (valueChange)="onFieldChange('label', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12">
              <bk-text-input [i18n]="urlI18n()" [value]="url()" (valueChange)="onFieldChange('url', $event)" [maxLength]="500" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12">
              <bk-text-input [i18n]="actionUrlI18n()" [value]="actionUrl()" (valueChange)="onFieldChange('actionUrl', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12">
              <bk-text-input [i18n]="altTextI18n()" [value]="altText()" (valueChange)="onFieldChange('altText', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12">
              <bk-text-input [i18n]="overlayI18n()" [value]="overlay()" (valueChange)="onFieldChange('overlay', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12">
              <bk-string-select [i18n]="imageTypeI18n()" [selectedString]="typeName()" (selectedStringChange)="onTypeChange($event)" [stringList]="imageTypeNames" [readOnly]="readOnly()" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class ImageEditModal {
  private readonly modalController = inject(ModalController);
  private readonly i18nService = inject(I18nService);

  // inputs
  public formData = model.required<ImageConfig>();
  public title = input('@content.section.image.edit.header');
  public readOnly = input<boolean>(true);

  // linked signals for fields
  protected label = linkedSignal(() => this.formData().label ?? '');
  protected url = linkedSignal(() => this.formData().url ?? '');
  protected actionUrl = linkedSignal(() => this.formData().actionUrl ?? '');
  protected altText = linkedSignal(() => this.formData().altText ?? '');
  protected overlay = linkedSignal(() => this.formData().overlay ?? '');
  protected typeName = linkedSignal(() => ImageType[this.formData().type] ?? 'Image');

  protected imageTypeNames = IMAGE_TYPE_NAMES;

  protected readonly fieldI18n = this.i18nService.translateAll({
    label_label:       PFX + 'label.label',
    label_placeholder: PFX + 'label.placeholder',
    label_helper:      PFX + 'label.helper',
    url_label:         PFX + 'url.label',
    url_placeholder:   PFX + 'url.placeholder',
    url_helper:        PFX + 'url.helper',
    actionUrl_label:       PFX + 'actionUrl.label',
    actionUrl_placeholder: PFX + 'actionUrl.placeholder',
    actionUrl_helper:      PFX + 'actionUrl.helper',
    altText_label:         PFX + 'altText.label',
    altText_placeholder:   PFX + 'altText.placeholder',
    altText_helper:        PFX + 'altText.helper',
    overlay_label:         PFX + 'overlay.label',
    overlay_placeholder:   PFX + 'overlay.placeholder',
    overlay_helper:        PFX + 'overlay.helper',
    imageType_label:       PFX + 'imageType.label',
  });

  protected labelI18n = computed(() => ({
    name: 'imageLabel',
    label: this.fieldI18n.label_label(),
    placeholder: this.fieldI18n.label_placeholder(),
    helper: this.fieldI18n.label_helper(),
  } as TextInputI18n));

  protected urlI18n = computed(() => ({
    name: 'imageUrl',
    label: this.fieldI18n.url_label(),
    placeholder: this.fieldI18n.url_placeholder(),
    helper: this.fieldI18n.url_helper(),
  } as TextInputI18n));

  protected actionUrlI18n = computed(() => ({
    name: 'imageActionUrl',
    label: this.fieldI18n.actionUrl_label(),
    placeholder: this.fieldI18n.actionUrl_placeholder(),
    helper: this.fieldI18n.actionUrl_helper(),
  } as TextInputI18n));

  protected altTextI18n = computed(() => ({
    name: 'imageAltText',
    label: this.fieldI18n.altText_label(),
    placeholder: this.fieldI18n.altText_placeholder(),
    helper: this.fieldI18n.altText_helper(),
  } as TextInputI18n));

  protected overlayI18n = computed(() => ({
    name: 'imageOverlay',
    label: this.fieldI18n.overlay_label(),
    placeholder: this.fieldI18n.overlay_placeholder(),
    helper: this.fieldI18n.overlay_helper(),
  } as TextInputI18n));
  protected imageTypeI18n = computed(() => ({ name: 'imageType', label: this.fieldI18n.imageType_label() } as StringSelectI18n));

  protected onFieldChange(field: keyof ImageConfig, value: string): void {
    this.formData.update(vm => ({ ...vm, [field]: value }));
  }

  protected onTypeChange(name: string): void {
    const type = ImageType[name as keyof typeof ImageType];
    if (type !== undefined) {
      this.formData.update(vm => ({ ...vm, type }));
    }
  }

  protected save(): void {
    this.modalController.dismiss(this.formData(), 'confirm');
  }
}
