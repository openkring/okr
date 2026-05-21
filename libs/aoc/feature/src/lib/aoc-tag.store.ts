import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { BkModel, TagCollection, TagModel } from '@bk2/shared-models';
import { bkPrompt, confirm } from '@bk2/shared-util-angular';
import { getSystemQuery } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import { PFX } from './scope';

const AOC_TAG_I18N_KEYS = {
  add_header: PFX + 'tag.add.header',
  add_placeholder: PFX + 'tag.add.placeholder',
  add_button: PFX + 'tag.add.button',
  add_conf: PFX + 'tag.add.conf',
  add_error: PFX + 'tag.add.error',
  create_header: PFX + 'tag.create.header',
  create_placeholder: PFX + 'tag.create.placeholder',
  create_conf: PFX + 'tag.create.conf',
  create_error: PFX + 'tag.create.error',
  delete_conf: PFX + 'tag.delete.conf',
  delete_confirm: PFX + 'tag.delete.confirm',
  delete_error: PFX + 'tag.delete.error',
  edit_header: PFX + 'tag.edit.header',
  edit_placeholder: PFX + 'tag.edit.placeholder',
  edit_conf: PFX + 'tag.edit.conf',
  edit_error: PFX + 'tag.edit.error',
  remove_conf: PFX + 'tag.remove.conf',
  remove_error: PFX + 'tag.remove.error',
  update_conf: PFX + 'tag.update.conf',
  update_error: PFX + 'tag.update.error',
  search: PFX + 'tag.search.placeholder',
  ok: '@ok',
  cancel: '@cancel',
  title:             PFX + 'tag.title',
  list_title:        PFX + 'tag.list.title',
  loading:           '@general.operation.loading',
  strings_title:     PFX + 'tag.strings.title',
  string_add_button: PFX + 'tag.string.add.button',
  strings_empty:     PFX + 'tag.strings.empty',
} satisfies Record<string, string>;

export type AocTagI18n = { [K in keyof typeof AOC_TAG_I18N_KEYS]: Signal<string> };

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
    i18nService: inject(I18nService)
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(AOC_TAG_I18N_KEYS),

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
      const modelName = await bkPrompt(store.alertController, store.i18n.create_header(), store.i18n.create_placeholder(), store.i18n.ok(), store.i18n.cancel());
      if (!modelName?.trim()) return;
      const tag = new TagModel(tenantId);
      tag.tagModel = modelName.trim();
      tag.tags = '';
      await store.firestoreService.createModel<TagItem>(TagCollection, { ...tag, bkey: '' }, store.i18n.create_conf(), store.i18n.create_error(), store.appStore.currentUser());
    },

    async archiveTagDocument(tag: TagItem): Promise<void> {
      const ok = await confirm(store.alertController, store.i18n.delete_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
      if (!ok) return;
      if (store.selectedTagKey() === tag.bkey) {
        patchState(store, { selectedTagKey: undefined });
      }
      await store.firestoreService.deleteModel<TagItem>(TagCollection, { ...tag }, store.i18n.delete_conf(), store.i18n.delete_error(), store.appStore.currentUser());
    },

    async addTagString(tag: TagItem): Promise<void> {
      const newStr = await bkPrompt(store.alertController, store.i18n.add_header(), store.i18n.add_placeholder(), store.i18n.ok(), store.i18n.cancel());
      if (!newStr?.trim()) return;
      const existing = tag.tags ? tag.tags.split(',').map(s => s.trim()).filter(Boolean) : [];
      const updated = [...existing, newStr.trim()].join(',');
      await store.firestoreService.updateModel<TagItem>(TagCollection, { ...tag, tags: updated }, false, store.i18n.add_conf(), store.i18n.add_error(), store.appStore.currentUser());
    },

    async removeTagString(tag: TagItem, tagStr: string): Promise<void> {
      const existing = tag.tags ? tag.tags.split(',').map(s => s.trim()).filter(Boolean) : [];
      const updated = existing.filter(s => s !== tagStr).join(',');
      await store.firestoreService.updateModel<TagItem>(TagCollection, { ...tag, tags: updated }, false, store.i18n.remove_conf(), store.i18n.remove_error(), store.appStore.currentUser());
    },

    async editTagString(tag: TagItem, tagStr: string): Promise<void> {
      const edited = await bkPrompt(store.alertController, store.i18n.edit_header(), store.i18n.edit_placeholder(), store.i18n.ok(), store.i18n.cancel(), tagStr);
      if (!edited?.trim() || edited.trim() === tagStr) return;
      const existing = tag.tags ? tag.tags.split(',').map(s => s.trim()).filter(Boolean) : [];
      const updated = existing.map(s => (s === tagStr ? edited.trim() : s)).join(',');
      await store.firestoreService.updateModel<TagItem>(TagCollection, { ...tag, tags: updated }, false, store.i18n.edit_conf(), store.i18n.edit_error(), store.appStore.currentUser());
    },
  }))
);
