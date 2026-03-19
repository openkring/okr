import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { AppStore } from '@bk2/shared-feature';
import { UploadService } from '@bk2/avatar-data-access';
import { DocumentService } from '@bk2/document-data-access';
import { buildDocumentModel } from '@bk2/document-util';
import { FolderService } from '@bk2/folder-data-access';
import { DEFAULT_MIMETYPES } from '@bk2/shared-constants';
import { DocumentModel } from '@bk2/shared-models';
import { map } from 'rxjs/operators';

const RAG_FOLDER_KEY = 'rag';

export interface RagMessage {
    role: 'user' | 'model';
    text: string;
}

export interface RagSource {
    title: string;
    uri: string;
    /** Firebase Storage download URL of the matching RAG document, if found. */
    url?: string;
}

export interface RagChatEntry {
    question: string;
    answer: string;
    sources: RagSource[];
}

export type RagState = {
    storeName: string;
    messages: RagMessage[];       // full history sent to the Cloud Function
    chatEntries: RagChatEntry[];  // display-friendly question/answer pairs
    isLoading: boolean;
    error: string | null;
};

const initialRagState: RagState = {
    storeName: '',
    messages: [],
    chatEntries: [],
    isLoading: false,
    error: null,
};

export const RagStore = signalStore(
    withState(initialRagState),
    withProps(() => ({
        appStore: inject(AppStore),
        uploadService: inject(UploadService),
        documentService: inject(DocumentService),
        folderService: inject(FolderService),
    })),
    withProps((store) => ({
        // Real-time list of documents in the 'rag' folder.
        // Firestore only allows one array-contains per query and getSystemQuery already
        // uses one on 'tenants', so we filter by folderKey client-side.
        ragDocumentsResource: rxResource({
            params: () => ({}),
            stream: () => store.documentService.list('title', 'asc').pipe(
                map(docs => docs.filter(d => d.folderKeys.includes(RAG_FOLDER_KEY))),
            ),
        }),
    })),
    withComputed((state) => ({
        currentUser: computed(() => state.appStore.currentUser()),
        hasHistory: computed(() => state.chatEntries().length > 0),
        ragDocuments: computed(() => state.ragDocumentsResource.value() ?? []),
    })),
    withMethods((store) => ({
        setStoreName(storeName: string): void {
            patchState(store, { storeName });
        },

        reset(): void {
            patchState(store, { messages: [], chatEntries: [], error: null });
        },

        /**
         * Opens the file picker (multi-select), uploads all selected files to
         * tenant/{tenantId}/rag/, creates a DocumentModel per file in the 'rag'
         * folder, and persists them. The Storage trigger automatically indexes
         * each file into the Google File Search store.
         */
        async addDocument(): Promise<void> {
            const tenantId = store.appStore.env.tenantId;
            const currentUser = store.currentUser();
            const storagePath = `tenant/${tenantId}/rag`;

            // Ensure the 'rag' folder exists (idempotent)
            await store.folderService.ensureGroupFolder(RAG_FOLDER_KEY, 'RAG', tenantId, currentUser ?? undefined);

            // Pick multiple files
            const files = await store.uploadService.pickMultipleFiles(DEFAULT_MIMETYPES);
            if (files.length === 0) return; // user cancelled

            // Upload all files in one modal
            const uploads = files.map(file => ({ file, fullPath: `${storagePath}/${file.name}` }));
            const downloadUrls = await store.uploadService.uploadFiles(uploads, '@cms.rag.upload');
            if (!downloadUrls) return; // upload cancelled

            // Create and persist a DocumentModel for each successfully uploaded file
            await Promise.all(files.map(async (file, i) => {
                const downloadUrl = downloadUrls[i];
                if (!downloadUrl) return;
                const document = await buildDocumentModel(file, tenantId, `${storagePath}/${file.name}`, downloadUrl, currentUser ?? undefined);
                document.folderKeys = [RAG_FOLDER_KEY];
                await store.documentService.create(document, currentUser ?? undefined);
            }));
        },

        /**
         * Permanently delete a RAG document.
         * RAG documents are isolated (not shared across folders — see APPARCH.md), so:
         * 1. The file is deleted from Firebase Storage, which triggers the onObjectDeleted
         *    Cloud Function to de-index it from the Vertex AI RAG store automatically.
         * 2. The DocumentModel is hard-deleted from Firestore (not archived).
         */
        async deleteDocument(document: DocumentModel): Promise<void> {
            await store.documentService.hardDelete(document);
        },

        async query(question: string): Promise<void> {
            if (!question.trim() || store.isLoading()) return;

            patchState(store, { isLoading: true, error: null });

            try {
                const functions = getFunctions(getApp(), 'europe-west6');
                const queryRag = httpsCallable<
                    { storeName: string; question: string; history: RagMessage[] },
                    { answer: string; sources: RagSource[] }
                >(functions, 'queryRag');

                const result = await queryRag({
                    storeName: store.storeName(),
                    question,
                    history: store.messages(),
                });

                const { answer } = result.data;

                // Match each source to a RAG document by filename and attach its
                // Firebase Storage download URL. Deduplicate by URL so the same
                // document cited multiple times only appears once.
                const docs = store.ragDocuments();
                const seen = new Set<string>();
                const sources: RagSource[] = result.data.sources
                    .map(source => {
                        const fileName = source.title;
                        const match = docs.find(doc => doc.fullPath.split('/').pop() === fileName);
                        return match?.url ? { ...source, url: match.url } : source;
                    })
                    .filter(source => {
                        if (!source.url) return false;
                        if (seen.has(source.url)) return false;
                        seen.add(source.url);
                        return true;
                    });

                patchState(store, {
                    messages: [
                        ...store.messages(),
                        { role: 'user', text: question },
                        { role: 'model', text: answer },
                    ],
                    chatEntries: [
                        ...store.chatEntries(),
                        { question, answer, sources },
                    ],
                    isLoading: false,
                });
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : 'An unexpected error occurred';
                patchState(store, { isLoading: false, error: message });
            }
        },
    })),
);
