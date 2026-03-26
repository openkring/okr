import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore, GroupSelectModalComponent } from '@bk2/shared-feature';
import { DEFAULT_KEY } from '@bk2/shared-constants';
import { GroupModel, GroupModelName } from '@bk2/shared-models';
import { confirm } from '@bk2/shared-util-angular';
import { GroupService } from '@bk2/subject-group-data-access';
import { GroupEditModalComponent } from '@bk2/subject-group-feature';

export interface OrgchartTreeNode {
  name: string;
  bkey: string;
  children: OrgchartTreeNode[];
}

function buildTreeNode(group: GroupModel, allGroups: GroupModel[]): OrgchartTreeNode {
  return {
    name: group.name,
    bkey: group.bkey,
    children: allGroups
      .filter(g => g.parentKey === group.bkey)
      .map(child => buildTreeNode(child, allGroups)),
  };
}

export type OrgchartState = {
  topGroupKey: string;
  showName: boolean;
};

const initialState: OrgchartState = {
  topGroupKey: '',
  showName: true,
};

export const OrgchartStore = signalStore(
  withState(initialState),
  withProps(() => ({
    groupService: inject(GroupService),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    alertController: inject(AlertController),
  })),
  withProps((store) => ({
    groupsResource: rxResource({
      stream: () => store.groupService.list(),
    }),
  })),
  withComputed((state) => ({
    allGroups: computed(() => state.groupsResource.value() ?? []),
    isLoading: computed(() => state.groupsResource.isLoading()),
    rootGroup: computed(() =>
      (state.groupsResource.value() ?? []).find(g => g.bkey === state.topGroupKey())
    ),
    treeData: computed((): OrgchartTreeNode | undefined => {
      const allGroups = state.groupsResource.value() ?? [];
      const root = allGroups.find(g => g.bkey === state.topGroupKey());
      if (!root) return undefined;
      return buildTreeNode(root, allGroups);
    }),
  })),
  withMethods((store) => ({
    setConfig(topGroupKey: string, showName: boolean): void {
      patchState(store, { topGroupKey, showName });
    },

    childrenOf(parentKey: string): GroupModel[] {
      return store.allGroups().filter(g => g.parentKey === parentKey);
    },

    async addNewGroup(parentKey: string): Promise<void> {
      const newGroup = new GroupModel(store.appStore.tenantId());
      newGroup.parentKey = parentKey;
      newGroup.hasChat = false;
      newGroup.hasContent = false;
      newGroup.hasCalendar = false;
      newGroup.hasTasks = false;
      newGroup.hasFiles = false;
      newGroup.hasAlbum = false;
      const modal = await store.modalController.create({
        component: GroupEditModalComponent,
        cssClass: 'wide-modal',
        componentProps: {
          group: newGroup,
          currentUser: store.appStore.currentUser(),
          tags: store.appStore.getTags(GroupModelName),
          tenantId: store.appStore.tenantId(),
          isNew: true,
          readOnly: false,
        },
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss();
      if (role === 'confirm' && data) {
        await store.groupService.create(data as GroupModel, store.appStore.currentUser());
      }
    },

    async addExistingGroup(parentKey: string): Promise<void> {
      const modal = await store.modalController.create({
        component: GroupSelectModalComponent,
        cssClass: 'list-modal',
        componentProps: {
          selectedTag: '',
          currentUser: store.appStore.currentUser(),
        },
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss();
      if (role === 'confirm' && data) {
        const group = data as GroupModel;
        await store.groupService.update(
          { ...group, parentKey },
          store.appStore.currentUser(),
        );
      }
    },

    async editGroup(group: GroupModel): Promise<void> {
      const modal = await store.modalController.create({
        component: GroupEditModalComponent,
        cssClass: 'wide-modal',
        componentProps: {
          group,
          currentUser: store.appStore.currentUser(),
          tags: store.appStore.getTags(GroupModelName),
          tenantId: store.appStore.tenantId(),
          isNew: false,
          readOnly: false,
        },
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss();
      if (role === 'confirm' && data) {
        await store.groupService.update(data as GroupModel, store.appStore.currentUser());
      }
    },

    async removeGroup(group: GroupModel): Promise<void> {
      const confirmed = await confirm(
        store.alertController,
        '@subject.group.operation.detach.confirm',
        true,
      );
      if (confirmed) {
        await store.groupService.update(
          { ...group, parentKey: DEFAULT_KEY, parentName: '' },
          store.appStore.currentUser(),
        );
      }
    },
  })),
);
