import { Component, computed, forwardRef, inject, input } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonLabel, IonMenuButton, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';
import { signalStore, withProps } from '@ngrx/signals';

import { I18nService } from '@bk2/shared-i18n';

const PreviewStore = signalStore(
  withProps(() => ({ i18nService: inject(I18nService) })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll({
      no_such_section: '@content.section.error.noSuchSection',
    }),
  })),
);
import { SectionModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';

import { AlbumSectionComponent } from './album-section';
import { ArticleSectionComponent } from './article-section';
import { ButtonSectionComponent } from './button-section';
import { CalendarSectionComponent } from './calendar-section';
import { HeroSectionComponent } from './hero-section';
import { IframeSectionComponent } from './iframe-section';
import { MapSectionComponent } from './map-section';
import { PeopleSectionComponent } from './people-section';
import { TableSectionComponent } from './table-section';
import { VideoSectionComponent } from './video-section';
import { SliderSectionComponent } from './slider-section';

@Component( {
  selector: 'bk-preview-modal',
  standalone: true,
  imports: [
    SvgIconPipe,
    ArticleSectionComponent, SliderSectionComponent, 
    forwardRef(() => PeopleSectionComponent),
    AlbumSectionComponent, MapSectionComponent, VideoSectionComponent, 
    CalendarSectionComponent, HeroSectionComponent, ButtonSectionComponent, IframeSectionComponent,
    TableSectionComponent,
    IonHeader, IonButtons, IonToolbar, IonTitle, IonButton, IonIcon, IonMenuButton,
    IonContent, IonLabel
  ],
  providers: [PreviewStore],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button></ion-menu-button></ion-buttons>      
        <ion-title>{{ title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="close()">
            <ion-icon slot="icon-only" src="{{'cancel' | svgIcon }}" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if(section(); as section) {
        @switch (section.type) {
          @case('album') {
            <bk-album-section [section]="section" />
          }
          @case('article') {
            <bk-article-section [section]="section"  />
          }
          @case('cal') {
            <bk-calendar-section [section]="section" />
          }
          @case('hero') {
            <bk-hero-section [section]="section" />
          }
          @case('map') {
            <bk-map-section [section]="section" />
          }
          @case('people') {
            <bk-people-section [section]="section"  />
          }
          @case('slider') {
            <bk-slider-section [section]="section" />
          }
          @case('video') {
            <bk-video-section [section]="section" />
          }

          @case('button') {     
            <bk-button-section [section]="section"  />    
          }
          @case('table') {
            <bk-table-section [section]="section" />          
          }
          @case('iframe') {
            <bk-iframe-section [section]="section" />
          }
          <!-- not yet implemented: chart, chat, tracker -->       
          @default {
            <ion-label>{{ errorMessage() }}</ion-label>
          }
        }
      }
    </ion-content>
  `
} )
export class PreviewModal {
  private readonly modalController = inject(ModalController);
  private readonly store = inject(PreviewStore);
  public section = input.required<SectionModel>();
  public title = input('Preview');
  protected errorMessage = computed(() =>
    this.store.i18n.no_such_section().replace('{{ type }}', this.section().type)
  );

  public close(): void {
    this.modalController.dismiss(null, 'cancel');
  }
}
