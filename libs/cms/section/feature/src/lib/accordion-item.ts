import { Component, computed, effect, inject, input } from '@angular/core';

import { ButtonCopyI18n, Spinner } from '@bk2/shared-ui';

import { SectionStore } from './section.store';
import { ArticleSectionComponent } from './article-section';
import { TableSectionComponent } from './table-section';
import { VideoSectionComponent } from './video-section';
import { IframeSectionComponent } from './iframe-section';
import { MapSectionComponent } from './map-section';
import { AlbumSectionComponent } from './album-section';
import { ButtonSectionComponent } from './button-section';
import { CalendarSectionComponent } from './calendar-section';
import { PeopleSectionComponent } from './people-section';
import { TrackerSectionComponent } from './tracker-section';
import { HeroSectionComponent } from './hero-section';
import { ChartSectionComponent } from './chart-section';
import { MissingSectionComponent } from './missing-section';
import { SliderSectionComponent } from './slider-section';

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
    CalendarSectionComponent, PeopleSectionComponent, TrackerSectionComponent,
    HeroSectionComponent, SliderSectionComponent, ChartSectionComponent,
    MissingSectionComponent, Spinner
  ],
  providers: [SectionStore],
  template: `
    @if(store.section(); as section) {
      @switch (section.type) {
        @case('article') { <bk-article-section [section]="section" /> }
        @case('table') { <bk-table-section [section]="section" /> }
        @case('video') { <bk-video-section [section]="section" /> }
        @case('iframe') { <bk-iframe-section [section]="section" /> }
        @case('map') { <bk-map-section [section]="section" /> }
        @case('album') { <bk-album-section [section]="section" /> }
        @case('button') { <bk-button-section [section]="section" /> }
        @case('cal') {
          @defer (on viewport) {
            <bk-calendar-section [section]="section" />
          } @placeholder {
            <bk-spinner />
          }
        }
        @case('people') { <bk-people-section [section]="section" /> }
        @case('tracker') { <bk-tracker-section [section]="section" [buttonCopyI18n]="buttonCopyI18n()" /> }
        @case('hero') { <bk-hero-section [section]="section" /> }
        @case('slider') { <bk-slider-section [section]="section" /> }
        @case('chart') {
          @defer (on viewport) {
            <bk-chart-section [section]="section" />
          } @placeholder {
            <bk-spinner />
          }
        }
        @default { <bk-missing-section [section]="section" /> }
      }
    }
  `
})
export class AccordionItemContentComponent {
  protected store = inject(SectionStore);
  protected readonly buttonCopyI18n = computed(() => ({ copy_conf: this.store.i18n.copy_conf() } as ButtonCopyI18n));
  public sectionId = input.required<string>();
  
  constructor() {
    effect(() => {
      const id = this.sectionId();
      if (id) {
        this.store.setSectionId(id);
      }
    });
  }
}
