import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { ModalController } from '@ionic/angular';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom, from, of } from 'rxjs';

import { CourseService } from '@okr/calendar-course-data-access';
import {
  buildCourseListRows, COURSE_I18N_KEYS, CourseAccess, CourseI18n, isCourseResponsible, mayCreateCourse, mayManageCourse,
  mayReadCourseFinance, yearlyTotalRows
} from '@okr/calendar-course-util';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { CourseFinanceModel, CourseModel } from '@okr/shared-models';
import { AlertService, exportCsv, resourceParams } from '@okr/shared-util-angular';
import { deepEqual, hasRole, nameMatches } from '@okr/shared-util-core';
import { isAdminMember } from '@okr/subject-group-util';

import type { CourseEditResult } from './course-edit.modal';

export type CourseState = {
  /** the group whose courses are listed (route param) */
  groupKey: string;
  searchTerm: string;
};
export const initialCourseState: CourseState = {
  groupKey: '',
  searchTerm: '',
};

/**
 * State of the course list (spec 1.132 §7.1, §7.7, §8).
 *
 * The edit modal is imported on demand (`await import()`): it pulls in the accounting data-access services
 * (books, accounts, cost centres), which the list itself does not need.
 */
export const CourseStore = signalStore(
  withState(initialCourseState),
  withProps(() => ({
    courseService: inject(CourseService),
    appStore: inject(AppStore),
    router: inject(Router),
    modalController: inject(ModalController),
    alertService: inject(AlertService),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(COURSE_I18N_KEYS) as CourseI18n,
  })),
  withComputed((state) => {
    const currentUser = computed(() => state.appStore.currentUser());
    const group = computed(() => state.appStore.getGroup(state.groupKey()));
    return {
      currentUser,
      tenantId: computed(() => state.appStore.tenantId()),
      group,
      groupName: computed(() => group()?.name ?? ''),
      /** What the user is, as far as the course rules are concerned (see `course-access.util`). */
      access: computed<CourseAccess>(() => ({
        personKey: currentUser()?.personKey ?? '',
        isGroupAdmin: isAdminMember(group(), currentUser()?.personKey),
        isPrivileged: hasRole('privileged', currentUser()),
        isTreasurer: hasRole('treasurer', currentUser()),
      })),
      /** the books of the tenant's default; '' = none set (the yearly totals then stay hidden) */
      books: computed(() => state.appStore.appConfig().defaultAccountingTenantId ?? ''),
    };
  }),
  withProps((state) => ({
    coursesResource: rxResource({
      params: resourceParams(() => state.groupKey()),
      stream: ({ params: groupKey }) => groupKey ? state.courseService.list(groupKey) : of([] as CourseModel[]),
    }),
  })),
  withComputed((state) => {
    /**
     * Only the treasurer, privileged and admin may read `bookings`, so nobody else gets a query at all.
     * Needs the books (`defaultAccountingTenantId`, never the app tenant); without them nothing is shown.
     */
    const canSeeYearlyTotals = computed(() => (state.access().isTreasurer || state.access().isPrivileged) && state.books() !== '');
    const courses = computed(() => state.coursesResource.value() ?? []);
    return {
      courses,
      coursesCount: computed(() => courses().length),
      filteredCourses: computed(() => courses().filter(c => nameMatches(c.index, state.searchTerm()))),
      isLoading: computed(() => state.coursesResource.isLoading()),
      /** may create a course in this group (the rules: privileged or admin of the group) */
      canAdd: computed(() => mayCreateCourse(state.access()) && state.groupKey() !== ''),
      /** responsible for at least one listed course, group admin, or privileged: the list's toolbar menu is theirs */
      canManage: computed(() => mayCreateCourse(state.access()) || courses().some(c => isCourseResponsible(c, state.access().personKey))),
      canSeeYearlyTotals,
    };
  }),
  withProps((state) => ({
    postedCompensationResource: rxResource({
      params: resourceParams(() => state.canSeeYearlyTotals() ? state.books() : undefined),
      stream: ({ params: books }) => books ? from(state.courseService.listPostedCompensation(books)) : of([]),
    }),
  })),
  withComputed((state) => ({
    /** year → persons → amount (§7.7), newest year first; only ever filled for the treasurer / privileged / admin */
    yearlyTotals: computed(() => yearlyTotalRows(state.postedCompensationResource.value() ?? [])),
    yearlyTotalsFailed: computed(() => state.canSeeYearlyTotals() && state.postedCompensationResource.status() === 'error'),
    yearlyTotalsLoading: computed(() => state.canSeeYearlyTotals() && state.postedCompensationResource.isLoading()),
  })),
  withMethods((store) => ({
    reload(): void {
      store.coursesResource.reload();
      if (store.canSeeYearlyTotals()) store.postedCompensationResource.reload();
    },

    /******************************** setters ******************************************* */
    setGroupKey(groupKey: string): void {
      patchState(store, { groupKey });
    },
    setSearchTerm(searchTerm: string): void {
      patchState(store, { searchTerm });
    },

    /******************************** per course ******************************************* */
    mayManage(course: CourseModel): boolean {
      return mayManageCourse(course, store.access());
    },

    /******************************** actions ******************************************* */
    async add(): Promise<void> {
      if (!store.canAdd()) return;
      const course = new CourseModel(store.tenantId());
      course.groupKey = store.groupKey();
      // Creating needs privileged or group admin, and both may read the finance document: show its form,
      // empty. It comes back only when it was changed (CourseEditResult.finance).
      const result = await this.openEditModal(course, new CourseFinanceModel(), false);
      if (!result) return;
      const key = await store.courseService.create(result.course, store.currentUser());
      if (key && result.finance) await store.courseService.saveFinance(key, result.finance);
      store.coursesResource.reload();
    },

    async edit(course: CourseModel, readOnly = false): Promise<void> {
      const mayEdit = !readOnly && mayManageCourse(course, store.access());
      // Only people who may read the amounts get the finance form, and only they trigger the read; for everybody
      // else the modal opens without it. `undefined` from `readFinance` means «not set up yet» (or unreadable):
      // the form then starts empty, and is saved only if it is changed.
      let finance: CourseFinanceModel | undefined;
      if (mayReadCourseFinance(course, store.access())) {
        finance = (await firstValueFrom(store.courseService.readFinance(course.okey))) ?? new CourseFinanceModel();
      }
      const result = await this.openEditModal(course, finance, !mayEdit);
      if (!result || !mayEdit) return;
      if (!deepEqual(result.course, course)) await store.courseService.update(result.course, store.currentUser());
      if (result.finance) await store.courseService.saveFinance(course.okey, result.finance);
      store.coursesResource.reload();
    },

    async archive(course: CourseModel): Promise<void> {
      if (!mayManageCourse(course, store.access())) return;
      const confirmed = await store.alertService.confirm(store.i18n.list_archiveConfirm(), true);
      if (!confirmed) return;
      await store.courseService.archive(course, store.currentUser());
      store.coursesResource.reload();
    },

    /** The course table (attendance, lock, export) of one course. */
    async openTable(course: CourseModel): Promise<void> {
      await store.router.navigate(['/course/table', course.okey]);
    },

    /** The listed (filtered) courses as CSV. */
    async exportGeneric(): Promise<void> {
      const rows = buildCourseListRows(store.filteredCourses(), {
        name: store.i18n.list_col_name(),
        period: store.i18n.list_col_period(),
        responsible: store.i18n.list_col_responsible(),
        trainers: store.i18n.list_col_trainers(),
        status: store.i18n.list_col_status(),
        locked: store.i18n.list_status_locked(),
        reported: store.i18n.list_status_reported(),
      });
      await exportCsv(rows, store.i18n.list_csvFile());
    },

    /** Opens the edit modal; the result of a confirmed dialog, else `undefined`. */
    async openEditModal(course: CourseModel, finance: CourseFinanceModel | undefined, readOnly: boolean): Promise<CourseEditResult | undefined> {
      const { CourseEditModal } = await import('./course-edit.modal');
      const modal = await store.modalController.create({
        component: CourseEditModal,
        componentProps: {
          course,
          finance,
          currentUser: store.currentUser(),
          groupName: store.groupName(),
          calEventTypes: store.appStore.getCategory('calevent_type'),
          readOnly,
        },
      });
      await modal.present();
      const { data, role } = await modal.onDidDismiss<CourseEditResult>();
      return role === 'confirm' && data ? data : undefined;
    },
  })),
);
