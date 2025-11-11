import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { CategoryCollection, CategoryListModel, DocumentCollection, DocumentModel } from '@bk2/shared-models';
import { chipMatches, debugListLoaded, getSystemQuery, nameMatches } from '@bk2/shared-util-core';

import { DocumentModalsService } from './document-modals.service';

export type DocumentListState = {
  searchTerm: string;
  selectedTag: string;
  selectedType: string;
  selectedSource: string;
};

export const initialDocumentListState: DocumentListState = {
  searchTerm: '',
  selectedTag: '',
  selectedType: 'all',
  selectedSource: 'all'
};

export const DocumentListStore = signalStore(
  withState(initialDocumentListState),
  withProps(() => ({
    documentModalsService: inject(DocumentModalsService),
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),    
  })),
  withProps((store) => ({
    documentsResource: rxResource({
      stream: () => {
        const documents$ = store.firestoreService.searchData<DocumentModel>(DocumentCollection, getSystemQuery(store.appStore.tenantId()), 'fullPath', 'asc');
        debugListLoaded<DocumentModel>('DocumentListStore.tasks', documents$, store.appStore.currentUser());
        return documents$;
      }
    }),
    docTypesResource: rxResource({
      stream: () => {
        return store.firestoreService.readModel<CategoryListModel>(CategoryCollection, 'document_type');            
      }
    }),
    docSourcesResource: rxResource({
      stream: () => {
        return store.firestoreService.readModel<CategoryListModel>(CategoryCollection, 'document_source');            
      }
    })
  })),

 withComputed((state) => {
    return {
      allDocuments: computed(() => state.documentsResource.value()) ?? [],
      docTypes: computed(() => state.docTypesResource.value()),
      docSources: computed(() => state.docSourcesResource.value()),
      isLoading: computed(() => state.documentsResource.isLoading()),
    }
  }),

  withComputed((state) => {
    return {
      allDocumentsCount: computed(() => state.allDocuments()?.length ?? 0),
      currentUser: computed(() => state.appStore.currentUser()),
      tenantId: computed(() => state.appStore.tenantId()),
      documents: computed(() => 
        state.allDocuments()?.filter((document: DocumentModel) => 
          nameMatches(document.index, state.searchTerm()) &&
          nameMatches(document.type, state.selectedType()) &&
          nameMatches(document.source, state.selectedSource()) &&
          chipMatches(document.tags, state.selectedTag()))
      )
    };
  }),

  withMethods((store) => {
    return {
 
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

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags('document');
      },

      /******************************* actions *************************************** */
      async add(): Promise<void> {
        console.log('DocumentListStore.add is not yet implemented (tbd).');
        store.documentsResource.reload();
      },

      async export(): Promise<void> {
        console.log('DocumentListStore.export ist not yet implemented (tbd)');
      },

      async edit(document?: DocumentModel): Promise<void> {
        if (document) {
          console.log('DocumentListStore.edit is not yet implemented (tbd).');
          store.documentsResource.reload();
        }
      },

      async delete(document?: DocumentModel): Promise<void> {
        if (document) {
          console.log('DocumentListStore.delete is not yet implemented (tbd).');
          store.documentsResource.reload();
        }
      },

      async replaceWithNewVersion(document: DocumentModel): Promise<void> {
        if (document) {
          console.log('DocumentListStore.replaceWithNewVersion is not yet implemented (tbd).');
          store.documentsResource.reload();
        }
      }
    };
  }),
);
