import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { ActionSheetController, AlertController, ModalController, ToastController } from '@ionic/angular';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { combineLatest, from, map, of, switchMap, catchError, firstValueFrom } from 'rxjs';

import { ActivityService } from '@okr/activity-data-access';
import { PageService } from '@okr/cms-page-data-access';
import { SectionService } from '@okr/cms-section-data-access';
import { DocumentService, VideoUrlService } from '@okr/content-document-data-access';
import { FolderService } from '@okr/content-folder-data-access';
import { newFolderModel } from '@okr/content-folder-util';
import { LearningService, RatingService } from '@okr/content-learning-data-access';
import {
  LEARNING_I18N_KEYS, LEARNING_PAGE_TYPE, LEARNING_ROOM_SUFFIX, LearningActor, LearningFilter, LearningI18n, LearningItemFormData,
  LearningRoomFormData, LearningTab, canChangeTags, canDeleteItem, canEditItem, curatedTopics, filterLearningDocs,
  groupLearningPageKey, isLearningPage, learningConfigOf, learningItemUrl, learningRoomUrl, menuLearningPageKey,
  parseTopics, uniqueLearningSlug,
} from '@okr/content-learning-util';
import {
  LearningAttachmentInfo, LearningFolderOption, LearningItemEditModal, LearningRoomEditModal,
  learningPublishAlertOptions, learningUnpublishAlertOptions,
} from '@okr/content-learning-ui';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import {
  DocumentModel, LEARNING_SECTION_SHAPE, LearningConfig, LearningSection, PageModel, SectionModel, UserModel,
} from '@okr/shared-models';
import { browse } from '@okr/shared-ui';
import { copyToClipboard, navigateByUrl, resourceParams, showToast } from '@okr/shared-util-angular';
import { fill, hasRole, safeStructuredClone } from '@okr/shared-util-core';

/** The room as the page and its first learning section describe it. */
export interface LearningRoom {
  page: PageModel;
  /** okey of the learning section ('' when the page has none) */
  sectionKey: string;
  /** undefined: the page has no usable learning section yet */
  config: LearningConfig | undefined;
}

export interface LearningUploadState {
  name: string;
  /** 0..1 */
  progress: number;
}

export type LearningStoreState = {
  pageKey: string;
  filter: LearningFilter;
  /** the start tab of the room config was applied to `filter` (once per room) */
  filterRoomKey: string;
  commentTexts: Record<string, string>;
  /** room whose comment texts are loaded (or loading) */
  commentTextsRoom: string;
  upload: LearningUploadState | undefined;
};

const initialState: LearningStoreState = {
  pageKey: '',
  filter: { tab: 'files', topic: '', query: '' },
  filterRoomKey: '',
  commentTexts: {},
  commentTextsRoom: '',
  upload: undefined,
};

const TABS: LearningTab[] = ['files', 'videos', 'images'];

/** All sections of a page (keys in page order, `@TID@` resolved); unreadable sections arrive as undefined. */
function readSections(sectionService: SectionService, page: PageModel, tenantId: string) {
  const keys = (page.sections ?? []).map(k => (typeof k === 'string' ? k.split('@TID@').join(tenantId) : '')).filter(k => !!k);
  if (keys.length === 0) return of([] as (SectionModel | undefined)[]);
  return combineLatest(keys.map(k => sectionService.read(k).pipe(catchError(() => of(undefined)))));
}

/**
 * Learning rooms (spec 1.115 part 2): one room (page + first learning section + folder documents),
 * its filter, uploads, item edits and ratings, and the room administration (create, rename,
 * archive, publish/unpublish).
 *
 * Provided per page (room page, item page, rooms page), never in root: each screen loads exactly
 * the room it shows, and the listeners stop with the screen.
 *
 * Rights are decided by the util (curatedTopics & co.) with `isGroupAdmin: false` — group admins
 * are not curators (Task 3 ruling: group.admins is writable by any member). The callables decide
 * again; the client checks only hide actions.
 */
export const LearningStore = signalStore(
  withState(initialState),

  withProps(() => ({
    appStore: inject(AppStore),
    learningService: inject(LearningService),
    ratingService: inject(RatingService),
    videoUrlService: inject(VideoUrlService),
    documentService: inject(DocumentService),
    pageService: inject(PageService),
    sectionService: inject(SectionService),
    folderService: inject(FolderService),
    activityService: inject(ActivityService),
    i18nService: inject(I18nService),
    modalController: inject(ModalController),
    alertController: inject(AlertController),
    actionSheetController: inject(ActionSheetController),
    toastController: inject(ToastController),
    router: inject(Router),
  })),

  withProps((store) => ({
    i18n: store.i18nService.translateAll(LEARNING_I18N_KEYS) as LearningI18n,
  })),

  withComputed((state) => ({
    tenantId: computed(() => state.appStore.tenantId()),
    currentUser: computed(() => state.appStore.currentUser()),
    /** auth settled and nobody signed in: the anonymous /public view */
    isAnonymous: computed(() => state.appStore.fbUser() === null),
    isContentAdmin: computed(() => hasRole('contentAdmin', state.appStore.currentUser())),
    /** auth restored and, when signed in, the user loaded: before that nothing room-specific is certain */
    sessionReady: computed(() => state.appStore.isUserSessionReady()),
  })),

  withProps((store) => ({
    roomResource: rxResource({
      params: resourceParams(() => ({
        pageKey: store.pageKey(),
        tenantId: store.tenantId(),
        signedIn: !!store.currentUser(),
      })),
      stream: ({ params }) => {
        if (!params.pageKey || !params.signedIn) return of(undefined);
        return store.pageService.read(params.pageKey).pipe(
          switchMap(page => {
            if (!page || !isLearningPage(page, params.tenantId)) return of(undefined);
            return readSections(store.sectionService, page, params.tenantId).pipe(
              map(sections => {
                const found = learningConfigOf(sections, params.tenantId);
                return { page, sectionKey: found?.sectionKey ?? '', config: found?.config } as LearningRoom;
              }),
            );
          }),
          catchError(() => of(undefined)),
        );
      },
    }),
    publicResource: rxResource({
      params: resourceParams(() => ({ pageKey: store.isAnonymous() ? store.pageKey() : '' })),
      stream: ({ params }) => params.pageKey
        ? from(store.learningService.publicRoom(params.pageKey))
        : of(undefined),
    }),
  })),

  withComputed((state) => ({
    room: computed(() => state.roomResource.hasValue() ? state.roomResource.value() : undefined),
    config: computed(() => (state.roomResource.hasValue() ? state.roomResource.value()?.config : undefined)),
    isRoomLoading: computed(() => state.roomResource.isLoading()),
    publicRoom: computed(() => state.publicResource.hasValue() ? state.publicResource.value() : undefined),
    publicRoomFailed: computed(() => !!state.publicResource.error()),
    isPublicLoading: computed(() => state.publicResource.isLoading()),
    actor: computed<LearningActor>(() => ({
      personKey: state.currentUser()?.personKey ?? '',
      roles: state.currentUser()?.roles ?? {},
      isGroupAdmin: false,
    })),
  })),

  withProps((store) => ({
    docsResource: rxResource({
      params: resourceParams(() => ({ folder: store.config()?.folder ?? '' })),
      // roomDocs swallows listener errors into [] (searchData): an empty list is not proof of an empty room
      stream: ({ params }) => params.folder ? store.learningService.roomDocs(params.folder) : of([] as DocumentModel[]),
    }),
  })),

  withComputed((state) => ({
    docs: computed(() => state.docsResource.value() ?? []),
    isDocsLoading: computed(() => state.docsResource.isLoading()),
    topics: computed(() => parseTopics(state.config()?.topics ?? '')),
    curated: computed<string[] | 'all'>(() => {
      const config = state.config();
      return config ? curatedTopics(config, state.actor()) : [];
    }),
  })),

  withComputed((state) => ({
    /** the room topics this person may upload into and tag with */
    curatableTopics: computed(() => {
      const cur = state.curated();
      return cur === 'all' ? state.topics() : state.topics().filter(t => cur.includes(t));
    }),
    visibleDocs: computed(() => filterLearningDocs(state.docs(), state.filter(), state.commentTexts())),
    counts: computed<Record<LearningTab, number>>(() => {
      const f = state.filter();
      const out = { files: 0, videos: 0, images: 0 };
      for (const tab of TABS) out[tab] = filterLearningDocs(state.docs(), { ...f, tab }, state.commentTexts()).length;
      return out;
    }),
  })),

  withMethods((store) => {
    const toast = (message: string) => showToast(store.toastController, message);

    async function confirmAlert(message: string, okLabel: string): Promise<boolean> {
      const alert = await store.alertController.create({
        message,
        buttons: [
          { text: store.i18n.rooms_cancel(), role: 'cancel' },
          { text: okLabel, role: 'confirm' },
        ],
      });
      await alert.present();
      const { role } = await alert.onDidDismiss();
      return role === 'confirm';
    }

    /** Room docs other than `self` as attachment candidates; resolves the picked one. */
    async function pickAttachment(selfKey: string): Promise<LearningAttachmentInfo | undefined> {
      const candidates = store.docs().filter(d => d.okey !== selfKey);
      if (candidates.length === 0) {
        await toast(store.i18n.detail_noAttachmentCandidates());
        return undefined;
      }
      const alert = await store.alertController.create({
        header: store.i18n.detail_pickAttachment(),
        inputs: candidates.map(d => ({ type: 'radio' as const, label: d.title || d.okey, value: d.okey })),
        buttons: [
          { text: store.i18n.rooms_cancel(), role: 'cancel' },
          { text: store.i18n.detail_ok(), role: 'confirm' },
        ],
      });
      await alert.present();
      const { data, role } = await alert.onDidDismiss();
      const key = role === 'confirm' ? (data?.values as string | undefined) : undefined;
      const doc = key ? candidates.find(d => d.okey === key) : undefined;
      return doc ? { key: doc.okey, title: doc.title || doc.okey } : undefined;
    }

    /** Room docs plus single reads for attachments that live outside the room folder. */
    async function attachmentInfos(keys: string[]): Promise<LearningAttachmentInfo[]> {
      const known = new Map(store.docs().map(d => [d.okey, d]));
      const out: LearningAttachmentInfo[] = [];
      for (const key of keys) {
        let doc = known.get(key);
        if (!doc) doc = await firstValueFrom(store.documentService.read(key)).catch(() => undefined);
        out.push({ key, title: doc?.title || key });
      }
      return out;
    }

    const methods = {
      /*-------------------------- room --------------------------------*/
      setPageKey(pageKey: string): void {
        if (pageKey === store.pageKey()) return;
        patchState(store, { pageKey, filterRoomKey: '', commentTexts: {}, commentTextsRoom: '', filter: { tab: 'files', topic: '', query: '' } });
      },

      /** Applies the room's start tab once, when its config first arrives. */
      applyDefaultTab(defaultTab: LearningTab | undefined): void {
        const key = store.pageKey();
        if (!key || store.filterRoomKey() === key) return;
        patchState(store, { filterRoomKey: key, filter: { ...store.filter(), tab: defaultTab ?? 'files' } });
      },

      setFilter(filter: LearningFilter): void {
        patchState(store, { filter });
        if (filter.query.trim()) void methods.loadCommentTexts();
      },

      /** Comment text for the search, read once per room and only when somebody searches. */
      async loadCommentTexts(): Promise<void> {
        const room = store.pageKey();
        if (!room || store.commentTextsRoom() === room || store.docs().length === 0) return;
        patchState(store, { commentTextsRoom: room });
        try {
          const texts = await store.learningService.commentTexts(store.docs().map(d => d.okey));
          if (store.pageKey() === room) patchState(store, { commentTexts: texts });
        } catch {
          // search then covers title, notes and tags only; allow a retry on the next query
          if (store.pageKey() === room) patchState(store, { commentTextsRoom: '' });
        }
      },

      /*-------------------------- items --------------------------------*/
      async openItem(doc: DocumentModel): Promise<void> {
        await navigateByUrl(store.router, learningItemUrl(store.pageKey(), doc.okey));
      },

      async download(doc: DocumentModel): Promise<void> {
        try {
          if ((doc.mimeType ?? '').startsWith('video/')) {
            const [signed] = await store.videoUrlService.forDownload([doc.okey]);
            await browse(signed?.downloadUrl || doc.url);
          } else {
            await browse(doc.url);
          }
        } catch {
          await toast(store.i18n.item_videoUnavailable());
        }
      },

      canEdit(doc: DocumentModel): boolean {
        const config = store.config();
        return !!config && !store.isAnonymous() && canEditItem(config, store.actor(), doc.tags ?? '');
      },

      canDelete(doc: DocumentModel): boolean {
        const config = store.config();
        return !!config && !store.isAnonymous() && canDeleteItem(config, store.actor(), doc.tags ?? '', doc.authorKey);
      },

      /** Opens the item edit modal; saves only the fields that changed. @returns true when saved */
      async editItem(doc: DocumentModel): Promise<boolean> {
        const config = store.config();
        if (!config || !methods.canEdit(doc)) return false;
        const item: LearningItemFormData = {
          title: doc.title ?? '', tags: doc.tags ?? '', notes: doc.notes ?? '',
          links: doc.links ?? [], attachmentKeys: doc.attachmentKeys ?? [],
        };
        const modal = await store.modalController.create({
          component: LearningItemEditModal,
          componentProps: {
            item,
            curatableTopics: methods.curatableFor(),
            attachments: await attachmentInfos(item.attachmentKeys),
            attachmentPicker: () => pickAttachment(doc.okey),
          },
        });
        await modal.present();
        const { data, role } = await modal.onWillDismiss<LearningItemFormData>();
        if (role !== 'confirm' || !data) return false;
        const tagsChanged = (data.tags ?? '') !== (doc.tags ?? '');
        if (tagsChanged && !canChangeTags(config, store.actor(), doc.tags ?? '', data.tags ?? '')) {
          await toast(store.i18n.detail_saveFailed());
          return false;
        }
        try {
          await store.learningService.saveItem({
            pageKey: store.pageKey(),
            docKey: doc.okey,
            title: data.title,
            notes: data.notes,
            links: data.links,
            attachmentKeys: data.attachmentKeys,
            ...(tagsChanged ? { tags: data.tags } : {}),
          });
          await toast(store.i18n.detail_saved());
          return true;
        } catch {
          await toast(store.i18n.detail_saveFailed());
          return false;
        }
      },

      /** Confirms and deletes the item. @returns true when deleted */
      async deleteItem(doc: DocumentModel): Promise<boolean> {
        if (!methods.canDelete(doc)) return false;
        const ok = await confirmAlert(fill(store.i18n.detail_deleteConfirm(), { title: doc.title || doc.okey }), store.i18n.detail_delete());
        if (!ok) return false;
        try {
          await store.learningService.deleteItem({ pageKey: store.pageKey(), docKey: doc.okey });
          await toast(store.i18n.detail_deleted());
          return true;
        } catch {
          await toast(store.i18n.detail_saveFailed());
          return false;
        }
      },

      /** The topics the edit form may touch: all room topics for content admins, else the curated ones. */
      curatableFor(): string[] {
        const cur = store.curated();
        return cur === 'all' ? store.topics() : cur;
      },

      /** The caller's own stars (undefined: not rated). */
      async myRating(docKey: string): Promise<number | undefined> {
        const personKey = store.actor().personKey;
        if (!personKey) return undefined;
        return store.ratingService.mine(docKey, personKey).catch(() => undefined);
      },

      /** Rates; RatingService already toasts its own failures, so errors are swallowed here. @returns success */
      async rate(docKey: string, stars: number): Promise<boolean> {
        const personKey = store.actor().personKey;
        if (!personKey) return false;
        try { await store.ratingService.rate(docKey, personKey, stars); return true; } catch { return false; }
      },

      async clearRating(docKey: string): Promise<boolean> {
        const personKey = store.actor().personKey;
        if (!personKey) return false;
        try { await store.ratingService.clear(docKey, personKey); return true; } catch { return false; }
      },

      /*-------------------------- upload --------------------------------*/
      /**
       * Uploads files into a topic one after the other (prepare → signed PUT with progress → done).
       * The service removes the half-created document when the PUT fails.
       */
      async upload(topic: string, files: File[]): Promise<void> {
        const config = store.config();
        if (!config || files.length === 0 || store.upload()) return;
        if (!methods.curatableFor().includes(topic)) return;
        const pageKey = store.pageKey();
        try {
          for (const file of files) {
            patchState(store, { upload: { name: file.name, progress: 0 } });
            try {
              await store.learningService.upload(pageKey, topic, file,
                progress => patchState(store, { upload: { name: file.name, progress } }));
              await toast(fill(store.i18n.room_uploaded(), { name: file.name }));
            } catch {
              await toast(store.i18n.room_uploadFailed());
              return;
            }
          }
        } finally {
          patchState(store, { upload: undefined });
        }
      },

      /*-------------------------- rooms administration (spec 1.115 §6) --------------------------------*/
      folderOptions: async (): Promise<LearningFolderOption[]> => {
        const folders = await firstValueFrom(store.folderService.list()).catch(() => []);
        return folders.map(f => ({ key: f.okey, name: f.name || f.okey }));
      },

      personNames(config: LearningConfig | undefined): Record<string, string> {
        const out: Record<string, string> = {};
        const persons = store.appStore.personsMap();
        for (const c of config?.curators ?? []) {
          for (const key of c.personKeys ?? []) {
            const p = persons.get(key);
            if (p) out[key] = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
          }
        }
        return out;
      },

      groupName(groupKey: string): string {
        return store.appStore.groupsMap().get(groupKey)?.name ?? '';
      },

      /** Opens the room modal for a new room and creates it. */
      async addRoom(rooms: PageModel[]): Promise<void> {
        if (!store.isContentAdmin()) return;
        const modal = await store.modalController.create({
          component: LearningRoomEditModal,
          componentProps: {
            isNew: true,
            allTopics: store.appStore.getTags('document'),
            folders: await methods.folderOptions(),
            tenantId: store.tenantId(),
          },
        });
        await modal.present();
        const { data, role } = await modal.onWillDismiss<LearningRoomFormData>();
        if (role !== 'confirm' || !data) return;
        await methods.createRoom(data, rooms.map(r => r.okey));
      },

      /**
       * Creates a room: a menu room gets page `<tenantId>_learning_<slug>` (and a new folder named
       * after the room when asked); a group room gets page `<groupKey>_learning` on the group's own
       * folder. The section key equals the page key. The page stays private (isPrivate) until published.
       * @returns the page key, or undefined when nothing was created
       */
      async createRoom(data: LearningRoomFormData, takenPageKeys: string[]): Promise<string | undefined> {
        const tenantId = store.tenantId();
        const user = store.currentUser();
        let pageKey: string;
        let folder = data.folder;
        if (data.mode === 'group') {
          if (!data.groupKey) return undefined;
          pageKey = groupLearningPageKey(data.groupKey);
          // createModel is a blind upsert: never overwrite an existing (even archived) group room
          const existing = await firstValueFrom(store.pageService.read(pageKey)).catch(() => undefined);
          if (existing && existing.isArchived !== true) {
            await toast(store.i18n.rooms_groupExists());
            return undefined;
          }
          const group = store.appStore.groupsMap().get(data.groupKey);
          const ok = await store.folderService.ensureGroupFolder(
            data.groupKey, group?.name || data.name, tenantId, user, (group?.admins ?? []).map(a => a.key));
          if (!ok) { await toast(store.i18n.rooms_saveFailed()); return undefined; }
          folder = data.groupKey;
        } else {
          pageKey = menuLearningPageKey(tenantId, uniqueLearningSlug(data.name, tenantId, takenPageKeys));
          if (data.createFolder) {
            const created = await store.folderService.create(newFolderModel(tenantId, data.name, [], user?.personKey ?? ''), user);
            if (!created) { await toast(store.i18n.rooms_saveFailed()); return undefined; }
            folder = created;
          }
        }
        if (!folder) { await toast(store.i18n.rooms_saveFailed()); return undefined; }

        const section = safeStructuredClone(LEARNING_SECTION_SHAPE) as LearningSection;
        section.okey = pageKey;
        section.name = data.name;
        section.title = data.name;
        section.state = 'published';
        section.roleNeeded = 'registered';
        section.tenants = [tenantId];
        section.properties = { folder, topics: data.topics, curators: data.curators, defaultTab: data.defaultTab };

        const page = new PageModel(tenantId);
        page.okey = pageKey;
        page.name = data.name;
        page.title = data.name;
        page.type = LEARNING_PAGE_TYPE;
        page.state = 'published';
        page.isPrivate = true;
        page.sections = [pageKey];

        const sectionKey = await store.sectionService.create(section as SectionModel, user);
        if (!sectionKey) return undefined;   // the service already toasted
        const created = await store.pageService.create(page, user);
        return created ? pageKey : undefined;
      },

      /** Opens the room modal on an existing room and saves name, topics, curators, start tab (and folder of a menu room). */
      async editRoom(page: PageModel): Promise<void> {
        if (!store.isContentAdmin()) return;
        const sections = await firstValueFrom(readSections(store.sectionService, page, store.tenantId())).catch(() => []);
        const found = learningConfigOf(sections, store.tenantId());
        const section = sections.find(s => s?.okey === found?.sectionKey);
        const groupKey = page.okey.endsWith(LEARNING_ROOM_SUFFIX) ? page.okey.slice(0, -LEARNING_ROOM_SUFFIX.length) : '';
        const room: LearningRoomFormData = {
          name: page.title || page.name,
          mode: groupKey ? 'group' : 'menu',
          groupKey,
          folder: found?.config.folder ?? '',
          createFolder: false,
          topics: found?.config.topics ?? '',
          curators: found?.config.curators ?? [],
          defaultTab: found?.config.defaultTab ?? 'files',
        };
        const modal = await store.modalController.create({
          component: LearningRoomEditModal,
          componentProps: {
            room,
            allTopics: store.appStore.getTags('document'),
            folders: await methods.folderOptions(),
            groupName: groupKey ? methods.groupName(groupKey) : '',
            personNames: methods.personNames(found?.config),
            tenantId: store.tenantId(),
          },
        });
        await modal.present();
        const { data, role } = await modal.onWillDismiss<LearningRoomFormData>();
        if (role !== 'confirm' || !data) return;
        const user = store.currentUser();
        // the way a room is reached is fixed by its page key: a group room keeps the group folder
        let folder = groupKey ? groupKey : (data.folder || room.folder);
        if (!groupKey && data.createFolder) {
          const created = await store.folderService.create(newFolderModel(store.tenantId(), data.name, [], user?.personKey ?? ''), user);
          if (!created) { await toast(store.i18n.rooms_saveFailed()); return; }
          folder = created;
        }
        const properties: LearningConfig = { folder, topics: data.topics, curators: data.curators, defaultTab: data.defaultTab };
        if (section) {
          await store.sectionService.update({ ...section, name: data.name, title: data.name, properties } as SectionModel, user);
        } else {
          // a page without a usable learning section: give it one (section key = page key)
          const fresh = safeStructuredClone(LEARNING_SECTION_SHAPE) as LearningSection;
          Object.assign(fresh, { okey: page.okey, name: data.name, title: data.name, state: 'published', roleNeeded: 'registered', tenants: [store.tenantId()], properties });
          const key = await store.sectionService.create(fresh as SectionModel, user);
          if (key && !(page.sections ?? []).includes(key)) page = { ...page, sections: [...(page.sections ?? []), key] };
        }
        await store.pageService.update({ ...page, name: data.name, title: data.name }, user);
      },

      /** Publishes (warning first, acts only on 'confirm') and logs who, when and which page. */
      async publish(page: PageModel): Promise<void> {
        await setPrivate(page, false);
      },

      async unpublish(page: PageModel): Promise<void> {
        await setPrivate(page, true);
      },

      /** Copies the room URL to paste into a menu entry in the menu editor (no client-side menu writes). */
      async copyUrl(page: PageModel): Promise<void> {
        await copyToClipboard(learningRoomUrl(page.okey));
        await toast(store.i18n.rooms_urlCopied());
      },

      /** Archives page and section (FirestoreService.deleteModel: detach or archive). Folder and documents stay. */
      async archiveRoom(page: PageModel): Promise<void> {
        if (!store.isContentAdmin()) return;
        const ok = await confirmAlert(fill(store.i18n.rooms_archiveConfirm(), { name: page.title || page.name }), store.i18n.rooms_archive());
        if (!ok) return;
        const user = store.currentUser();
        const sections = await firstValueFrom(readSections(store.sectionService, page, store.tenantId())).catch(() => []);
        for (const s of sections) {
          if (s && s.type === LEARNING_PAGE_TYPE) await store.sectionService.delete(s, user);
        }
        await store.pageService.delete(page, user);
      },

      async openRoom(page: PageModel): Promise<void> {
        await navigateByUrl(store.router, learningRoomUrl(page.okey));
      },
    };
    return methods;

    async function setPrivate(page: PageModel, isPrivate: boolean): Promise<void> {
      if (!store.isContentAdmin()) return;
      const options = isPrivate ? learningUnpublishAlertOptions(store.i18n) : learningPublishAlertOptions(store.i18n);
      const alert = await store.alertController.create(options);
      await alert.present();
      const { role } = await alert.onDidDismiss();
      if (role !== 'confirm') return;
      const user: UserModel | undefined = store.currentUser();
      const key = await store.pageService.update({ ...page, isPrivate }, user);
      if (!key) return;   // the service already toasted the failure
      await store.activityService.log('learning', isPrivate ? 'unpublish' : 'publish', user, page.okey);
      await toast(isPrivate ? store.i18n.rooms_unpublished() : store.i18n.rooms_published());
    }
  }),
);
