import { Component, computed, inject, input, linkedSignal, model, Signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow, ModalController } from '@ionic/angular/standalone';

import { ImageConfig, ImageType } from '@bk2/shared-models';
import { StringSelect, StringSelectI18n, TextInput, TextInputI18n, Header } from '@bk2/shared-ui';

interface ImageEditI18n {
  image_edit_title:                  Signal<string>;
  image_edit_label_label:            Signal<string>;
  image_edit_label_placeholder:      Signal<string>;
  image_edit_label_helper:           Signal<string>;
  image_edit_url_label:              Signal<string>;
  image_edit_url_placeholder:        Signal<string>;
  image_edit_url_helper:             Signal<string>;
  image_edit_action_label:           Signal<string>;
  image_edit_action_placeholder:     Signal<string>;
  image_edit_action_helper:          Signal<string>;
  altText_label:                     Signal<string>;
  altText_placeholder:               Signal<string>;
  altText_helper:                    Signal<string>;
  image_edit_overlay_label:          Signal<string>;
  image_edit_overlay_placeholder:    Signal<string>;
  image_edit_overlay_helper:         Signal<string>;
  image_edit_type_label:             Signal<string>;
}

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
    <bk-header [i18n]="{ title: i18n().image_edit_title() }" [isModal]="true" [showOkButton]="true" (okClicked)="save()" />
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

  // inputs
  public formData = model.required<ImageConfig>();
  public readOnly = input<boolean>(true);
  public readonly i18n = input.required<ImageEditI18n>();

  // linked signals for fields
  protected label = linkedSignal(() => this.formData().label ?? '');
  protected url = linkedSignal(() => this.formData().url ?? '');
  protected actionUrl = linkedSignal(() => this.formData().actionUrl ?? '');
  protected altText = linkedSignal(() => this.formData().altText ?? '');
  protected overlay = linkedSignal(() => this.formData().overlay ?? '');
  protected typeName = linkedSignal(() => ImageType[this.formData().type] ?? 'Image');

  protected imageTypeNames = IMAGE_TYPE_NAMES;

  protected labelI18n = computed(() => ({
    name: 'imageLabel',
    label: this.i18n().image_edit_label_label(),
    placeholder: this.i18n().image_edit_label_placeholder(),
    helper: this.i18n().image_edit_label_helper(),
  } as TextInputI18n));

  protected urlI18n = computed(() => ({
    name: 'imageUrl',
    label: this.i18n().image_edit_url_label(),
    placeholder: this.i18n().image_edit_url_placeholder(),
    helper: this.i18n().image_edit_url_helper(),
  } as TextInputI18n));

  protected actionUrlI18n = computed(() => ({
    name: 'imageActionUrl',
    label: this.i18n().image_edit_action_label(),
    placeholder: this.i18n().image_edit_action_placeholder(),
    helper: this.i18n().image_edit_action_helper(),
  } as TextInputI18n));

  protected altTextI18n = computed(() => ({
    name: 'imageAltText',
    label: this.i18n().altText_label(),
    placeholder: this.i18n().altText_placeholder(),
    helper: this.i18n().altText_helper(),
  } as TextInputI18n));

  protected overlayI18n = computed(() => ({
    name: 'imageOverlay',
    label: this.i18n().image_edit_overlay_label(),
    placeholder: this.i18n().image_edit_overlay_placeholder(),
    helper: this.i18n().image_edit_overlay_helper(),
  } as TextInputI18n));
  protected imageTypeI18n = computed(() => ({ name: 'imageType', label: this.i18n().image_edit_type_label() } as StringSelectI18n));

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
