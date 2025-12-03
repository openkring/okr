import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';
import { Photo } from '@capacitor/camera';

import { DEFAULT_KEY, DEFAULT_NAME, END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { AppStore, PersonSelectModalComponent } from '@bk2/shared-feature';
import { GroupModelName, MembershipModel } from '@bk2/shared-models';
import { debugData, debugItemLoaded, getTodayStr, isPerson } from '@bk2/shared-util-core';

import { MembershipService } from '@bk2/relationship-membership-data-access';
import { GroupService } from '@bk2/subject-group-data-access';
import { convertFormToGroup, GroupFormModel } from '@bk2/subject-group-util';
import { getMembershipIndex } from '@bk2/relationship-membership-util';
import { AvatarService } from '@bk2/avatar-data-access';

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
    appStore: inject(AppStore),
    membershipService: inject(MembershipService),
    modalController: inject(ModalController),
    avatarService: inject(AvatarService), 
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
      tenantId: computed(() => state.appStore.env.tenantId),
      isLoading: computed(() => state.groupResource.isLoading()),
      segment: computed(() => state.selectedSegment()),
    };
  }),

  withMethods((store) => {
    return {
      reset() {
        patchState(store, initialState);
      },

      /************************************ SETTERS ************************************* */      
      setGroupKey(groupKey: string): void {
        patchState(store, { groupKey });
      },

      setSelectedSegment(selectedSegment: string): void {
        patchState(store, { selectedSegment });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags('group');
      },
      
      /************************************ ACTIONS ************************************* */

      async save(formData?: GroupFormModel): Promise<void> {
        const group = convertFormToGroup(formData, store.group());
        await (!group.bkey ? 
          store.groupService.create(group, store.currentUser()) : 
          store.groupService.update(group, store.currentUser()));
      },

      async saveAvatar(photo: Photo): Promise<void> {
        const group = store.group();
        if (!group) return;
        await store.avatarService.saveAvatarPhoto(photo, group.bkey, store.tenantId(), GroupModelName);
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
        const modal = await store.modalController.create({
          component: PersonSelectModalComponent,
          cssClass: 'list-modal',
          componentProps: {
            selectedTag: '',
            currentUser: store.currentUser()
          }
        });
        modal.present();
        const { data, role } = await modal.onWillDismiss();
        if (role === 'confirm') {
          if (isPerson(data, store.tenantId())) {
            const membership = new MembershipModel(store.tenantId());
            membership.memberKey = data.bkey;
            membership.memberName1 = data.firstName;
            membership.memberName2 = data.lastName;
            membership.memberModelType = 'person';
            membership.memberType = data.gender;
            membership.memberDateOfBirth = data.dateOfBirth;
            membership.memberDateOfDeath = data.dateOfDeath;
            membership.memberZipCode = data.favZipCode;
            membership.memberBexioId = data.bexioId;
            membership.orgKey = store.groupKey() ?? DEFAULT_KEY;
            membership.orgName = store.group()?.name ?? DEFAULT_NAME;
            membership.dateOfEntry = getTodayStr();
            membership.dateOfExit = END_FUTURE_DATE_STR;
            membership.index = getMembershipIndex(membership);
            membership.order = 1; // default priority for the first membership
            membership.relIsLast = true; // this is the last membership of this person in
            debugData(`GroupEditStore.addMember: new membership: `, membership, store.currentUser());
            store.membershipService.create(membership, store.appStore.currentUser());
          }
        }
      },
    }
  }),
);
