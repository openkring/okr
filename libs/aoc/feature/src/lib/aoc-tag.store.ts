import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { OkrModel, TagCollection, TagModel } from '@okr/shared-models';
import { okrPrompt, confirm } from '@okr/shared-util-angular';
import { getSystemQuery } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';
import { AOC_I18N_KEYS } from '@okr/aoc-util';

/**
 * TagModel as it arrives from Firestore.
 * FirestoreService attaches `okey` (document ID) at runtime; this interface makes that explicit.
 */
export interface TagItem extends OkrModel {
  tagModel: string;
  tags: string;
}

/** True when this definition belongs to the given tenant alone (i.e. it may be edited in place). */
function isOwnedBy(tag: TagItem, tenantId: string): boolean {
  return tag.tenants?.length === 1 && tag.tenants[0] === tenantId;
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
    i18nService: inject(I18nService)
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(AOC_I18N_KEYS),

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
      return ((store.tagsResource.value() ?? []) as TagItem[]).find(t => t.okey === key);
    }),
    tagStrings: computed((): string[] => {
      const key = store.selectedTagKey();
      const tag = key ? ((store.tagsResource.value() ?? []) as TagItem[]).find(t => t.okey === key) : undefined;
      if (!tag?.tags) return [];
      return tag.tags.split(',').map(s => s.trim()).filter(Boolean);
    }),
  })),
  withMethods(store => {
    /**
     * Persist an edited tag list — copy-on-write.
     *
     * A definition shared with other tenants must never be mutated: the edit is forked into a new
     * document (random id, same tagModel, tenants = [currentTenant]) while the current tenant is
     * removed from the shared one, atomically. Only a definition owned by this tenant alone is
     * updated in place. See the `tag-model` skill.
     */
    const saveTags = async (tag: TagItem, tags: string, confirmMessage: string, errorMessage: string): Promise<void> => {
      if (isOwnedBy(tag, store.appStore.env.tenantId)) {
        await store.firestoreService.updateModel<TagItem>(TagCollection, { ...tag, tags }, false, confirmMessage, errorMessage, store.appStore.currentUser());
        return;
      }
      const forkedKey = await store.firestoreService.forkModel<TagItem>(TagCollection, tag, { tags }, errorMessage);
      if (forkedKey) patchState(store, { selectedTagKey: forkedKey });
    };

    return {
    setSearchTerm(searchTerm: string): void {
      patchState(store, { searchTerm });
    },

    selectTag(tag: TagItem): void {
      patchState(store, { selectedTagKey: tag.okey });
    },

    deselectTag(): void {
      patchState(store, { selectedTagKey: undefined });
    },

    async createTagDocument(): Promise<void> {
      const tenantId = store.appStore.env.tenantId;
      const modelName = await okrPrompt(store.alertController, store.i18n.tag_create(), store.i18n.tag_create_placeholder(), store.i18n.ok(), store.i18n.cancel());
      if (!modelName?.trim()) return;
      // invariant: exactly ONE non-archived definition per (tagModel, tenant) — getTags() takes the first match.
      const existing = (store.tagsResource.value() ?? []) as TagItem[];
      if (existing.some(t => t.tagModel === modelName.trim())) {
        await confirm(store.alertController, store.i18n.tag_create_error(), store.i18n.ok(), store.i18n.cancel(), true);
        return;
      }
      const tag = new TagModel(tenantId);
      tag.tagModel = modelName.trim();
      tag.tags = '';
      await store.firestoreService.createModel<TagItem>(TagCollection, { ...tag, okey: '' }, store.i18n.tag_create_conf(), store.i18n.tag_create_error(), store.appStore.currentUser());
    },

    async archiveTagDocument(tag: TagItem): Promise<void> {
      const ok = await confirm(store.alertController, store.i18n.tag_delete_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
      if (!ok) return;
      if (store.selectedTagKey() === tag.okey) {
        patchState(store, { selectedTagKey: undefined });
      }
      // a shared definition is not ours to delete — opt this tenant out of it instead.
      if (!isOwnedBy(tag, store.appStore.env.tenantId)) {
        const tenants = (tag.tenants ?? []).filter(t => t !== store.appStore.env.tenantId);
        await store.firestoreService.updateModel<TagItem>(TagCollection, { ...tag, tenants }, false, store.i18n.tag_delete_conf(), store.i18n.tag_delete_error(), store.appStore.currentUser());
        return;
      }
      await store.firestoreService.deleteModel<TagItem>(TagCollection, { ...tag }, store.i18n.tag_delete_conf(), store.i18n.tag_delete_error(), store.appStore.currentUser());
    },

    async addTagString(tag: TagItem): Promise<void> {
      const newStr = await okrPrompt(store.alertController, store.i18n.tag_add(), store.i18n.tag_add_placeholder(), store.i18n.ok(), store.i18n.cancel());
      if (!newStr?.trim()) return;
      const existing = tag.tags ? tag.tags.split(',').map(s => s.trim()).filter(Boolean) : [];
      const updated = [...existing, newStr.trim()].join(',');
      await saveTags(tag, updated, store.i18n.tag_add_conf(), store.i18n.tag_add_error());
    },

    async removeTagString(tag: TagItem, tagStr: string): Promise<void> {
      const existing = tag.tags ? tag.tags.split(',').map(s => s.trim()).filter(Boolean) : [];
      const updated = existing.filter(s => s !== tagStr).join(',');
      await saveTags(tag, updated, store.i18n.tag_remove_conf(), store.i18n.tag_remove_error());
    },

    async editTagString(tag: TagItem, tagStr: string): Promise<void> {
      const edited = await okrPrompt(store.alertController, store.i18n.tag_update(), store.i18n.tag_update_placeholder(), store.i18n.ok(), store.i18n.cancel(), tagStr);
      if (!edited?.trim() || edited.trim() === tagStr) return;
      const existing = tag.tags ? tag.tags.split(',').map(s => s.trim()).filter(Boolean) : [];
      const updated = existing.map(s => (s === tagStr ? edited.trim() : s)).join(',');
      await saveTags(tag, updated, store.i18n.tag_update_conf(), store.i18n.tag_update_error());
    },
    };
  })
);
