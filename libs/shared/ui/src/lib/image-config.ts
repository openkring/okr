import { AsyncPipe } from '@angular/common';
import { Component, input, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonNote, IonRow } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { ImageConfig, ImageType } from '@bk2/shared-models';
import { CategoryComponent, TextInputComponent } from '@bk2/shared-ui';
import { ImageTypes } from '@bk2/shared-categories';

@Component({
  selector: 'bk-image-config',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid,
    TextInputComponent, CategoryComponent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ title() | translate | async }}</ion-card-title>
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
              <bk-text-input name="label" [value]="label()" (valueChange)="onFieldChange('label', $event)" [readOnly]="readOnly()" [showHelper]=true />
            </ion-col>
            <ion-col size="12">
                <bk-cat name="type" [value]="type()" (valueChange)="onFieldChange('type', $event)" [readOnly]="readOnly()" [categories]="imageTypes" />
            </ion-col>  
            <ion-col size="12"> 
              <bk-text-input name="url" [value]="url()" (valueChange)="onFieldChange('url', $event)" [readOnly]="readOnly()" [copyable]="true" [showHelper]=true />
            </ion-col>  
            <ion-col size="12">  
              <bk-text-input name="actionUrl" [value]="actionUrl()" (valueChange)="onFieldChange('actionUrl', $event)" [readOnly]="readOnly()" [copyable]="true" [showHelper]=true />
            </ion-col>
            <ion-col size="12">
              <bk-text-input name="altText" [value]="altText()" (valueChange)="onFieldChange('altText', $event)" [readOnly]="readOnly()" [copyable]="true" [showHelper]=true />
            </ion-col>  
            <ion-col size="12">
              <bk-text-input name="overlay" [value]="overlay()" (valueChange)="onFieldChange('overlay', $event)" [readOnly]="readOnly()" [copyable]="true" [showHelper]=true />
            </ion-col>  
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class ImageConfigComponent {
  // inputs
  public formData = model.required<ImageConfig>();
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
