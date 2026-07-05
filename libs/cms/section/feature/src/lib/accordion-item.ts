import { Component, computed, effect, inject, input } from '@angular/core';

import { ButtonCopyI18n, DeferError, Spinner } from '@okr/shared-ui';

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
  selector: 'okr-accordion-item-content',
  standalone: true,
  imports: [
    ArticleSectionComponent, TableSectionComponent, VideoSectionComponent,
    IframeSectionComponent, MapSectionComponent, AlbumSectionComponent, ButtonSectionComponent,
    CalendarSectionComponent, PeopleSectionComponent, TrackerSectionComponent,
    HeroSectionComponent, SliderSectionComponent, ChartSectionComponent,
    MissingSectionComponent, Spinner, DeferError
  ],
  providers: [SectionStore],
  template: `
    @if(store.section(); as section) {
      @switch (section.type) {
        @case('article') { <okr-article-section [section]="section" /> }
        @case('table') { <okr-table-section [section]="section" /> }
        @case('video') { <okr-video-section [section]="section" /> }
        @case('iframe') { <okr-iframe-section [section]="section" /> }
        @case('map') { <okr-map-section [section]="section" /> }
        @case('album') { <okr-album-section [section]="section" /> }
        @case('button') { <okr-button-section [section]="section" /> }
        @case('cal') {
          @defer (on viewport) {
            <okr-calendar-section [section]="section" />
          } @placeholder {
            <okr-spinner />
          } @error {
            <okr-defer-error />
          }
        }
        @case('people') { <okr-people-section [section]="section" /> }
        @case('tracker') { <okr-tracker-section [section]="section" [buttonCopyI18n]="buttonCopyI18n()" /> }
        @case('hero') { <okr-hero-section [section]="section" /> }
        @case('slider') { <okr-slider-section [section]="section" /> }
        @case('chart') {
          @defer (on viewport) {
            <okr-chart-section [section]="section" />
          } @placeholder {
            <okr-spinner />
          } @error {
            <okr-defer-error />
          }
        }
        @default { <okr-missing-section [section]="section" /> }
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
