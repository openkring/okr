import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore, PersonSelectModalComponent } from '@bk2/shared-feature';
import { GroupCollection, GroupModel, GroupModelName, MembershipModel } from '@bk2/shared-models';
import { AppNavigationService, navigateByUrl } from '@bk2/shared-util-angular';
import { chipMatches, debugData, debugItemLoaded, getSystemQuery, getTodayStr, isGroup, isPerson, nameMatches } from '@bk2/shared-util-core';

import { GroupService } from '@bk2/subject-group-data-access';

import { GroupEditModalComponent } from './group-edit.modal';
import { MembershipService } from '@bk2/relationship-membership-data-access';
import { AvatarService } from '@bk2/avatar-data-access';
import { of } from 'rxjs';
import { Photo } from '@capacitor/camera';
import { DEFAULT_KEY, DEFAULT_NAME, END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { getMembershipIndex } from '@bk2/relationship-membership-util';

export type GroupState = {
  searchTerm: string;
  selectedTag: string;
  groupKey: string | undefined;
  selectedSegment: string | undefined;
};
export const initialState: GroupState = {
  searchTerm: '',
  selectedTag: '',
  groupKey: undefined,
  selectedSegment: 'content'
};

export const GroupStore = signalStore(
  withState(initialState),
  withProps(() => ({
    groupService: inject(GroupService),
    appNavigationService: inject(AppNavigationService),
    router: inject(Router),
    appStore: inject(AppStore),
    membershipService: inject(MembershipService),
    avatarService: inject(AvatarService), 
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    alertController: inject(AlertController),
    toastController: inject(ToastController),
  })),
  withProps((store) => ({
    groupsResource: rxResource({
      stream: () => {
        return store.firestoreService.searchData<GroupModel>(GroupCollection, getSystemQuery(store.appStore.tenantId()), 'id', 'asc')
      }
    }),
    groupResource: rxResource({
      params: () => ({
        groupKey: store.groupKey()
      }),
      stream: ({params}) => {
        if (!params.groupKey) return of(undefined);
        const group$ = store.groupService.read(params.groupKey);
        debugItemLoaded('GroupStore.group', group$, store.appStore.currentUser());
        return group$;
      }
    }),
  })),
  withComputed((state) => ({
    // groups
    groups: computed(() => {
      return state.groupsResource.value();
    }),
    groupsCount: computed(() => state.groupsResource.value()?.length ?? 0),
    filteredGroups: computed(() =>
      state.groupsResource.value()?.filter((group: GroupModel) =>
        nameMatches(group.index, state.searchTerm()) &&
        chipMatches(group.tags, state.selectedTag())
      ) ?? []
    ),
    // group
    group: computed(() => state.groupResource.value()),
    defaultResource : computed(() => state.appStore.defaultResource()),
    segment: computed(() => state.selectedSegment()),

    // other
    currentUser: computed(() => state.appStore.currentUser()),
    isLoading: computed(() => state.groupsResource.isLoading() || state.groupResource.isLoading()),
    tenantId: computed(() => state.appStore.tenantId()),
  })),
  withMethods((store) => ({
    reset() {
      patchState(store, initialState);
      store.groupsResource.reload();
    },
    reload() {
      store.groupsResource.reload();
      store.groupResource.reload();
    },
    printState() {
      console.log('------------------------------------');
      console.log('GroupStore state:');
      console.log('  searchTerm: ' + store.searchTerm());
      console.log('  selectedTag: ' + store.selectedTag());
      console.log('  groups: ' + JSON.stringify(store.groups()));
      console.log('  groupsCount: ' + store.groupsCount());
      console.log('  filteredGroups: ' + JSON.stringify(store.filteredGroups()));
      console.log('  currentUser: ' + JSON.stringify(store.currentUser()));
      console.log('  tenantId: ' + store.tenantId());
      console.log('------------------------------------');
    },

    /******************************** setters (filter) ******************************************* */
    setSearchTerm(searchTerm: string) {
      patchState(store, { searchTerm });
    },
    setSelectedTag(selectedTag: string) {
      patchState(store, { selectedTag });
    },
    setGroupKey(groupKey: string): void {
      patchState(store, { groupKey });
    },

    setSelectedSegment(selectedSegment: string): void {
      patchState(store, { selectedSegment });
    },

    /******************************* getters *************************************** */
    getTags(): string {
      return store.appStore.getTags('group');
    },

    /******************************* actions *************************************** */
    /**
     * Adds a new group.
     */
    async add(readOnly = true): Promise<void> {
      if (readOnly) return;
      const newGroup = new GroupModel(store.tenantId());
      await this.edit(newGroup, readOnly);
    },

    async edit(group?: GroupModel, readOnly = true): Promise<void> {
      const modal = await store.modalController.create({
        component: GroupEditModalComponent,
        componentProps: {
          group,
          currentUser: store.currentUser(),
          tags: this.getTags(),
          readOnly
        }
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data && !readOnly) {
        if (isGroup(data, store.tenantId())) {
          await (!data.bkey ? 
            store.groupService.create(data, store.currentUser()) : 
            store.groupService.update(data, store.currentUser()));
          this.reload();
        }
      }
    },

    async view(group?: GroupModel, readOnly = true): Promise<void> {
      if (!group?.bkey || group.bkey.length === 0) return;
      store.appNavigationService.pushLink('/group/all/c-test-groups');
      await navigateByUrl(store.router, `/group-view/${group.bkey}`, { readOnly });
    },

    async delete(group?: GroupModel, readOnly = true): Promise<void> {
      if (!group || readOnly) return;
      await store.groupService.delete(group, store.currentUser());
      this.reset();
    },

    async export(type: string): Promise<void> {
      console.log(`GroupStore.export(${type}) is not yet implemented.`);
    },

    async save(group?: GroupModel): Promise<void> {
      if (!group) return;
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
      console.log('GroupStore.addSection: Not implemented yet');
    },
    selectSection(): void {
      console.log('GroupStore.selectSection: Not implemented yet');
    },
    sortSections(): void {
      console.log('GroupStore.sortSections: Not implemented yet');
    },
    editSection(): void {
      console.log('GroupStore.editSection: Not implemented yet');
    },
    addEvent(): void {
      console.log('GroupStore.addEvent: Not implemented yet');
    },
    addTask(): void {
      console.log('GroupStore.addTask: Not implemented yet');
    },

      async addMember(): Promise<void> {
        console.log('GroupStore.addMember: Not implemented yet');
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
            debugData(`GroupStore.addMember: new membership: `, membership, store.currentUser());
            store.membershipService.create(membership, store.appStore.currentUser());
          }
        }
      },
  }))
);
