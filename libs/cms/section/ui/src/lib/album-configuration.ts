import { Component, computed, inject, input, linkedSignal, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { AlbumConfig } from '@bk2/shared-models';
import { CategoryOld, CategoryOldI18n, Checkbox, CheckboxI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { GalleryEffects } from '@bk2/shared-categories';
import { I18nService } from '@bk2/shared-i18n';

import { AlbumStyles } from '@bk2/cms-section-util';
import { PFX } from './scope';

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
  private readonly i18nService = inject(I18nService);

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

  protected readonly fieldI18n = this.i18nService.translateAll({
    directory_label:       PFX + 'directory.label',
    directory_placeholder: PFX + 'directory.placeholder',
    directory_helper:      PFX + 'directory.helper',
    albumStyle_label:             PFX + 'albumStyle.label',
    effect_label:                 PFX + 'effect.label',
    recursive_label:              PFX + 'recursive.label',
    recursive_helper:             PFX + 'recursive.helper',
    showVideos_label:             PFX + 'showVideos.label',
    showVideos_helper:            PFX + 'showVideos.helper',
    showStreamingVideos_label:    PFX + 'showStreamingVideos.label',
    showStreamingVideos_helper:   PFX + 'showStreamingVideos.helper',
    showDocs_label:               PFX + 'showDocs.label',
    showDocs_helper:              PFX + 'showDocs.helper',
    showPdfs_label:               PFX + 'showPdfs.label',
    showPdfs_helper:              PFX + 'showPdfs.helper',
  });

  protected directoryI18n = computed(() => ({
    name: 'directory',
    label: this.fieldI18n.directory_label(),
    placeholder: this.fieldI18n.directory_placeholder(),
    helper: this.fieldI18n.directory_helper(),
  } as TextInputI18n));
  protected albumStyleI18n = computed(() => ({ name: 'albumStyle', label: this.fieldI18n.albumStyle_label() } as CategoryOldI18n));
  protected effectI18n     = computed(() => ({ name: 'effect',     label: this.fieldI18n.effect_label()     } as CategoryOldI18n));

  protected recursiveI18n = computed(() => ({
    name: 'recursive',
    label: this.fieldI18n.recursive_label(),
    helper: this.fieldI18n.recursive_helper(),
  } as CheckboxI18n));

  protected showVideosI18n = computed(() => ({
    name: 'showVideos',
    label: this.fieldI18n.showVideos_label(),
    helper: this.fieldI18n.showVideos_helper(),
  } as CheckboxI18n));

  protected showStreamingVideosI18n = computed(() => ({
    name: 'showStreamingVideos',
    label: this.fieldI18n.showStreamingVideos_label(),
    helper: this.fieldI18n.showStreamingVideos_helper(),
  } as CheckboxI18n));

  protected showDocsI18n = computed(() => ({
    name: 'showDocs',
    label: this.fieldI18n.showDocs_label(),
    helper: this.fieldI18n.showDocs_helper(),
  } as CheckboxI18n));

  protected showPdfsI18n = computed(() => ({
    name: 'showPdfs',
    label: this.fieldI18n.showPdfs_label(),
    helper: this.fieldI18n.showPdfs_helper(),
  } as CheckboxI18n));

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, $event: string | string[] | number | boolean): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
  }
}
