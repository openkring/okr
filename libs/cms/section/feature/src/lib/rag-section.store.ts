import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { AppStore } from '@bk2/shared-feature';
import { UploadService } from '@bk2/avatar-data-access';
import { DocumentService } from '@bk2/document-data-access';
import { FolderService } from '@bk2/folder-data-access';
import { DEFAULT_MIMETYPES } from '@bk2/shared-constants';

const RAG_FOLDER_KEY = 'rag';

export interface RagMessage {
    role: 'user' | 'model';
    text: string;
}

export interface RagSource {
    title: string;
    uri: string;
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
    withComputed((state) => ({
        currentUser: computed(() => state.appStore.currentUser()),
        hasHistory: computed(() => state.chatEntries().length > 0),
    })),
    withMethods((store) => ({
        setStoreName(storeName: string): void {
            patchState(store, { storeName });
        },

        reset(): void {
            patchState(store, { messages: [], chatEntries: [], error: null });
        },

        /**
         * Opens the file picker, uploads the selected file to
         * tenant/{tenantId}/rag/{fileName}, creates a DocumentModel in the
         * 'rag' folder, and persists it. The Storage trigger automatically
         * indexes the file into the Google File Search store.
         */
        async addDocument(): Promise<void> {
            const tenantId = store.appStore.env.tenantId;
            const currentUser = store.currentUser();
            const storagePath = `tenant/${tenantId}/rag`;

            // Ensure the 'rag' folder exists (idempotent)
            await store.folderService.ensureGroupFolder(RAG_FOLDER_KEY, 'RAG', tenantId, currentUser ?? undefined);

            // Pick file + upload to Storage + build DocumentModel
            const document = await store.uploadService.uploadAndCreateDocument(
                tenantId,
                DEFAULT_MIMETYPES,
                storagePath,
                '@cms.rag.upload',
            );
            if (!document) return; // user cancelled

            // Link to the 'rag' folder and save
            document.folderKeys = [RAG_FOLDER_KEY];
            await store.documentService.create(document, currentUser ?? undefined);
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

                const { answer, sources } = result.data;

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
