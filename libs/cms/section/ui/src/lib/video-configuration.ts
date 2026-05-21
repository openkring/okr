import { Component, computed, inject, input, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { TextInput, TextInputI18n } from '@bk2/shared-ui';
import { VideoConfig } from '@bk2/shared-models';
import { coerceBoolean } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import { PFX } from './scope';

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
  private readonly i18nService = inject(I18nService);

  // inputs
  public formData = model.required<VideoConfig>();
  public title = input('@content.section.type.video.edit');
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // linked signals (fields)
  protected url = linkedSignal(() => this.formData().url ?? '');
  protected width = linkedSignal(() => this.formData().width ?? '100%');
  protected height = linkedSignal(() => this.formData().height ?? 'auto');
  protected frameborder = linkedSignal(() => this.formData().frameborder ?? '0');
  protected baseUrl = linkedSignal(() => this.formData().baseUrl ?? 'https://www.youtube.com/embed/');

  protected readonly fieldI18n = this.i18nService.translateAll({
    youtubeId_label:       PFX + 'youtubeId.label',
    youtubeId_placeholder: PFX + 'youtubeId.placeholder',
    youtubeId_helper:      PFX + 'youtubeId.helper',
    width_label:           PFX + 'width.label',
    width_placeholder:     PFX + 'width.placeholder',
    width_helper:          PFX + 'width.helper',
    height_label:          PFX + 'height.label',
    height_placeholder:    PFX + 'height.placeholder',
    height_helper:         PFX + 'height.helper',
    frameborder_label:     PFX + 'frameborder.label',
    frameborder_placeholder: PFX + 'frameborder.placeholder',
    frameborder_helper:    PFX + 'frameborder.helper',
    baseUrl_label:         PFX + 'baseUrl.label',
    baseUrl_placeholder:   PFX + 'baseUrl.placeholder',
    baseUrl_helper:        PFX + 'baseUrl.helper',
  });

  protected youtubeIdI18n = computed(() => ({
    name: 'youtubeId',
    label: this.fieldI18n.youtubeId_label(),
    placeholder: this.fieldI18n.youtubeId_placeholder(),
    helper: this.fieldI18n.youtubeId_helper(),
  } as TextInputI18n));

  protected widthI18n = computed(() => ({
    name: 'width',
    label: this.fieldI18n.width_label(),
    placeholder: this.fieldI18n.width_placeholder(),
    helper: this.fieldI18n.width_helper(),
  } as TextInputI18n));

  protected heightI18n = computed(() => ({
    name: 'height',
    label: this.fieldI18n.height_label(),
    placeholder: this.fieldI18n.height_placeholder(),
    helper: this.fieldI18n.height_helper(),
  } as TextInputI18n));

  protected frameborderI18n = computed(() => ({
    name: 'frameborder',
    label: this.fieldI18n.frameborder_label(),
    placeholder: this.fieldI18n.frameborder_placeholder(),
    helper: this.fieldI18n.frameborder_helper(),
  } as TextInputI18n));

  protected baseUrlI18n = computed(() => ({
    name: 'baseUrl',
    label: this.fieldI18n.baseUrl_label(),
    placeholder: this.fieldI18n.baseUrl_placeholder(),
    helper: this.fieldI18n.baseUrl_helper(),
  } as TextInputI18n));

  /************************************** actions *********************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
