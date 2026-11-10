import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonButton, IonButtons, IonCheckbox, IonContent, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonNote, ModalController } from '@ionic/angular';

import {
  COURSE_I18N_KEYS, CourseApplicantRow, CourseApplicantsResult, courseInviteCountsLine, CourseI18n, groupCourseApplicants, preselectedApplicantKeys
} from '@okr/calendar-course-util';
import { I18nService } from '@okr/shared-i18n';
import { ApplicationCourseState, ApplicationKind, CourseModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { fill } from '@okr/shared-util-core';

/**
 * Selection dialog: which applicants to invite to a course (spec 1.152 §8.1). Not an edit modal — nothing is stored
 * from a form, the choice is the dismiss data (role `confirm`, the application keys); the caller
 * (`CourseStore.inviteApplicants`) calls `inviteApplicantsToCourse`. On the `check-forms` MODAL_ALLOWLIST.
 *
 * The rows come from `listCourseApplicants`, already filtered by D7: a non-privileged manager never receives the
 * third group («Weitere Bewerbende»), so it is simply empty for them.
 */
@Component({
  selector: 'okr-course-invite-modal',
  standalone: true,
  imports: [
    Header, EmptyList, SvgIconPipe, NgTemplateOutlet,
    IonContent, IonList, IonListHeader, IonItem, IonLabel, IonCheckbox, IonNote, IonButtons, IonButton, IonIcon,
  ],
  styles: [`
    .counts { display: block; padding: 12px 16px 0; }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n.invite_title() }" [isModal]="true">
      <ion-buttons okrHeaderEnd slot="end">
        <ion-button [strong]="true" [disabled]="selected().size === 0" (click)="invite()">{{ inviteLabel() }}</ion-button>
      </ion-buttons>
    </okr-header>
    <ion-content>
      <ion-note class="counts">{{ countsLine() }}</ion-note>
      @if (result().rows.length === 0) {
        <okr-empty-list [message]="i18n.invite_empty()" />
      } @else {
        @if (groups().onCourse.length > 0) {
          <ion-list lines="inset">
            <ion-list-header>{{ i18n.invite_group_onCourse() }}</ion-list-header>
            @for (row of groups().onCourse; track row.key) { <ng-container *ngTemplateOutlet="item; context: { $implicit: row }" /> }
          </ion-list>
        }
        @if (groups().inAudience.length > 0) {
          <ion-list lines="inset">
            <ion-list-header>{{ i18n.invite_group_audience() }}</ion-list-header>
            @for (row of groups().inAudience; track row.key) { <ng-container *ngTemplateOutlet="item; context: { $implicit: row }" /> }
          </ion-list>
        }
        @if (groups().others.length > 0) {
          <ion-list lines="inset">
            <ion-item button [detail]="false" (click)="showOthers.set(!showOthers())" [attr.aria-expanded]="showOthers()">
              <ion-label>{{ i18n.invite_group_others() }} ({{ groups().others.length }})</ion-label>
              <ion-icon slot="end" src="{{ (showOthers() ? 'chevron-up' : 'chevron-down') | svgIcon }}" aria-hidden="true" />
            </ion-item>
            @if (showOthers()) {
              @for (row of groups().others; track row.key) { <ng-container *ngTemplateOutlet="item; context: { $implicit: row }" /> }
            }
          </ion-list>
        }
      }
    </ion-content>

    <ng-template #item let-row>
      <ion-item>
        <ion-checkbox slot="start" [checked]="selected().has(row.key)" (ionChange)="toggle(row.key)" [attr.aria-label]="row.firstName + ' ' + row.lastName" />
        <ion-label>
          <h3>{{ row.firstName }} {{ row.lastName }}</h3>
          <p>{{ details(row) }}</p>
        </ion-label>
      </ion-item>
    </ng-template>
  `,
})
export class CourseInviteModal {
  private readonly modalController = inject(ModalController);
  // direct inject, no store: the store opens this modal
  protected readonly i18n = inject(I18nService).translateAll(COURSE_I18N_KEYS) as CourseI18n;

  // inputs
  public readonly course = input.required<CourseModel>();
  public readonly result = input.required<CourseApplicantsResult>();

  // state
  protected readonly groups = computed(() => groupCourseApplicants(this.result().rows, this.course().okey, this.course().audience ?? []));
  protected readonly selected = linkedSignal<ReadonlySet<string>>(() => new Set(preselectedApplicantKeys(this.result().rows, this.course().okey)));
  protected readonly showOthers = signal(false);

  protected readonly countsLine = computed(() => courseInviteCountsLine(this.result(), {
    places: this.i18n.invite_counts_places(),
    unlimited: this.i18n.invite_counts_unlimited(),
    invited: this.i18n.invite_counts_invited(),
    accepted: this.i18n.invite_counts_accepted(),
  }));
  protected readonly inviteLabel = computed(() => {
    const n = this.selected().size;
    return n > 0 ? `${this.i18n.invite_send()} (${n})` : this.i18n.invite_send();
  });

  private readonly kindLabels = computed<Record<ApplicationKind, string>>(() => ({
    youth: this.i18n.form_announce_youth(),
    adult: this.i18n.form_announce_adult(),
    transfer: this.i18n.form_announce_transfer(),
  }));
  private readonly stateLabels = computed<Record<ApplicationCourseState, string>>(() => ({
    '': '',
    registered: this.i18n.invite_state_registered(),
    invited: this.i18n.invite_state_invited(),
    accepted: this.i18n.invite_state_accepted(),
    declined: this.i18n.invite_state_declined(),
  }));

  /** «Junioren · 14 Jahre · angemeldet für Skiff 2» */
  protected details(row: CourseApplicantRow): string {
    const parts = [this.kindLabels()[row.applicationAs] ?? ''];
    if (row.age !== undefined) parts.push(fill(this.i18n.invite_age(), { age: row.age }));
    const state = this.stateLabels()[row.courseState] ?? '';
    if (row.courseKey === this.course().okey) {
      if (state) parts.push(state);
    } else if (row.courseKey && state) {
      parts.push(fill(this.i18n.invite_onOther(), { state, course: row.courseName }));
    }
    return parts.filter(Boolean).join(' · ');
  }

  protected toggle(key: string): void {
    const next = new Set(this.selected());
    if (!next.delete(key)) next.add(key);
    this.selected.set(next);
  }

  protected async invite(): Promise<void> {
    if (this.selected().size === 0) return;
    await dismissOverlay(this.modalController, [...this.selected()], 'confirm');
  }
}
