import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom, of } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { CategoryCollection, CategoryListModel, MembershipModel, OrgModel, PersonModel } from '@bk2/shared-models';
import { selectDate } from '@bk2/shared-ui';
import { confirm } from '@bk2/shared-util-angular';
import { convertDateFormatToString, DateFormat, debugListLoaded, isValidAt } from '@bk2/shared-util-core';

import { MembershipService } from '@bk2/relationship-membership-data-access';
import { OrgService } from '@bk2/subject-org-data-access';

import { MembershipModalsService } from './membership-modals.service';

export type MembershipAccordionState = {
  member: PersonModel | OrgModel | undefined;
  modelType: string;
  showOnlyCurrent: boolean;
};

const initialState: MembershipAccordionState = {
  member: undefined,
  modelType: 'person',
  showOnlyCurrent: true,
};

export const MembershipAccordionStore = signalStore(
  withState(initialState),
  withProps(() => ({
    membershipService: inject(MembershipService),
    membershipModalsService: inject(MembershipModalsService),
    orgService: inject(OrgService),
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    alertController: inject(AlertController)
  })),
  withProps((store) => ({

    // load all the memberships of the given member (person)
    membershipsResource: rxResource({
      params: () => ({
        member: store.member(),
        modelType: store.modelType()
      }),
      stream: ({ params }) => {
        if (!params.member) return of([]);
        const memberships$ = store.membershipService.listMembershipsOfMember(params.member.bkey, params.modelType);
        debugListLoaded('MembershipAccordionStore.memberships', memberships$, store.appStore.currentUser());
        return memberships$;
      }
    })
  })),

  withComputed((state) => {
    return {
      allMemberships: computed(() => state.membershipsResource.value() ?? []),
      currentMemberships: computed(() => state.membershipsResource.value()?.filter(m => isValidAt(m.dateOfEntry, m.dateOfExit)) ?? []),
      memberships: computed(() => state.showOnlyCurrent() ? state.membershipsResource.value() ?? [] : state.membershipsResource.value()?.filter(m => isValidAt(m.dateOfEntry, m.dateOfExit)) ?? []),
      defaultOrg: computed(() => state.appStore.defaultOrg()),
      currentUser: computed(() => state.appStore.currentUser()),
      isLoading: computed(() => state.membershipsResource.isLoading()),
    }
  }),

  withMethods((store) => {
    return {

      /******************************** setters ******************************************* */
      setMember(member: PersonModel | OrgModel, modelType: string): void {
        patchState(store, { member, modelType });
        store.membershipsResource.reload();
      },

      setShowMode(showOnlyCurrent: boolean) {
        patchState(store, { showOnlyCurrent });
      },

      /******************************** actions ******************************************* */
      async add(defaultMember: PersonModel | OrgModel, modelType: 'person' | 'org', readOnly = true): Promise<void> {
        if (!readOnly) {
          await store.membershipModalsService.add(defaultMember, store.defaultOrg(), modelType);
          store.membershipsResource.reload();
        }
      },

      async edit(membership?: MembershipModel, readOnly = true): Promise<void> {
        if (!readOnly) {
          await store.membershipModalsService.edit(membership);
          store.membershipsResource.reload();
        }
      },

      /**
         * Ask user for the end date of an existing membership and end it.
         * We do not archive memberships as we want to make them visible for entries & exits.
         * Therefore, we end an membership by setting its validTo date.
         * @param membership the membership to delete
         */
      async end(membership: MembershipModel, readOnly = true): Promise<void> {
        if (membership && !readOnly) {
          const date = await selectDate(store.modalController);
          if (!date) return;
          await store.membershipService.endMembershipByDate(membership, convertDateFormatToString(date, DateFormat.IsoDate, DateFormat.StoreDate, false), store.currentUser());
          store.membershipsResource.reload();
        }
      },

      async changeMembershipCategory(membership?: MembershipModel, readOnly = true): Promise<void> {
        if (membership && !readOnly) {
          const mcat = await firstValueFrom(store.firestoreService.readModel<CategoryListModel>(CategoryCollection, 'mcat_' + membership.orgKey));
          if (mcat) {
            await store.membershipModalsService.changeMembershipCategory(membership, mcat);
            store.membershipsResource.reload();
          }
        }
      },

      async delete(membership?: MembershipModel, readOnly = true): Promise<void> {
        if (membership && !readOnly) {
          const result = await confirm(store.alertController, '@membership.operation.delete.confirm', true);
          if (result === true) {
            await store.membershipService.delete(membership);
            store.membershipsResource.reload();
          }
        }
      }
    }
  })
);
