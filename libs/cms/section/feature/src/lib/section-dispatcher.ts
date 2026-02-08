import { Component, computed, input } from '@angular/core';
import { IonItem, IonLabel } from '@ionic/angular/standalone';

import { RoleName, SectionModel, UserModel } from '@bk2/shared-models';
import { hasRole } from '@bk2/shared-util-core';

import { AccordionSectionComponent } from './accordion-section';
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
import { EventsSectionComponent } from './events-section.component';
import { InvitationsSectionComponent } from './invitations-section.component';
import { TasksSectionComponent } from './tasks-section.component';

/**
 * This component shows a section view. A section is part of a page. There are many different types of sections.
 * The section renders differently depending on the type property.
 * Use it like this: <bk-section-dispatcher sectionType="name of the sectionType"></bk-section-dispatcher>
 */
@Component({
  selector: 'bk-section-dispatcher',
  standalone: true,
  imports: [
    AccordionSectionComponent,
    ArticleSectionComponent, MissingSectionComponent, TableSectionComponent, VideoSectionComponent, EventsSectionComponent,
    IframeSectionComponent, MapSectionComponent, AlbumSectionComponent, ButtonSectionComponent,
    CalendarSectionComponent, PeopleSectionComponent, GallerySectionComponent, TrackerSectionComponent,
    HeroSectionComponent, SwiperSectionComponent, ChartSectionComponent, ChatSectionComponent,
    InvitationsSectionComponent, TasksSectionComponent,
    IonItem, IonLabel
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
            <bk-article-section [section]="section" />
          }
          @case('button') {  
            <bk-button-section [section]="section" [editMode]="editMode()" />
          }
          @case('cal') {
            <bk-calendar-section [section]="section" [editMode]="editMode()" />
          }
          @case('chart') {
            <bk-chart-section [section]="section" />
          }
          @case('chat') {
            <bk-chat-section [section]="section" />
          }
          @case('gallery') {
            <bk-gallery-section [section]="section" [editMode]="editMode()" />
          }
          @case('hero') {
            <bk-hero-section [section]="section" />
          }
          @case('iframe') { 
            <bk-iframe-section [section]="section" />
          }
          @case('map') {
            <bk-map-section [section]="section" [editMode]="editMode()" />
          }
          @case('people') {
            <bk-people-section [section]="section" [editMode]="editMode()" />
          }
          @case('slider') {
            <bk-swiper-section [section]="section" />
          }
          @case('table') {
            <bk-table-section [section]="section" />
          }
          @case('tasks') {
            <bk-tasks-section [section]="section" [editMode]="editMode()" />
          }
          @case('tracker') {
            <bk-tracker-section [section]="section" [editMode]="editMode()" />
          }
          @case('video') {
            <bk-video-section [section]="section" />
          }
          @case('events') {
            <bk-events-section [section]="section" [editMode]="editMode()" />
          }
          @case('invitations') {
            <bk-invitations-section [section]="section" [editMode]="editMode()" />
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
  public section = input.required<SectionModel>();
  public currentUser = input.required<UserModel | undefined>();
  public editMode = input.required<boolean>();

  protected readonly roleNeeded = computed(() => this.section()?.roleNeeded as RoleName);

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
