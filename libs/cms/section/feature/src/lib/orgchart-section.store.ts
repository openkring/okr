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
import { OrgEditModalComponent } from '@bk2/subject-org-feature';

export interface OrgchartTreeNode {
  name: string;
  bkey: string;
  modelType: 'group' | 'org';
  icon: string;
  children: OrgchartTreeNode[];
}

function groupToNode(group: GroupModel): OrgchartTreeNode {
  return { name: group.name, bkey: group.bkey, modelType: 'group', icon: group.icon, children: [] };
}

function buildTreeNode(node: OrgchartTreeNode, allGroups: GroupModel[]): OrgchartTreeNode {
  return {
    ...node,
    children: allGroups
      .filter(g => g.parentKey === node.bkey)
      .map(child => buildTreeNode(groupToNode(child), allGroups)),
  };
}

function parseTopElement(topElement: string): { modelType: 'group' | 'org'; key: string } {
  const dotIndex = topElement.indexOf('.');
  if (dotIndex === -1) return { modelType: 'group', key: topElement };
  const raw = topElement.slice(0, dotIndex);
  return { modelType: raw === 'org' ? 'org' : 'group', key: topElement.slice(dotIndex + 1) };
}

export type OrgchartState = {
  topElement: string;
  showName: boolean;
  display: 'vertical' | 'horizontal';
};

const initialState: OrgchartState = {
  topElement: '',
  showName: true,
  display: 'vertical',
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
    isLoading: computed(() => state.groupsResource.isLoading() || state.appStore.isLoading()),
    rootNode: computed((): OrgchartTreeNode | undefined => {
      const { modelType, key } = parseTopElement(state.topElement());
      if (modelType === 'org') {
        const org = state.appStore.allOrgs().find(o => o.bkey === key);
        if (!org) return undefined;
        return { name: org.name, bkey: org.bkey, modelType: 'org', icon: 'org', children: [] };
      }
      const group = (state.groupsResource.value() ?? []).find(g => g.bkey === key);
      if (!group) return undefined;
      return groupToNode(group);
    }),
    treeData: computed((): OrgchartTreeNode | undefined => {
      const allGroups = state.groupsResource.value() ?? [];
      const { modelType, key } = parseTopElement(state.topElement());
      let root: OrgchartTreeNode | undefined;
      if (modelType === 'org') {
        const org = state.appStore.allOrgs().find(o => o.bkey === key);
        if (!org) return undefined;
        root = { name: org.name, bkey: org.bkey, modelType: 'org', icon: 'org', children: [] };
      } else {
        const group = allGroups.find(g => g.bkey === key);
        if (!group) return undefined;
        root = groupToNode(group);
      }
      return buildTreeNode(root, allGroups);
    }),
  })),
  withMethods((store) => ({
    setConfig(topElement: string, showName: boolean, display: 'vertical' | 'horizontal'): void {
      patchState(store, { topElement, showName, display });
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

    async editGroup(node: OrgchartTreeNode): Promise<void> {
      if (node.modelType !== 'group') return;
      const group = store.allGroups().find(g => g.bkey === node.bkey);
      if (!group) return;
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

    async viewNode(node: OrgchartTreeNode): Promise<void> {
      if (node.modelType === 'org') {
        const org = store.appStore.allOrgs().find(o => o.bkey === node.bkey);
        if (!org) return;
        const modal = await store.modalController.create({
          component: OrgEditModalComponent,
          cssClass: 'wide-modal',
          componentProps: {
            org,
            currentUser: store.appStore.currentUser(),
            resource: store.appStore.defaultResource(),
            tags: store.appStore.getTags('org'),
            tenantId: store.appStore.tenantId(),
            types: store.appStore.getCategory('org_type'),
            readOnly: true,
          },
        });
        await modal.present();
        await modal.onWillDismiss();
      } else {
        const group = store.allGroups().find(g => g.bkey === node.bkey);
        if (!group) return;
        const modal = await store.modalController.create({
          component: GroupEditModalComponent,
          cssClass: 'wide-modal',
          componentProps: {
            group,
            currentUser: store.appStore.currentUser(),
            tags: store.appStore.getTags('group'),
            tenantId: store.appStore.tenantId(),
            isNew: false,
            readOnly: true,
          },
        });
        await modal.present();
        await modal.onWillDismiss();
      }
    },

    async removeGroup(node: OrgchartTreeNode): Promise<void> {
      if (node.modelType !== 'group') return;
      const group = store.allGroups().find(g => g.bkey === node.bkey);
      if (!group) return;
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
