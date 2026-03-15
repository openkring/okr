import { computed, inject } from '@angular/core';
import { FirebaseStorage, StorageReference, deleteObject, getDownloadURL, getMetadata, listAll, ref } from 'firebase/storage';
import { AlertController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';

import { STORAGE } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { DocumentCollection, DocumentModel } from '@bk2/shared-models';
import { confirm, copyToClipboardWithConfirmation, downloadToBrowser } from '@bk2/shared-util-angular';
import { DateFormat, convertDateFormatToString, getFullName, getTodayStr } from '@bk2/shared-util-core';

import { DocumentService } from '@bk2/document-data-access';
import { extractDateFromFileName, extractTagsFromStoragePath, extractTitleFromFileName, getDocumentIndex, storeDateToDisplayDate } from '@bk2/document-util';

export type StorageFileInfo = {
  fullPath: string;
  downloadUrl: string;
  size: number;
  contentType: string;
  timeCreated: string;   // ISO 8601, e.g. "2024-01-17T10:30:00.000Z"
  updated: string;       // ISO 8601
  md5Hash: string;       // base64-encoded MD5 hash from Firebase Storage metadata
};

export type AocDocState = {
  missingDocs: StorageFileInfo[];
  isChecking: boolean;
};

export const initialState: AocDocState = {
  missingDocs: [],
  isChecking: false,
};

async function listStorageFilesRecursively(storage: FirebaseStorage, path: string): Promise<StorageReference[]> {
  const result = await listAll(ref(storage, path));
  const nested = await Promise.all(result.prefixes.map(prefix => listStorageFilesRecursively(storage, prefix.fullPath)));
  return [...result.items, ...nested.flat()];
}

/** Convert an ISO 8601 date string from Firebase Storage metadata to the app's store date format. */
function isoToStoreDate(iso: string): string {
  return convertDateFormatToString(iso.substring(0, 10), DateFormat.IsoDate, DateFormat.StoreDate);
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
  })),
  withComputed(state => ({
    currentUser: computed(() => state.appStore.currentUser()),
    tenantId: computed(() => state.appStore.env.tenantId),
  })),
  withMethods(store => ({

    async checkFilesInStore(): Promise<void> {
      patchState(store, { isChecking: true, missingDocs: [] });

      // Load all existing Firestore document fullPaths
      const allDocs = await firstValueFrom(store.documentService.list());
      const existingPaths = new Set(allDocs.map(d => d.fullPath).filter(Boolean));

      // Recursively list all files in storage under tenant/${tenantId}
      const tenantRoot = `tenant/${store.appStore.env.tenantId}`;
      const storageRefs = await listStorageFilesRecursively(store.storage, tenantRoot);

      // Fetch metadata + URL only for files without a Firestore document
      const missing: StorageFileInfo[] = [];
      await Promise.all(
        storageRefs
          .filter(fileRef => !existingPaths.has(fileRef.fullPath))
          .map(async fileRef => {
            try {
              const [metadata, downloadUrl] = await Promise.all([
                getMetadata(fileRef),
                getDownloadURL(fileRef),
              ]);
              missing.push({
                fullPath: fileRef.fullPath,
                downloadUrl,
                size: metadata.size,
                contentType: metadata.contentType ?? '',
                timeCreated: metadata.timeCreated,
                updated: metadata.updated,
                md5Hash: metadata.md5Hash ?? '',
              });
            } catch {
              // skip files that are inaccessible
            }
          })
      );

      patchState(store, { missingDocs: missing, isChecking: false });
    },

    clearMissingDocs(): void {
      patchState(store, { missingDocs: [] });
    },

    async downloadDocument(file: StorageFileInfo): Promise<void> {
      await downloadToBrowser(file.downloadUrl);
    },

    async deleteDocument(file: StorageFileInfo): Promise<void> {
      const ok = await confirm(store.alertController, '@aoc.doc.delete.confirm', true);
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
      const tenantId = store.appStore.env.tenantId;

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
      await store.firestoreService.createModel<DocumentModel>(
        DocumentCollection, document, '@document.operation.create', currentUser
      );
      patchState(store, {
        missingDocs: store.missingDocs().filter(d => d.fullPath !== file.fullPath),
      });
    },
  }))
);
