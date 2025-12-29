import { Component, computed, effect, inject, input } from '@angular/core';
import { IonItem, IonLabel } from '@ionic/angular/standalone';

import { RoleName } from '@bk2/shared-models';
import { debugMessage, hasRole, replaceSubstring } from '@bk2/shared-util-core';

import { AlbumSectionComponent } from './album-section.component';
import { ArticleSectionComponent } from './article-section.component';
import { ButtonSectionComponent } from './button-section.component';
import { CalendarSectionComponent } from './calendar-section.component';
import { ChartSectionComponent } from './chart-section.component';
import { ChatSectionComponent } from './chat-section.component';
import { GallerySectionComponent } from './gallery-section.component';
import { HeroSectionComponent } from './hero-section.component';
import { IframeSectionComponent } from './iframe-section.component';
import { MapSectionComponent } from './map-section.component';
import { MissingSectionComponent } from './missing-section.component';
import { PeopleSectionComponent } from './people-section.component';
import { SwiperSectionComponent } from './swiper-section.component';
import { TableSectionComponent } from './table-section.component';
import { TrackerSectionComponent } from './tracker-section.component';
import { VideoSectionComponent } from './video-section.component';
import { SectionStore } from './section.store';

/**
 * This component shows a section view. A section is part of a page. There are many different types of sections.
 * The section renders differently depending on the type property.
 * Use it like this: <bk-section sectionType="name of the sectionType"></bk-section>
 */
@Component({
  selector: 'bk-section',
  standalone: true,
  imports: [
    ArticleSectionComponent, MissingSectionComponent, TableSectionComponent, VideoSectionComponent,
    IframeSectionComponent, MapSectionComponent, AlbumSectionComponent, ButtonSectionComponent,
    CalendarSectionComponent, PeopleSectionComponent, GallerySectionComponent, TrackerSectionComponent,
    HeroSectionComponent, SwiperSectionComponent, ChartSectionComponent, ChatSectionComponent,
    IonItem, IonLabel
  ],
  providers: [SectionStore],
  template: `
    @if (section(); as section) {
      @if (hasRole(roleNeeded())) {
        @switch (section.type) {
          @case('album') { 
            <bk-album-section [section]="section" />
          }
          @case('article') {
            <bk-article-section [section]="section" />
          }
          @case('button') {  
            <bk-button-section [section]="section" />
          }
          @case('cal') {
            <bk-calendar-section [section]="section" />
          }
          @case('chart') {
            <bk-chart-section [section]="section" />
          }
          @case('chat') {
            <bk-chat-section [section]="section" />
          }
          @case('gallery') {
            <bk-gallery-section [section]="section" />
          }
          @case('hero') {
            <bk-hero-section [section]="section" />
          }
          @case('iframe') { 
            <bk-iframe-section [section]="section" />
          }
          @case('map') {
            <bk-map-section [section]="section" />
          }
          @case('people') {
            <bk-people-section [section]="section" />
          }
          @case('slider') {
            <bk-swiper-section [section]="section" />
          }
          @case('table') {
            <bk-table-section [section]="section" />
          }
          @case('tracker') {
            <bk-tracker-section [section]="section" />
          }
          @case('video') {
            <bk-video-section [section]="section" />
          }
          @default {
            <bk-missing-section [section]="section" />
          }
        }
      }
    } @else {
      <ion-item color="warning">
        <ion-label>Missing type on section {{ id() }}</ion-label>
      </ion-item>
    }
  `
})
export class SectionComponent {
  private readonly sectionStore = inject(SectionStore);

  public id = input.required<string>();     // sectionId
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => this.readOnly());

  protected readonly section = computed(() => this.sectionStore.section());
  protected readonly roleNeeded = computed(() => this.section()?.roleNeeded as RoleName);

  constructor() {
    effect(() => {
      const id = replaceSubstring(this.id(), '@TID@', this.sectionStore.appStore.env.tenantId);
      debugMessage(`SectionComponent: sectionId=${this.id()} -> ${id}`, this.sectionStore.currentUser());
      this.sectionStore.setSectionId(id);
    });
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.sectionStore.currentUser());
  }
}
