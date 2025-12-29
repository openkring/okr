import { AsyncPipe } from '@angular/common';
import { Component, forwardRef, inject, input } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonLabel, IonMenuButton, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { SectionModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';

import { AlbumSectionComponent } from './album-section.component';
import { ArticleSectionComponent } from './article-section.component';
import { ButtonSectionComponent } from './button-section.component';
import { CalendarSectionComponent } from './calendar-section.component';
import { GallerySectionComponent } from './gallery-section.component';
import { HeroSectionComponent } from './hero-section.component';
import { IframeSectionComponent } from './iframe-section.component';
import { MapSectionComponent } from './map-section.component';
import { PeopleSectionComponent } from './people-section.component';
import { SwiperSectionComponent } from './swiper-section.component';
import { TableSectionComponent } from './table-section.component';
import { VideoSectionComponent } from './video-section.component';

@Component( {
  selector: 'bk-preview-modal',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    ArticleSectionComponent, SwiperSectionComponent, GallerySectionComponent, 
    forwardRef(() => PeopleSectionComponent),
    AlbumSectionComponent, MapSectionComponent, VideoSectionComponent, 
    CalendarSectionComponent, HeroSectionComponent, ButtonSectionComponent, IframeSectionComponent,
    TableSectionComponent,
    IonHeader, IonButtons, IonToolbar, IonTitle, IonButton, IonIcon, IonMenuButton,
    IonContent, IonLabel
  ],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button></ion-menu-button></ion-buttons>      
        <ion-title>{{ title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="close()">
            <ion-icon slot="icon-only" src="{{'close_cancel' | svgIcon }}" />
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
          @case('gallery') {
            <bk-gallery-section [section]="section" />
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
            <bk-swiper-section [section]="section" />
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
            <ion-label>{{ '@content.section.error.noSuchSection' | translate: { type: section.type } | async }}</ion-label>
          }
        }
      }
    </ion-content>
  `
} )
export class PreviewModalComponent {
  private readonly modalController = inject(ModalController);
  public section = input.required<SectionModel>();
  public title = input('Preview');

  public close(): void {
    this.modalController.dismiss(null, 'cancel');
  }
}
