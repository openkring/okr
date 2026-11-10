import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { formatDate } from '@angular/common';
import { Router } from '@angular/router';
import { ActionSheetController, AlertController, ModalController, ToastController } from '@ionic/angular';
import { catchError, of } from 'rxjs';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { ApplicationModel, ApplicationState } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat, fill, getAge, getAvatarInfoForCurrentUser } from '@okr/shared-util-core';
import { AlertService, createActionSheetButton, createActionSheetOptions } from '@okr/shared-util-angular';

import { CourseService } from '@okr/calendar-course-data-access';
import { MembershipStore } from '@okr/relationship-membership-feature';

import { ApplicationService } from '@okr/application-data-access';
import {
  APPLICATION_I18N_KEYS, ApplicationForFilter, ApplicationI18n, applicationCourseKey, compareApplicationsByName,
  findDuplicateGroups, findPersonCandidates, isMembershipApplication, isSameBirthDate, matchesApplicationForFilter,
  matchesStateFilter, MERGE_FIELD_I18N, mergeApplications, proposeMembershipCategory, stateColor
} from '@okr/application-util';
import { ApplicationEditModal } from '@okr/application-ui';

/** the course name of an application (courseKey, else the 1.125 courseId property); the key itself while the course is unknown (deleted, not yet loaded), '' without a course */
function courseNameOf(app: ApplicationModel, names: Record<string, string>): string {
  const key = applicationCourseKey(app);
  return key ? (names[key] ?? key) : '';
}

/** The list's «Art» filter: the kind of application, or only the likely duplicates (spec 1.152 §9). */
export type ApplicationListFilter = ApplicationForFilter | 'duplicates';

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
  const date = app.submittedAt ? formatDate(app.submittedAt, 'dd.MM.yyyy', 'en-US') : '';
  return [`${app.lastName}, ${app.firstName}`, date].filter(Boolean).join(' · ');
}

export const ApplicationStore = signalStore(
  withState({
    searchTerm:  '',
    stateFilter: 'open' as string,
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
        .filter(a => kf === 'all' || a.applicationAs === kf)
        .filter(a => ff === 'duplicates' ? dups.has(a.okey) : matchesApplicationForFilter(a, ff))
        .filter(a => !term || (a.index ?? '').toLowerCase().includes(term))
        .sort(compareApplicationsByName);
    }),
    /** course key (`CourseModel.okey`) → course name, for the course registrations */
    courseNames: computed<Record<string, string>>(() => Object.fromEntries(
      (store.coursesResource.value() ?? []).map(c => [c.okey, c.name])
    )),
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

      const { takenFromDrop } = mergeApplications(keep, picked);
      const labels = [...new Set(takenFromDrop)]
        .map(f => { const k = MERGE_FIELD_I18N[f]; return k ? store.i18n[k]() : f; });
      const message = labels.length > 0
        ? fill(store.i18n.merge_confirm(), { fields: labels.join(', ') })
        : store.i18n.merge_confirm_nothing();
      const confirmed = await store.alertService.confirm(message, true);
      if (confirmed !== true) return;
      await store.applicationService.merge(keep, picked, store.currentUser());
      store.applicationsResource.reload();
    },

    async addToGroup(_app: ApplicationModel): Promise<void> {
      // GroupSelectModal not yet implemented — follow-up task
      console.warn('addToGroup: GroupSelectModal not yet implemented');
    },
  }))
);
