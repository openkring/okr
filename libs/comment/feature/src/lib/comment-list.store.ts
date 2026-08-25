import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { combineLatest, map, of } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { DEFAULT_MIMETYPES } from '@okr/shared-constants';
import { CommentModel, DocumentModel, DocumentModelName } from '@okr/shared-models';
import { debugListLoaded, sanitizeFileName } from '@okr/shared-util-core';

import { UploadService } from '@okr/avatar-data-access';
import { DocumentService } from '@okr/content-document-data-access';

import { CommentService } from '@okr/comment-data-access';
import { COMMENT_LIST_I18N_KEYS, isImageMimeType } from '@okr/comment-util';

export type CommentListState = {
  parentKey: string; // modelType.key of the parent model
  pendingFiles: File[]; // picked in the composer, uploaded on send
  isUploading: boolean;
};

export const initialState: CommentListState = {
  parentKey: '',
  pendingFiles: [],
  isUploading: false,
};

/** The attachment keys of all loaded comments, de-duplicated and stable in order. */
function attachmentKeysOf(comments: CommentModel[]): string[] {
  const keys = new Set<string>();
  // legacy comments have no attachmentKeys field at all — Firestore reads skip model defaults
  for (const comment of comments) for (const key of comment.attachmentKeys ?? []) keys.add(key);
  return [...keys];
}

export const CommentListStore = signalStore(
  withState(initialState),
  withProps(() => {
    const i18nService = inject(I18nService);
    return {
      commentService: inject(CommentService),
      documentService: inject(DocumentService),
      uploadService: inject(UploadService),
      appStore: inject(AppStore),
      i18n: i18nService.translateAll(COMMENT_LIST_I18N_KEYS),
    };
  }),
  withProps((store) => ({
    commentsResource: rxResource({
      params: () => ({
        parentKey: store.parentKey(),
        currentUser: store.appStore.currentUser()
      }),
      stream: ({params}) => {
        return store.commentService.list(params.parentKey).pipe(
          debugListLoaded('CommentListStore.comment$', params.currentUser)
        );
      }
    }),
  })),

  withProps((store) => ({
    /**
     * The documents referenced by the loaded comments, read by okey.
     *
     * A query would be cheaper, but Firestore permits only one array-membership clause per query
     * and `getSystemQuery` already spends it on `tenants`. Reads by document id are cached and
     * only happen for comments that actually carry an attachment.
     */
    attachmentsResource: rxResource({
      params: () => ({ keys: attachmentKeysOf(store.commentsResource.value() ?? []).join(',') }),
      stream: ({params}) => {
        const keys = params.keys.length > 0 ? params.keys.split(',') : [];
        if (keys.length === 0) return of<DocumentModel[]>([]);
        return combineLatest(keys.map(key => store.documentService.read(key))).pipe(
          map(documents => documents.filter((doc): doc is DocumentModel => !!doc))
        );
      }
    }),
  })),

  withComputed((state) => {
    return {
      comments: computed(() => state.commentsResource.value()),
      commentCount: computed(() => (state.commentsResource.value() ?? []).length),
      attachments: computed(() => {
        const byKey = new Map<string, DocumentModel>();
        for (const doc of state.attachmentsResource.value() ?? []) byKey.set(doc.okey, doc);
        return byKey;
      }),
      currentUser: computed(() => state.appStore.currentUser()),
      currentPersonKey: computed(() => state.appStore.currentUser()?.personKey ?? ''),
      tenantId: computed(() => state.appStore.env.tenantId),
      isLoading: computed(() => state.commentsResource.isLoading()),
    };
  }),

  withMethods((store) => {
    return {

      /******************************** setters (filter) ******************************************* */
      setParentKey(parentKey: string) {
        patchState(store, { parentKey });
      },

      /******************************* attachments *************************************** */
      /**
       * Pick files for the next comment. They are held in state and only uploaded on send, so
       * abandoning the comment leaves nothing behind in storage.
       *
       * Deliberately no `await` before pickMultipleFiles(): the file dialog must open inside the
       * user-activation context of the tap, or Safari blocks it.
       */
      async pickFiles(): Promise<void> {
        const files = await store.uploadService.pickMultipleFiles(DEFAULT_MIMETYPES);
        if (files.length === 0) return;
        patchState(store, { pendingFiles: [...store.pendingFiles(), ...files] });
      },

      removeFile(index: number): void {
        patchState(store, { pendingFiles: store.pendingFiles().filter((_, i) => i !== index) });
      },

      /** Open an attachment: images zoom in place, everything else opens in a new tab. */
      async openAttachment(document: DocumentModel): Promise<void> {
        if (!document.url) return;
        if (isImageMimeType(document.mimeType, document.fullPath)) {
          await store.uploadService.showZoomedImage(document.url, document.fullPath);
        } else {
          window.open(document.url, '_blank', 'noopener');
        }
      },

      /******************************* actions *************************************** */
      /**
       * Upload the pending files, then save the comment referencing them.
       *
       * The documents are created exactly the way `DocumentStore.addFiles` creates them
       * (same storage path, `folderKeys = [parentKey]`), so they also appear in the documents
       * accordion of the same parent — the comment merely records which of them belong to it.
       */
      async add(comment: string): Promise<void> {
        const currentUser = store.currentUser();
        if (!currentUser) return;
        const files = store.pendingFiles();
        if (comment.length === 0 && files.length === 0) return;
        if (store.isUploading()) return;

        patchState(store, { isUploading: true });
        try {
          const attachmentKeys: string[] = [];
          const basePath = `tenant/${store.tenantId()}/${DocumentModelName}`;
          for (const file of files) {
            const fullPath = `${basePath}/${sanitizeFileName(file.name)}`;
            const downloadUrl = await store.uploadService.uploadFile(file, fullPath, file.name);
            if (!downloadUrl) continue;
            const doc = await store.documentService.getDocumentFromFile(file, fullPath);
            doc.folderKeys = [store.parentKey()];
            doc.authorKey = currentUser.personKey;
            doc.authorName = `${currentUser.firstName} ${currentUser.lastName}`;
            doc.priorVersionKey = '';
            doc.version = '1.0';
            const key = await store.documentService.create(doc, currentUser);
            if (key) attachmentKeys.push(key);
          }
          await store.commentService.create(store.parentKey(), comment, currentUser, attachmentKeys);
          patchState(store, { pendingFiles: [] });
          store.commentsResource.reload();
        } finally {
          patchState(store, { isUploading: false });
        }
      }
    };
  })
);
