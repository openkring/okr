import { Component, computed, input, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { TextInputComponent } from '@bk2/shared-ui';
import { VideoConfig } from '@bk2/shared-models';
import { coerceBoolean } from '@bk2/shared-util-core';
import { TranslatePipe } from '@bk2/shared-i18n';

@Component({
  selector: 'bk-video-config',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonCardHeader, IonCardTitle,
    TextInputComponent, 
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ title() | translate | async }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="12">
                <bk-text-input name="youtubeId" [value]="url()" (valueChange)="onFieldChange('url', $event)" [maxLength]=11 [readOnly]="isReadOnly()" [showHelper]=true />                                        
              </ion-col>
                      <ion-col size="12">
                <bk-text-input name="width" [value]="width()" (valueChange)="onFieldChange('width', $event)" [maxLength]=11 [readOnly]="isReadOnly()" [showHelper]=true />                                        
              </ion-col>
              <ion-col size="12">
                <bk-text-input name="height" [value]="height()" (valueChange)="onFieldChange('height', $event)" [maxLength]=11 [readOnly]="isReadOnly()" [showHelper]=true />                                        
              </ion-col>
              <ion-col size="12">
                <bk-text-input name="frameborder" [value]="frameborder()" (valueChange)="onFieldChange('frameborder', $event)" [maxLength]=4 [readOnly]="isReadOnly()" [showHelper]=true />                                        
              </ion-col>
              <ion-col size="12">
                <bk-text-input name="baseUrl" [value]="baseUrl()" (valueChange)="onFieldChange('baseUrl', $event)" [maxLength]=100 [readOnly]="isReadOnly()" [showHelper]=true />                                        
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
    `
})
export class VideoConfigComponent {
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

  /************************************** actions *********************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
} 