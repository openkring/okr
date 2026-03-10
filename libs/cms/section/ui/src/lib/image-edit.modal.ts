import { AsyncPipe } from '@angular/common';
import { Component, inject, input, linkedSignal, model } from '@angular/core';
import {
  IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow, ModalController
} from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { ImageConfig, ImageType } from '@bk2/shared-models';
import { StringSelectComponent, TextInputComponent, HeaderComponent } from '@bk2/shared-ui';

const IMAGE_TYPE_NAMES = Object.keys(ImageType).filter(k => isNaN(Number(k)));

@Component({
  selector: 'bk-image-edit-modal',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    HeaderComponent,
    TextInputComponent, StringSelectComponent,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol,
  ],
  template: `
    <bk-header [title]="title()" [isModal]="true" [showOkButton]="true" (okClicked)="save()" />
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ '@content.section.image.edit.title' | translate | async }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12">
              <bk-text-input name="imageLabel" [value]="label()" (valueChange)="onFieldChange('label', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12">
              <bk-text-input name="imageUrl" [value]="url()" (valueChange)="onFieldChange('url', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12">
              <bk-text-input name="imageActionUrl" [value]="actionUrl()" (valueChange)="onFieldChange('actionUrl', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12">
              <bk-text-input name="imageAltText" [value]="altText()" (valueChange)="onFieldChange('altText', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12">
              <bk-text-input name="imageOverlay" [value]="overlay()" (valueChange)="onFieldChange('overlay', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12">
              <bk-string-select name="imageType" [selectedString]="typeName()" (selectedStringChange)="onTypeChange($event)" [stringList]="imageTypeNames" [readOnly]="readOnly()" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class ImageEditModalComponent {
  private readonly modalController = inject(ModalController);

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
