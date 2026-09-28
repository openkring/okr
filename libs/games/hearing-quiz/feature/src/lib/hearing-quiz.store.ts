import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { ActionSheetController, AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { ENV } from '@okr/shared-config';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { HearingQuizNodeModel, HearingQuizNodeType } from '@okr/shared-models';
import { confirm, createActionSheetButton, createActionSheetOptions } from '@okr/shared-util-angular';
import { fill, generateRandomString, hasRole } from '@okr/shared-util-core';

import { HearingQuizNodeService, HearingQuizResultService } from '@okr/games-hearing-quiz-data-access';
import {
  HEARING_QUIZ_I18N_KEYS,
  HQ_MAX_COPY_NODES,
  HearingQuizI18n,
  HearingQuizTreeRow,
  canMoveTo,
  childrenOf,
  cloneSubtree,
  descendantKeys,
  flattenTree,
  hqQuestionUrl,
  hqSessionUrl,
  lastSessionByFolder,
  newHearingQuizNode,
  nextOrder,
  planDrop,
  planMove,
  targetFolders,
} from '@okr/games-hearing-quiz-util';

const OPEN_KEYS_STORAGE = 'okr.hearingQuiz.open';

/** Open folders are a per-device convenience (spec §3), never data: localStorage, guarded. */
function readOpenKeys(): string[] {
  try {
    const raw = localStorage.getItem(OPEN_KEYS_STORAGE);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

function writeOpenKeys(keys: string[]): void {
  try { localStorage.setItem(OPEN_KEYS_STORAGE, JSON.stringify(keys)); } catch { /* private mode etc. */ }
}

export type HearingQuizState = {
  openKeys: string[];
  editMode: boolean;
};

/**
 * The Hörtraining content tree page. Component-provided on `HearingQuizTreePage`.
 * Edit actions check `contentAdmin` here as well as in the template; firestore.rules is the
 * real gate.
 */
export const HearingQuizStore = signalStore(
  withState<HearingQuizState>(() => ({ openKeys: readOpenKeys(), editMode: false })),

  withProps(() => ({
    appStore: inject(AppStore),
    env: inject(ENV),
    router: inject(Router),
    nodeService: inject(HearingQuizNodeService),
    resultService: inject(HearingQuizResultService),
    modalController: inject(ModalController),
    actionSheetController: inject(ActionSheetController),
    alertController: inject(AlertController),
    i18n: inject(I18nService).translateAll(HEARING_QUIZ_I18N_KEYS) as HearingQuizI18n,
  })),

  withProps(store => ({
    // Gated on the LOADED user (a plain string, so the resource only re-runs on a real change):
    // querying before users/{uid} is readable is denied by the rules.
    nodesResource: rxResource({
      params: () => store.appStore.currentUser()?.okey || undefined,
      stream: () => store.nodeService.list(),
    }),
    resultsResource: rxResource({
      params: () => (store.appStore.currentUser() ? store.appStore.fbUser()?.uid : undefined) || undefined,
      stream: ({ params }) => store.resultService.listMine(params, store.env.tenantId),
    }),
  })),

  withComputed(store => ({
    nodes: computed(() => store.nodesResource.value() ?? []),
    isLoading: computed(() => store.nodesResource.isLoading()),
    currentUser: computed(() => store.appStore.currentUser()),
    openSet: computed(() => new Set(store.openKeys())),
    lastScores: computed(() => lastSessionByFolder(store.resultsResource.value() ?? [])),
  })),

  withComputed(store => ({
    rows: computed((): HearingQuizTreeRow[] => flattenTree(store.nodes(), store.openSet())),
    isContentAdmin: computed(() => hasRole('contentAdmin', store.currentUser())),
  })),

  withMethods(store => {
    const setOpen = (keys: string[]): void => {
      patchState(store, { openKeys: keys });
      writeOpenKeys(keys);
    };

    const open = (key: string): void => {
      if (key && !store.openKeys().includes(key)) setOpen([...store.openKeys(), key]);
    };

    const subtreeOf = (node: HearingQuizNodeModel): HearingQuizNodeModel[] => {
      const below = descendantKeys(store.nodes(), node.okey);
      return [node, ...store.nodes().filter(n => below.has(n.okey))];
    };

    /** Open the edit modal; resolves to the edited copy, or undefined when cancelled. */
    const openModal = async (node: HearingQuizNodeModel): Promise<HearingQuizNodeModel | undefined> => {
      const { HearingQuizNodeEditModal } = await import('./hearing-quiz-node-edit.modal');
      const modal = await store.modalController.create({
        component: HearingQuizNodeEditModal,
        componentProps: {
          node,
          folderOptions: node.okey ? targetFolders(store.nodes(), node.okey) : targetFolders(store.nodes()),
          hasChildren: !!node.okey && childrenOf(store.nodes(), node.okey).length > 0,
          readOnly: !store.isContentAdmin(),
        },
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss();
      return role === 'confirm' ? (data as HearingQuizNodeModel) : undefined;
    };

    const move = async (node: HearingQuizNodeModel, parentKey: string, insertIndex: number): Promise<void> => {
      if (!canMoveTo(store.nodes(), node.okey, parentKey)) {
        await confirm(store.alertController, store.i18n.move_invalid(), 'OK', '', false);
        return;
      }
      await store.nodeService.place(store.nodes(), planMove(store.nodes(), node.okey, parentKey, insertIndex), store.currentUser());
      open(parentKey);
    };

    const copy = async (node: HearingQuizNodeModel, parentKey: string, insertIndex: number): Promise<void> => {
      if (parentKey !== '' && !store.nodes().some(n => n.okey === parentKey && n.type === 'folder')) return;
      const copies = cloneSubtree(store.nodes(), node.okey, parentKey, 0, () => generateRandomString(20));
      if (copies.length > HQ_MAX_COPY_NODES) {
        await confirm(store.alertController, store.i18n.copy_too_large(), 'OK', '', false);
        return;
      }
      // place the copy's root among its new siblings, renumbering them as a move would
      const [root] = copies;
      const placements = planMove([...store.nodes(), root], root.okey, parentKey, insertIndex);
      root.order = placements.find(p => p.key === root.okey)?.order ?? nextOrder(store.nodes(), parentKey);
      const ok = await store.nodeService.createCopies(copies, store.currentUser());
      if (!ok) return;
      await store.nodeService.place(store.nodes(), placements.filter(p => p.key !== root.okey), store.currentUser());
      open(parentKey);
    };

    /** Ask for a target folder (ActionSheet), then move or copy there, appended at the end. */
    const chooseTarget = async (node: HearingQuizNodeModel, mode: 'move' | 'copy'): Promise<void> => {
      const options = createActionSheetOptions(store.i18n.target_title());
      const targets = [{ key: '', label: store.i18n.target_root() }, ...targetFolders(store.nodes(), mode === 'move' ? node.okey : undefined)];
      for (const t of targets) {
        options.buttons.push({ text: t.label, data: { action: t.key } });
      }
      options.buttons.push(createActionSheetButton('cancel', store.i18n.action_cancel(), store.env.services.imgixBaseUrl));
      const sheet = await store.actionSheetController.create(options);
      await sheet.present();
      const { data, role } = await sheet.onDidDismiss();
      if (role === 'cancel' || !data || typeof data.action !== 'string') return;
      const parentKey = data.action as string;
      const end = childrenOf(store.nodes(), parentKey).filter(n => n.okey !== node.okey).length;
      if (mode === 'move') await move(node, parentKey, end);
      else await copy(node, parentKey, end);
    };

    const add = async (type: HearingQuizNodeType, parentKey = ''): Promise<void> => {
      if (!store.isContentAdmin()) return;
      const node = newHearingQuizNode(store.env.tenantId, type, parentKey, nextOrder(store.nodes(), parentKey));
      const result = await openModal(node);
      if (!result) return;
      result.order = nextOrder(store.nodes(), result.parentKey ?? '');
      await store.nodeService.create(result, store.currentUser());
      open(result.parentKey ?? '');
    };

    /** The `+` on a folder: folder or question? */
    const addInto = async (parent: HearingQuizNodeModel): Promise<void> => {
      const options = createActionSheetOptions(store.i18n.add_title());
      const base = store.env.services.imgixBaseUrl;
      options.buttons.push(createActionSheetButton('folder', store.i18n.add_folder(), base, 'folder'));
      options.buttons.push(createActionSheetButton('question', store.i18n.add_question(), base, 'music'));
      options.buttons.push(createActionSheetButton('cancel', store.i18n.action_cancel(), base));
      const sheet = await store.actionSheetController.create(options);
      await sheet.present();
      const { data } = await sheet.onDidDismiss();
      const action = data?.action;
      if (action === 'folder' || action === 'question') await add(action, parent.okey);
    };

    const edit = async (node: HearingQuizNodeModel): Promise<void> => {
      const result = await openModal(node);
      if (!result || !store.isContentAdmin()) return;
      const newParent = result.parentKey ?? '';
      if (newParent !== (node.parentKey ?? '')) {
        if (!canMoveTo(store.nodes(), node.okey, newParent)) return;
        result.order = nextOrder(store.nodes(), newParent);
      }
      await store.nodeService.update(result, store.currentUser());
      open(newParent);
    };

    const remove = async (node: HearingQuizNodeModel): Promise<void> => {
      const subtree = subtreeOf(node);
      const message = subtree.length > 1
        ? fill(store.i18n.delete_confirm_folder(), { title: node.title, count: subtree.length - 1 })
        : fill(store.i18n.delete_confirm(), { title: node.title });
      const ok = await confirm(store.alertController, message, store.i18n.action_delete(), store.i18n.action_cancel(), true);
      if (!ok) return;
      await store.nodeService.delete(subtree, store.currentUser());
    };

    return {
      toggle(key: string): void {
        const keys = store.openKeys();
        setOpen(keys.includes(key) ? keys.filter(k => k !== key) : [...keys, key]);
      },

      toggleEditMode(): void {
        if (!store.isContentAdmin()) return;
        patchState(store, { editMode: !store.editMode() });
      },

      async openQuestion(node: HearingQuizNodeModel): Promise<void> {
        await store.router.navigateByUrl(hqQuestionUrl(node.okey));
      },

      async startSession(folder: HearingQuizNodeModel): Promise<void> {
        await store.router.navigateByUrl(hqSessionUrl(folder.okey));
      },

      lastScoreLabel(folderKey: string): string {
        const last = store.lastScores().get(folderKey);
        if (!last) return '';
        const total = last.correct + last.wrong + last.skipped;
        return fill(store.i18n.last_score(), { correct: last.correct, total });
      },

      add,
      addInto,
      edit,
      delete: remove,

      /** The per-row ActionSheet in edit mode — also the touch/keyboard alternative to dragging. */
      async showActions(node: HearingQuizNodeModel): Promise<void> {
        const options = createActionSheetOptions(node.title || store.i18n.actions_title());
        const base = store.env.services.imgixBaseUrl;
        options.buttons.push(createActionSheetButton('edit', store.i18n.action_edit(), base, 'edit'));
        if (node.type === 'folder') {
          options.buttons.push(createActionSheetButton('add', store.i18n.add_title(), base, 'add-circle'));
        }
        options.buttons.push(createActionSheetButton('move', store.i18n.action_move(), base, 'reorder-four'));
        options.buttons.push(createActionSheetButton('copy', store.i18n.action_copy(), base, 'copy'));
        options.buttons.push(createActionSheetButton('delete', store.i18n.action_delete(), base, 'trash'));
        options.buttons.push(createActionSheetButton('cancel', store.i18n.action_cancel(), base));
        const sheet = await store.actionSheetController.create(options);
        await sheet.present();
        const { data } = await sheet.onDidDismiss();
        switch (data?.action) {
          case 'edit': await edit(node); break;
          case 'add': await addInto(node); break;
          case 'move': await chooseTarget(node, 'move'); break;
          case 'copy': await chooseTarget(node, 'copy'); break;
          case 'delete': await remove(node); break;
        }
      },

      /** A drop in the flat row list; Shift held = copy instead of move (spec §4.2). */
      async drop(previousIndex: number, currentIndex: number, isCopy: boolean): Promise<void> {
        if (!store.isContentAdmin()) return;
        const rows = store.rows();
        const moved = rows[previousIndex]?.node;
        const plan = planDrop(rows, previousIndex, currentIndex);
        if (!moved || !plan) return;
        if (isCopy) await copy(moved, plan.parentKey, plan.insertIndex);
        else if (previousIndex !== currentIndex) await move(moved, plan.parentKey, plan.insertIndex);
      },
    };
  }),
);
