import { Component, computed, inject, input, linkedSignal, model, signal, Signal } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonNote, IonRow, ModalController } from '@ionic/angular/standalone';

import { UploadService } from '@okr/avatar-data-access';
import { ImageConfig, ImageType } from '@okr/shared-models';
import { StringSelect, StringSelectI18n, TextInput, TextInputI18n, Header } from '@okr/shared-ui';
import { SectionI18n } from '@okr/cms-section-util';
import { dismissOverlay } from '@okr/shared-util-angular';

const IMAGE_TYPE_NAMES = Object.keys(ImageType).filter(k => isNaN(Number(k)));

@Component({
  selector: 'okr-image-edit-modal',
  standalone: true,
  imports: [
    Header,
    TextInput, StringSelect,
    IonButton, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonNote, IonRow, IonCol,
  ],
  template: `
    <okr-header [i18n]="{ title: i18n().image_edit_title() }" [isModal]="true" [showOkButton]="true" (okClicked)="save()" />
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().image_edit_title() }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12">
              <okr-text-input [i18n]="labelI18n()" [value]="label()" (valueChange)="onFieldChange('label', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12">
              <okr-text-input [i18n]="urlI18n()" [value]="url()" (valueChange)="onFieldChange('url', $event)" [maxLength]="500" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12">
              <okr-text-input [i18n]="actionUrlI18n()" [value]="actionUrl()" (valueChange)="onFieldChange('actionUrl', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12">
              <okr-text-input [i18n]="altTextI18n()" [value]="altText()" (valueChange)="onFieldChange('altText', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12">
              <okr-text-input [i18n]="overlayI18n()" [value]="overlay()" (valueChange)="onFieldChange('overlay', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12">
              <okr-text-input [i18n]="creditI18n()" [value]="credit()" (valueChange)="onFieldChange('credit', $event)" [maxLength]="150" [readOnly]="readOnly()" />
              @if(!readOnly() && url()) {
                <ion-button size="small" fill="clear" [disabled]="readingCredit()" (click)="readCreditFromFile()">
                  {{ i18n().image_edit_credit_read() }}
                </ion-button>
                @if(creditWasEmpty()) {
                  <ion-note class="ion-padding-start" color="medium">{{ i18n().image_edit_credit_read_empty() }}</ion-note>
                }
              }
            </ion-col>
            <ion-col size="12">
              <okr-string-select [i18n]="imageTypeI18n()" [selectedString]="typeName()" (selectedStringChange)="onTypeChange($event)" [stringList]="imageTypeNames" [readOnly]="readOnly()" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class ImageEditModal {
  private readonly modalController = inject(ModalController);
  private readonly uploadService = inject(UploadService);

  // state of the "read attribution from the image file" action
  protected readonly readingCredit = signal(false);
  protected readonly creditWasEmpty = signal(false);

  // inputs
  public formData = model.required<ImageConfig>();
  public readOnly = input<boolean>(true);
  public readonly i18n = input.required<SectionI18n>();

  // linked signals for fields
  protected label = linkedSignal(() => this.formData().label ?? '');
  protected url = linkedSignal(() => this.formData().url ?? '');
  protected actionUrl = linkedSignal(() => this.formData().actionUrl ?? '');
  protected altText = linkedSignal(() => this.formData().altText ?? '');
  protected overlay = linkedSignal(() => this.formData().overlay ?? '');
  protected credit = linkedSignal(() => this.formData().credit ?? '');
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

  protected creditI18n = computed(() => ({
    name: 'imageCredit',
    label: this.i18n().image_edit_credit_label(),
    placeholder: this.i18n().image_edit_credit_placeholder(),
    helper: this.i18n().image_edit_credit_helper(),
  } as TextInputI18n));
  protected imageTypeI18n = computed(() => ({ name: 'imageType', label: this.i18n().image_edit_type_label() } as StringSelectI18n));

  protected onFieldChange(field: keyof ImageConfig, value: string): void {
    this.formData.update(vm => ({ ...vm, [field]: value }));
  }

  /**
   * Reads the attribution embedded in the image file (IPTC/EXIF) and puts it into the credit field.
   *
   * This is the manual counterpart to the automatic read at upload time. It covers the two cases the
   * upload-time read cannot: images added before the feature existed, and a cold file whose metadata
   * was not available through imgix yet. It overwrites whatever is in the field, because the user
   * asked for it explicitly.
   */
  protected async readCreditFromFile(): Promise<void> {
    if (this.readOnly()) return;
    this.readingCredit.set(true);
    this.creditWasEmpty.set(false);
    try {
      const credit = await this.uploadService.readImageCredit(this.url());
      if (credit) this.onFieldChange('credit', credit);
      else this.creditWasEmpty.set(true);
    } finally {
      this.readingCredit.set(false);
    }
  }

  protected onTypeChange(name: string): void {
    const type = ImageType[name as keyof typeof ImageType];
    if (type !== undefined) {
      this.formData.update(vm => ({ ...vm, type }));
    }
  }

  protected save(): void {
    dismissOverlay(this.modalController, this.formData(), 'confirm');
  }
}
