import { Component, DestroyRef, computed, effect, inject, input } from '@angular/core';
import {
  ActionSheetController, ActionSheetOptions, IonBackButton, IonButton, IonButtons, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel,
  IonNote, IonTitle, IonToolbar
} from '@ionic/angular';

import { CourseTable } from '@okr/calendar-course-ui';
import { CalEventModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, Spinner } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetDivider, createActionSheetOptions } from '@okr/shared-util-angular';

import { CourseTableStore } from './course-table.store';

/** «now» moves on while the page is open: an event that begins gets its prefill and becomes confirmable */
const CLOCK_INTERVAL_MS = 60_000;

/**
 * The course table (spec 1.132 §8): `/course/table/:courseKey`. Whoever has a role in the course, is a member of its
 * group or appears in the table sees the whole table with sign-ups and attendance (D7) — the amounts only those who
 * may read the finance document; everybody else gets the not-found state (§13, `mayViewCourseTable`). Trainers,
 * responsible persons, group admins, eventAdmin and privileged confirm the attendance per event (tap a column) and
 * assign group events while the course is not locked; the toolbar menu holds the exports, lock / unlock, the
 * compensation request and the «reported» note, each for the people §6 names.
 *
 * The course actions are an ActionSheet rather than a DB-driven context menu: which of them apply depends on the
 * course's state (locked or not, report profile) and on per-course rights (responsible, trainer, group admin) that a
 * menu row's `roleNeeded` cannot express.
 */
@Component({
  selector: 'okr-course-table-page',
  standalone: true,
  imports: [
    SvgIconPipe, Spinner, EmptyList, CourseTable,
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonButton, IonTitle, IonIcon, IonContent, IonItem, IonLabel, IonNote, IonChip,
  ],
  providers: [CourseTableStore],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-back-button [defaultHref]="backHref()" /></ion-buttons>
        <ion-title>{{ title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="store.showHelp()" [title]="store.i18n.help_open()" [attr.aria-label]="store.i18n.help_open()">
            <ion-icon slot="icon-only" src="{{ 'info-circle' | svgIcon }}" />
          </ion-button>
          @if (store.canAddSeries()) {
            <ion-button (click)="store.addSeries()">
              <ion-icon slot="start" src="{{ 'add-circle' | svgIcon }}" />
              {{ store.i18n.action_addSeries() }}
            </ion-button>
          }
          @if (hasActions()) {
            <ion-button (click)="showCourseActions()">
              <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
            </ion-button>
          }
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if (store.notFound()) {
        <okr-empty-list [message]="store.i18n.table_notFound()" />
      } @else if (store.table(); as table) {
        @if (store.isLocked() || store.course()?.reportedAt) {
          <ion-item lines="none">
            @if (store.isLocked()) {
              <ion-icon slot="start" color="medium" src="{{ 'lock-closed' | svgIcon }}" />
              <ion-label class="ion-text-wrap"><ion-note>{{ store.i18n.table_locked() }}</ion-note></ion-label>
            }
            @if (store.course()?.reportedAt) {
              <ion-chip slot="end" color="success">{{ store.i18n.table_reported() }}</ion-chip>
            }
          </ion-item>
        }
        <okr-course-table
          [table]="table"
          [i18n]="store.i18n"
          [canEdit]="store.canEdit()"
          [canAddNumbers]="store.canManage()"
          [findings]="store.findings()"
          [numberErrors]="store.numberErrors()"
          [compensation]="store.compensation()"
          [unlistedKeys]="store.unlistedKeys()"
          [typeLabels]="store.typeLabels()"
          [formatMoney]="formatMoney"
          [nameDisplay]="store.nameDisplay()"
          [today]="store.today()"
          [nowTime]="store.nowTime()"
          (eventClicked)="showEventActions($event)"
          (assignClicked)="store.assign($event)"
          (addNumberClicked)="store.promptMissingNumber($event)"
        />
      } @else {
        <okr-spinner />
      }
    </ion-content>
  `,
})
export class CourseTablePage {
  protected readonly store = inject(CourseTableStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  // inputs (route: course/table/:courseKey)
  public readonly courseKey = input.required<string>();

  protected readonly title = computed(() => this.store.course()?.name || this.store.i18n.table_title());
  protected readonly backHref = computed(() => {
    const groupKey = this.store.course()?.groupKey;
    return groupKey ? `/course/${groupKey}/all/c-courses` : '/';
  });
  /** the toolbar menu: anybody who may export or manage; plain members have nothing to do here */
  protected readonly hasActions = computed(() => this.store.canExport() || this.store.canManage());
  protected readonly formatMoney = (minor: number, currency?: string): string => this.store.money(minor, currency);

  constructor() {
    effect(() => this.store.loadTable(this.courseKey()));
    const clock = setInterval(() => this.store.tick(), CLOCK_INTERVAL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(clock));
  }

  /******************************* course actions *************************************** */
  protected async showCourseActions(): Promise<void> {
    const course = this.store.course();
    if (!course) return;
    const i18n = this.store.i18n;
    const options = createActionSheetOptions(course.name);
    if (this.store.canExport()) {
      options.buttons.push(createActionSheetButton('course.exportGeneric', i18n.action_exportGeneric(), this.imgixBaseUrl, 'download'));
      if (this.store.isJs()) {
        options.buttons.push(createActionSheetButton('course.exportJs', i18n.action_exportJs(), this.imgixBaseUrl, 'download'));
      }
    }
    if (this.store.canManage()) {
      options.buttons.push(createActionSheetDivider());
      if (course.isLocked) {
        options.buttons.push(createActionSheetButton('course.request', i18n.action_request(), this.imgixBaseUrl, 'moneybag'));
        if (!course.reportedAt) {
          options.buttons.push(createActionSheetButton('course.reported', i18n.action_reported(), this.imgixBaseUrl, 'send'));
        }
        options.buttons.push(createActionSheetButton('course.unlock', i18n.action_unlock(), this.imgixBaseUrl, 'lock-open'));
      } else {
        options.buttons.push(createActionSheetButton('course.lock', i18n.action_lock(), this.imgixBaseUrl, 'lock-closed'));
      }
    }
    options.buttons.push(createActionSheetButton('cancel', i18n.list_cancel(), this.imgixBaseUrl, 'cancel'));
    const { data } = await this.present(options);
    switch (data?.action) {
      case 'course.exportGeneric': await this.store.exportGeneric(); break;
      case 'course.exportJs': await this.store.exportJs(); break;
      case 'course.lock': await this.store.lock(); break;
      case 'course.unlock': await this.store.unlock(); break;
      case 'course.request': await this.store.requestCompensation(); break;
      case 'course.reported': await this.store.markReported(); break;
    }
  }

  /******************************* per-event actions *************************************** */
  /** A tapped column: confirm the attendance (from the event's start on) or take the event out of the course. */
  protected async showEventActions(event: CalEventModel): Promise<void> {
    if (!this.store.canEdit()) return;
    this.store.tick();
    const i18n = this.store.i18n;
    const options = createActionSheetOptions(`${this.store.eventLabel(event)} ${event.name ?? ''}`.trim());
    if (this.store.hasStarted(event)) {
      options.buttons.push(createActionSheetButton('event.attendance', i18n.event_attendance(), this.imgixBaseUrl, 'checkbox-circle'));
    }
    options.buttons.push(createActionSheetButton('event.unassign', i18n.event_unassign(), this.imgixBaseUrl, 'remove-circle'));
    options.buttons.push(createActionSheetButton('cancel', i18n.list_cancel(), this.imgixBaseUrl, 'cancel'));
    const { data } = await this.present(options);
    switch (data?.action) {
      case 'event.attendance': await this.store.openAttendance(event); break;
      case 'event.unassign': await this.store.unassign(event); break;
    }
  }

  private async present(options: ActionSheetOptions): Promise<{ data?: { action?: string } }> {
    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    return actionSheet.onDidDismiss();
  }
}
