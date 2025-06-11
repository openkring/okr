import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { firstValueFrom, Observable, of } from 'rxjs';

import { ENV, FIRESTORE } from '@bk2/shared/config';
import { CategoryCollection, CategoryListModel, MembershipModel, ModelType, OrgModel, PersonModel } from '@bk2/shared/models';
import { AppStore } from '@bk2/auth/feature';
import { convertDateFormatToString, DateFormat, debugListLoaded, isValidAt, readModel } from '@bk2/shared/util';
import { AvatarService } from '@bk2/avatar/data-access';
import { confirm } from '@bk2/shared/i18n';
import { getAvatarImgixUrl } from '@bk2/shared/pipes';
import { OrgService } from '@bk2/org/data-access';
import { MembershipService } from '@bk2/membership/data-access';
import { MembershipModalsService } from './membership-modals.service';
import { selectDate } from '@bk2/shared/ui';

export type MembershipAccordionState = {
  member: PersonModel | OrgModel | undefined;
  modelType: ModelType;
  showOnlyCurrent: boolean;
};

const initialState: MembershipAccordionState = {
  member: undefined,
  modelType: ModelType.Person,
  showOnlyCurrent: true,
};

export const MembershipAccordionStore = signalStore(
  withState(initialState),
  withProps(() => ({
    membershipService: inject(MembershipService),
    membershipModalsService: inject(MembershipModalsService),
    orgService: inject(OrgService),
    avatarService: inject(AvatarService),
    firestore: inject(FIRESTORE),
    appStore: inject(AppStore),
    env: inject(ENV),
    modalController: inject(ModalController),
    alertController: inject(AlertController)
  })),
  withProps((store) => ({

      // load all the memberships of the given member (person)
     membershipsResource: rxResource({
      request: () => ({
        member: store.member(),
        modelType: store.modelType()
      }),
      loader: ({request}) => {
        if (!request.member) return of([]);
        const memberships$ = store.membershipService.listMembershipsOfMember(request.member.bkey, request.modelType);
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
      setMember(member: PersonModel | OrgModel, modelType: ModelType): void {
        patchState(store, { member, modelType });
        store.membershipsResource.reload();
      },

      setShowMode(showOnlyCurrent: boolean) {
        patchState(store, { showOnlyCurrent });
      },

      /******************************** actions ******************************************* */
      async add(defaultMember: PersonModel | OrgModel, modelType: ModelType): Promise<void> {
        await store.membershipModalsService.add(defaultMember, store.defaultOrg(), modelType);
        store.membershipsResource.reload();
      },

      async edit(membership?: MembershipModel): Promise<void> {
        await store.membershipModalsService.edit(membership);
        store.membershipsResource.reload();
      },

      /**
         * Ask user for the end date of an existing membership and end it.
         * We do not archive memberships as we want to make them visible for entries & exits.
         * Therefore, we end an membership by setting its validTo date.
         * @param membership the membership to delete
         */
      async end(membership: MembershipModel): Promise<void> {
        if (membership) {
          const _date = await selectDate(store.modalController);
          if (!_date) return;
          await store.membershipService.endMembershipByDate(membership, convertDateFormatToString(_date, DateFormat.IsoDate, DateFormat.StoreDate, false), store.currentUser());
          store.membershipsResource.reload();
        }
      },
  
      async changeMembershipCategory(membership?: MembershipModel): Promise<void> {
        if(membership) {
          const _mcat = await firstValueFrom(readModel<CategoryListModel>(store.firestore, CategoryCollection, 'mcat_' + membership.orgKey));            
          if (_mcat) {
            await store.membershipModalsService.changeMembershipCategory(membership, _mcat);
            store.membershipsResource.reload();
          }
        }
      },

      async delete(membership?: MembershipModel): Promise<void> {
        if (membership) {
          const _result = await confirm(store.alertController, '@membership.operation.delete.confirm', true);
          if (_result === true) {
            await store.membershipService.delete(membership);
            store.membershipsResource.reload();
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
