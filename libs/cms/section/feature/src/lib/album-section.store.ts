import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { ALBUM_CONFIG_SHAPE, AlbumConfig, DocumentCollection, DocumentModel, FolderModel, FolderModelName, ImageConfig, ImageType, SectionModelName } from '@okr/shared-models';
import { checkVideoLimits, debugMessage, fileSizeUnit, fill, formatDuration, getSystemQuery } from '@okr/shared-util-core';
import { showImageSlider } from '@okr/shared-ui';
import { downloadFilesAsZip, exportCsv, getExportFileName, showToast, ZipEntry } from '@okr/shared-util-angular';

import { UploadService } from '@okr/avatar-data-access';
import { DocumentService } from '@okr/content-document-data-access';
import { FolderService } from '@okr/content-folder-data-access';
import { newFolderModel } from '@okr/content-folder-util';

import { buildAlbumUploadPath, compareByFileName, isVisibleInAlbum, SECTION_I18N_KEYS, toImageConfig } from '@okr/cms-section-util';

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
    alertController: inject(AlertController),
    toastController: inject(ToastController),
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
    // Sorted by file name once, here: everything downstream (the file list, the zip and CSV
    // exports, the folder tiles' fallback cover) inherits that order. The Firestore query can
    // only order by `fullPath`, whose random upload prefix is effectively a shuffle.
    documents: computed(() => [...(state.documentsResource.value() ?? [])].sort(compareByFileName)),
    currentFolder: computed(() => state.currentFolderResource.value()),
    isLoading: computed(() => state.documentsResource.isLoading() || state.foldersResource.isLoading()),
    error: computed(() => state.documentsResource.error() ?? state.foldersResource.error()),
  })),

  withComputed((state) => ({
    title: computed(() => state.currentFolder()?.title || state.currentFolder()?.name || ''),
    parentFolderKey: computed(() => state.currentFolder()?.parents?.[0] ?? ''),

    // The documents of the current folder that the album actually shows, as MODELS — the source
    // of both the zip download and the CSV export, which need fields (size, author, dates) that
    // `images` drops. Same filter as `images`, so an export never contains a file the user
    // cannot see on screen.
    visibleDocuments: computed<DocumentModel[]>(() => {
      const config = state.config();
      const folderKey = state.currentFolderKey();
      return state.documents()
        .filter((doc) => (doc.folderKeys ?? []).includes(folderKey) && isVisibleInAlbum(doc, config));
    }),

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
          // An explicitly chosen cover wins; it falls back to the first image when the chosen
          // document was deleted or moved out, so a stale key never blanks the tile.
          // `coverDocumentKey` is absent on every folder written before it existed.
          const chosen = folder.coverDocumentKey
            ? files.find((doc) => doc.okey === folder.coverDocumentKey)
            : undefined;
          const coverUrl = (chosen ?? files.find((doc) => doc.mimeType.startsWith('image/')))?.fullPath ?? '';
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
      // The direct /album/<folderKey> route synthesizes its section, so it has no okey — without
      // this branch the path collapsed to `tenant/<tid>/section//album` and every album's uploads
      // landed in the same directory. Key that case on the folder instead.
      const sectionKey = store.sectionKey();
      const basePath = sectionKey
        ? `tenant/${tenantId}/${SectionModelName}/${sectionKey}/album`
        : `tenant/${tenantId}/${FolderModelName}/${folderKey}/album`;
      const tags = `@tag.${tenantId},@tag.${SectionModelName},@tag.album`;

      for (const file of files) {
        // Videos werden vor dem Upload geprüft: eine 200-MB-Datei erst hochzuladen und dann
        // abzulehnen wäre die teuerste Art, Nein zu sagen. Bilder gehen ungeprüft durch.
        if (file.type.startsWith('video/')) {
          const check = await checkVideoLimits(file);
          if (!check.ok) {
            const message = check.reason === 'size'
              ? fill(store.i18n.album_video_too_large(), { size: fileSizeUnit(check.actual ?? 0) })
              : fill(store.i18n.album_video_too_long(), { duration: formatDuration(check.actual ?? 0) });
            await showToast(store.toastController, message);
            continue;   // die übrigen Dateien der Mehrfachauswahl laufen weiter
          }
        }

        // buildAlbumUploadPath makes the path unique by construction (a random segment, no
        // lookup) — two members uploading their own `IMG_0042.mov` at the same moment can never
        // agree on the same path, so the transcoder's fullPath lookup stays unambiguous. The
        // original name is not lost: it goes into doc.title below, which is what the UI shows.
        const fullPath = buildAlbumUploadPath(basePath, file.name);
        const downloadUrl = await store.uploadService.uploadFile(file, fullPath, file.name);
        if (!downloadUrl) continue;

        const doc = await store.documentService.getDocumentFromFile(file, fullPath);
        doc.url = downloadUrl;
        doc.title = file.name;
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
      await showImageSlider(store.modalController, images, store.imageStyle(), startIndex);
    },

    /** Full-screen slideshow over the images of the current folder, starting at the first one. */
    async startSlideshow(): Promise<void> {
      const gallery = store.images().filter((image) => image.type === ImageType.Image);
      if (gallery.length === 0) return;
      await this.openGallery(gallery, 0);
    },

    /**
     * Download every visible file of the current folder as one zip.
     *
     * Confirmed first: this fetches each file in full, so the user is told how many and gets to
     * back out. `downloadFilesAsZip` skips what it cannot fetch and reports it, so the toast
     * distinguishes "12 files" from "12 of 14".
     */
    async downloadAll(): Promise<void> {
      const documents = store.visibleDocuments();
      const folderName = store.title() || store.currentFolderKey();
      if (documents.length === 0) {
        await showToast(store.toastController, store.i18n.album_download_empty());
        return;
      }

      const confirm = await store.alertController.create({
        header: store.i18n.album_download_header(),
        message: fill(store.i18n.album_download_confirm(), { count: documents.length }),
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: store.i18n.album_download_start(), role: 'confirm' }
        ]
      });
      await confirm.present();
      if ((await confirm.onDidDismiss()).role !== 'confirm') return;

      const entries: ZipEntry[] = documents
        .filter((doc) => !!doc.url)
        .map((doc) => ({ url: doc.url, fileName: doc.fullPath.split('/').pop() || doc.okey }));
      const { zipped, failed } = await downloadFilesAsZip(entries, getExportFileName(folderName, 'zip'));

      const message = failed.length === 0
        ? fill(store.i18n.album_download_done(), { count: zipped })
        : fill(store.i18n.album_download_partial(), { count: zipped, failed: failed.length });
      await showToast(store.toastController, message);
    },

    /** CSV listing of the files in the current folder (what is on screen, not the whole album). */
    async exportCsv(): Promise<void> {
      const documents = store.visibleDocuments();
      const folderName = store.title() || store.currentFolderKey();
      const headers = [
        store.i18n.album_csv_name(), store.i18n.album_csv_title(), store.i18n.album_csv_type(),
        store.i18n.album_csv_size(), store.i18n.album_csv_author(), store.i18n.album_csv_created(),
        store.i18n.album_csv_updated(), store.i18n.album_csv_url()
      ];
      const rows = documents.map((doc) => [
        doc.fullPath.split('/').pop() || doc.okey,
        doc.title,
        doc.mimeType,
        String(doc.size),
        doc.authorName,
        doc.dateOfDocCreation,
        doc.dateOfDocLastUpdate,
        doc.url
      ]);
      await exportCsv([headers, ...rows], getExportFileName(folderName, 'csv'));
    },

    /** Create a subfolder of the folder currently browsed and step into it. */
    async addFolder(): Promise<void> {
      const currentUser = store.currentUser();
      const parentFolderKey = store.currentFolderKey();
      if (!currentUser || !parentFolderKey) return;

      const alert = await store.alertController.create({
        header: store.i18n.album_newfolder_header(),
        inputs: [{ name: 'name', type: 'text', placeholder: store.i18n.album_newfolder_placeholder() }],
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: store.i18n.create(), role: 'confirm' }
        ]
      });
      await alert.present();
      const { data, role } = await alert.onDidDismiss();
      if (role !== 'confirm') return;
      const name: string = data?.values?.name?.trim() ?? '';
      if (!name) return;

      const folder = newFolderModel(store.appStore.tenantId(), name, [parentFolderKey], currentUser.personKey);
      const newKey = await store.folderService.create(folder, currentUser);
      store.foldersResource.reload();
      if (newKey) this.setFolder(newKey);
    },

    /**
     * Choose which image of the current folder is shown as its tile in the PARENT album.
     * A radio alert rather than a modal: the choice is one of a handful of names, and an album
     * with no images offers nothing to choose.
     */
    async selectCover(): Promise<void> {
      const currentUser = store.currentUser();
      const folder = store.currentFolder();
      if (!currentUser || !folder) return;

      const candidates = store.visibleDocuments().filter((doc) => doc.mimeType.startsWith('image/'));
      if (candidates.length === 0) {
        await showToast(store.toastController, store.i18n.album_cover_empty());
        return;
      }

      const alert = await store.alertController.create({
        header: store.i18n.album_cover_header(),
        inputs: [
          // The empty value restores the default (first image found), so a wrong pick is undoable.
          { name: 'cover', type: 'radio', label: store.i18n.album_cover_auto(), value: '', checked: !folder.coverDocumentKey },
          ...candidates.map((doc) => ({
            name: 'cover',
            type: 'radio' as const,
            label: doc.title || doc.fullPath.split('/').pop() || doc.okey,
            value: doc.okey,
            checked: doc.okey === folder.coverDocumentKey
          }))
        ],
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: store.i18n.album_cover_apply(), role: 'confirm' }
        ]
      });
      await alert.present();
      const { data, role } = await alert.onDidDismiss();
      if (role !== 'confirm') return;

      const coverDocumentKey: string = data?.values ?? '';
      if (coverDocumentKey === (folder.coverDocumentKey ?? '')) return;
      await store.folderService.update({ ...folder, coverDocumentKey }, currentUser);
      store.foldersResource.reload();
      store.currentFolderResource.reload();
    }
  }))
);
