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
import { PeopleListSectionComponent } from './people-list-section.component';
import { SectionDetailStore } from './section-detail.store';
import { SwiperSectionComponent } from './swiper-section.component';
import { TableSectionComponent } from './table-section.component';
import { TrackerSectionComponent } from './tracker-section.component';
import { VideoSectionComponent } from './video-section.component';

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
    CalendarSectionComponent, PeopleListSectionComponent, GallerySectionComponent, TrackerSectionComponent,
    HeroSectionComponent, SwiperSectionComponent, ChartSectionComponent, ChatSectionComponent,
    IonItem, IonLabel
  ],
  providers: [SectionDetailStore],
  template: `
    @if (section(); as section) {
      @if (hasRole(roleNeeded())) {
        @switch (section.type) {
          @case('album') { 
            <bk-album-section [section]="section" />
          }
          @case('article') {
            <bk-article-section [section]="section" [readOnly]="readOnly()" />
          }
          @case('button') {  
            <bk-button-section [section]="section" [readOnly]="readOnly()" />
          }
          @case('calendar') {
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
          @case('peopleList') {
            <bk-people-list-section [section]="section" [readOnly]="readOnly()" />
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
<!--         
          @case('list') {      
            <bk-list-section [section]="section" />           
          }
          @case('model') {
            <bk-model-section [section]="section" />
          }
          @case('accordion') {
            <bk-accordion-section [section]="section" [readOnly]="readOnly()" />      
          }

          Testimonials (Section)
A Testimonials page is where customers share their experiences, building trust and credibility with potential visitors. 
Here, try to demonstrate feedback in a clean, easy-to-navigate gallery format. Whether a grid or a carousel, the layout should allow 
visitors to effortlessly browse through it.

Each testimonial could feature a brief quote prominently, with the option to expand or click through for more detailed stories or 
video reviews if users want to know more. Styling should be consistent with your brand but also aim to highlight the feedback 
so they stand out on the page. Use clean fonts and subtle background colors that make the text easy to read and draw attention to the quotes.
  -->
  `
})
export class SectionComponent {
  private readonly sectionStore = inject(SectionDetailStore);

  public id = input.required<string>();     // sectionId
  public readOnly = input(true);

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
