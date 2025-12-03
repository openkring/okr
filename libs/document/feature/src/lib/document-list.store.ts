import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Browser } from '@capacitor/browser';
import { firstValueFrom } from 'rxjs';
import { Router } from '@angular/router';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { CategoryListModel, DocumentCollection, DocumentModel, DocumentModelName } from '@bk2/shared-models';
import { chipMatches, debugListLoaded, getSystemQuery, nameMatches } from '@bk2/shared-util-core';
import { navigateByUrl, confirm } from '@bk2/shared-util-angular';

import { DocumentService } from '@bk2/document-data-access';
import { UploadService } from '@bk2/avatar-data-access';

import { DocumentModalsService } from './document-modals.service';

export type DocumentListState = {
  searchTerm: string;
  selectedTag: string;
  selectedType: string;
  selectedSource: string;
  parentKey: string;
};

export const initialState: DocumentListState = {
  searchTerm: '',
  selectedTag: '',
  selectedType: 'all',
  selectedSource: 'all',
  parentKey: '',
};

export const DocumentListStore = signalStore(
  withState(initialState),
  withProps(() => ({
    documentModalsService: inject(DocumentModalsService),
    appStore: inject(AppStore),
    router: inject(Router),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    alertController: inject(AlertController),
    documentService: inject(DocumentService),
    uploadService: inject(UploadService),
  })),
  withProps((store) => ({
    documentsResource: rxResource({
      stream: () => {
        const documents$ = store.firestoreService.searchData<DocumentModel>(DocumentCollection, getSystemQuery(store.appStore.tenantId()), 'fullPath', 'asc');
        debugListLoaded<DocumentModel>('DocumentListStore.documents', documents$, store.appStore.currentUser());
        return documents$;
      }
    })
  })),

 withComputed((state) => {
    return {
      documents: computed(() => state.documentsResource.value()) ?? [],
      isLoading: computed(() => state.documentsResource.isLoading()),
    }
  }),

  withComputed((state) => {
    return {
      documentsCount: computed(() => state.documents()?.length ?? 0),
      currentUser: computed(() => state.appStore.currentUser()),
      tenantId: computed(() => state.appStore.tenantId()),
      filteredDocuments: computed(() => 
        state.documents()?.filter((document: DocumentModel) => 
          nameMatches(document.index, state.searchTerm()) &&
          nameMatches(document.type, state.selectedType()) &&
          nameMatches(document.source, state.selectedSource()) &&
          chipMatches(document.tags, state.selectedTag()))
      ),
      documentsOfParent: computed(() => 
        state.documents()?.filter((document: DocumentModel) => 
          document.parents.includes(state.parentKey()
      )))
    };
  }),

  withMethods((store) => {
    return {
      reset() {
        patchState(store, initialState);
        store.documentsResource.reload();
      },
 
      /******************************** setters (filter) ******************************************* */
      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      setSelectedType(selectedType: string) {
        patchState(store, { selectedType });
      },

      setSelectedSource(selectedSource: string) {
        patchState(store, { selectedSource });
      },

      setParentKey(parentKey: string) {
        patchState(store, { parentKey });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags(DocumentModelName);
      },

      /******************************* actions *************************************** */
      /**
       * Add a new document:
       * 1) Let's the user pick a document from the local file system
       * 2) upload the file into Firestorage in tenant/[tenantId]/document/[hash]
       * 3) generates an initial document object in the database with attributes derived from the file
       * 4) create the document in the database
       * 5) navigate to documents details page to edit additional metadata
       */
      async add(priorVersionKey?: string): Promise<void> {
        const currentUser = store.currentUser();
        if (!currentUser) return;
        store.appStore.appNavigationService.pushLink('/document/all' );

        // 1+2+3) pick a file, upload to storage and create initial document object
        const document = await store.uploadService.uploadAndCreateDocument(store.appStore.tenantId());
        if (!document) return;
        const parentKey = store.parentKey();
        document.parents = parentKey ? [parentKey] : [];
        document.authorKey = currentUser.personKey;
        document.authorName = currentUser.firstName + ' ' + currentUser.lastName;
        if (priorVersionKey) {
          document.priorVersionKey = priorVersionKey;
          document.version = 'x.y';
        } else {
          document.priorVersionKey = '';
          document.version = '1.0';  // initial version, can be changed by the user
        }

        // 4) create the document in the database
        await store.documentService.create(document, currentUser);
        // 5) navigate to document details page
        await navigateByUrl(store.router, `/document/${document.bkey}`, { readOnly: false });        
        //store.documentsResource.reload();
      },

      // add a new version of the document
      async update(document: DocumentModel, readOnly = true): Promise<void> {
        if (!document || readOnly) return;
        await this.add(document.bkey);
        //store.documentsResource.reload();
      },

      /**
       * Returns all prior versions of the given document, ordered by version descending.
       * Follows the priorVersion field backwardd until no more.
       * Works starting from any version in the chain.
       * @param document 
       */
      async getRevisions(document?: DocumentModel): Promise<DocumentModel[]> {
        const versions: DocumentModel[] = [];
        let currentDoc = document;
        while (currentDoc) {
          versions.push(currentDoc);
          if (currentDoc.priorVersionKey) {
            currentDoc = await firstValueFrom(store.documentService.read(currentDoc.priorVersionKey));
          } else {
            currentDoc = undefined;
          }
        }
        return versions;
      },

      async export(type: string): Promise<void> {
        console.log(`DocumentListStore.export(${type}) is not yet implemented (tbd)`);
      },

      async edit(document?: DocumentModel, readOnly = true): Promise<void> {
        if (!document) return;
        store.appStore.appNavigationService.pushLink('/document/all' );
        await navigateByUrl(store.router, `/document/${document.bkey}`, { readOnly });        
        store.documentsResource.reload();
      },

      async delete(document?: DocumentModel, readOnly = true): Promise<void> {
        if (!document || readOnly) return;
        const result = await confirm(store.alertController, '@document.operation.delete.confirm', true);
        if (result === true) {
          await store.documentService.delete(document, store.currentUser());
          this.reset();
        }
      },

      async preview(document?: DocumentModel, readOnly = true): Promise<void> {
        if (!document || readOnly) return;
        await Browser.open({ url: document.url, windowName: '_blank' });
      },

      async download(document?: DocumentModel, readOnly = true): Promise<void> {
        if (!document || readOnly) return;
        window.open(document.url, '_blank');
      }
    };
  }),
);
