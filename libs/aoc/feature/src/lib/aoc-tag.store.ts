import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { BkModel, TagCollection, TagModel } from '@bk2/shared-models';
import { bkPrompt, confirm } from '@bk2/shared-util-angular';
import { getSystemQuery } from '@bk2/shared-util-core';

/**
 * TagModel as it arrives from Firestore.
 * FirestoreService attaches `bkey` (document ID) at runtime; this interface makes that explicit.
 */
export interface TagItem extends BkModel {
  tagModel: string;
  tags: string;
}

export type AocTagState = {
  searchTerm: string;
  selectedTagKey: string | undefined;
};

export const initialState: AocTagState = {
  searchTerm: '',
  selectedTagKey: undefined,
};

export const AocTagStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    alertController: inject(AlertController),
  })),
  withProps(store => ({
    tagsResource: rxResource({
      params: () => ({
        fbUser: store.appStore.fbUser(),
        tenantId: store.appStore.env.tenantId,
      }),
      stream: ({ params }) => {
        if (!params.fbUser || !params.tenantId) return of([] as TagItem[]);
        return store.firestoreService.searchData<TagItem>(
          TagCollection, getSystemQuery(params.tenantId), 'tagModel', 'asc'
        );
      },
    }),
  })),
  withComputed(store => ({
    isLoading: computed(() => store.tagsResource.isLoading()),
    filteredTags: computed((): TagItem[] => {
      const term = store.searchTerm().toLowerCase().trim();
      const all = (store.tagsResource.value() ?? []) as TagItem[];
      return term ? all.filter(t => t.tagModel.toLowerCase().includes(term)) : all;
    }),
    selectedTag: computed((): TagItem | undefined => {
      const key = store.selectedTagKey();
      if (!key) return undefined;
      return ((store.tagsResource.value() ?? []) as TagItem[]).find(t => t.bkey === key);
    }),
    tagStrings: computed((): string[] => {
      const key = store.selectedTagKey();
      const tag = key ? ((store.tagsResource.value() ?? []) as TagItem[]).find(t => t.bkey === key) : undefined;
      if (!tag?.tags) return [];
      return tag.tags.split(',').map(s => s.trim()).filter(Boolean);
    }),
  })),
  withMethods(store => ({
    setSearchTerm(searchTerm: string): void {
      patchState(store, { searchTerm });
    },

    selectTag(tag: TagItem): void {
      patchState(store, { selectedTagKey: tag.bkey });
    },

    deselectTag(): void {
      patchState(store, { selectedTagKey: undefined });
    },

    async createTagDocument(): Promise<void> {
      const tenantId = store.appStore.env.tenantId;
      const modelName = await bkPrompt(store.alertController, '@aoc.tag.create.header', '@aoc.tag.create.placeholder');
      if (!modelName?.trim()) return;
      const tag = new TagModel(tenantId);
      tag.tagModel = modelName.trim();
      tag.tags = '';
      await store.firestoreService.createModel<TagItem>(TagCollection, { ...tag, bkey: '' }, '@aoc.tag.operation.create', store.appStore.currentUser());
    },

    async archiveTagDocument(tag: TagItem): Promise<void> {
      const ok = await confirm(store.alertController, '@aoc.tag.delete.confirm', true);
      if (!ok) return;
      if (store.selectedTagKey() === tag.bkey) {
        patchState(store, { selectedTagKey: undefined });
      }
      await store.firestoreService.deleteModel<TagItem>(TagCollection, { ...tag }, '@aoc.tag.operation.delete', store.appStore.currentUser());
    },

    async addTagString(tag: TagItem): Promise<void> {
      const newStr = await bkPrompt(store.alertController, '@aoc.tag.string.add.header', '@aoc.tag.string.add.placeholder');
      if (!newStr?.trim()) return;
      const existing = tag.tags ? tag.tags.split(',').map(s => s.trim()).filter(Boolean) : [];
      const updated = [...existing, newStr.trim()].join(',');
      await store.firestoreService.updateModel<TagItem>(TagCollection, { ...tag, tags: updated }, false, '@aoc.tag.operation.update', store.appStore.currentUser());
    },

    async removeTagString(tag: TagItem, tagStr: string): Promise<void> {
      const existing = tag.tags ? tag.tags.split(',').map(s => s.trim()).filter(Boolean) : [];
      const updated = existing.filter(s => s !== tagStr).join(',');
      await store.firestoreService.updateModel<TagItem>(TagCollection, { ...tag, tags: updated }, false, '@aoc.tag.operation.update', store.appStore.currentUser());
    },

    async editTagString(tag: TagItem, tagStr: string): Promise<void> {
      const edited = await bkPrompt(store.alertController, '@aoc.tag.string.edit.header', '@aoc.tag.string.edit.placeholder', tagStr);
      if (!edited?.trim() || edited.trim() === tagStr) return;
      const existing = tag.tags ? tag.tags.split(',').map(s => s.trim()).filter(Boolean) : [];
      const updated = existing.map(s => (s === tagStr ? edited.trim() : s)).join(',');
      await store.firestoreService.updateModel<TagItem>(TagCollection, { ...tag, tags: updated }, false, '@aoc.tag.operation.update', store.appStore.currentUser());
    },
  }))
);
