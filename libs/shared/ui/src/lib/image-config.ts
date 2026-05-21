import { Component, input, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { ImageConfig, ImageType } from '@bk2/shared-models';
import { ImageTypes } from '@bk2/shared-categories';

import { CategoryOld, CategoryOldI18n } from './category-old';
import { TextInput, TextInputI18n } from './text-input';

export interface ImageConfigI18n {
  label: TextInputI18n;
  type: CategoryOldI18n;
  url: TextInputI18n;
  actionUrl: TextInputI18n;
  altText: TextInputI18n;
  overlay: TextInputI18n;
}

@Component({
  selector: 'bk-image-config',
  standalone: true,
  imports: [
    
    IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid,
    TextInput, CategoryOld
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ title() }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        @if(intro(); as intro) {
          @if(intro.length > 0) {
            <small><div [innerHTML]="intro"></div></small>
          }
        }
        <ion-grid>
          <ion-row>
            <ion-col size="12">
              <bk-text-input [i18n]="i18n().label" [value]="label()" (valueChange)="onFieldChange('label', $event)" [readOnly]="readOnly()" [showHelper]=true />
            </ion-col>
            <ion-col size="12">
                <bk-category-old [i18n]="i18n().type" [value]="type()" (valueChange)="onFieldChange('type', $event)" [readOnly]="readOnly()" [categories]="imageTypes" />
            </ion-col>
            <ion-col size="12">
              <bk-text-input [i18n]="i18n().url" [value]="url()" (valueChange)="onFieldChange('url', $event)" [readOnly]="readOnly()" [copyable]="true" [showHelper]=true [maxLength]="500" />
            </ion-col>
            <ion-col size="12">
              <bk-text-input [i18n]="i18n().actionUrl" [value]="actionUrl()" (valueChange)="onFieldChange('actionUrl', $event)" [readOnly]="readOnly()" [copyable]="true" [showHelper]=true [maxLength]="500" />
            </ion-col>
            <ion-col size="12">
              <bk-text-input [i18n]="i18n().altText" [value]="altText()" (valueChange)="onFieldChange('altText', $event)" [readOnly]="readOnly()" [copyable]="true" [showHelper]=true [maxLength]="500" />
            </ion-col>
            <ion-col size="12">
              <bk-text-input [i18n]="i18n().overlay" [value]="overlay()" (valueChange)="onFieldChange('overlay', $event)" [readOnly]="readOnly()" [copyable]="true" [showHelper]=true [maxLength]="100" />
            </ion-col>  
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class ImageConfigEdit {
  // inputs
  public formData = model.required<ImageConfig>();
  public i18n = input.required<ImageConfigI18n>();
  public title = input('@content.section.forms.imageConfig.title');
  public subTitle = input('@content.section.forms.imageConfig.subtitle');
  public intro = input<string>();
  public readonly readOnly = input(true);

  // linked signals (fields)
  protected label = linkedSignal(() => this.formData().label ?? '');
  protected type = linkedSignal(() => this.formData().type ?? ImageType.Image);
  protected url = linkedSignal(() => this.formData().url ?? '');
  protected actionUrl = linkedSignal(() => this.formData().actionUrl ?? '');
  protected altText = linkedSignal(() => this.formData().altText ?? '');
  protected overlay = linkedSignal(() => this.formData().overlay ?? '');

  // passing constants to the template
  protected imageTypes = ImageTypes;

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | ImageType): void {
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }
}
