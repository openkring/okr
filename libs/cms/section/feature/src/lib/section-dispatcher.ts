import { Component, computed, inject, input } from '@angular/core';
import { IonItem, IonLabel } from '@ionic/angular/standalone';
import { signalStore, withProps } from '@ngrx/signals';

import { I18nService } from '@bk2/shared-i18n';
import { RoleName, SectionModel, UserModel } from '@bk2/shared-models';
import { ButtonCopyI18n, Spinner } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';

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

const SectionDispatcherStore = signalStore(
  withProps(() => ({ i18nService: inject(I18nService) })),
  withProps(store => ({
    i18n: store.i18nService.translateAll({ copy_conf: '@shared/ui.copy.conf' }),
  })),
);

/**
 * This component shows a section view. A section is part of a page. There are many different types of sections.
 * The section renders differently depending on the type property.
 * Use it like this: <bk-section-dispatcher sectionType="name of the sectionType"></bk-section-dispatcher>
 */
@Component({
  selector: 'bk-section-dispatcher',
  standalone: true,
  providers: [SectionDispatcherStore],
  imports: [
    // Eagerly loaded — lightweight sections, needed immediately
    AccordionSectionComponent,
    ArticleSectionComponent, MissingSectionComponent, TableSectionComponent, VideoSectionComponent, EventsSectionComponent,
    IframeSectionComponent, MapSectionComponent, AlbumSectionComponent, ButtonSectionComponent,
    PeopleSectionComponent, ResponsibilitySectionComponent, TrackerSectionComponent, HeroSectionComponent,
    InvitationsSectionComponent, TasksSectionComponent, ActivitiesSectionComponent, MessagesSectionComponent, NewsSectionComponent, OrgchartSectionComponent, RagSectionComponent, ContextDiagramSectionComponent, MemberAgeSectionComponent,
    IonItem, IonLabel, Spinner,
    CalendarSectionComponent, ChartSectionComponent, SliderSectionComponent,
  ],
  template: `
    @if (section(); as section) {
      @if (hasRole(roleNeeded())) {
        @switch (section.type) {
          @case('accordion') { 
            <bk-accordion-section [section]="section" />
          }
          @case('album') { 
            <bk-album-section [section]="section" [editMode]="editMode()" />
          }
          @case('article') {
            <bk-article-section [section]="section" [editMode]="editMode()" />
          }
          @case('button') {  
            <bk-button-section [section]="section" [editMode]="editMode()" />
          }
          @case('cal') {
            @defer (on viewport) {
              <bk-calendar-section [section]="section" [editMode]="editMode()" />
            } @placeholder {
              <bk-spinner />
            }
          }
          @case('chart') {
            @defer (on viewport) {
              <bk-chart-section [section]="section" />
            } @placeholder {
              <bk-spinner />
            }
          }
          @case('events') {
            <bk-events-section [section]="section" [editMode]="editMode()" />
          }
          @case('hero') {
            <bk-hero-section [section]="section" />
          }
          @case('iframe') { 
            <bk-iframe-section [section]="section" />
          }
          @case('invitations') {
            <bk-invitations-section [section]="section" [editMode]="editMode()" />
          }
          @case('map') {
            <bk-map-section [section]="section" [editMode]="editMode()" />
          }
          @case('messages') {
            <bk-messages-section [section]="section" [editMode]="editMode()" />
          }
          @case('news') {
            <bk-news-section [section]="section" [editMode]="editMode()" />
          }
          @case('orgchart') {
            @defer (on viewport) {
              <bk-orgchart-section [section]="section" [editMode]="editMode()" />
            } @placeholder {
              <bk-spinner />
            }
          }
          @case('people') {
            <bk-people-section [section]="section" [editMode]="editMode()" />
          }
          @case('responsibility') {
            <bk-responsibility-section [section]="section" [editMode]="editMode()" />
          }
          @case('context') {
            @defer (on viewport) {
              <bk-context-diagram-section [section]="section" [editMode]="editMode()" />
            } @placeholder {
              <bk-spinner />
            }
          }
          @case('rag') {
            <bk-rag-section [section]="section" [editMode]="editMode()" />
          }
          @case('slider') {
            @defer (on idle) {
              <bk-slider-section [section]="section" [editMode]="editMode()" />
            }
          }
          @case('table') {
            <bk-table-section [section]="section" />
          }
          @case('tasks') {
            <bk-tasks-section [section]="section" [editMode]="editMode()" />
          }
          @case('activities') {
            <bk-activities-section [section]="section" [editMode]="editMode()" />
          }
          @case('tracker') {
            <bk-tracker-section [section]="section" [editMode]="editMode()" [buttonCopyI18n]="buttonCopyI18n()" />
          }
          @case('video') {
            <bk-video-section [section]="section" />
          }
          @case('member-age') {
            <bk-member-age-section [section]="section" [editMode]="editMode()" />
          }
          @default {
            <bk-missing-section [section]="section" />
          }
        }
      }
    } @else {
      <ion-item color="warning">
        <ion-label>Missing type on section {{ section().bkey }}</ion-label>
      </ion-item>
    }
  `
})
export class SectionDispatcher {
  private readonly store = inject(SectionDispatcherStore);
  protected readonly buttonCopyI18n = computed(() => ({ copy_conf: this.store.i18n.copy_conf() } as ButtonCopyI18n));
  public section = input.required<SectionModel>();
  public currentUser = input.required<UserModel | undefined>();
  public editMode = input.required<boolean>();

  protected readonly roleNeeded = computed(() => this.section()?.roleNeeded as RoleName);

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
