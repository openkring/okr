import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom, of } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { CategoryCollection, CategoryListModel, MembershipModel, OrgCollection, OrgModel } from '@bk2/shared-models';
import { confirm } from '@bk2/shared-util-angular';
import { convertDateFormatToString, DateFormat, debugItemLoaded, debugListLoaded, isValidAt } from '@bk2/shared-util-core';

import { MembershipService } from '@bk2/relationship-membership-data-access';

import { MembershipModalsService } from './membership-modals.service';

export type MembersAccordionState = {
  orgKey: string | undefined;
  showOnlyCurrent: boolean;
  currentMembership: MembershipModel | undefined;
};

const initialState: MembersAccordionState = {
  orgKey: undefined,
  showOnlyCurrent: true,
  currentMembership: undefined,
};

export const MembersAccordionStore = signalStore(
  withState(initialState),
  withProps(() => ({
    membershipService: inject(MembershipService),
    membershipModalsService: inject(MembershipModalsService),
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    alertController: inject(AlertController),
    modalController: inject(ModalController)
  })),
  withProps((store) => ({
    // load all the memberships of the given org = its members
    membersResource: rxResource({
      params: () => ({
        orgKey: store.orgKey()
      }),
      stream: ({ params }) => {
        if (!params.orgKey) return of([]);
        const members$ = store.membershipService.listMembersOfOrg(params.orgKey);
        debugListLoaded('MembersAccordionStore.members', members$, store.appStore.currentUser());
        return members$;
      }
    }),
    // load the current org
    orgResource: rxResource({
      params: () => ({
        orgKey: store.orgKey()
      }),
      stream: ({ params }) => {
        const org$ = store.firestoreService.readModel<OrgModel>(OrgCollection, params.orgKey);
        debugItemLoaded<OrgModel>(`org ${params.orgKey}`, org$, store.appStore.currentUser());
        return org$;
      }
    })
  })),

  withComputed((state) => {
    return {
      allMembers: computed(() => state.membersResource.value() ?? []),
      currentMemberships: computed(() => state.membersResource.value()?.filter(m => isValidAt(m.dateOfEntry, m.dateOfExit)) ?? []),
      members: computed(() => state.showOnlyCurrent() ? state.membersResource.value() ?? [] : state.membersResource.value()?.filter(m => isValidAt(m.dateOfEntry, m.dateOfExit)) ?? []),
      currentUser: computed(() => state.appStore.currentUser()),
      currentPerson: computed(() => state.appStore.currentPerson()),
      currentOrg: computed(() => state.orgResource.value()),
      isLoading: computed(() => state.membersResource.isLoading() || state.orgResource.isLoading()),
    }
  }),

  withMethods((store) => {
    return {

      /******************************** setters ******************************************* */
      setOrgKey(orgKey: string) {
        patchState(store, { orgKey });
        store.membersResource.reload();
      },

      setShowMode(showOnlyCurrent: boolean) {
        patchState(store, { showOnlyCurrent });
      },

      setCurrentMembership(currentMembership: MembershipModel | undefined) {
        patchState(store, { currentMembership });
      },

      /******************************** actions ******************************************* */
      async addMember(readOnly = true): Promise<void> {
        if (!readOnly) {
          await store.membershipModalsService.add(store.currentPerson(), store.currentOrg(), 'person');
          store.membersResource.reload();
        }
      },

      async edit(membership?: MembershipModel, readOnly = true): Promise<void> {
        if (!readOnly && membership) {
          await store.membershipModalsService.edit(membership);
          store.membersResource.reload();
        }
      },

      async end(endDate?: string): Promise<void> {
        const membership = store.currentMembership();
        if (membership && endDate) {
          await store.membershipService.endMembershipByDate(membership, convertDateFormatToString(endDate, DateFormat.IsoDate, DateFormat.StoreDate, false), store.currentUser());
          store.membersResource.reload();
        }
      },

      async changeMembershipCategory(membership?: MembershipModel, readOnly = true): Promise<void> {
        if (!readOnly && membership) {
          const mcat = await firstValueFrom(store.firestoreService.readModel<CategoryListModel>(CategoryCollection, 'mcat_' + membership.orgKey));
          if (mcat) {
            await store.membershipModalsService.changeMembershipCategory(membership, mcat);
            store.membersResource.reload();
          }
        }
      },

      async delete(membership?: MembershipModel, readOnly = true): Promise<void> {
        if (!readOnly && membership) {
          const result = await confirm(store.alertController, '@membership.operation.delete.confirm', true);
          if (result === true) {
            await store.membershipService.delete(membership);
            store.membersResource.reload();
          }
        }
      }
    }
  })
);
