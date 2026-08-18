import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { ALBUM_CONFIG_SHAPE, AlbumConfig, DocumentCollection, DocumentModel, FolderModel, ImageConfig, SectionModelName } from '@okr/shared-models';
import { debugMessage, getSystemQuery, sanitizeFileName } from '@okr/shared-util-core';
import { showImageSlider } from '@okr/shared-ui';

import { UploadService } from '@okr/avatar-data-access';
import { DocumentService } from '@okr/content-document-data-access';
import { FolderService } from '@okr/content-folder-data-access';

import { isVisibleInAlbum, SECTION_I18N_KEYS, toImageConfig } from '@okr/cms-section-util';

export interface AlbumState {
  config: AlbumConfig;
  sectionKey: string;       // okey of the album section — the storage path of uploaded files
  rootFolderKey: string;    // the album's starting folder (config.folder, or the section name)
  currentFolderKey: string; // the folder currently browsed; starts at rootFolderKey
}

export const initialState: AlbumState = {
  config: ALBUM_CONFIG_SHAPE,
  sectionKey: '',
  rootFolderKey: '',
  currentFolderKey: ''
};

export const AlbumStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    folderService: inject(FolderService),
    documentService: inject(DocumentService),
    uploadService: inject(UploadService),
    modalController: inject(ModalController),
    i18n: inject(I18nService).translateAll(SECTION_I18N_KEYS),
  })),

  withComputed((state) => ({
    imgixBaseUrl: computed(() => state.appStore.services.imgixBaseUrl()),
    currentUser: computed(() => state.appStore.currentUser()),
    imageStyle: computed(() => state.config().imageStyle),
    albumStyle: computed(() => state.config().albumStyle || 'grid'),
    isTopFolder: computed(() => state.currentFolderKey() === state.rootFolderKey()),
  })),

  withProps((store) => ({
    // All documents of the tenant. The album needs more than the current folder's files: the folder
    // tiles are rendered with the first image found *inside* each subfolder.
    documentsResource: rxResource({
      params: () => ({ currentUser: store.currentUser() }),
      stream: ({ params }) => {
        if (!params.currentUser) return of<DocumentModel[]>([]);
        return store.firestoreService.searchData<DocumentModel>(
          DocumentCollection, getSystemQuery(store.appStore.tenantId()), 'fullPath', 'asc');
      }
    }),

    // All folders of the tenant: the folder tiles count their own subfolders, too.
    // Same cached stream listByParent() uses, so this costs no extra read.
    foldersResource: rxResource({
      params: () => ({ currentUser: store.currentUser() }),
      stream: ({ params }) => {
        if (!params.currentUser) return of<FolderModel[]>([]);
        return store.folderService.list();
      }
    }),

    currentFolderResource: rxResource({
      params: () => ({ folderKey: store.currentFolderKey(), currentUser: store.currentUser() }),
      stream: ({ params }) => {
        if (!params.currentUser || !params.folderKey) return of<FolderModel | undefined>(undefined);
        return store.folderService.read(params.folderKey);
      }
    })
  })),

  withComputed((state) => ({
    documents: computed(() => state.documentsResource.value() ?? []),
    currentFolder: computed(() => state.currentFolderResource.value()),
    isLoading: computed(() => state.documentsResource.isLoading() || state.foldersResource.isLoading()),
    error: computed(() => state.documentsResource.error() ?? state.foldersResource.error()),
  })),

  withComputed((state) => ({
    title: computed(() => state.currentFolder()?.title || state.currentFolder()?.name || ''),
    parentFolderKey: computed(() => state.currentFolder()?.parents?.[0] ?? ''),

    // the files of the current folder, in display order
    images: computed<ImageConfig[]>(() => {
      const config = state.config();
      const folderKey = state.currentFolderKey();
      return state.documents()
        .filter((doc) => (doc.folderKeys ?? []).includes(folderKey) && isVisibleInAlbum(doc, config))
        .map(toImageConfig);
    }),

    // subfolders with their cover image (= first image document inside the folder, falling back to
    // the tenant logo) and the number of entries they hold (files + own subfolders)
    folders: computed(() => {
      const documents = state.documents();
      const allFolders = state.foldersResource.value() ?? [];
      const logoUrl = state.appStore.appConfig().logoUrl;
      return allFolders
        .filter((folder) => folder.parents.includes(state.currentFolderKey()))
        .map((folder) => {
          const files = documents.filter((doc) => (doc.folderKeys ?? []).includes(folder.okey));
          const subFolderCount = allFolders.filter((f) => f.parents.includes(folder.okey)).length;
          const coverUrl = files.find((doc) => doc.mimeType.startsWith('image/'))?.fullPath ?? '';
          return {
            okey: folder.okey,
            label: folder.title || folder.name,
            fileCount: files.length + subFolderCount,
            coverUrl: coverUrl || logoUrl,
            isLogo: !coverUrl
          };
        });
    })
  })),

  withMethods((store) => ({
    /** Browse into a folder; triggers the reload of its files and subfolders. */
    setFolder(currentFolderKey?: string): void {
      if (!currentFolderKey) return;
      debugMessage(`AlbumStore.setFolder(${currentFolderKey})`, store.currentUser());
      patchState(store, { currentFolderKey });
    },

    setAlbumStyle(albumStyle: string): void {
      patchState(store, { config: { ...store.config(), albumStyle } });
    },

    /**
     * @param config the section's AlbumConfig
     * @param sectionName used as the folder key when the config does not name one
     * @param sectionKey okey of the section — part of the storage path of uploaded files
     */
    setConfig(config?: AlbumConfig, sectionName = '', sectionKey = ''): void {
      const _config = { ...ALBUM_CONFIG_SHAPE, ...(config ?? {}) };
      const rootFolderKey = _config.folder || sectionName;
      if (store.rootFolderKey() === rootFolderKey) {
        patchState(store, { config: _config, sectionKey });   // keep the browsing position
        return;
      }
      patchState(store, { config: _config, sectionKey, rootFolderKey, currentFolderKey: rootFolderKey });
      debugMessage(`AlbumStore.setConfig: folder=${rootFolderKey}`, store.currentUser());
    },

    /**
     * Upload the given files to tenant/<tid>/section/<sectionKey>/album and create a DocumentModel
     * per file, assigned to the folder currently being browsed.
     */
    async addFiles(files: File[]): Promise<void> {
      const currentUser = store.currentUser();
      const folderKey = store.currentFolderKey();
      if (!currentUser || !folderKey || files.length === 0) return;

      const tenantId = store.appStore.tenantId();
      const basePath = `tenant/${tenantId}/${SectionModelName}/${store.sectionKey()}/album`;
      const tags = `@tag.${tenantId},@tag.${SectionModelName},@tag.album`;

      for (const file of files) {
        const fullPath = `${basePath}/${sanitizeFileName(file.name)}`;
        const downloadUrl = await store.uploadService.uploadFile(file, fullPath, file.name);
        if (!downloadUrl) continue;

        const doc = await store.documentService.getDocumentFromFile(file, fullPath);
        doc.url = downloadUrl;
        doc.tags = tags;
        doc.folderKeys = [folderKey];
        doc.authorKey = currentUser.personKey;
        doc.authorName = `${currentUser.firstName} ${currentUser.lastName}`;
        doc.version = '1.0';
        await store.documentService.create(doc, currentUser);
      }
      store.documentsResource.reload();
    },

    goUp(): void {
      if (store.isTopFolder()) return;
      this.setFolder(store.parentFolderKey());
    },

    async openGallery(images: ImageConfig[], initialSlide = 0): Promise<void> {
      const startIndex = Math.max(0, Math.min(initialSlide, images.length - 1));
      await showImageSlider(store.modalController, images, startIndex);
    }
  }))
);
