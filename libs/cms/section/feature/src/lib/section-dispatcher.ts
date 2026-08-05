import { Component, computed, inject, input } from '@angular/core';
import { IonItem, IonLabel } from '@ionic/angular/standalone';

import { RoleName, SectionModel, UserModel } from '@okr/shared-models';
import { ButtonCopyI18n, DeferError, Spinner } from '@okr/shared-ui';
import { hasRole } from '@okr/shared-util-core';

import { AccordionSectionComponent } from './accordion-section';
import { AlbumSectionComponent } from './album-section';
import { ArticleSectionComponent } from './article-section';
import { ButtonSectionComponent } from './button-section';
import { CalendarSectionComponent } from './calendar-section';
import { ChartSectionComponent } from './chart-section';
import { HeroSectionComponent } from './hero-section';
import { IframeSectionComponent } from './iframe-section';
import { MapSectionComponent } from './map-section';
import { MissingSectionComponent } from './missing-section';
import { PeopleSectionComponent } from './people-section';
import { SliderSectionComponent } from './slider-section';
import { TableSectionComponent } from './table-section';
import { TrackerSectionComponent } from './tracker-section';
import { VideoSectionComponent } from './video-section';
import { EventsSectionComponent } from './events-section';
import { InvitationsSectionComponent } from './invitations-section';
import { TasksSectionComponent } from './tasks-section';
import { ActivitiesSectionComponent } from './activities-section';
import { MessagesSectionComponent } from './messages-section';
import { NewsSectionComponent } from './news-section';
import { OrgchartSectionComponent } from './orgchart-section';
import { RagSectionComponent } from './rag-section';
import { ContextDiagramSectionComponent } from './context-diagram-section';
import { ResponsibilitySectionComponent } from './responsibility-section';
import { MemberAgeSectionComponent } from './member-age-section';
import { MemberCatSectionComponent } from './member-cat-section';
import { SankeySectionComponent } from './sankey-section';
import { SpiderSectionComponent } from './spider-section';
import { TocSectionComponent } from './toc-section';
import { TestimonialSectionComponent } from './testimonial-section';
import { TripStatsSectionComponent } from './trip-stats-section';
import { FormSectionComponent } from './form-section';
import { SectionStore } from './section.store';

/**
 * This component shows a section view. A section is part of a page. There are many different types of sections.
 * The section renders differently depending on the type property.
 * Use it like this: <okr-section-dispatcher sectionType="name of the sectionType"></okr-section-dispatcher>
 */
@Component({
  selector: 'okr-section-dispatcher',
  standalone: true,
  providers: [SectionStore],
  imports: [
    // Eagerly loaded — lightweight sections, needed immediately
    AccordionSectionComponent,
    ArticleSectionComponent, MissingSectionComponent, TableSectionComponent, VideoSectionComponent, EventsSectionComponent,
    IframeSectionComponent, MapSectionComponent, AlbumSectionComponent, ButtonSectionComponent,
    PeopleSectionComponent, ResponsibilitySectionComponent, TrackerSectionComponent, HeroSectionComponent,
    InvitationsSectionComponent, TasksSectionComponent, ActivitiesSectionComponent, MessagesSectionComponent, NewsSectionComponent, OrgchartSectionComponent, RagSectionComponent, ContextDiagramSectionComponent, MemberAgeSectionComponent, MemberCatSectionComponent, SankeySectionComponent, SpiderSectionComponent, TocSectionComponent, TestimonialSectionComponent,
    IonItem, IonLabel, Spinner, DeferError,
    CalendarSectionComponent, ChartSectionComponent, SliderSectionComponent,
    TripStatsSectionComponent,
    FormSectionComponent,
  ],
  template: `
    @if (section(); as section) {
      @if (hasRole(roleNeeded())) {
        @switch (section.type) {
          @case('accordion') { 
            <okr-accordion-section [section]="section" />
          }
          @case('album') { 
            <okr-album-section [section]="section" [editMode]="editMode()" />
          }
          @case('article') {
            <okr-article-section [section]="section" [editMode]="editMode()" />
          }
          @case('button') {  
            <okr-button-section [section]="section" [editMode]="editMode()" />
          }
          @case('cal') {
            @defer (on viewport) {
              <okr-calendar-section [section]="section" [editMode]="editMode()" />
            } @placeholder {
              <okr-spinner />
            } @error {
              <okr-defer-error />
            }
          }
          @case('chart') {
            @defer (on viewport) {
              <okr-chart-section [section]="section" />
            } @placeholder {
              <okr-spinner />
            } @error {
              <okr-defer-error />
            }
          }
          @case('events') {
            <okr-events-section [section]="section" [editMode]="editMode()" />
          }
          @case('hero') {
            <okr-hero-section [section]="section" />
          }
          @case('iframe') { 
            <okr-iframe-section [section]="section" />
          }
          @case('invitations') {
            <okr-invitations-section [section]="section" [editMode]="editMode()" />
          }
          @case('map') {
            <okr-map-section [section]="section" [editMode]="editMode()" />
          }
          @case('messages') {
            <okr-messages-section [section]="section" [editMode]="editMode()" />
          }
          @case('news') {
            <okr-news-section [section]="section" [editMode]="editMode()" />
          }
          @case('orgchart') {
            @defer (on viewport) {
              <okr-orgchart-section [section]="section" [editMode]="editMode()" />
            } @placeholder {
              <okr-spinner />
            } @error {
              <okr-defer-error />
            }
          }
          @case('people') {
            <okr-people-section [section]="section" [editMode]="editMode()" />
          }
          @case('responsibility') {
            <okr-responsibility-section [section]="section" [editMode]="editMode()" />
          }
          @case('context') {
            @defer (on viewport) {
              <okr-context-diagram-section [section]="section" [editMode]="editMode()" />
            } @placeholder {
              <okr-spinner />
            } @error {
              <okr-defer-error />
            }
          }
          @case('rag') {
            <okr-rag-section [section]="section" [editMode]="editMode()" />
          }
          @case('slider') {
            @defer (on idle) {
              <okr-slider-section [section]="section" [editMode]="editMode()" />
            } @error {
              <okr-defer-error />
            }
          }
          @case('table') {
            <okr-table-section [section]="section" />
          }
          @case('tasks') {
            <okr-tasks-section [section]="section" [editMode]="editMode()" />
          }
          @case('activities') {
            <okr-activities-section [section]="section" [editMode]="editMode()" />
          }
          @case('tracker') {
            <okr-tracker-section [section]="section" [editMode]="editMode()" [buttonCopyI18n]="buttonCopyI18n()" />
          }
          @case('video') {
            <okr-video-section [section]="section" />
          }
          @case('member-age') {
            <okr-member-age-section [section]="section" [editMode]="editMode()" />
          }
          @case('member-cat') {
            <okr-member-cat-section [section]="section" [editMode]="editMode()" />
          }
          @case('trip-stats') {
            <okr-trip-stats-section [section]="section" [editMode]="editMode()" />
          }
          @case('sankey') {
            <okr-sankey-section [section]="section" />
          }
          @case('spider') {
            <okr-spider-section [section]="section" />
          }
          @case('testimonial') {
            <okr-testimonial-section [section]="section" />
          }
          @case('toc') {
            <okr-toc-section [section]="section" [editMode]="editMode()" />
          }
          @case('form') {
            <okr-form-section [section]="section" [editMode]="editMode()" />
          }
          @default {
            <okr-missing-section [section]="section" />
          }
        }
      }
    } @else {
      <ion-item color="warning">
        <ion-label>Missing type on section {{ section().okey }}</ion-label>
      </ion-item>
    }
  `
})
export class SectionDispatcher {
  private readonly store = inject(SectionStore);

  // inputs
  public section = input.required<SectionModel>();
  public currentUser = input.required<UserModel | undefined>();
  public editMode = input.required<boolean>();

  // derived
  protected readonly buttonCopyI18n = computed(() => ({ copy_conf: this.store.i18n.copy_conf() } as ButtonCopyI18n));
  protected readonly roleNeeded = computed(() => this.section()?.roleNeeded as RoleName);

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
