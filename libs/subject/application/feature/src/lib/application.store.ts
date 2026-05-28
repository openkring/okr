import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { ApplicationKind, ApplicationModel, ApplicationState, UserModel } from '@bk2/shared-models';
import { getAvatarInfoForCurrentUser } from '@bk2/shared-util-core';
import { AlertService } from '@bk2/shared-util-angular';

import { MemberNewModal } from '@bk2/relationship-membership-feature';

import { ApplicationService } from '@bk2/application-data-access';
import { matchesStateFilter, proposeMembershipCategory, stateColor } from '@bk2/application-util';
import { ApplicationEditModal } from './application-edit.modal';

const APPLICATION_I18N_KEYS = {
  list_title:              '@application/list.title',
  list_empty:              '@application/list.empty',
  edit_title:              '@application/edit.title',
  edit_accept:             '@application/edit.accept',
  edit_deny:               '@application/edit.deny',
  edit_accept_confirm:     '@application/edit.accept_confirm',
  edit_accept_conf:        '@application/edit.accept_conf',
  edit_accept_error:       '@application/edit.accept_error',
  edit_deny_reason:        '@application/edit.deny_reason',
  edit_deny_conf:          '@application/edit.deny_conf',
  edit_deny_error:         '@application/edit.deny_error',
  delete_confirm:          '@application/delete.confirm',
  delete_conf:             '@application/delete.conf',
  delete_error:            '@application/delete.error',
  actions_add_membership:  '@application/actions.add_membership',
  actions_no_person:       '@application/actions.no_person',
  cancel:                  '@application/cancel',
  kind_youth:              '@application/kind_youth',
  kind_adult:              '@application/kind_adult',
  kind_transfer:           '@application/kind_transfer',
  state_applied:           '@application/state_applied',
  state_reviewing:         '@application/state_reviewing',
  state_closed_approved:   '@application/state_closed_approved',
  state_closed_denied:     '@application/state_closed_denied',
  state_closed_cancelled:  '@application/state_closed_cancelled',
  field_first_name:        '@application/field.first_name',
  field_last_name:         '@application/field.last_name',
  field_gender:            '@application/field.gender',
  field_date_of_birth:     '@application/field.date_of_birth',
  field_ssn:               '@application/field.ssn',
  field_email:             '@application/field.email',
  field_phone:             '@application/field.phone',
  field_street_name:       '@application/field.street_name',
  field_street_number:     '@application/field.street_number',
  field_zip_code:          '@application/field.zip_code',
  field_city:              '@application/field.city',
  field_country_code:      '@application/field.country_code',
  field_parent_first_name: '@application/field.parent_first_name',
  field_parent_last_name:  '@application/field.parent_last_name',
  field_parent_email:      '@application/field.parent_email',
  field_parent_phone:      '@application/field.parent_phone',
  field_application_as:    '@application/field.application_as',
  field_state:             '@application/field.state',
  field_submitted_at:      '@application/field.submitted_at',
  field_reviewed_at:       '@application/field.reviewed_at',
  field_reviewer:          '@application/field.reviewer',
  field_close_reason:      '@application/field.close_reason',
  section_person:          '@application/section.person',
  section_contact:         '@application/section.contact',
  section_address:         '@application/section.address',
  section_parent:          '@application/section.parent',
  section_application:     '@application/section.application',
} satisfies Record<string, string>;

export type ApplicationI18n = { [K in keyof typeof APPLICATION_I18N_KEYS]: Signal<string> };

export const ApplicationStore = signalStore(
  withState({
    searchTerm:  '',
    stateFilter: 'open' as string,
    kindFilter:  'all' as string,
  }),

  withProps(() => ({
    appStore:           inject(AppStore),
    applicationService: inject(ApplicationService),
    modalController:    inject(ModalController),
    alertService:       inject(AlertService),
    alertController:    inject(AlertController),
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
  })),

  withComputed((store) => ({
    filteredApplications: computed(() => {
      const all  = store.applicationsResource.value() ?? [];
      const term = store.searchTerm().toLowerCase();
      const sf   = store.stateFilter();
      const kf   = store.kindFilter();
      return all
        .filter(a => !a.isArchived)
        .filter(a => matchesStateFilter(a.state, sf))
        .filter(a => kf === 'all' || a.applicationAs === kf)
        .filter(a => !term || a.index.toLowerCase().includes(term))
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
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
        componentProps: { application: app, currentUser: cu, i18n: store.i18n }
      });
      await modal.present();
      await modal.onWillDismiss();
      store.applicationsResource.reload();
    },

    async deleteApplication(app: ApplicationModel): Promise<void> {
      const confirmed = await store.alertService.confirm(store.i18n.delete_confirm(), true);
      if (confirmed !== true) return;
      await store.applicationService.delete(app, store.currentUser());
      store.applicationsResource.reload();
    },

    async acceptApplication(app: ApplicationModel): Promise<void> {
      const confirmed = await store.alertService.confirm(store.i18n.edit_accept_confirm(), true);
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
        header: store.i18n.edit_deny_reason(),
        inputs: [{ name: 'reason', type: 'text', placeholder: '' }],
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: store.i18n.edit_deny(), role: 'confirm' }
        ]
      });
      await alert.present();
      const { data, role } = await alert.onDidDismiss();
      if (role !== 'confirm' || !data?.values?.reason) return;
      await store.applicationService.deny(app, data.values.reason, store.currentUser());
      store.applicationsResource.reload();
    },

    async addMembership(app: ApplicationModel): Promise<void> {
      if (!app.personKey) {
        console.warn(store.i18n.actions_no_person());
        return;
      }
      const mcat = store.appStore.getCategory('membership_category');
      const genders = store.appStore.getCategory('gender');
      const defaultOrg = store.appStore.defaultOrg();
      if (!defaultOrg) return;
      const modal = await store.modalController.create({
        component: MemberNewModal,
        componentProps: {
          currentUser: store.currentUser(),
          mcat,
          tags: store.appStore.getTags('membership'),
          tenantId: store.tenantId(),
          genders,
          org: defaultOrg,
        }
      });
      await modal.present();
      await modal.onWillDismiss();
    },

    async addToGroup(_app: ApplicationModel): Promise<void> {
      // GroupSelectModal not yet implemented — follow-up task
      console.warn('addToGroup: GroupSelectModal not yet implemented');
    },
  }))
);
