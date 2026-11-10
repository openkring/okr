import { Component, computed, effect, inject, input } from '@angular/core';
import {
  ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonChip, IonContent,
  IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonNote, IonPopover, IonTitle, IonToolbar
} from '@ionic/angular';

import { AvatarDisplay } from '@okr/avatar-ui';
import { Menu, MenuItemsStore } from '@okr/cms-menu-feature';
import { coursePlacesLabel, formatCoursePeriod } from '@okr/calendar-course-util';
import { formatChf } from '@okr/finance-booking-util';
import { CourseModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetDivider, createActionSheetOptions } from '@okr/shared-util-angular';
import { contextMenuId, fill } from '@okr/shared-util-core';

import { CourseStore } from './course.store';

/**
 * The courses of one group (spec 1.132 §7.1, §8): `/course/:groupKey/:listId/:contextMenuName`, reached from the
 * «Kurse» entry in the group calendar (everybody) or its context menu (editors). With `groupKey = 'all'` it is the
 * tenant-wide overview (every group's courses; the treasurer's entry). Everybody who sees the group may open a course; creating, editing and
 * archiving is for the people the rules name (see `course-access.util`). The treasurer / privileged / admin also get
 * the yearly compensation totals per person (§7.7).
 */
@Component({
  selector: 'okr-course-list',
  standalone: true,
  imports: [
    SvgIconPipe, Spinner, EmptyList, ListFilter, Menu, AvatarDisplay,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon, IonContent, IonList, IonItem, IonLabel, IonChip,
    IonNote, IonPopover, IonCard, IonCardHeader, IonCardTitle, IonCardContent,
  ],
  providers: [CourseStore],
  styles: [`
    .year-row { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; }
    .year-sum { font-weight: bold; border-top: 1px solid var(--ion-color-light-shade); margin-top: 4px; padding-top: 8px; }
    .amount { font-variant-numeric: tabular-nums; white-space: nowrap; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ filteredCount() }}/{{ count() }} {{ store.i18n.courses() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="store.showHelp()" [title]="store.i18n.help_open()" [attr.aria-label]="store.i18n.help_open()">
            <ion-icon slot="icon-only" src="{{ 'info-circle' | svgIcon }}" />
          </ion-button>
          @if (store.canOpenMenu() && menuItemsStore.canOpen(contextMenuName())) {
            <ion-button id="{{ popupId }}">
              <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="{{ popupId }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"
              (ionPopoverDidDismiss)="onPopoverDismiss($event)">
              <ng-template>
                <ion-content>
                  <okr-menu [menuName]="contextMenuName()" [excludeNames]="excludedMenuNames()" />
                </ion-content>
              </ng-template>
            </ion-popover>
          }
        </ion-buttons>
      </ion-toolbar>
      <okr-list-filter (searchTermChanged)="store.setSearchTerm($event)" />
    </ion-header>

    <ion-content>
      @if (!groupKey()) {
        <okr-empty-list [message]="store.i18n.list_noGroup()" />
      } @else if (store.isLoading()) {
        <okr-spinner />
      } @else if (filteredCount() === 0) {
        <okr-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-list lines="inset">
          @for (course of store.filteredCourses(); track course.okey) {
            <ion-item button [detail]="false" (click)="showActions(course)">
              <ion-label>
                <h2>{{ course.name }}</h2>
                <p>{{ period(course) }}@if (store.isAll() && store.groupNameOf(course); as group) { · {{ group }}}</p>
              </ion-label>
              <div slot="end" class="ion-hide-sm-down">
                <okr-avatar-display [avatars]="course.responsiblePersons" [showName]="false" />
              </div>
              @if (course.isAnnounced) {
                <ion-chip slot="end" color="secondary">{{ store.i18n.list_announced() }}</ion-chip>
              }
              @if (places(course); as placesLabel) {
                <ion-chip slot="end" color="light" [attr.aria-label]="placesAria(placesLabel)">{{ placesLabel }}</ion-chip>
              }
              @if (course.isLocked) {
                <ion-chip slot="end" color="medium">{{ store.i18n.list_status_locked() }}</ion-chip>
              }
              @if (course.reportedAt) {
                <ion-chip slot="end" color="success">{{ store.i18n.list_status_reported() }}</ion-chip>
              }
            </ion-item>
          }
        </ion-list>
      }

      @if (store.canSeeYearlyTotals()) {
        <ion-card>
          <ion-card-header><ion-card-title>{{ store.i18n.yearly_title() }}</ion-card-title></ion-card-header>
          <ion-card-content>
            <ion-note>{{ store.i18n.yearly_intro() }}</ion-note>
            @if (store.yearlyTotalsLoading()) {
              <okr-spinner />
            } @else if (store.yearlyTotalsFailed()) {
              <p>{{ store.i18n.yearly_error() }}</p>
            } @else if (store.yearlyTotals().length === 0) {
              <p>{{ store.i18n.yearly_empty() }}</p>
            } @else {
              @for (year of store.yearlyTotals(); track year.year) {
                <h3>{{ year.year }}</h3>
                @for (person of year.persons; track person.personKey) {
                  <div class="year-row"><span>{{ person.name }}</span><span class="amount">{{ money(person.amount) }}</span></div>
                }
                <div class="year-row year-sum"><span>{{ store.i18n.yearly_sum() }}</span><span class="amount">{{ money(year.sum) }}</span></div>
              }
            }
          </ion-card-content>
        </ion-card>
      }
    </ion-content>
  `,
})
export class CourseList {
  protected readonly store = inject(CourseStore);
  protected readonly menuItemsStore = inject(MenuItemsStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  // inputs (route: course/:groupKey/:listId/:contextMenuName)
  public readonly groupKey = input.required<string>();
  public readonly listId = input('all');   // reserved for later partitions (e.g. running / past courses); today only 'all'
  public readonly contextMenuName = input.required<string>();

  protected readonly popupId = contextMenuId('c_courses');
  protected readonly count = computed(() => this.store.coursesCount());
  protected readonly filteredCount = computed(() => this.store.filteredCourses().length);
  /** `add` is for those who may create (privileged / group admin); a plain responsible person sees the other rows only */
  protected readonly excludedMenuNames = computed(() => this.store.canAdd() ? [] : ['course-add']);

  constructor() {
    effect(() => this.store.setGroupKey(this.groupKey()));
  }

  protected period(course: CourseModel): string {
    return formatCoursePeriod(course);
  }

  /** «5/8» (taken/places); '' while the count is unknown, or when unlimited and nobody has a place */
  protected places(course: CourseModel): string {
    const taken = this.store.placesTakenOf(course);
    return taken === undefined ? '' : coursePlacesLabel(course.maxParticipants ?? 0, taken);
  }

  /** «Belegte Plätze: 5/8» for screen readers */
  protected placesAria(label: string): string {
    return fill(this.store.i18n.list_placesAria(), { places: label });
  }

  protected money(minor: number): string {
    return formatChf(minor);
  }

  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const method = $event.detail.data;
    if (!method) return;   // dismissed without choosing an item
    switch (method) {
      case 'add': await this.store.add(); break;
      case 'exportGeneric': await this.store.exportGeneric(); break;
      default: console.error(`CourseList.onPopoverDismiss: unknown method ${method}`);
    }
  }

  /******************************* per-course actions *************************************** */
  protected async showActions(course: CourseModel): Promise<void> {
    const options = createActionSheetOptions(course.name);
    this.addActionSheetButtons(options, course);
    await this.executeActions(options, course);
  }

  private addActionSheetButtons(options: ActionSheetOptions, course: CourseModel): void {
    const i18n = this.store.i18n;
    const mayManage = this.store.mayManage(course);
    options.buttons.push(createActionSheetButton('course.open', i18n.list_open(), this.imgixBaseUrl, 'grid'));
    if (mayManage) {
      options.buttons.push(createActionSheetButton('course.edit', i18n.list_edit(), this.imgixBaseUrl, 'edit'));
    } else {
      options.buttons.push(createActionSheetButton('course.view', i18n.list_view(), this.imgixBaseUrl, 'eye-on'));
    }
    if (mayManage) {
      options.buttons.push(createActionSheetButton('course.invite', i18n.list_invite(), this.imgixBaseUrl, 'email'));
      options.buttons.push(createActionSheetDivider());
      options.buttons.push(createActionSheetButton('course.archive', i18n.list_archive(), this.imgixBaseUrl, 'trash'));
    }
    options.buttons.push(createActionSheetButton('cancel', i18n.list_cancel(), this.imgixBaseUrl, 'cancel'));
  }

  private async executeActions(options: ActionSheetOptions, course: CourseModel): Promise<void> {
    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'course.open': await this.store.openTable(course); break;
      case 'course.edit': await this.store.edit(course); break;
      case 'course.view': await this.store.edit(course, true); break;
      case 'course.invite': await this.store.inviteApplicants(course); break;
      case 'course.archive': await this.store.archive(course); break;
    }
  }
}
