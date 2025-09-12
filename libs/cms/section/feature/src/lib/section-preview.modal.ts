import { AsyncPipe } from '@angular/common';
import { Component, forwardRef, inject, input } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonLabel, IonMenuButton, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { SectionModel, SectionType } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';

import { AlbumSectionComponent } from './album-section.component';
import { ArticleSectionComponent } from './article-section.component';
import { ButtonSectionComponent } from './button-section.component';
import { CalendarSectionComponent } from './calendar-section.component';
import { GallerySectionComponent } from './gallery-section.component';
import { HeroSectionComponent } from './hero-section.component';
import { IframeSectionComponent } from './iframe-section.component';
import { MapSectionComponent } from './map-section.component';
import { PeopleListSectionComponent } from './people-list-section.component';
import { SwiperSectionComponent } from './swiper-section.component';
import { TableSectionComponent } from './table-section.component';
import { VideoSectionComponent } from './video-section.component';

@Component( {
  selector: 'bk-preview-modal',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    ArticleSectionComponent, SwiperSectionComponent, GallerySectionComponent, 
    forwardRef(() => PeopleListSectionComponent),
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
          @case(ST.Album) {                                   <!-- 0: Album -->
            <bk-album-section [section]="section" />
          }
          @case(ST.Article) {                                 <!-- 1: Article -->
            <bk-article-section [section]="section" [readOnly]="true"  />
          }
          <!-- not yet implemented -->                        <!-- 2: Chart -->        
          @case(ST.Gallery) {                                 <!-- 3: Gallery -->
            <bk-gallery-section [section]="section" />
          }
          @case(ST.Hero) {                                    <!-- 4: Hero -->
            <bk-hero-section [section]="section" />
          }
          @case(ST.Map) {                                     <!-- 5: Map -->
            <bk-map-section [section]="section" />
          }
          @case(ST.PeopleList) {                              <!-- 6: PeopleList -->
            <bk-people-list-section [section]="section" [readOnly]="true"  />
          }
          @case(ST.Slider) {                                  <!-- 7: Slider -->
            <bk-swiper-section [section]="section" />
          }
          @case(ST.Video) {                                   <!-- 8: Video -->
            <bk-video-section [section]="section" />
          }
          @case(ST.Calendar) {                                <!-- 9: Calendar -->
            <bk-calendar-section [section]="section" />
          }
          @case(ST.Button) {                                  <!-- 10: Button -->      
            <bk-button-section [section]="section" [readOnly]="true"  />    
          }
          @case(ST.Table) {                                   <!-- 11: Table -->
            <bk-table-section [section]="section" />          
          }
          @case(ST.Iframe) {
            <bk-iframe-section [section]="section" />         <!-- 12: Iframe -->
          }
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

  public ST = SectionType;

  public close(): void {
    this.modalController.dismiss(null, 'cancel');
  }
}
