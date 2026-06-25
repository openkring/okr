import { Component, computed, input, linkedSignal, model, output, Signal } from '@angular/core';
import { IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonIcon, IonRow } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared-pipes';

import { ImageConfig, ImageType } from '@bk2/shared-models';
import { ImageTypes } from '@bk2/shared-categories';

import { CategoryOld } from './category-old';
import { TextInput, TextInputI18n } from './text-input';

export interface ImageConfigI18n {
  image_edit:         Signal<string>;
  image_type_name:    Signal<string>;
  image_type_label:   Signal<string>;
  image_type_helper:  Signal<string>;
  label_label:       Signal<string>;
  label_placeholder: Signal<string>;
  label_helper:      Signal<string>;
  url_label:         Signal<string>;
  url_placeholder:   Signal<string>;
  url_helper:        Signal<string>;
  actionUrl_label:       Signal<string>;
  actionUrl_placeholder: Signal<string>;
  actionUrl_helper:      Signal<string>;
  altText_label:         Signal<string>;
  altText_placeholder:   Signal<string>;
  altText_helper:        Signal<string>;
  overlay_label:          Signal<string>;
  overlay_placeholder:    Signal<string>;
  overlay_helper:         Signal<string>;
}

@Component({
  selector: 'bk-image-config',
  standalone: true,
  imports: [
    IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonIcon, IonRow,
    TextInput, CategoryOld, SvgIconPipe
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <ion-card>
      <ion-card-header>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <ion-card-title>{{ i18n().image_edit() }}</ion-card-title>
          @if(!readOnly() && storagePath()) {
            <ion-buttons>
              <ion-button (click)="uploadRequested.emit()">
                <ion-icon slot="icon-only" src="{{'add-circle' | svgIcon}}" />
              </ion-button>
            </ion-buttons>
          }
        </div>
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
              <bk-text-input [i18n]="urlI18n()" [value]="url()" (valueChange)="onFieldChange('url', $event)" [readOnly]="readOnly()" [copyable]="true" [showHelper]=true [maxLength]="500" />
            </ion-col>
            <ion-col size="12">
              <bk-text-input [i18n]="altTextI18n()" [value]="altText()" (valueChange)="onFieldChange('altText', $event)" [readOnly]="readOnly()" [copyable]="true" [showHelper]=true [maxLength]="500" />
            </ion-col>
            @if(showAdvanced()) {
              <ion-col size="12">
                <bk-text-input [i18n]="labelI18n()" [value]="label()" (valueChange)="onFieldChange('label', $event)" [readOnly]="readOnly()" [showHelper]=true />
              </ion-col>
              <ion-col size="12">
                <bk-category-old [i18n]="typeI18n()" [value]="type()" (valueChange)="onFieldChange('type', $event)" [readOnly]="readOnly()" [categories]="imageTypes" />
              </ion-col>
              <ion-col size="12">
                <bk-text-input [i18n]="actionUrlI18n()" [value]="actionUrl()" (valueChange)="onFieldChange('actionUrl', $event)" [readOnly]="readOnly()" [copyable]="true" [showHelper]=true [maxLength]="500" />
              </ion-col>
              <ion-col size="12">
                <bk-text-input [i18n]="overlayI18n()" [value]="overlay()" (valueChange)="onFieldChange('overlay', $event)" [readOnly]="readOnly()" [copyable]="true" [showHelper]=true [maxLength]="100" />
              </ion-col>
            }
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
  public intro = input<string>();
  public readonly readOnly = input(true);
  public storagePath = input<string>();
  public readonly showAdvanced = input(false);

  // outputs
  public readonly uploadRequested = output<void>();

  // linked signals (fields)
  protected label = linkedSignal(() => this.formData().label ?? '');
  protected type = linkedSignal(() => this.formData().type ?? ImageType.Image);
  protected url = linkedSignal(() => this.formData().url ?? '');
  protected actionUrl = linkedSignal(() => this.formData().actionUrl ?? '');
  protected altText = linkedSignal(() => this.formData().altText ?? '');
  protected overlay = linkedSignal(() => this.formData().overlay ?? '');

  // derived
  protected labelI18n = computed(() => ({ name: 'label', label: this.i18n().label_label(), placeholder: this.i18n().label_placeholder(), helper: this.i18n().label_helper()} as TextInputI18n));
  protected typeI18n = computed(() => ({ name: 'type', label: this.i18n().label_label(), placeholder: this.i18n().label_placeholder(), helper: this.i18n().label_helper()} as TextInputI18n));
  protected urlI18n = computed(() => ({ name: 'url', label: this.i18n().url_label(), placeholder: this.i18n().url_placeholder(), helper: this.i18n().url_helper()} as TextInputI18n));
  protected actionUrlI18n = computed(() => ({ name: 'actionUrl', label: this.i18n().actionUrl_label(), placeholder: this.i18n().actionUrl_placeholder(), helper: this.i18n().actionUrl_helper()} as TextInputI18n));
  protected altTextI18n = computed(() => ({ name: 'altText', label: this.i18n().altText_label(), placeholder: this.i18n().altText_placeholder(), helper: this.i18n().altText_helper()} as TextInputI18n));
  protected overlayI18n = computed(() => ({ name: 'overlay', label: this.i18n().overlay_label(), placeholder: this.i18n().overlay_placeholder(), helper: this.i18n().overlay_helper()} as TextInputI18n));

  // passing constants to the template
  protected imageTypes = ImageTypes;

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | ImageType): void {
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }
}
