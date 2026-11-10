import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { ModalController } from '@ionic/angular';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { catchError, from, of } from 'rxjs';

import { CourseService } from '@okr/calendar-course-data-access';
import {
  ALL_COURSES_KEY, buildCourseListRows, chunkKeys, COURSE_I18N_KEYS, CourseAccess, CourseApplicantsResult, courseListHelpRole, CourseI18n,
  INVITE_MAX_APPLICANTS, InviteApplicantsResult, inviteResultMessage, loadFinanceForEdit, mayCreateCourse, mayManageCourse, mayOpenCourseMenu,
  mayReadCourseFinance, mayWriteCourseFinance, yearlyTotalRows
} from '@okr/calendar-course-util';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { CourseFinanceModel, CourseModel } from '@okr/shared-models';
import { AlertService, exportCsv, resourceParams } from '@okr/shared-util-angular';
import { deepEqual, hasRole, nameMatches } from '@okr/shared-util-core';
import { isAdminMember } from '@okr/subject-group-util';

import type { CourseEditResult } from './course-edit.modal';

export type CourseState = {
  /** the group whose courses are listed (route param); `ALL_COURSES_KEY` = every course of the tenant */
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
 * (books, accounts, cost centres), which the list itself does not need. The invite dialog comes from the ui lib, on
 * demand too (spec 1.152 §8.1).
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
    const isAll = computed(() => state.groupKey() === ALL_COURSES_KEY);
    const group = computed(() => isAll() ? undefined : state.appStore.getGroup(state.groupKey()));
    const personKey = computed(() => currentUser()?.personKey ?? '');
    return {
      currentUser,
      tenantId: computed(() => state.appStore.tenantId()),
      isAll,
      group,
      groupName: computed(() => group()?.name ?? ''),
      /**
       * What the user is as far as the rules go, for the listed group (create) — the group admin flag is per GROUP,
       * so for a single course use `accessFor(course)`.
       */
      access: computed<CourseAccess>(() => ({
        personKey: personKey(),
        isGroupAdmin: isAdminMember(group(), personKey()),
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
      stream: ({ params: groupKey }) => !groupKey ? of([] as CourseModel[])
        : groupKey === ALL_COURSES_KEY ? state.courseService.listAll() : state.courseService.list(groupKey),
    }),
  })),
  withComputed((state) => {
    /**
     * The yearly totals are for the treasurer, privileged and admin — the same readers firestore.rules allows on
     * `bookings` / `booking-lines` (a plain member reads only the booking of their own expense). This gate mirrors
     * the rules: nobody else gets a query at all (it would be denied) and the card is not rendered. Needs the books
     * (`defaultAccountingTenantId`, never the app tenant); without them nothing is shown.
     */
    const canSeeYearlyTotals = computed(() => (state.access().isTreasurer || state.access().isPrivileged) && state.books() !== '');
    const courses = computed(() => state.coursesResource.value() ?? []);
    const canAdd = computed(() => mayCreateCourse(state.access()) && state.groupKey() !== '' && !state.isAll());
    /** the group admin flag belongs to the course's own group, which differs per row in the overview */
    const accessFor = (course: CourseModel): CourseAccess => ({
      ...state.access(),
      isGroupAdmin: isAdminMember(state.appStore.getGroup(course.groupKey), state.access().personKey),
    });
    return {
      courses,
      coursesCount: computed(() => courses().length),
      filteredCourses: computed(() => courses().filter(c => nameMatches(c.index, state.searchTerm()))),
      isLoading: computed(() => state.coursesResource.isLoading()),
      /** may create a course in the listed group (the rules: privileged or admin of the group); never in the overview */
      canAdd,
      /**
       * the toolbar menu (add, export): whoever may add (a group admin on an EMPTY list included), manages a listed
       * course, or is privileged / treasurer (the overview's export)
       */
      canOpenMenu: computed(() => mayOpenCourseMenu(
        state.access(),
        canAdd(),
        courses().some(c => mayManageCourse(c, accessFor(c))),
      )),
      canSeeYearlyTotals,
      /** whose help the (i) opens: the strongest role of the viewer over the listed courses (§10) */
      helpRole: computed(() => courseListHelpRole(courses(), accessFor, state.access())),
    };
  }),
  withProps((state) => ({
    postedCompensationResource: rxResource({
      params: resourceParams(() => state.canSeeYearlyTotals() ? state.books() : undefined),
      stream: ({ params: books }) => books ? from(state.courseService.listPostedCompensation(books)) : of([]),
    }),
    /**
     * Places taken per listed course (A7), ONE callable for the whole list (`courseApplicantCounts`). The server
     * answers only for courses the viewer manages or that are announced; a failure leaves the chips without a count.
     */
    placesResource: rxResource({
      params: resourceParams(() => state.courses().slice(0, INVITE_MAX_APPLICANTS).map(c => c.okey)),
      stream: ({ params: keys }) => keys.length === 0 ? of({} as Record<string, number>)
        : from(state.courseService.applicantCounts(keys)).pipe(catchError((err) => {
          console.warn('CourseStore: the places per course could not be loaded.', err);
          return of({} as Record<string, number>);
        })),
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
      store.placesResource.reload();
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
    accessFor(course: CourseModel): CourseAccess {
      return {
        ...store.access(),
        isGroupAdmin: isAdminMember(store.appStore.getGroup(course.groupKey), store.access().personKey),
      };
    },
    mayManage(course: CourseModel): boolean {
      return mayManageCourse(course, this.accessFor(course));
    },
    /** Places taken on a course (A7); `undefined` while unknown (loading, not counted for this viewer, failed). */
    placesTakenOf(course: CourseModel): number | undefined {
      return store.placesResource.value()?.[course.okey];
    },
    /** name of the course's group, for the overview rows */
    groupNameOf(course: CourseModel): string {
      return store.appStore.getGroup(course.groupKey)?.name ?? '';
    },

    /******************************** actions ******************************************* */
    /** The (i): the help for the viewer's role. The ui lib is imported on demand, like the edit modal. */
    async showHelp(): Promise<void> {
      const { openCourseHelp } = await import('@okr/calendar-course-ui');
      await openCourseHelp(store.modalController, store.helpRole());
    },

    async add(): Promise<void> {
      if (!store.canAdd()) return;
      const course = new CourseModel(store.tenantId());
      course.groupKey = store.groupKey();
      // Creating needs privileged or group admin, and both may read the finance document: show its form,
      // empty (a new course has no finance document yet, so there is nothing a save could overwrite). It comes
      // back only when it was changed (CourseEditResult.finance).
      const result = await this.openEditModal(course, new CourseFinanceModel(), false);
      if (!result) return;
      const key = await store.courseService.create(result.course, store.currentUser());
      if (key && result.finance) await store.courseService.saveFinance(key, result.finance);
      store.coursesResource.reload();
    },

    async edit(course: CourseModel, readOnly = false): Promise<void> {
      const access = this.accessFor(course);
      const mayEdit = !readOnly && mayManageCourse(course, access);
      // Only people who may read the amounts get the finance form, and only they trigger the read. The read is
      // STRICT (server, confirmed-missing vs. failed): `saveFinance` overwrites the whole document, so a blank form
      // is offered only when the server said «no document». If the read failed the dialog opens WITHOUT the
      // finance part (nothing saveable) and the user is told.
      const { finance, unavailable } = await loadFinanceForEdit(
        mayReadCourseFinance(course, access),
        () => store.courseService.readFinanceStrict(course.okey),
      );
      if (unavailable) void store.alertService.showToast(store.i18n.list_financeUnavailable());
      // a treasurer who does not manage the course sees the rates read-only (the whole dialog is read-only for them)
      // and never writes them — the rules allow finance writes to the course managers only (spec §6)
      const result = await this.openEditModal(course, finance, !mayEdit);
      if (!result || !mayEdit) return;
      if (!deepEqual(result.course, course)) await store.courseService.update(result.course, store.currentUser());
      if (result.finance && mayWriteCourseFinance(course, access)) await store.courseService.saveFinance(course.okey, result.finance);
      store.coursesResource.reload();
    },

    async archive(course: CourseModel): Promise<void> {
      if (!this.mayManage(course)) return;
      const confirmed = await store.alertService.confirm(store.i18n.list_archiveConfirm(), true);
      if (!confirmed) return;
      await store.courseService.archive(course, store.currentUser());
      store.coursesResource.reload();
    },

    /**
     * «Bewerbende einladen» (spec 1.152 §8): load the applicants the viewer may see (`listCourseApplicants`, D7), let
     * them choose in the invite dialog, then `inviteApplicantsToCourse` in slices of at most 100 keys. The result
     * toast names every skipped applicant with the reason.
     */
    async inviteApplicants(course: CourseModel): Promise<void> {
      if (!this.mayManage(course)) return;
      let applicants: CourseApplicantsResult;
      try {
        applicants = await store.courseService.listApplicants(course.okey);
      } catch (err) {
        console.warn('CourseStore.inviteApplicants: listCourseApplicants failed', err);
        void store.alertService.showToast(store.i18n.invite_loadError());
        return;
      }
      const { CourseInviteModal } = await import('@okr/calendar-course-ui');
      const modal = await store.modalController.create({ component: CourseInviteModal, componentProps: { course, result: applicants } });
      await modal.present();
      const { data, role } = await modal.onDidDismiss<string[]>();
      if (role !== 'confirm' || !data || data.length === 0) return;

      const total: InviteApplicantsResult = { invited: 0, skipped: [] };
      try {
        for (const keys of chunkKeys(data, INVITE_MAX_APPLICANTS)) {
          const result = await store.courseService.inviteApplicants(course.okey, keys);
          total.invited += result.invited;
          total.skipped.push(...(result.skipped ?? []));
        }
      } catch (err) {
        console.warn('CourseStore.inviteApplicants: inviteApplicantsToCourse failed', err);
        void store.alertService.showToast(store.i18n.invite_error());
        store.placesResource.reload();
        return;
      }
      void store.alertService.showToast(inviteResultMessage(total, applicants.rows, {
        invited: store.i18n.invite_result_invited(),
        skipped: store.i18n.invite_result_skipped(),
        reasons: {
          'no-email': store.i18n.invite_reason_noEmail(),
          'not-found': store.i18n.invite_reason_notFound(),
          closed: store.i18n.invite_reason_closed(),
          'mail-failed': store.i18n.invite_reason_mailFailed(),
        },
      }));
      store.placesResource.reload();
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
          groupName: this.groupNameOf(course),
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
