import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Observable, of } from 'rxjs';

import { AppStore } from '@bk2/shared-feature';
import { AppNavigationService } from '@bk2/shared-util-angular';
import { debugItemLoaded, getSystemQuery } from '@bk2/shared-util-core';

import { DocumentService } from '@bk2/document-data-access';
import { DocumentModel, DocumentModelName } from '@bk2/shared-models';
import { convertFormToDocument, DocumentFormModel } from '@bk2/document-util';

/**
 * the documentEditPage is setting the personKey.
 * The store reads the corresponding person and updates the state with the person.
 * Then, the person is used to read its addresses.
 */
export type DocumentEditState = {
  documentKey: string | undefined;
  formIsValid: boolean;
};

export const initialState: DocumentEditState = {
  documentKey: undefined,
  formIsValid: false,
};

export const DocumentEditStore = signalStore(
  withState(initialState),
  withProps(() => ({
    documentService: inject(DocumentService),
    appNavigationService: inject(AppNavigationService),
    appStore: inject(AppStore),
    modalController: inject(ModalController)
  })),

  withProps((store) => ({
    documentResource: rxResource({
      params: () => ({
        documentKey: store.documentKey()
      }),
      stream: ({params}) => {
        if (!params.documentKey?.length) return new Observable<DocumentModel>(() => {});
        const document$ = store.documentService.read(params.documentKey);
        debugItemLoaded('DocumentEditStore.document', document$, store.appStore.currentUser());
        return document$;
      }
    }),
  })),

  withComputed((state) => {
    return {
      document: computed(() => state.documentResource.value()),
      currentUser: computed(() => state.appStore.currentUser()),
      tenantId: computed(() => state.appStore.env.tenantId),
    };
  }),

  withMethods((store) => {
    return {
      
      /************************************ SETTERS ************************************* */
      setDocumentKey(documentKey: string): void {
        patchState(store, { documentKey });
      },

      setFormIsValid(isValid: boolean): void {
        patchState(store, { formIsValid: isValid });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags(DocumentModelName);
      },

      /************************************ ACTIONS ************************************* */
      reloadDocuments(): void {
        store.documentResource.reload();
      },

      async save(vm?: DocumentFormModel): Promise<void> {
        const doc = convertFormToDocument(vm, store.document());
        await (!doc.bkey ? 
          store.documentService.create(doc, store.currentUser()) : 
          store.documentService.update(doc, store.currentUser()));
        store.appNavigationService.back();
      }
    }
  }),
);
