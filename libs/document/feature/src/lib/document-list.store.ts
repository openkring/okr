import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';

import { chipMatches, debugListLoaded, getSystemQuery, nameMatches, searchData } from '@bk2/shared/util-core';
import { AllCategories, DocumentCollection, DocumentModel, ModelType } from '@bk2/shared/models';
import { categoryMatches } from '@bk2/shared/categories';
import { AppStore } from '@bk2/shared/feature';

import { DocumentModalsService } from './document-modals.service';

export type DocumentListState = {
  searchTerm: string;
  selectedTag: string;
  selectedType: number;
};

export const initialDocumentListState: DocumentListState = {
  searchTerm: '',
  selectedTag: '',
  selectedType: AllCategories,
};

export const DocumentListStore = signalStore(
  withState(initialDocumentListState),
  withProps(() => ({
    documentModalsService: inject(DocumentModalsService),
    appStore: inject(AppStore),
    modalController: inject(ModalController),    
  })),
  withProps((store) => ({
    documentsResource: rxResource({
      loader: () => {
        const documents$ = searchData<DocumentModel>(store.appStore.firestore, DocumentCollection, getSystemQuery(store.appStore.tenantId()), 'fullPath', 'asc');
        debugListLoaded<DocumentModel>('DocumentListStore.tasks', documents$, store.appStore.currentUser());
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
          categoryMatches(document.type, state.selectedType()) &&
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

      setSelectedType(selectedType: number) {
        patchState(store, { selectedType });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags(ModelType.Task);
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
