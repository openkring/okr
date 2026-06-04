import { Component, computed, input, linkedSignal, model, Signal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { AlbumConfig } from '@bk2/shared-models';
import { CategoryOld, CategoryOldI18n, Checkbox, CheckboxI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { GalleryEffects } from '@bk2/shared-categories';

import { AlbumStyles, SectionI18n } from '@bk2/cms-section-util';

@Component({
  selector: 'bk-album-config',
  standalone: true,
  imports: [
    vestForms, FormsModule,
    TextInput, CategoryOld, Checkbox,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().album_edit() }}</ion-card-title>
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
              <bk-text-input [i18n]="directoryI18n()" [value]="directory()" (valueChange)="onFieldChange('directory', $event)"  [readOnly]="readOnly()" [showHelper]=true />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-category-old [i18n]="albumStyleI18n()" [value]="albumStyle()" (valueChange)="onFieldChange('albumStyle', $event)" [categories]="albumStyles" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox [i18n]="recursiveI18n()" [checked]="recursive()" (checkedChange)="onFieldChange('recursive', $event)" [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox [i18n]="showVideosI18n()" [checked]="showVideos()" (checkedChange)="onFieldChange('showVideos', $event)" [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox [i18n]="showStreamingVideosI18n()" [checked]="showStreamingVideos()" (checkedChange)="onFieldChange('showStreamingVideos', $event)" [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox [i18n]="showDocsI18n()" [checked]="showDocs()" (checkedChange)="onFieldChange('showDocs', $event)" [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox [i18n]="showPdfsI18n()" [checked]="showPdfs()" (checkedChange)="onFieldChange('showPdfs', $event)" [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-category-old [i18n]="effectI18n()" [value]="effect()" (valueChange)="onFieldChange('effect', $event)" [categories]="galleryEffects" [readOnly]="readOnly()" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class AlbumConfiguration {
  // inputs
  public formData = model.required<AlbumConfig>();
  public intro = input<string>();
  public readonly readOnly = input(true);
  public readonly i18n = input.required<SectionI18n>();

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

  protected directoryI18n = computed(() => ({
    name: 'directory',
    label: this.i18n().album_directory_label(),
    placeholder: this.i18n().album_directory_placeholder(),
    helper: this.i18n().album_directory_helper(),
  } as TextInputI18n));
  protected albumStyleI18n = computed(() => ({ name: 'albumStyle', label: this.i18n().album_style_label() } as CategoryOldI18n));
  protected effectI18n     = computed(() => ({ name: 'effect',     label: this.i18n().album_effect_label()     } as CategoryOldI18n));

  protected recursiveI18n = computed(() => ({
    name: 'recursive',
    label: this.i18n().album_recursive_label(),
    helper: this.i18n().album_recursive_helper(),
  } as CheckboxI18n));

  protected showVideosI18n = computed(() => ({
    name: 'showVideos',
    label: this.i18n().album_show_videos_label(),
    helper: this.i18n().album_show_videos_helper(),
  } as CheckboxI18n));

  protected showStreamingVideosI18n = computed(() => ({
    name: 'showStreamingVideos',
    label: this.i18n().album_show_streaming_label(),
    helper: this.i18n().album_show_streaming_helper(),
  } as CheckboxI18n));

  protected showDocsI18n = computed(() => ({
    name: 'showDocs',
    label: this.i18n().album_show_docs_label(),
    helper: this.i18n().album_show_docs_helper(),
  } as CheckboxI18n));

  protected showPdfsI18n = computed(() => ({
    name: 'showPdfs',
    label: this.i18n().album_show_pdfs_label(),
    helper: this.i18n().album_show_pdfs_helper(),
  } as CheckboxI18n));

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, $event: string | string[] | number | boolean): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
  }
}
