import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { firstValueFrom, Observable, of } from 'rxjs';

import { CategoryCollection, CategoryListModel, MembershipModel, ModelType, OrgCollection, OrgModel } from '@bk2/shared/models';
import { convertDateFormatToString, DateFormat, debugItemLoaded, debugListLoaded, isValidAt, readModel } from '@bk2/shared/util-core';
import { confirm } from '@bk2/shared/util-angular';
import { getAvatarImgixUrl } from '@bk2/shared/pipes';
import { AppStore } from '@bk2/shared/feature';
import { selectDate } from '@bk2/shared/ui';

import { AvatarService } from '@bk2/avatar/data-access';

import { MembershipService } from '@bk2/membership/data-access';
import { MembershipModalsService } from './membership-modals.service';
import { THUMBNAIL_SIZE } from '@bk2/shared/constants';

export type MembersAccordionState = {
  orgKey: string | undefined;
  showOnlyCurrent: boolean;
};

const initialState: MembersAccordionState = {
  orgKey: undefined,
  showOnlyCurrent: true,
};

export const MembersAccordionStore = signalStore(
  withState(initialState),
  withProps(() => ({
    membershipService: inject(MembershipService),
    membershipModalsService: inject(MembershipModalsService),
    avatarService: inject(AvatarService),
    appStore: inject(AppStore),
    alertController: inject(AlertController),
    modalController: inject(ModalController)
  })),
  withProps((store) => ({
      // load all the memberships of the given org = its members
     membersResource: rxResource({
      params: () => ({
        orgKey: store.orgKey()
      }),
      stream: ({params}) => {
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
      stream: ({params}) => {
        const org$ = readModel<OrgModel>(store.appStore.firestore, OrgCollection, params.orgKey);
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

      /******************************** actions ******************************************* */
      async addMember(): Promise<void> {
        await store.membershipModalsService.add(store.currentPerson(), store.currentOrg(), ModelType.Person);
        store.membersResource.reload();
      },

      async edit(membership?: MembershipModel): Promise<void> {
        await store.membershipModalsService.edit(membership);
        store.membersResource.reload();
      },

      async end(membership?: MembershipModel): Promise<void> {
        if (membership) {
          const _date = await selectDate(store.modalController);
          if (!_date) return;
          await store.membershipService.endMembershipByDate(membership, convertDateFormatToString(_date, DateFormat.IsoDate, DateFormat.StoreDate, false), store.currentUser());              
          store.membersResource.reload();  
        }
      },

      async changeMembershipCategory(membership?: MembershipModel): Promise<void> {
        if(membership) {
          const _mcat = await firstValueFrom(readModel<CategoryListModel>(store.appStore.firestore, CategoryCollection, 'mcat_' + membership.orgKey));            
          if (_mcat) {
            await store.membershipModalsService.changeMembershipCategory(membership, _mcat);
            store.membersResource.reload();
          }
        }
      },

      async delete(membership?: MembershipModel): Promise<void> {
        if (membership) {
          const _result = await confirm(store.alertController, '@membership.operation.delete.confirm', true);
          if (_result === true) {
            await store.membershipService.delete(membership);
            store.membersResource.reload();
          } 
        }
      },



      /******************************** helpers ******************************************* */
      getAvatarImgixUrl(membership: MembershipModel): Observable<string> {
          return getAvatarImgixUrl(store.appStore.firestore, `${ModelType.Org}.${membership.orgKey}`, THUMBNAIL_SIZE, store.appStore.services.imgixBaseUrl());        
      }
    }
  })
);
