import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { firstValueFrom, of } from 'rxjs';
import { Router } from '@angular/router';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Photo } from '@capacitor/camera';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore, PersonSelectModal } from '@bk2/shared-feature';
import { ArticleSection, AvatarInfo, CalendarCollection, CalendarModel, ChatSection, ColorIonic, GroupCollection, GroupModel, GroupModelName, ImageActionType, MembershipModel, PageCollection, PageModel, PersonModel, SectionCollection, ViewPosition } from '@bk2/shared-models';
import { AlertService, AppNavigationService, navigateByUrl } from '@bk2/shared-util-angular';
import { chipMatches, debugData, debugItemLoaded, debugListLoaded, getAvatarInfo, getAvatarInfoForCurrentUser, getSystemQuery, isGroup, isPerson, nameMatches } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import { GroupService } from '@bk2/subject-group-data-access';
import { AvatarService } from '@bk2/avatar-data-access';
import { MembershipService } from '@bk2/relationship-membership-data-access';
import { createGroupMembership } from '@bk2/relationship-membership-util';
import { MatrixChatService } from '@bk2/chat-data-access';
import { getVisibleGroupKeys } from '@bk2/subject-group-util';

import { GroupEditModal } from './group-edit.modal';
import { PFX } from './scope';

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
    alertService: inject(AlertService),
    toastController: inject(ToastController),
    chatService: inject(MatrixChatService),
    i18nService: inject(I18nService)
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll({
      groups:               PFX + 'groups',
      empty:                PFX + 'empty',
      name:                 '@name',
      content:              PFX + 'content',
      segment_content:      PFX + 'segment.content',
      segment_chat:         PFX + 'segment.chat',
      segment_calendar:     PFX + 'segment.calendar',
      segment_tasks:        PFX + 'segment.tasks',
      segment_files:        PFX + 'segment.files',
      segment_album:        PFX + 'segment.album',
      segment_members:      PFX + 'segment.members',
      group_create_label:   PFX + 'group.create.label',
      group_create_conf:    PFX + 'group.create.conf',
      group_create_error:   PFX + 'group.create.error',
      group_create_duplicate: PFX + 'group.create.duplicate',
      group_create_exists:  PFX + 'group.create.exists',
      group_edit_label:     PFX + 'group.edit.label',
      group_view_label:     PFX + 'group.view.label',
      group_delete_confirm: PFX + 'group.delete.confirm',
      page_create_conf:     PFX + 'page.create.conf',
      page_create_error:    PFX + 'page.create.error',
      article_create_conf:  PFX + 'article.create.conf',
      article_create_error: PFX + 'article.create.error',
      article_title:        PFX + 'article.title',
      article_content:      PFX + 'article.content',
      chat_name:            PFX + 'chat.name',
      chat_create_conf:     PFX + 'chat.create.conf',
      chat_create_error:    PFX + 'chat.create.error',
      chat_group_name:      PFX + 'chat.group.name',
      chat_group_description: PFX + 'chat.group.description',
      calendar_name:        PFX + 'calendar.name',
      calendar_create_conf: PFX + 'calendar.create.conf',
      calendar_create_error: PFX + 'calendar.create.error',
      as_title:             PFX + 'actionsheet.title',
      as_show:              PFX + 'actionsheet.show',
      as_edit:              PFX + 'actionsheet.edit',
      as_addPage:           PFX + 'actionsheet.addPage',
      as_delete:            PFX + 'actionsheet.delete',
      ok: '@ok',
      cancel: '@cancel',
      changeConfirmation_ok:           PFX + 'changeConfirmation.ok',
      changeConfirmation_cancel:       PFX + 'changeConfirmation.cancel',
      changeConfirmation_confirmation: PFX + 'changeConfirmation.confirmation',
    }),

    groupsResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser(),
        tenantId: store.appStore.tenantId()
      }),
      stream: ({ params }): ReturnType<typeof store.firestoreService.searchData<GroupModel>> => {
        if (!params.currentUser || !params.tenantId) return of([] as GroupModel[]);
        return store.firestoreService.searchData<GroupModel>(GroupCollection, getSystemQuery(params.tenantId), 'name', 'asc');
      }
    }),
    groupResource: rxResource({
      params: () => ({
        groupKey: store.groupKey()
      }),
      stream: ({params}) => {
        return store.groupService.read(params.groupKey).pipe(
          debugItemLoaded('GroupStore.group', store.appStore.currentUser())
        );
      }
    }),
    currentUserMembershipsResource: rxResource({
      params: () => ({
        personKey: store.appStore.currentUser()?.personKey
      }),
      stream: ({params}) => {
        return store.membershipService.listMembershipsOfMember(params.personKey, 'person', 'group').pipe(
          debugListLoaded('GroupStore.currentUserMemberships', store.appStore.currentUser())
        );
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
    myGroupMemberships: computed(() => state.currentUserMembershipsResource.value()),

    // other
    currentUser: computed(() => state.appStore.currentUser()),
    isLoading: computed(() => state.groupsResource.isLoading() || state.groupResource.isLoading()),
    tenantId: computed(() => state.appStore.tenantId()),
  })),
  withComputed((state) => ({
    myGroupIds: computed(() => state.myGroupMemberships()?.map(m => m.orgKey) ?? []),
    myGroups: computed(() => {
      const myGroupIds = state.myGroupMemberships()?.map(m => m.orgKey) ?? [];
      const groups: GroupModel[] = [];
      for (const gid of myGroupIds) {
        const group = state.appStore.getGroup(gid);
        if (group) groups.push(group);
      }
      return groups;
    }),
    /** All groups the current user can access: member-based + visibility-role-based. */
    myAccessibleGroups: computed(() => {
      const currentUser = state.appStore.currentUser();
      const allGroups = state.appStore.allGroups();
      const memberGroupIds = new Set(state.myGroupMemberships()?.map(m => m.orgKey) ?? []);
      const visibleKeys = currentUser ? new Set(getVisibleGroupKeys(allGroups, memberGroupIds, currentUser)) : new Set<string>();
      const result: GroupModel[] = [];
      for (const g of allGroups) {
        if (memberGroupIds.has(g.bkey) || visibleKeys.has(g.bkey)) {
          result.push(g);
        }
      }
      return result;
    }),
  })),
  withMethods((store) => ({
    reset() {
      patchState(store, initialState);
    },
    reload() {
      store.groupsResource.reload();
      store.groupResource.reload();
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

    /******************************* actions on the group *************************************** */
    /**
     * Adds a new group.
     */
    async add(readOnly = true): Promise<void> {
      if (readOnly) return;
      const newGroup = new GroupModel(store.tenantId());
      const currentUser = store.currentUser();
      if (currentUser) {
        const avatar = getAvatarInfoForCurrentUser(currentUser);
        if (avatar) {
          newGroup.admins = [avatar];
        }
        await this.edit(newGroup, readOnly, true);
        const currentPerson = store.appStore.getPerson(currentUser.personKey);
        if (currentPerson) {
          this.addMember(currentPerson);
        }
      }
    },

    async edit(group?: GroupModel, readOnly = true, isNew = false): Promise<void> {
      const modal = await store.modalController.create({
        component: GroupEditModal,
        componentProps: {
          group,
          currentUser: store.currentUser(),
          tags: this.getTags(),
          tenantId: store.tenantId(),
          isNew,
          readOnly
        }
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data && !readOnly) {
        if (isGroup(data, store.tenantId())) {
          if (isNew) {
            data.bkey = data.name;
          // bkey is user-defined. Therefore, we need to check for duplicates when creating a new group.
            const existingGroup = store.groups()?.find((g: GroupModel) => g.bkey === data.bkey);
            if (existingGroup) {
              const alert = await store.alertController.create({
                header: store.i18n.group_create_duplicate(),
                message: store.i18n.group_create_exists(),
                buttons: [store.i18n.ok()]
              });
              await alert.present();
              return;
            }
            data.filesFolder = data.hasFiles ? `f_${data.bkey}` : '';
            data.albumFolder = data.hasAlbum ? `a_${data.bkey}` : '';
            await store.groupService.create(data, store.currentUser());
            this.setGroupKey(data.bkey);
            await this.ensureAllAdminsAreMember(data);

            // create default calendar segment
            await this.createGroupCalendar(data);

            // create default content page with initial article section
            const articleId = await this.createArticleSection(data);
            await this.createGroupPage(data, 'content', store.i18n.content(), articleId);

            // create default chat section/page and chat room
            const chatId = await this.createChatSection(data);
            await this.createGroupPage(data, 'chat', store.i18n.chat_group_name(), chatId);
            await store.chatService.createGroupRoom(data.bkey, [], store.i18n.chat_group_name() + ': ' + data.name);
          } else {
            await store.groupService.update(data, store.currentUser());
            await this.ensureAllAdminsAreMember(data);
          }
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
      const result = await store.alertService.confirm(store.i18n.group_delete_confirm(), true);
      if (result === true) {
        await store.groupService.delete(group, store.currentUser());
        this.reload();
      }
    },

    /******************************* export and save *************************************** */
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

    /******************************* cms: page & sections *************************************** */
    /**
     * Checks whether the group already has a content page.
     * The id of the page is generated as groupId_content
     * @param groupId the id/key of the group to check
     */
    async doesGroupContentPageExist(groupId: string): Promise<boolean> {
      const page = await firstValueFrom(store.firestoreService.readModel<PageModel>(PageCollection, `${groupId}_content`));
      return !!page;
    },

    async createGroupPage(group: GroupModel, postfix: string, name: string, sectionId?: string): Promise<void> {
      const page = new PageModel(store.tenantId());
      page.bkey = `${group.bkey}_${postfix}`;
      page.name = name;
      page.type = postfix;
      page.state = 'published';
      if (sectionId) {
        page.sections = [sectionId];
      }
      await store.firestoreService.createModel<PageModel>(PageCollection, page, 
        store.i18n.page_create_conf(), store.i18n.page_create_error(), store.currentUser());
    },

    async createChatSection(group: GroupModel): Promise<string | undefined> {
      const name = `${group.bkey}_chat`;
      const section = {
        bkey: name,
        type: 'chat',
        name: name,
        title: store.i18n.chat_name(),
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
          description: store.i18n.chat_group_description(),
          id: `group-chat-${group.bkey}`,
          name: store.i18n.chat_group_name(),
          showChannelList: true,
          type: 'messaging',
          url: ''
        },
        notes: '',
        tags: '',
        tenants: [store.tenantId()],
      } as ChatSection;
      return await store.firestoreService.createModel<ChatSection>(SectionCollection, section, 
        store.i18n.chat_create_conf(), store.i18n.chat_create_error(), store.currentUser())
    },

    async createArticleSection(group: GroupModel): Promise<string | undefined> {
      const section = {
        bkey: `g-${group.bkey}`,
        type: 'article',
        state: 'published',
        name: `group-intro-${group.bkey}`,
        title: store.i18n.article_title(),
        subTitle: '',
        index: '',
        color: ColorIonic.Light,
        colSize: '12',
        roleNeeded: 'groupAdmin',
        isArchived: false,
        content: { 
          htmlContent: store.i18n.article_content(),
          colSize: 3,
          position: ViewPosition.None
        },
        properties: {
          images: [],
          imageStyle: {
            imgIxParams: '',
            width: '100%',
            height: 'auto',
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
      return await store.firestoreService.createModel<ArticleSection>(SectionCollection, section, 
        store.i18n.article_create_conf(), store.i18n.article_create_error(), store.currentUser())
    },

    /******************************* events / calendar *************************************** */
    async createGroupCalendar(group: GroupModel): Promise<void> {
      const cal = new CalendarModel(store.tenantId());
      cal.bkey = group.bkey;
      cal.name = group.name;
      cal.description = store.i18n.calendar_name + group.bkey;
      cal.owner = `${GroupModelName}.${group.bkey}`;
      await store.firestoreService.createModel<CalendarModel>(CalendarCollection, cal, 
        store.i18n.calendar_create_conf(), store.i18n.calendar_create_error(), store.currentUser());
    },

    addEvent(): void {
      console.log('GroupStore.addEvent: Not implemented yet');
    },

    /******************************* tasks *************************************** */
    addTask(): void {
      console.log('GroupStore.addTask: Not implemented yet');
    },

    /******************************* members *************************************** */
    async ensureAllAdminsAreMember(group: GroupModel): Promise<void> {
      const groupAvatar = getAvatarInfo(group, 'group') as AvatarInfo;
      if (group?.admins?.length > 0) {
        for (const admin of group.admins) {
          await this.ensureAdminIsMember(admin, groupAvatar, group);
        }
      }
    },

    async ensureAdminIsMember(admin: AvatarInfo, groupAvatar: AvatarInfo, group: GroupModel): Promise<void> {
      if (await store.membershipService.isMemberOf(admin, groupAvatar)) return;
      if (admin.modelType === 'person') {
        await this.addMember(store.appStore.getPerson(admin.key), group);
      }
    },

    async addMember(person?: PersonModel, groupOverride?: GroupModel): Promise<void> {
      let membership: MembershipModel | undefined;
      const group = groupOverride ?? store.group();
      if (group) {
        if (person) {
          membership = createGroupMembership(group, person, store.tenantId());
        } else {
          const modal = await store.modalController.create({
            component: PersonSelectModal,
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
              membership = createGroupMembership(group, data, store.tenantId());
            }
          }
        }
        debugData(`GroupStore.addMember: new membership: `, membership, store.currentUser());
        if (membership) {
          store.membershipService.create(membership, store.appStore.currentUser());
        }
      }
    },
  }))
);

