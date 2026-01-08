import { AsyncPipe } from '@angular/common';
import { Component, input, linkedSignal, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { TranslatePipe } from '@bk2/shared-i18n';
import { AlbumConfig } from '@bk2/shared-models';
import { CategoryComponent, CheckboxComponent, TextInputComponent } from '@bk2/shared-ui';
import { GalleryEffects } from '@bk2/shared-categories';

import { AlbumStyles } from '@bk2/cms-section-util';

@Component({
  selector: 'bk-album-config',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    vestForms, FormsModule,
    TextInputComponent, CategoryComponent, CheckboxComponent,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol
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
              <bk-text-input name="directory" [value]="directory()" (valueChange)="onFieldChange('directory', $event)"  [readOnly]="readOnly()" [showHelper]=true />
            </ion-col>
            <ion-col size="12" size-md="6"> 
              <bk-cat name="albumStyle" [value]="albumStyle()" (valueChange)="onFieldChange('albumStyle', $event)" [categories]="albumStyles" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox name="recursive" [checked]="recursive()" (checkedChange)="onFieldChange('recursive', $event)" [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox name="showVideos" [checked]="showVideos()" (checkedChange)="onFieldChange('showVideos', $event)" [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox name="showStreamingVideos" [checked]="showStreamingVideos()" (checkedChange)="onFieldChange('showStreamingVideos', $event)" [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox name="showDocs" [checked]="showDocs()" (checkedChange)="onFieldChange('showDocs', $event)" [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">        
              <bk-checkbox name="showPdfs" [checked]="showPdfs()" (checkedChange)="onFieldChange('showPdfs', $event)" [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat name="effect" [value]="effect()" (valueChange)="onFieldChange('effect', $event)" [categories]="galleryEffects" [readOnly]="readOnly()" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class AlbumConfigComponent {
  // inputs
  public formData = model.required<AlbumConfig>();
  public title = input('@content.section.type.album.edit');
  public intro = input<string>();
  public readonly readOnly = input(true);

  // linked signals (fields)
  protected directory = linkedSignal(() => this.formData().directory);
  protected albumStyle = linkedSignal(() => this.formData().albumStyle);
  protected imageStyle = linkedSignal(() => this.formData().imageStyle);
  protected recursive = linkedSignal(() => this.formData().recursive);
  protected showVideos = linkedSignal(() => this.formData().showVideos);
  protected showStreamingVideos = linkedSignal(() => this.formData().showStreamingVideos);
  protected showDocs = linkedSignal(() => this.formData().showDocs);
  protected showPdfs = linkedSignal(() => this.formData().showPdfs);
  protected effect = linkedSignal(() => this.formData().effect);

  // passing constants to template
  protected albumStyles = AlbumStyles;
  protected galleryEffects = GalleryEffects;

    /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, $event: string | string[] | number | boolean): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
  }
}
