import { Component, effect, inject, input } from '@angular/core';
import { SectionStore } from './section.store';
import { ArticleSectionComponent } from './article-section.component';
import { TableSectionComponent } from './table-section.component';
import { VideoSectionComponent } from './video-section.component';
import { IframeSectionComponent } from './iframe-section.component';
import { MapSectionComponent } from './map-section.component';
import { AlbumSectionComponent } from './album-section.component';
import { ButtonSectionComponent } from './button-section.component';
import { CalendarSectionComponent } from './calendar-section.component';
import { PeopleSectionComponent } from './people-section.component';
import { GallerySectionComponent } from './gallery-section.component';
import { TrackerSectionComponent } from './tracker-section.component';
import { HeroSectionComponent } from './hero-section.component';
import { SwiperSectionComponent } from './swiper-section.component';
import { ChartSectionComponent } from './chart-section.component';
import { ChatSectionComponent } from './chat-section.component';
import { MissingSectionComponent } from './missing-section.component';

/**
 * Renders a section within an accordion item.
 * Loads the section data via SectionStore and renders the appropriate section type component.
 * This avoids circular dependency by not importing AccordionSectionComponent or SectionComponent.
 */
@Component({
  selector: 'bk-accordion-item-content',
  standalone: true,
  imports: [
    ArticleSectionComponent, TableSectionComponent, VideoSectionComponent,
    IframeSectionComponent, MapSectionComponent, AlbumSectionComponent, ButtonSectionComponent,
    CalendarSectionComponent, PeopleSectionComponent, GallerySectionComponent, TrackerSectionComponent,
    HeroSectionComponent, SwiperSectionComponent, ChartSectionComponent, ChatSectionComponent,
    MissingSectionComponent
  ],
  providers: [SectionStore],
  template: `
    @if(sectionStore.section(); as section) {
      @switch (section.type) {
        @case('article') { <bk-article-section [section]="section" /> }
        @case('table') { <bk-table-section [section]="section" /> }
        @case('video') { <bk-video-section [section]="section" /> }
        @case('iframe') { <bk-iframe-section [section]="section" /> }
        @case('map') { <bk-map-section [section]="section" /> }
        @case('album') { <bk-album-section [section]="section" /> }
        @case('button') { <bk-button-section [section]="section" /> }
        @case('cal') { <bk-calendar-section [section]="section" /> }
        @case('people') { <bk-people-section [section]="section" /> }
        @case('gallery') { <bk-gallery-section [section]="section" /> }
        @case('tracker') { <bk-tracker-section [section]="section" /> }
        @case('hero') { <bk-hero-section [section]="section" /> }
        @case('slider') { <bk-swiper-section [section]="section" /> }
        @case('chart') { <bk-chart-section [section]="section" /> }
        @case('chat') { <bk-chat-section [section]="section" /> }
        @default { <bk-missing-section [section]="section" /> }
      }
    }
  `
})
export class AccordionItemContentComponent {
  protected sectionStore = inject(SectionStore);
  public sectionId = input.required<string>();
  
  constructor() {
    effect(() => {
      const id = this.sectionId();
      if (id) {
        this.sectionStore.setSectionId(id);
      }
    });
  }
}
