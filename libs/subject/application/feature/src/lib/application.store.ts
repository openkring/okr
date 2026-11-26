import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { ActionSheetController, AlertController, ModalController, ToastController } from '@ionic/angular';
import { catchError, of } from 'rxjs';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { ApplicationKind, ApplicationModel, ApplicationState, CourseModel } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat, fill, getAge, getAvatarInfoForCurrentUser, getTodayStr } from '@okr/shared-util-core';
import { AlertService, createActionSheetButton, createActionSheetOptions, exportCsv } from '@okr/shared-util-angular';
import { browseUrl } from '@okr/subject-address-util';

import { CourseService } from '@okr/calendar-course-data-access';
import { COURSE_I18N_KEYS, courseHasEnded, InviteSkipReason } from '@okr/calendar-course-util';
import { MembershipStore } from '@okr/relationship-membership-feature';

import { ApplicationService } from '@okr/application-data-access';
import {
  APPLICATION_I18N_KEYS, ApplicationForFilter, ApplicationI18n, applicationCourseKey, applicationKindCategory, applicationStateCategory,
  buildApplicationExportRows, compareApplicationsByName, compareApplicationsBySubmitted, findDuplicateGroups,
  findPersonCandidates, isMembershipApplication, isSameBirthDate, matchesApplicationForFilter, matchesKindFilter,
  matchesStateFilter, MERGE_FIELD_I18N, mergeApplications, newApplication, pickMergeKeep, proposeMembershipCategory,
  stateColor
} from '@okr/application-util';
import { ApplicationEditModal } from '@okr/application-ui';

/** the course name of an application (courseKey, else the 1.125 courseId property); the key itself while the course is unknown (deleted, not yet loaded), '' without a course */
function courseNameOf(app: ApplicationModel, names: Record<string, string>): string {
  const key = applicationCourseKey(app);
  return key ? (names[key] ?? key) : '';
}

/** The list's «Art» filter: the kind of application, or only the likely duplicates (spec 1.152 §9). */
export type ApplicationListFilter = ApplicationForFilter | 'duplicates';

/** the skip reasons of `inviteApplicantsToCourse`, worded by the course feature (one text for both lists) */
const INVITE_REASON_I18N_KEYS = {
  'no-email':        COURSE_I18N_KEYS.invite_reason_noEmail,
  'not-found':       COURSE_I18N_KEYS.invite_reason_notFound,
  closed:            COURSE_I18N_KEYS.invite_reason_closed,
  'on-other-course': COURSE_I18N_KEYS.invite_reason_onOtherCourse,
  'mail-failed':     COURSE_I18N_KEYS.invite_reason_mailFailed,
  'write-failed':    COURSE_I18N_KEYS.invite_reason_writeFailed,
} satisfies Record<InviteSkipReason, string>;

function kindLabelOf(kind: ApplicationKind, i18n: ApplicationI18n): string {
  switch (kind) {
    case 'youth':    return i18n.kind_youth();
    case 'transfer': return i18n.kind_transfer();
    default:         return i18n.kind_adult();
  }
}

function stateLabelOf(app: ApplicationModel, i18n: ApplicationI18n): string {
  const key = ('state_' + (app.state ?? '').replace('.', '_')) as keyof ApplicationI18n;
  const sig = i18n[key];
  return sig ? sig() : app.state;
}

function courseStateLabel(app: ApplicationModel, i18n: ApplicationI18n): string {
  switch (app.courseState ?? '') {
    case 'registered': return i18n.course_state_registered();
    case 'invited':    return i18n.course_state_invited();
    case 'accepted':   return i18n.course_state_accepted();
    case 'declined':   return i18n.course_state_declined();
    default:           return '';
  }
}

/** «Name, Vorname · 01.02.2026» — one application of a duplicate group in the merge picker */
function pickerLabel(app: ApplicationModel): string {
  const date = convertDateFormatToString((app.submittedAt ?? '').substring(0, 10), DateFormat.IsoDate, DateFormat.ViewDate, false);
  return [`${app.lastName}, ${app.firstName}`, date].filter(Boolean).join(' · ');
}

export const ApplicationStore = signalStore(
  withState({
    searchTerm:  '',
    stateFilter: 'all' as string,
    kindFilter:  'all' as string,
    forFilter:   'all' as ApplicationListFilter,
  }),

  withProps(() => ({
    appStore:           inject(AppStore),
    membershipStore:    inject(MembershipStore),
    applicationService: inject(ApplicationService),
    courseService:      inject(CourseService),
    modalController:    inject(ModalController),
    alertService:       inject(AlertService),
    alertController:    inject(AlertController),
    actionSheetController: inject(ActionSheetController),
    toastController:    inject(ToastController),
    router:             inject(Router),
    i18nService:        inject(I18nService),
  })),

  withProps((store) => ({
    i18n: store.i18nService.translateAll(APPLICATION_I18N_KEYS),
    inviteReasonI18n: store.i18nService.translateAll(INVITE_REASON_I18N_KEYS),
    applicationsResource: rxResource({
      params: () => ({ tenantId: store.appStore.tenantId() }),
      stream: () => store.applicationService.list(),
    }),
    // course registrations name their course by key; a failed read only costs the names, never the list
    coursesResource: rxResource({
      params: () => ({ tenantId: store.appStore.tenantId() }),
      stream: () => store.courseService.listAll().pipe(catchError(() => of([]))),
    }),
  })),

  withComputed((store) => ({
    /** application okey → okeys of its likely duplicates (A5), over all live applications */
    duplicates: computed(() => findDuplicateGroups(store.applicationsResource.value() ?? [])),
  })),

  withComputed((store) => ({
    filteredApplications: computed(() => {
      const all  = store.applicationsResource.value() ?? [];
      const term = store.searchTerm().toLowerCase();
      const sf   = store.stateFilter();
      const kf   = store.kindFilter();
      const ff   = store.forFilter();
      const dups = store.duplicates();
      return all
        .filter(a => !a.isArchived)
        .filter(a => matchesStateFilter(a.state, sf))
        .filter(a => matchesKindFilter(a, kf))
        .filter(a => ff === 'duplicates' ? dups.has(a.okey) : matchesApplicationForFilter(a, ff))
        .filter(a => !term || (a.index ?? '').toLowerCase().includes(term))
        .sort(compareApplicationsBySubmitted);
    }),
    /** course key (`CourseModel.okey`) → course name, for the course registrations */
    courseNames: computed<Record<string, string>>(() => Object.fromEntries(
      (store.coursesResource.value() ?? []).map(c => [c.okey, c.name])
    )),
    /** the «Typ» filter (applicationAs), built in code */
    kindCategory: computed(() => applicationKindCategory(store.appStore.tenantId())),
    stateCategory: computed(() => applicationStateCategory(store.appStore.tenantId())),
    /** courses an application can still be invited to: not archived, not yet over (the server checks again) */
    assignableCourses: computed<CourseModel[]>(() => {
      const today = getTodayStr();
      return (store.coursesResource.value() ?? [])
        .filter(c => !c.isArchived && !courseHasEnded(c, today))
        .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''));
    }),
    currentUser: computed(() => store.appStore.currentUser()),
    tenantId:    computed(() => store.appStore.tenantId()),
    imgixBaseUrl: computed(() => store.appStore.services.imgixBaseUrl()),
  })),

  withMethods((store) => ({
    setSearchTerm(term: string): void {
      patchState(store, { searchTerm: term });
    },
    setStateFilter(state: string): void {
      patchState(store, { stateFilter: state });
    },
    setKindFilter(kind: string): void {
      patchState(store, { kindFilter: kind });
    },
    setForFilter(filter: ApplicationListFilter): void {
      patchState(store, { forFilter: filter });
    },
    courseName(app: ApplicationModel): string {
      return courseNameOf(app, store.courseNames());
    },
    /** «Kursname · eingeladen» — the course line of a row; '' without a course */
    courseLine(app: ApplicationModel): string {
      return [courseNameOf(app, store.courseNames()), courseStateLabel(app, store.i18n)].filter(Boolean).join(' · ');
    },
    kindLabel(kind: ApplicationKind): string {
      return kindLabelOf(kind, store.i18n);
    },
    stateLabel(app: ApplicationModel): string {
      return stateLabelOf(app, store.i18n);
    },
    isDuplicate(app: ApplicationModel): boolean {
      return store.duplicates().has(app.okey);
    },

    stateColor(state: ApplicationState): 'warning' | 'primary' | 'success' | 'danger' | 'medium' {
      return stateColor(state);
    },

    async editApplication(app: ApplicationModel): Promise<void> {
      const cu = store.currentUser();
      if (app.state === 'applied' && cu) {
        const reviewer = getAvatarInfoForCurrentUser(cu);
        if (reviewer) {
          await store.applicationService.beginReview(app, reviewer, cu);
        }
      }
      const modal = await store.modalController.create({
        component: ApplicationEditModal,
        componentProps: { application: app, currentUser: cu, i18n: store.i18n, courseName: courseNameOf(app, store.courseNames()) }
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<ApplicationModel>();
      if (role === 'confirm' && data) {
        await store.applicationService.update(data, cu);
      }
      store.applicationsResource.reload();
    },

    /**
     * «Neue Anmeldung»: the memberAdmin records an application that did not come in through a form
     * (phone, paper, in person). Same path as a form submission: task, confirmation mail to the applicant.
     */
    async addApplication(): Promise<void> {
      const cu = store.currentUser();
      const modal = await store.modalController.create({
        component: ApplicationEditModal,
        componentProps: { application: newApplication(store.tenantId()), currentUser: cu, i18n: store.i18n, isNew: true }
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<ApplicationModel>();
      if (role !== 'confirm' || !data) return;
      await store.applicationService.create(data, cu);
      store.applicationsResource.reload();
    },

    /** «Exportieren»: the listed (filtered) applications as CSV. */
    async exportApplications(): Promise<void> {
      const i = store.i18n;
      const rows = buildApplicationExportRows(
        store.filteredApplications(),
        {
          submitted: i.list_col_submitted(), firstName: i.firstname(), lastName: i.lastname(), type: i.list_col_type(),
          dateOfBirth: i.date_of_birth(), email: i.email(), phone: i.phone(), streetName: i.street_name(),
          streetNumber: i.street_number(), zipCode: i.zip_code(), city: i.city(), state: i.state(), course: i.merge_field_course(),
        },
        kind => kindLabelOf(kind, i),
        app => stateLabelOf(app, i),
        app => courseNameOf(app, store.courseNames()),
      );
      await exportCsv(rows, i.list_csv_file());
    },

    async sendEmail(app: ApplicationModel): Promise<void> {
      const email = (app.email ?? '').trim();
      if (!email) { void store.alertService.showToast(store.i18n.email_missing()); return; }
      await browseUrl(`mailto:${email}`, '');
    },

    async call(app: ApplicationModel): Promise<void> {
      const phone = (app.phone ?? '').trim();
      if (!phone) { void store.alertService.showToast(store.i18n.call_missing()); return; }
      await browseUrl(`tel:${phone}`, '');
    },

    /**
     * «Kurs zuteilen» (spec 1.152 §8): pick a running course, confirm, then `inviteApplicantsToCourse` for this
     * one application — the applicant gets the invitation mail with the personal answer link, `courseState`
     * becomes `invited`. The server decides (D7, closed, no e-mail, course ended); a refusal is shown with its reason.
     */
    async assignCourse(app: ApplicationModel): Promise<void> {
      const courses = store.assignableCourses();
      const name = `${app.firstName} ${app.lastName}`.trim();
      if (courses.length === 0) { void store.alertService.showToast(store.i18n.course_assign_none()); return; }

      const imgix = store.imgixBaseUrl();
      const opts  = createActionSheetOptions(fill(store.i18n.course_assign_pick(), { name }));
      for (const course of courses) {
        opts.buttons.push(createActionSheetButton('course.' + course.okey, course.name, imgix));
      }
      opts.buttons.push(createActionSheetButton('cancel', store.i18n.cancel(), imgix, 'cancel-circle'));
      const sheet = await store.actionSheetController.create(opts);
      await sheet.present();
      const { data } = await sheet.onDidDismiss();
      const course = typeof data?.action === 'string' && data.action.startsWith('course.')
        ? courses.find(c => c.okey === data.action.substring('course.'.length))
        : undefined;
      if (!course) return;

      const confirmed = await store.alertService.confirm(fill(store.i18n.course_assign_confirm(), { name, course: course.name }), true);
      if (confirmed !== true) return;
      try {
        const result = await store.courseService.inviteApplicants(course.okey, [app.okey]);
        const skipped = result.skipped?.[0];
        void store.alertService.showToast(skipped
          ? fill(store.i18n.course_assign_skipped(), { reason: store.inviteReasonI18n[skipped.reason]?.() ?? skipped.reason })
          : store.i18n.course_assign_done());
      } catch (err) {
        console.warn('ApplicationStore.assignCourse: inviteApplicantsToCourse failed', err);
        const ended = (err as { details?: { reason?: string } } | undefined)?.details?.reason === 'course-ended';
        void store.alertService.showToast(ended ? store.i18n.course_assign_ended() : store.i18n.course_assign_error());
      }
      store.applicationsResource.reload();
    },

    async deleteApplication(app: ApplicationModel): Promise<void> {
      const confirmed = await store.alertService.confirm(store.i18n.delete_confirm(), true);
      if (confirmed !== true) return;
      await store.applicationService.delete(app, store.currentUser());
      store.applicationsResource.reload();
    },

    async acceptApplication(app: ApplicationModel): Promise<void> {
      const confirmed = await store.alertService.confirm(store.i18n.accept_confirm(), true);
      if (confirmed !== true) return;
      try {
        await store.applicationService.accept(app, store.currentUser());
        store.applicationsResource.reload();
      } catch (err) {
        console.error('ApplicationStore.acceptApplication:', err);
      }
    },

    async denyApplication(app: ApplicationModel): Promise<void> {
      const alert = await store.alertController.create({
        header: store.i18n.deny_reason(),
        inputs: [{ name: 'reason', type: 'text', placeholder: '' }],
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: store.i18n.deny(), role: 'confirm' }
        ]
      });
      await alert.present();
      const { data, role } = await alert.onDidDismiss();
      if (role !== 'confirm' || !data?.values?.reason) return;
      await store.applicationService.deny(app, data.values.reason, store.currentUser());
      store.applicationsResource.reload();
    },

    /**
     * Promote an approved application to a membership (roadmap A3). `accept()` already created
     * the person and its addresses, so this only adds the missing membership in the default org —
     * `MemberNewModal` would have created a SECOND person. Saving the membership is what opens
     * the Firebase account and emits `membership.created` (server-side, spec 1.35 / 4.60).
     * The member category is only PROPOSED (spec 1.125 §13.1): the modal opens with it preselected
     * and a note; nothing is written unless the memberAdmin saves.
     */
    async addMembership(app: ApplicationModel): Promise<void> {
      if (!isMembershipApplication(app)) return;
      if (!app.personKey) {
        console.warn(store.i18n.list_no_person());
        return;
      }
      const person = store.appStore.allPersons().find(p => p.okey === app.personKey);
      const defaultOrg = store.appStore.defaultOrg();
      if (!person || !defaultOrg) return;
      // an unreadable birth date gives no age, so no proposal (as in the application form)
      const proposal = getAge(app.dateOfBirth ?? '') < 0 ? undefined : proposeMembershipCategory(app);
      await store.membershipStore.addExistingPersonToOrg(person, defaultOrg, proposal);
    },

    /**
     * «Als Person erfassen» (spec 1.152 §9): first offers an existing person with the same first and
     * last name (and the same date of birth, when both are known) to link instead; otherwise creates
     * the person, its addresses and (youth) the parent. The application stays open.
     */
    async createPerson(app: ApplicationModel): Promise<void> {
      if (app.personKey) return;
      const cu = store.currentUser();
      for (const person of findPersonCandidates(app, store.appStore.allPersons())) {
        const dob = await store.applicationService.readPersonDateOfBirth(person.okey);
        if (!isSameBirthDate(app.dateOfBirth, dob)) continue;
        const dobText = dob ? fill(store.i18n.person_exists_dob(), {
          date: convertDateFormatToString(dob, DateFormat.StoreDate, DateFormat.ViewDate, false)
        }) : '';
        const alert = await store.alertController.create({
          message: fill(store.i18n.person_exists(), { name: `${person.firstName} ${person.lastName}`, dob: dobText }),
          buttons: [
            { text: store.i18n.person_link(),       role: 'link' },
            { text: store.i18n.person_create_new(), role: 'create' },
            { text: store.i18n.cancel(),            role: 'cancel' },
          ]
        });
        await alert.present();
        const { role } = await alert.onDidDismiss();
        if (role === 'link') {
          await store.applicationService.linkPerson(app, person.okey, cu);
          store.applicationsResource.reload();
          return;
        }
        if (role !== 'create') return;   // cancelled or dismissed
        break;                            // «neu erfassen»: create without asking about further candidates
      }
      await store.applicationService.createPerson(app, cu);
      store.applicationsResource.reload();
    },

    /**
     * «Zusammenführen …» (spec 1.152 §9): picks the other application from the duplicate group of
     * `keep`, lists what it brings along, then merges it into `keep` and archives it.
     */
    async mergeApplication(keep: ApplicationModel): Promise<void> {
      const all    = store.applicationsResource.value() ?? [];
      const others = (store.duplicates().get(keep.okey) ?? [])
        .map(okey => all.find(a => a.okey === okey))
        .filter((a): a is ApplicationModel => !!a)
        .sort(compareApplicationsByName);
      if (others.length === 0) return;

      const imgix = store.imgixBaseUrl();
      const opts  = createActionSheetOptions(store.i18n.merge_pick());
      for (const other of others) {
        opts.buttons.push(createActionSheetButton('merge.' + other.okey, pickerLabel(other), imgix));
      }
      opts.buttons.push(createActionSheetButton('cancel', store.i18n.cancel(), imgix, 'cancel-circle'));
      const sheet = await store.actionSheetController.create(opts);
      await sheet.present();
      const { data } = await sheet.onDidDismiss();
      const picked = typeof data?.action === 'string' && data.action.startsWith('merge.')
        ? others.find(o => o.okey === data.action.substring('merge.'.length))
        : undefined;
      if (!picked) return;

      // the invitee's answer link is signed for one okey: when only `picked` holds the invitation,
      // it is kept and `keep` is merged into it (pickMergeKeep), and the confirmation says so —
      // unless that would reopen a closed application (then resendInvitation)
      const roles = pickMergeKeep(keep, picked);
      const { takenFromDrop } = mergeApplications(roles.keep, roles.drop);
      const labels = [...new Set(takenFromDrop)]
        .map(f => { const k = MERGE_FIELD_I18N[f]; return k ? store.i18n[k]() : f; });
      const message = roles.swapped
        ? (labels.length > 0
          ? fill(store.i18n.merge_swapped(), { fields: labels.join(', ') })
          : store.i18n.merge_swapped_nothing())
        : (labels.length > 0
          ? fill(store.i18n.merge_confirm(), { fields: labels.join(', ') })
          : store.i18n.merge_confirm_nothing());
      // keep is closed, picked is open and holds the invitation: no swap (the closed state wins),
      // so the answer link signed for picked's okey dies with it and must be sent again
      const fullMessage = roles.resendInvitation ? `${message} ${store.i18n.merge_resend_invitation()}` : message;
      const confirmed = await store.alertService.confirm(fullMessage, true);
      if (confirmed !== true) return;
      await store.applicationService.merge(roles.keep, roles.drop, store.currentUser());
      store.applicationsResource.reload();
    },

    async addToGroup(_app: ApplicationModel): Promise<void> {
      // GroupSelectModal not yet implemented — follow-up task
      console.warn('addToGroup: GroupSelectModal not yet implemented');
    },
  }))
);
