import { Component, computed, input, linkedSignal, model, Signal, signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { AlbumConfig, CategoryListModel } from '@okr/shared-models';
import { CategoryOld, CategoryOldI18n, CategorySelect, Checkbox, CheckboxI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { GalleryEffects } from '@okr/shared-categories';

import { SectionI18n } from '@okr/cms-section-util';

@Component({
  selector: 'okr-album-config',
  standalone: true,
  imports: [
    TextInput, CategoryOld, CategorySelect, Checkbox,
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
              <okr-text-input [i18n]="folderI18n()" [value]="folder()" (valueChange)="onFieldChange('folder', $event)"  [readOnly]="readOnly()" [showHelper]=true />
            </ion-col>
            <ion-col size="12" size-md="6">
              @if(albumStyles().items.length > 0) {
                <okr-cat-select [category]="albumStyles()" [selectedItemName]="albumStyle()" (selectedItemNameChange)="onFieldChange('albumStyle', $event)" [withAll]="false" [readOnly]="readOnly()" />
              }
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-checkbox [i18n]="showVideosI18n()" [checked]="showVideos()" (checkedChange)="onFieldChange('showVideos', $event)" [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-checkbox [i18n]="showStreamingVideosI18n()" [checked]="showStreamingVideos()" (checkedChange)="onFieldChange('showStreamingVideos', $event)" [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-checkbox [i18n]="showDocsI18n()" [checked]="showDocs()" (checkedChange)="onFieldChange('showDocs', $event)" [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-checkbox [i18n]="showPdfsI18n()" [checked]="showPdfs()" (checkedChange)="onFieldChange('showPdfs', $event)" [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-category-old [i18n]="effectI18n()" [value]="effect()" (valueChange)="onFieldChange('effect', $event)" [categories]="galleryEffects" [readOnly]="readOnly()" />
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
  public readonly albumStyles = input.required<CategoryListModel>();

  // linked signals (fields)
  protected folder = linkedSignal(() => this.formData().folder);
  protected albumStyle = linkedSignal(() => this.formData().albumStyle);
  protected imageStyle = linkedSignal(() => this.formData().imageStyle);
  protected showVideos = linkedSignal(() => this.formData().showVideos);
  protected showStreamingVideos = linkedSignal(() => this.formData().showStreamingVideos);
  protected showDocs = linkedSignal(() => this.formData().showDocs);
  protected showPdfs = linkedSignal(() => this.formData().showPdfs);
  protected effect = linkedSignal(() => this.formData().effect);

  // passing constants to template
  protected galleryEffects = GalleryEffects;

  protected folderI18n = computed(() => ({
    name: 'folder',
    label: this.i18n().album_folder_label(),
    placeholder: this.i18n().album_folder_placeholder(),
    helper: this.i18n().album_folder_helper(),
  } as TextInputI18n));
  protected effectI18n     = computed(() => ({ name: 'effect',     label: this.i18n().album_effect_label()     } as CategoryOldI18n));

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
