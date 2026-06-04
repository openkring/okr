import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { ApplicationModel, ApplicationState, UserModel } from '@bk2/shared-models';
import { getAvatarInfoForCurrentUser } from '@bk2/shared-util-core';
import { AlertService } from '@bk2/shared-util-angular';

import { MemberNewModal } from '@bk2/relationship-membership-feature';

import { ApplicationService } from '@bk2/application-data-access';
import { APPLICATION_I18N_KEYS, matchesStateFilter, stateColor } from '@bk2/application-util';
import { ApplicationEditModal } from './application-edit.modal';


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

    async addMembership(app: ApplicationModel): Promise<void> {
      if (!app.personKey) {
        console.warn(store.i18n.list_no_person());
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
