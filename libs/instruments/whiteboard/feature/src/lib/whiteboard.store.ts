import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Observable } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { WhiteboardCollection, WhiteboardItem, WhiteboardItemKind, WhiteboardModel } from '@okr/shared-models';
import { AlertService } from '@okr/shared-util-angular';
import { debugItemLoaded, debugListLoaded, getSystemQuery, nameMatches } from '@okr/shared-util-core';

import { WhiteboardService } from '@okr/instruments-whiteboard-data-access';
import { createItem, createWhiteboard, getWhiteboardTemplate, WHITEBOARD_I18N_KEYS, WhiteboardTemplate } from '@okr/instruments-whiteboard-util';

import { WhiteboardEditModal } from './whiteboard-edit.modal';
import { WhiteboardItemEditModal } from './whiteboard-item-edit.modal';

export type WhiteboardState = {
  whiteboardKey: string;
  searchTerm: string;
};

const initialState: WhiteboardState = {
  whiteboardKey: '',
  searchTerm: '',
};

export const WhiteboardStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    alertService: inject(AlertService),
    whiteboardService: inject(WhiteboardService),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(WHITEBOARD_I18N_KEYS),
  })),
  withProps((store) => ({
    whiteboardsResource: rxResource({
      params: () => ({ currentUser: store.appStore.currentUser() }),
      stream: ({ params }) =>
        store.firestoreService.searchData<WhiteboardModel>(
          WhiteboardCollection, getSystemQuery(store.appStore.tenantId()), 'name', 'asc',
        ).pipe(debugListLoaded<WhiteboardModel>('WhiteboardStore.whiteboards', params.currentUser)),
    }),

    whiteboardResource: rxResource({
      params: () => ({ whiteboardKey: store.whiteboardKey(), currentUser: store.appStore.currentUser() }),
      stream: ({ params }) => {
        const key = params.whiteboardKey;
        if (!key) return new Observable<WhiteboardModel>(() => {});
        return store.whiteboardService.read(key).pipe(
          debugItemLoaded('WhiteboardStore.whiteboard', params.currentUser),
        );
      },
    }),
  })),

  withComputed((state) => ({
    whiteboards: computed(() => state.whiteboardsResource.value() ?? []),
    isLoading: computed(() => state.whiteboardsResource.isLoading()),
    whiteboard: computed(() => state.whiteboardResource.value()),
    currentUser: computed(() => state.appStore.currentUser()),
    tenantId: computed(() => state.appStore.tenantId()),
    tags: computed(() => state.appStore.getTags('whiteboard')),
  })),

  withComputed((state) => ({
    filteredWhiteboards: computed(() =>
      state.whiteboards().filter(w => nameMatches(w.index, state.searchTerm())),
    ),
    /** The template of the currently open board (blank when none / unknown). */
    template: computed<WhiteboardTemplate>(() => getWhiteboardTemplate(state.whiteboard()?.templateKey ?? '')),
  })),

  withMethods((store) => ({
    setWhiteboardKey(whiteboardKey: string) { patchState(store, { whiteboardKey }); },
    setSearchTerm(searchTerm: string) { patchState(store, { searchTerm }); },

    reload() {
      store.whiteboardsResource.reload();
      store.whiteboardResource.reload();
    },

    /*-------------------------- board CRUD --------------------------------*/
    async add(): Promise<void> {
      if (!store.currentUser()) return;
      const whiteboard = createWhiteboard(store.tenantId());
      await this.editMeta(whiteboard, false);
    },

    async editMeta(whiteboard: WhiteboardModel, readOnly = true): Promise<void> {
      const modal = await store.modalController.create({
        component: WhiteboardEditModal,
        componentProps: { whiteboard, currentUser: store.currentUser(), readOnly },
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data && !readOnly) {
        data.okey?.length === 0
          ? await store.whiteboardService.create(data, store.currentUser())
          : await store.whiteboardService.update(data, store.currentUser());
        this.reload();
      }
    },

    async delete(whiteboard?: WhiteboardModel): Promise<void> {
      if (!whiteboard) return;
      const confirmed = await store.alertService.confirm(store.i18n.delete_confirm(), true);
      if (confirmed === true) {
        await store.whiteboardService.delete(whiteboard, store.currentUser());
        this.reload();
      }
    },

    /*-------------------------- item operations (embedded array) --------------------------------*/
    /** Persist a new sticker/label at (x, y) on the open board. */
    async addItem(kind: WhiteboardItemKind, x: number, y: number): Promise<void> {
      const board = store.whiteboard();
      if (!board) return;
      const item = createItem(kind, x, y);
      await store.whiteboardService.update({ ...board, items: [...board.items, item] }, store.currentUser());
    },

    /** Persist a moved item — a single write of its new position (D4: written on pointerup). */
    async moveItem(key: string, x: number, y: number): Promise<void> {
      const board = store.whiteboard();
      if (!board) return;
      const items = board.items.map(it => it.key === key ? { ...it, x, y } : it);
      await store.whiteboardService.update({ ...board, items }, store.currentUser());
    },

    /** Open the per-item editor (edits a clone; live stream keeps the board fresh underneath). */
    async editItem(item: WhiteboardItem, readOnly = false): Promise<void> {
      const modal = await store.modalController.create({
        component: WhiteboardItemEditModal,
        componentProps: { item, readOnly },
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      const board = store.whiteboard(); // re-read: may have changed while the modal was open
      if (!board) return;
      if (role === 'confirm' && data) {
        const items = board.items.map(it => it.key === data.key ? data : it);
        await store.whiteboardService.update({ ...board, items }, store.currentUser());
      } else if (role === 'delete') {
        const items = board.items.filter(it => it.key !== item.key);
        await store.whiteboardService.update({ ...board, items }, store.currentUser());
      }
    },
  })),
);
