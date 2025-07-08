import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { of } from 'rxjs';

import { END_FUTURE_DATE_STR } from '@bk2/shared/constants';
import { ENV } from '@bk2/shared/config';
import { MembershipModel, ModelType } from '@bk2/shared/models';
import { debugData, debugItemLoaded, getTodayStr, isPerson } from '@bk2/shared/util-core';
import { AppNavigationService } from '@bk2/shared/util-angular';
import { AppStore, PersonSelectModalComponent } from '@bk2/shared/feature';

import { convertFormToGroup, GroupFormModel } from '@bk2/subject/group/util';
import { GroupService } from '@bk2/subject/group/data-access';
import { MembershipService } from '@bk2/relationship/membership/data-access';

export type GroupEditState = {
  groupKey: string | undefined;
  selectedSegment: string | undefined;
};

export const initialState: GroupEditState = {
  groupKey: undefined,
  selectedSegment: 'content'
};

export const GroupEditStore = signalStore(
  withState(initialState),
  withProps(() => ({
    groupService: inject(GroupService),
    appNavigationService: inject(AppNavigationService),
    appStore: inject(AppStore),
    env: inject(ENV),
    membershipService: inject(MembershipService),
    modalController: inject(ModalController),    
  })),

  withProps((store) => ({
    groupResource: rxResource({
      params: () => ({
        groupKey: store.groupKey()
      }),
      stream: ({params}) => {
        if (!params.groupKey) return of(undefined);
        const group$ = store.groupService.read(params.groupKey);
        debugItemLoaded('GroupEditStore.group', group$, store.appStore.currentUser());
        return group$;
      }
    }),
  })),
  withComputed((state) => {
    return {
      group: computed(() => state.groupResource.value()),
      currentUser: computed(() => state.appStore.currentUser()),
      defaultResource : computed(() => state.appStore.defaultResource()),
      tenantId: computed(() => state.env.tenantId),
      isLoading: computed(() => state.groupResource.isLoading()),
      segment: computed(() => state.selectedSegment()),
    };
  }),

  withMethods((store) => {
    return {
      /************************************ SETTERS ************************************* */      
      setGroupKey(groupKey: string): void {
        patchState(store, { groupKey });
      },

      setSelectedSegment(selectedSegment: string): void {
        patchState(store, { selectedSegment });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags(ModelType.Group);
      },
      
      /************************************ ACTIONS ************************************* */

      async save(vm: GroupFormModel): Promise<void> {
        const _group = convertFormToGroup(store.group(), vm, store.env.tenantId);
        await (!_group.bkey ? 
          store.groupService.create(_group, store.currentUser()) : 
          store.groupService.update(_group, store.currentUser()));
        store.appNavigationService.logLinkHistory();
        store.appNavigationService.back();
      },

      addSection(): void {
        console.log('GroupEditStore.addSection: Not implemented yet');
      },
      selectSection(): void {
        console.log('GroupEditStore.selectSection: Not implemented yet');
      },
      sortSections(): void {
        console.log('GroupEditStore.sortSections: Not implemented yet');
      },
      editSection(): void {
        console.log('GroupEditStore.editSection: Not implemented yet');
      },
      addEvent(): void {
        console.log('GroupEditStore.addEvent: Not implemented yet');
      },
      addTask(): void {
        console.log('GroupEditStore.addTask: Not implemented yet');
      },
      async addMember(): Promise<void> {
        console.log('GroupEditStore.addMember: Not implemented yet');
        const _modal = await store.modalController.create({
          component: PersonSelectModalComponent,
          cssClass: 'list-modal',
          componentProps: {
            selectedTag: '',
            currentUser: store.currentUser()
          }
        });
        _modal.present();
        const { data, role } = await _modal.onWillDismiss();
        if (role === 'confirm') {
          if (isPerson(data, store.tenantId())) {
            const _membership = new MembershipModel(store.tenantId());
            _membership.memberKey = data.bkey;
            _membership.memberName1 = data.firstName;
            _membership.memberName2 = data.lastName;
            _membership.memberModelType = ModelType.Person;
            _membership.memberType = data.gender;
            _membership.memberDateOfBirth = data.dateOfBirth;
            _membership.memberDateOfDeath = data.dateOfDeath;
            _membership.memberZipCode = data.fav_zip;
            _membership.memberBexioId = data.bexioId;
            _membership.orgKey = store.groupKey() ?? '';
            _membership.orgName = store.group()?.name ?? '';
            _membership.dateOfEntry = getTodayStr();
            _membership.dateOfExit = END_FUTURE_DATE_STR;
            _membership.index = store.membershipService.getSearchIndex(_membership);
            _membership.priority = 1; // default priority for the first membership
            _membership.relIsLast = true; // this is the last membership of this person in
            debugData(`GroupEditStore.addMember: new membership: `, _membership, store.currentUser());
            store.membershipService.create(_membership, store.appStore.currentUser());
          }
        }
      },
    }
  }),
);
