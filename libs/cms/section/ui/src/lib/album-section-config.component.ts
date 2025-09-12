import { Component, computed, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { GalleryEffects } from '@bk2/shared-categories';
import { AlbumStyle, GalleryEffect } from '@bk2/shared-models';
import { CategoryComponent, CheckboxComponent, TextInputComponent } from '@bk2/shared-ui';

import { AlbumStyles, SectionFormModel } from '@bk2/cms-section-util';

@Component({
  selector: 'bk-album-section-config',
  standalone: true,
  imports: [
    IonGrid, IonRow, IonCol,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    CategoryComponent, TextInputComponent, CheckboxComponent
  ],
  viewProviders: [vestFormsViewProviders],
  template: `
    <ion-row>
      <ion-col size="12"> 
        <ion-card>
          <ion-card-header>
            <ion-card-title>Album</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <bk-text-input name="directory" [value]="directory()" [showHelper]=true />
                </ion-col>
                <ion-col size="12" size-md="6"> 
                  <bk-cat name="albumStyle" [value]="albumStyle()" [categories]="albumStyles" (changed)="onChange('albumStyle', $event)" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-checkbox name="recursive" [isChecked]="recursive()" [showHelper]="true" (changed)="onChange('recursive', $event)" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-checkbox name="showVideos" [isChecked]="showVideos()" [showHelper]="true"  (changed)="onChange('showVideos', $event)" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-checkbox name="showStreamingVideos" [isChecked]="showStreamingVideos()" [showHelper]="true" (changed)="onChange('showStreamingVideos', $event)" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-checkbox name="showDocs" [isChecked]="showDocs()" [showHelper]="true" (changed)="onChange('showDocs', $event)"/>
                </ion-col>
                <ion-col size="12" size-md="6">        
                  <bk-checkbox name="showPdfs" [isChecked]="showPdfs()" [showHelper]="true" (changed)="onChange('showPdfs', $event)" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-cat name="galleryEffect" [value]="galleryEffect()" [categories]="galleryEffects" (changed)="onChange('galleryEffect', $event)" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </ion-col>
    </ion-row>
  `
})
export class AlbumSectionConfigComponent {
  public vm = model.required<SectionFormModel>();
  protected album = computed(() => this.vm().properties?.album);

  protected directory = linkedSignal(() => this.album()?.directory ?? '');
  protected albumStyle = linkedSignal(() => this.album()?.albumStyle ?? AlbumStyle.Grid);
  protected recursive = linkedSignal(() => this.album()?.recursive ?? true);
  protected showVideos = linkedSignal(() => this.album()?.showVideos ?? true);
  protected showStreamingVideos = linkedSignal(() => this.album()?.showStreamingVideos ?? true);
  protected showDocs = linkedSignal(() => this.album()?.showDocs ?? true);
  protected showPdfs = linkedSignal(() => this.album()?.showPdfs ?? true);
  protected galleryEffect = linkedSignal(() => this.album()?.galleryEffect ?? GalleryEffect.Slide);
  public changed = output<void>(); 

  protected albumStyles = AlbumStyles;
  protected galleryEffects = GalleryEffects;

  protected onChange(fieldName: string, $event: boolean | number): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    this.changed.emit();
  }
}
