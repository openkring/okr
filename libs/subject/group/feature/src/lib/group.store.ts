import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';
import { Photo } from '@capacitor/camera';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore, PersonSelectModalComponent } from '@bk2/shared-feature';
import { ArticleSection, CalendarCollection, CalendarModel, ChatSection, ColorIonic, GroupCollection, GroupModel, GroupModelName, ImageActionType, ImageType, MembershipModel, PageCollection, PageModel, SectionCollection, ViewPosition } from '@bk2/shared-models';
import { confirm, AppNavigationService, navigateByUrl } from '@bk2/shared-util-angular';
import { chipMatches, debugData, debugItemLoaded, debugListLoaded, getSystemQuery, getTodayStr, isGroup, isPerson, nameMatches } from '@bk2/shared-util-core';
import { DEFAULT_KEY, DEFAULT_NAME, END_FUTURE_DATE_STR } from '@bk2/shared-constants';

import { GroupService } from '@bk2/subject-group-data-access';
import { AvatarService } from '@bk2/avatar-data-access';
import { MembershipService } from '@bk2/relationship-membership-data-access';
import { getMembershipIndex } from '@bk2/relationship-membership-util';

import { GroupEditModalComponent } from './group-edit.modal';

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
        return store.firestoreService.searchData<GroupModel>(GroupCollection, getSystemQuery(store.appStore.tenantId()), 'name', 'asc')
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
    currentUserMembershipsResource: rxResource({
      params: () => ({
        personKey: store.appStore.currentUser()?.personKey
      }),
      stream: ({params}) => {
        console.log('GroupStore.currentUserMembershipsResource: personKey=', params.personKey);
        if (!params.personKey) return of([]);
        const result = store.membershipService.listMembershipsOfMember(params.personKey, 'person');
        debugListLoaded('GroupStore.currentUserMemberships', result, store.appStore.currentUser());  
        return result;
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

    // memberships
    currentUserMemberships: computed(() => state.currentUserMembershipsResource.value()),

    // other
    currentUser: computed(() => state.appStore.currentUser()),
    isLoading: computed(() => state.groupsResource.isLoading() || state.groupResource.isLoading()),
    tenantId: computed(() => state.appStore.tenantId()),
  })),
  withMethods((store) => ({
    reset() {
      patchState(store, initialState);
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
      console.log('  groupKey: ' + store.groupKey());
      console.log('  selectedSegment: ' + store.selectedSegment());
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
      await this.edit(newGroup, readOnly, true);
    },

    async edit(group?: GroupModel, readOnly = true, isNew = false): Promise<void> {
      const modal = await store.modalController.create({
        component: GroupEditModalComponent,
        componentProps: {
          group,
          currentUser: store.currentUser(),
          tags: this.getTags(),
          isNew,
          readOnly
        }
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data && !readOnly) {
        if (isGroup(data, store.tenantId())) {
          if (isNew) {
          // bkey is user-defined. Therefore, we need to check for duplicates when creating a new group.
            const existingGroup = store.groups()?.find((g: GroupModel) => g.bkey === data.bkey);
            if (existingGroup) {
              const alert = await store.alertController.create({
                header: 'Duplicate ID',
                message: `A group with ID "${data.bkey}" already exists. Please use a different ID.`,
                buttons: ['OK']
              });
              await alert.present();
              return;
            }
            await store.groupService.create(data, store.currentUser());

            // create default calendar segment
            await this.createGroupCalendar(data);

            // create default content page with initial article section
            const articleId = await this.createArticleSection(data);
            await this.createGroupPage(data, 'content', 'Inhalt', articleId);

            // create default chat section and page
            const chatId = await this.createChatSection(data);
            await this.createGroupPage(data, 'chat', 'Chat', chatId);
          } else {
            await store.groupService.update(data, store.currentUser());
          }
          this.reload();
        }
      }
    },

    async createGroupCalendar(group: GroupModel): Promise<void> {
      const cal = new CalendarModel(store.tenantId());
      cal.bkey = group.bkey;
      cal.name = group.name;
      cal.description = `Calendar for group ${group.bkey}`;
      cal.owner = `${GroupModelName}.${group.bkey}`;
      await store.firestoreService.createModel<CalendarModel>(CalendarCollection, cal, '@calendar.operation.create', store.currentUser());
    },

    async createGroupPage(group: GroupModel, postfix: string, name: string, sectionId?: string): Promise<void> {
      const page = new PageModel(store.tenantId());
      page.bkey = `${group.bkey}_${postfix}`;
      page.name = name;
      page.type = 'content';
      page.state = 'published';
      if (sectionId) {
        page.sections = [sectionId];
      }
      await store.firestoreService.createModel<PageModel>(PageCollection, page, '@page.operation.create', store.currentUser());
    },

    async createChatSection(group: GroupModel): Promise<string | undefined> {
      const name = `${group.bkey}_chat`;
      const section = {
        bkey: name,
        type: 'chat',
        name: name,
        title: 'Chat',
        subTitle: '',
        index: '',
        color: ColorIonic.Light,
        roleNeeded: 'registered',
        isArchived: false,
        content: { 
          htmlContent: '<p></p>',
          colSize: 4,
          position: ViewPosition.None
        },
        properties: {
          description: 'Hier können sich alle Mitglieder der Gruppe austauschen.',
          id: `group-chat-${group.bkey}`,
          name: 'Gruppen Chat',
          showChannelList: true,
          type: 'messaging',
          url: ''
        },
        notes: '',
        tags: '',
        tenants: [store.tenantId()],
      } as ChatSection;
      return await store.firestoreService.createModel<ChatSection>(SectionCollection, section, '@section.operation.create', store.currentUser())
    },

    async createArticleSection(group: GroupModel): Promise<string | undefined> {
      const name = `${group.bkey}_article1`;
      const section = {
        bkey: name,
        type: 'article',
        name: name,
        title: 'Artikel',
        subTitle: '',
        index: '',
        color: ColorIonic.Light,
        roleNeeded: 'registered',
        isArchived: false,
        content: { 
          htmlContent: '<p>Diese Website enthält Informationen, die für die Gruppe relevant sind. Der/die Gruppen-Admin kann diesen Inhalt frei bearbeiten. Dazu musst du oben rechts im Menu auf den Editor-Modus klicken. Du siehst dann die vorhandenen Sektionen gelb umrandet. Wenn du nun auf eine solche Sektion klickst, kannst du sie bearbeiten.</p>',
          colSize: 4,
          position: ViewPosition.Left
        },
        properties: {
          image: {
            label: '',
            type: ImageType.Image,
            url: store.appStore.services.imgixBaseUrl() + '/' + store.appStore.appConfig().welcomeBannerUrl,
            actionUrl: '',
            altText: 'default image (same as welcome banner)',
            overlay: ''
          },
          imageStyle: {
            imgIxParams: '',
            width: '571px',
            height: '420px',
            sizes: '(max-width: 786px) 50vw, 100vw',
            border: '1px',
            borderRadius: '4px',
            isThumbnail: false,
            slot: 'none',
            fill: false,
            hasPriority: false,
            action: ImageActionType.None,
            zoomFactor: 2
          },
        },
        notes: '',
        tags: '',
        tenants: [store.tenantId()],
      } as ArticleSection;
      return await store.firestoreService.createModel<ArticleSection>(SectionCollection, section, '@section.operation.create', store.currentUser())
    },

    async view(group?: GroupModel, readOnly = true): Promise<void> {
      if (!group?.bkey || group.bkey.length === 0) return;
      store.appNavigationService.pushLink('/group/all/c-test-groups');
      await navigateByUrl(store.router, `/group-view/${group.bkey}`, { readOnly });
    },

    async delete(group?: GroupModel, readOnly = true): Promise<void> {
      if (!group || readOnly) return;
      const result = await confirm(store.alertController, '@subject.group.operation.delete.confirm', true);
      if (result === true) {
        await store.groupService.delete(group, store.currentUser());
        this.reload();
      }
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
          membership.orgModelType = 'group';
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
