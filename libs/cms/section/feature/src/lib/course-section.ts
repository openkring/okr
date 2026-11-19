import { Component, computed, effect, inject, input } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCardSubtitle } from '@ionic/angular';

import { OptionalCardHeader } from '@okr/shared-ui';
import { I18nService } from '@okr/shared-i18n';
import { CourseConfig, SectionModel } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat, fill, formatCourseRange, PublicCourse } from '@okr/shared-util-core';
import { getSectionIntro } from '@okr/cms-section-util';

import { CoursePreselectService } from './course-preselect.service';
import { CourseSectionStore } from './course-section.store';
import { formatCourseDateLine, isPastCourseDate, todayIso } from './course-section.util';

const COURSE_FORM_ID = 'okr-course-form';

/** Announced courses with their dates; «Jetzt anmelden» preselects the course in the Anmeldung form (spec 1.166). */
@Component({
  selector: 'okr-course-section',
  standalone: true,
  providers: [CourseSectionStore],
  imports: [IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCardSubtitle, OptionalCardHeader],
  styles: [`
    ion-card.course { margin: 8px 0; }
    ul.dates { list-style: none; margin: 8px 0; padding: 0; }
    ul.dates li { padding: 2px 0; }
    li.past { opacity: 0.5; }
    li.cancelled .line { text-decoration: line-through; }
    li.cancelled .badge { margin-left: 8px; font-size: 0.8rem; color: var(--ion-color-danger); }
    .places { font-size: 0.9rem; margin: 8px 0; }
  `],
  template: `
    @if (!isLoading()) {
      @if (courses().length > 0) {
        <okr-optional-card-header [intro]="sectionIntro().text" [introPosition]="sectionIntro().position" [title]="title()" [subTitle]="subTitle()" />
        @for (course of courses(); track course.key) {
          <ion-card class="course">
            <ion-card-header>
              <ion-card-title>{{ course.name }}</ion-card-title>
              @if (range(course); as r) {
                <ion-card-subtitle>{{ r }}</ion-card-subtitle>
              }
            </ion-card-header>
            <ion-card-content>
              @if (course.dates.length > 0) {
                <ul class="dates">
                  @for (d of course.dates; track $index) {
                    <li [class.past]="isPast(d)" [class.cancelled]="d.isCancelled">
                      <span class="line">{{ dateLine(d) }}</span>
                      @if (d.isCancelled) {
                        <span class="badge">{{ store.i18n.course_cancelled() }}</span>
                      }
                    </li>
                  }
                </ul>
              }
              @if (placesText(course); as p) {
                <p class="places">{{ p }}</p>
              }
              @if (preselect.courseFormPresent()) {
                <ion-button [disabled]="course.isFull || editMode()" (click)="register(course)">
                  {{ course.isFull ? store.i18n.course_full() : store.i18n.course_register() }}
                </ion-button>
              }
            </ion-card-content>
          </ion-card>
        }
      } @else if (emptyText()) {
        <ion-card><ion-card-content>{{ emptyText() }}</ion-card-content></ion-card>
      }
    }
  `,
})
export class CourseSection {
  protected readonly store = inject(CourseSectionStore);
  protected readonly preselect = inject(CoursePreselectService);
  private readonly i18nService = inject(I18nService);

  public section = input<SectionModel>();
  public editMode = input<boolean>(false);

  protected readonly config = computed(() => this.section()?.properties as CourseConfig | undefined);
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);
  protected readonly sectionIntro = computed(() => getSectionIntro(this.section()));
  protected readonly courses = computed(() => this.store.courses());
  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly emptyText = computed(() => {
    const cfg = this.config();
    return cfg?.emptyTextI18n?.[this.i18nService.getActiveLang()] || cfg?.emptyText || '';
  });
  private readonly today = todayIso();

  constructor() {
    effect(() => this.store.setAudience(this.config()?.audience ?? []));
  }

  /** «12.03.–30.04.2027»; the formatter reads StoreDates, the endpoint sends ISO. */
  protected range(course: PublicCourse): string {
    const store = (iso: string) => convertDateFormatToString(iso, DateFormat.IsoDate, DateFormat.StoreDate, false);
    return formatCourseRange(store(course.startDate), store(course.endDate));
  }

  protected dateLine(d: PublicCourse['dates'][number]): string {
    return formatCourseDateLine(d, this.i18nService.getActiveLang());
  }

  protected isPast(d: PublicCourse['dates'][number]): boolean {
    return isPastCourseDate(d, this.today);
  }

  /** '' when the course has no place limit; the full state is shown on the button instead. */
  protected placesText(course: PublicCourse): string {
    if (course.remaining < 0 || course.isFull) return '';
    return course.remaining === 1
      ? this.store.i18n.course_places_one()
      : fill(this.store.i18n.course_places(), { n: course.remaining });
  }

  protected register(course: PublicCourse): void {
    if (this.editMode() || course.isFull) return;
    this.preselect.request(course.key);
    const host = document.getElementById(COURSE_FORM_ID);
    if (!host) return;
    host.scrollIntoView({ behavior: 'smooth', block: 'start' });
    host.querySelector<HTMLElement>('input, select, textarea')?.focus({ preventScroll: true });
  }
}
