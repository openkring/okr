import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController } from '@ionic/angular/standalone';
import { firstValueFrom, Observable, of } from 'rxjs';

import { ENV, FIRESTORE } from '@bk2/shared/config';
import { CategoryCollection, CategoryListModel, MembershipModel, ModelType, OrgCollection, OrgModel } from '@bk2/shared/models';
import { debugItemLoaded, debugListLoaded, isValidAt, readModel } from '@bk2/shared/util';
import { confirm } from '@bk2/shared/i18n';
import { getAvatarImgixUrl } from '@bk2/shared/pipes';

import { AvatarService } from '@bk2/avatar/data-access';
import { AppStore } from '@bk2/auth/feature';

import { MembershipService } from '@bk2/membership/data-access';


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
    avatarService: inject(AvatarService),
    appStore: inject(AppStore),
    firestore: inject(FIRESTORE),
    env: inject(ENV),
    alertController: inject(AlertController)
  })),
  withProps((store) => ({
      // load all the memberships of the given org = its members
     membersResource: rxResource({
      request: () => ({
        orgKey: store.orgKey()
      }),
      loader: ({request}) => {
        if (!request.orgKey) return of([]);
        const members$ = store.membershipService.listMembersOfOrg(request.orgKey);
        debugListLoaded('MembersAccordionStore.members', members$, store.appStore.currentUser());
        return members$;
      }
    }),
    // load the current org
    orgResource: rxResource({
      request: () => ({
        orgKey: store.orgKey()
      }),  
      loader: ({request}) => {
        const org$ = readModel<OrgModel>(store.firestore, OrgCollection, request.orgKey);
        debugItemLoaded<OrgModel>(`org ${request.orgKey}`, org$, store.appStore.currentUser());
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
        await store.membershipService.add(store.currentPerson(), store.currentOrg(), ModelType.Person);
        store.membersResource.reload();
      },

      async edit(membership?: MembershipModel): Promise<void> {
        await store.membershipService.edit(membership);
        store.membersResource.reload();
      },

      async end(membership?: MembershipModel): Promise<void> {
        if (membership) {
          await store.membershipService.end(membership);
          store.membersResource.reload();  
        }
      },

      async changeMembershipCategory(membership?: MembershipModel): Promise<void> {
        if(membership) {
          const _mcat = await firstValueFrom(readModel<CategoryListModel>(store.firestore, CategoryCollection, 'mcat_' + membership.orgKey));            
          if (_mcat) {
            await store.membershipService.changeMembershipCategory(membership, _mcat);
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
          return getAvatarImgixUrl(store.firestore, `${ModelType.Org}.${membership.orgKey}`, store.env.thumbnail.width, store.env.app.imgixBaseUrl);        
      }
    }
  })
);
