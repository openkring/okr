import { Component, computed, inject, input, linkedSignal, model, Signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { TextInput, TextInputI18n } from '@bk2/shared-ui';
import { VideoConfig } from '@bk2/shared-models';
import { coerceBoolean } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

interface VideoConfI18n {
  video_youtubeId_label:       Signal<string>,
  video_youtubeId_placeholder: Signal<string>,
  video_youtubeId_helper:      Signal<string>,
  video_width_label:           Signal<string>,
  video_width_placeholder:     Signal<string>,
  video_width_helper:          Signal<string>,
  video_height_label:          Signal<string>,
  video_height_placeholder:    Signal<string>,
  video_height_helper:         Signal<string>,
  video_frameborder_label:     Signal<string>,
  video_frameborder_placeholder: Signal<string>,
  video_frameborder_helper:    Signal<string>,
  video_baseUrl_label:         Signal<string>,
  video_baseUrl_placeholder:   Signal<string>,
  video_baseUrl_helper:        Signal<string>,
}

@Component({
  selector: 'bk-video-config',
  standalone: true,
  imports: [
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonCardHeader, IonCardTitle,
    TextInput,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="12">
                <bk-text-input [i18n]="youtubeIdI18n()" [value]="url()" (valueChange)="onFieldChange('url', $event)" [maxLength]=11 [readOnly]="isReadOnly()" [showHelper]=true />
              </ion-col>
              <ion-col size="12">
                <bk-text-input [i18n]="widthI18n()" [value]="width()" (valueChange)="onFieldChange('width', $event)" [maxLength]=11 [readOnly]="isReadOnly()" [showHelper]=true />
              </ion-col>
              <ion-col size="12">
                <bk-text-input [i18n]="heightI18n()" [value]="height()" (valueChange)="onFieldChange('height', $event)" [maxLength]=11 [readOnly]="isReadOnly()" [showHelper]=true />
              </ion-col>
              <ion-col size="12">
                <bk-text-input [i18n]="frameborderI18n()" [value]="frameborder()" (valueChange)="onFieldChange('frameborder', $event)" [maxLength]=4 [readOnly]="isReadOnly()" [showHelper]=true />
              </ion-col>
              <ion-col size="12">
                <bk-text-input [i18n]="baseUrlI18n()" [value]="baseUrl()" (valueChange)="onFieldChange('baseUrl', $event)" [maxLength]=100 [readOnly]="isReadOnly()" [showHelper]=true />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
    `
})
export class VideoConfiguration {
  // inputs
  public formData = model.required<VideoConfig>();
  public title = input('@content.section.type.video.edit');
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  public readonly i18n = input.required<VideoConfI18n>();

  // linked signals (fields)
  protected url = linkedSignal(() => this.formData().url ?? '');
  protected width = linkedSignal(() => this.formData().width ?? '100%');
  protected height = linkedSignal(() => this.formData().height ?? 'auto');
  protected frameborder = linkedSignal(() => this.formData().frameborder ?? '0');
  protected baseUrl = linkedSignal(() => this.formData().baseUrl ?? 'https://www.youtube.com/embed/');

  protected youtubeIdI18n = computed(() => ({
    name: 'youtubeId',
    label: this.i18n().video_youtubeId_label(),
    placeholder: this.i18n().video_youtubeId_placeholder(),
    helper: this.i18n().video_youtubeId_helper(),
  } as TextInputI18n));

  protected widthI18n = computed(() => ({
    name: 'width',
    label: this.i18n().video_width_label(),
    placeholder: this.i18n().video_width_placeholder(),
    helper: this.i18n().video_width_helper(),
  } as TextInputI18n));

  protected heightI18n = computed(() => ({
    name: 'height',
    label: this.i18n().video_height_label(),
    placeholder: this.i18n().video_height_placeholder(),
    helper: this.i18n().video_height_helper(),
  } as TextInputI18n));

  protected frameborderI18n = computed(() => ({
    name: 'frameborder',
    label: this.i18n().video_frameborder_label(),
    placeholder: this.i18n().video_frameborder_placeholder(),
    helper: this.i18n().video_frameborder_helper(),
  } as TextInputI18n));

  protected baseUrlI18n = computed(() => ({
    name: 'baseUrl',
    label: this.i18n().video_baseUrl_label(),
    placeholder: this.i18n().video_baseUrl_placeholder(),
    helper: this.i18n().video_baseUrl_helper(),
  } as TextInputI18n));

  /************************************** actions *********************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
