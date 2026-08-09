import { computed, inject } from '@angular/core';
import { deleteObject, getDownloadURL, ref } from 'firebase/storage';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { AlertController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { STORAGE } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { DocumentCollection, DocumentModel, UserModel } from '@okr/shared-models';
import { confirm, copyToClipboardWithConfirmation, downloadToBrowser, showToast } from '@okr/shared-util-angular';
import { DateFormat, convertDateFormatToString, getFullName, getTodayStr } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';

import { DocumentService } from '@okr/document-data-access';
import { extractDateFromFileName, extractTagsFromStoragePath, extractTitleFromFileName, getDocumentIndex } from '@okr/document-util';
import { AOC_I18N_KEYS } from '@okr/aoc-util';

/** One object under `tenant/{tenantId}/`, as returned by the `listTenantStorageFiles` callable. */
export type TenantStorageFile = {
  fullPath: string;
  size: number;
  contentType: string;
  timeCreated: string;   // ISO 8601, e.g. "2024-01-17T10:30:00.000Z"
  updated: string;       // ISO 8601
  md5Hash: string;       // base64-encoded MD5 hash from Firebase Storage metadata
};

/** A `TenantStorageFile` with no Firestore document, plus the download URL for the actions. */
export type StorageFileInfo = TenantStorageFile & {
  downloadUrl: string;
};

export type AocDocState = {
  missingDocs: StorageFileInfo[];
  isChecking: boolean;
  /** Files already processed by the bulk create; 0 while it is not running (see `isCreatingAll`). */
  createdCount: number;
  isCreatingAll: boolean;
};

export const initialState: AocDocState = {
  missingDocs: [],
  isChecking: false,
  createdCount: 0,
  isCreatingAll: false,
};

/** Above this many orphans, offer the bulk create instead of one ActionSheet per file. */
export const BULK_CREATE_THRESHOLD = 10;

/**
 * Lists every object under `tenant/{tenantId}/` via the `listTenantStorageFiles` callable.
 *
 * NOT a client-side `listAll()`: `storage.rules` authorises every tenant path through the
 * cross-service `firestore.get()` on the caller's `users/{uid}` doc, and that call does not
 * resolve on a Storage `list` request — so listing 403s for everyone while `get`/`create`
 * on the very same prefix succeed. Making it work client-side would mean granting `list` to
 * any `signedIn()` caller, i.e. letting every tenant enumerate every other tenant's file
 * names. See `apps/functions/src/tenant/list-storage-files.ts`.
 */
async function listTenantStorageFiles(tenantId: string): Promise<TenantStorageFile[]> {
  const fn = httpsCallable<{ tenantId: string }, { files: TenantStorageFile[] }>(
    getFunctions(getApp(), 'europe-west6'), 'listTenantStorageFiles'
  );
  const result = await fn({ tenantId });
  return result.data.files ?? [];
}

/** Convert an ISO 8601 date string from Firebase Storage metadata to the app's store date format. */
function isoToStoreDate(iso: string): string {
  return convertDateFormatToString(iso.substring(0, 10), DateFormat.IsoDate, DateFormat.StoreDate);
}

/** Fill a `{{name}}` placeholder in an already-resolved i18n string. */
function fill(template: string, params: Record<string, string | number>): string {
  return Object.entries(params).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, String(v)), template);
}

/** Build the DocumentModel for one orphaned storage file. Shared by the single and bulk create. */
function buildDocument(file: StorageFileInfo, tenantId: string, currentUser: UserModel | undefined): DocumentModel {
  // 1. Derive dates: prefer filename date prefix, then storage metadata, then today
  const rawFileName = file.fullPath.split('/').pop() ?? '';
  const fileNameDate = extractDateFromFileName(rawFileName);
  const creationDate = fileNameDate
    ?? (file.timeCreated ? isoToStoreDate(file.timeCreated) : getTodayStr());
  const updateDate = fileNameDate
    ?? (file.updated ? isoToStoreDate(file.updated) : creationDate);

  // 2. Human-readable title from file name
  const title = extractTitleFromFileName(rawFileName) || rawFileName;

  // 3. Tags from storage path (includes tenant, model type, and keyword tags)
  const tags = extractTagsFromStoragePath(file.fullPath);

  const document = new DocumentModel(tenantId);
  document.title = title;
  document.altText = title;
  document.fullPath = file.fullPath;
  document.url = file.downloadUrl;
  document.mimeType = file.contentType;
  document.size = file.size;
  document.source = 'storage';
  document.hash = file.md5Hash;
  document.dateOfDocCreation = creationDate;
  document.dateOfDocLastUpdate = updateDate;
  document.version = creationDate;
  document.folderKeys = [];
  document.tags = tags;
  document.authorKey = currentUser?.personKey ?? '';
  document.authorName = getFullName(currentUser?.firstName, currentUser?.lastName);
  document.index = getDocumentIndex(document);
  return document;
}

export const AocDocStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    storage: inject(STORAGE),
    firestoreService: inject(FirestoreService),
    documentService: inject(DocumentService),
    toastController: inject(ToastController),
    alertController: inject(AlertController),
    i18nService: inject(I18nService)
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(AOC_I18N_KEYS),
  })),
  withComputed(state => ({
    currentUser: computed(() => state.appStore.currentUser()),
    tenantId: computed(() => state.appStore.env.tenantId),
  })),
  withMethods(store => ({

    async checkFilesInStore(): Promise<void> {
      patchState(store, { isChecking: true, missingDocs: [] });

      try {
        // Load all existing Firestore document fullPaths
        const allDocs = await store.documentService.listOnce();
        const existingPaths = new Set(allDocs.map(d => d.fullPath).filter(Boolean));

        // List all files in storage under tenant/${tenantId} (metadata included)
        const storageFiles = await listTenantStorageFiles(store.appStore.env.tenantId);

        // Fetch the download URL only for files without a Firestore document. `get` is
        // allowed by storage.rules for a tenant member, unlike `list` above.
        const missing: StorageFileInfo[] = [];
        await Promise.all(
          storageFiles
            .filter(file => !existingPaths.has(file.fullPath))
            .map(async file => {
              try {
                const downloadUrl = await getDownloadURL(ref(store.storage, file.fullPath));
                missing.push({ ...file, downloadUrl });
              } catch {
                // skip files that are inaccessible
              }
            })
        );

        patchState(store, { missingDocs: missing });
      } catch (e) {
        // storage/unauthorized (rules or App Check) would otherwise leave the button disabled forever
        await showToast(store.toastController, (e as Error).message);
      } finally {
        patchState(store, { isChecking: false });
      }
    },

    clearMissingDocs(): void {
      patchState(store, { missingDocs: [] });
    },

    async downloadDocument(file: StorageFileInfo): Promise<void> {
      await downloadToBrowser(file.downloadUrl);
    },

    async deleteDocument(file: StorageFileInfo): Promise<void> {
      const ok = await confirm(store.alertController, store.i18n.doc_delete_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
      if (!ok) return;
      await deleteObject(ref(store.storage, file.fullPath));
      patchState(store, {
        missingDocs: store.missingDocs().filter(d => d.fullPath !== file.fullPath),
      });
    },

    async copyStoragePath(file: StorageFileInfo): Promise<void> {
      await copyToClipboardWithConfirmation(store.toastController, file.fullPath);
    },

    async copyDownloadUrl(file: StorageFileInfo): Promise<void> {
      await copyToClipboardWithConfirmation(store.toastController, file.downloadUrl);
    },

    async createDbEntry(file: StorageFileInfo): Promise<void> {
      const currentUser = store.currentUser();
      const document = buildDocument(file, store.appStore.env.tenantId, currentUser);
      await store.firestoreService.createModel<DocumentModel>(
        DocumentCollection, document, store.i18n.doc_create_conf(), store.i18n.doc_create_error(), currentUser
      );
      patchState(store, {
        missingDocs: store.missingDocs().filter(d => d.fullPath !== file.fullPath),
      });
    },

    /**
     * Create a DB entry for every listed file, one at a time.
     *
     * Deliberately sequential rather than `Promise.all`: the list is unbounded (it can be the
     * whole tenant bucket), and firing hundreds of concurrent Firestore writes is what makes
     * these bulk actions fall over — each `createModel` write also triggers the replication
     * triggers server-side. Sequential keeps it to one in-flight write, makes the progress
     * count honest, and is fast enough for a rarely-used admin repair action. A failed file
     * is skipped, not retried, so one bad document cannot abort the whole run.
     */
    async createAllDbEntries(): Promise<void> {
      const files = store.missingDocs();
      if (files.length === 0) return;

      const ok = await confirm(store.alertController,
        fill(store.i18n.doc_create_all_confirm(), { count: files.length }),
        store.i18n.ok(), store.i18n.cancel(), false);
      if (!ok) return;

      patchState(store, { isCreatingAll: true, createdCount: 0 });
      const currentUser = store.currentUser();
      const tenantId = store.appStore.env.tenantId;
      const failed: StorageFileInfo[] = [];

      for (const file of files) {
        try {
          // No per-file confirmation toast, and errors are suppressed: hundreds of toasts
          // would bury the screen. The single summary toast below reports the outcome.
          const key = await store.firestoreService.createModel<DocumentModel>(
            DocumentCollection, buildDocument(file, tenantId, currentUser), undefined, undefined, currentUser, true
          );
          if (!key) failed.push(file);
        } catch {
          failed.push(file);
        }
        patchState(store, { createdCount: store.createdCount() + 1 });
      }

      // Whatever failed stays in the list so it is still visible and retryable per file.
      patchState(store, { missingDocs: failed, isCreatingAll: false, createdCount: 0 });
      await showToast(store.toastController,
        fill(store.i18n.doc_create_all_conf(), { done: files.length - failed.length, count: files.length }));
    },
  }))
);
