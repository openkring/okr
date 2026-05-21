import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Browser } from '@capacitor/browser';
import { firstValueFrom, Observable, of } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { CategoryListModel, DocumentCollection, DocumentModel, DocumentModelName, FolderModel } from '@bk2/shared-models';
import { chipMatches, debugItemLoaded, debugListLoaded, getSystemQuery, nameMatches } from '@bk2/shared-util-core';
import { confirm, AppNavigationService } from '@bk2/shared-util-angular';
import { I18nService } from '@bk2/shared-i18n';

import { DocumentService } from '@bk2/document-data-access';
import { FolderService } from '@bk2/folder-data-access';
import { newFolderModel } from '@bk2/folder-util';
import { UploadService } from '@bk2/avatar-data-access';

import { PFX } from './scope';
import { DocumentEditModal } from 'libs/document/feature/src/lib/document-edit.modal';

export type DocumentState = {
  documentKey: string;
  listId: string;

  // filters
  searchTerm: string;
  selectedTag: string;
  selectedType: string;
  selectedSource: string;
};

export const initialState: DocumentState = {
  documentKey: '',
  listId: '',
  searchTerm: '',
  selectedTag: '',
  selectedType: 'all',
  selectedSource: 'all',
};

export const DocumentStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    appNavigationService: inject(AppNavigationService),
    modalController: inject(ModalController),
    alertController: inject(AlertController),
    documentService: inject(DocumentService),
    folderService: inject(FolderService),
    uploadService: inject(UploadService),
    i18nService: inject(I18nService)
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll({
      documents:        PFX + 'documents',
      revisions:        PFX + 'revisions',
      empty:            PFX + 'empty',
      name:             PFX + 'name',
      size:             PFX + 'size',
      lastUpdate:       PFX + 'lastUpdate',
      revision_list:    PFX + 'revision.list.title',
      upload_single:    PFX + 'upload.single.title',
      upload_multiple:  PFX + 'upload.multiple.title',
      image_add:        PFX + 'image.add',
      image_select:     PFX + 'image.select',
      image_upload:     PFX + 'image.upload',
      delete_confirm:   PFX + 'delete.confirm',
      as_title:         PFX + 'actionsheet.title',
      as_view:          PFX + 'actionsheet.view',
      as_edit:          PFX + 'actionsheet.edit',
      as_update:        PFX + 'actionsheet.update',
      as_create:        PFX + 'actionsheet.create',
      as_delete:        PFX + 'actionsheet.delete',
      as_revisions:     PFX + 'actionsheet.revisions',
      as_download:      PFX + 'actionsheet.download',
      changeConfirmation_ok:           PFX + 'changeConfirmation.ok',
      changeConfirmation_cancel:       PFX + 'changeConfirmation.cancel',
      changeConfirmation_confirmation: PFX + 'changeConfirmation.confirmation',
      ok: '@ok',
      cancel: '@cancel'
    }),

    documentsResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser()
      }),
      stream: ({params}) => {
        return store.firestoreService.searchData<DocumentModel>(DocumentCollection, getSystemQuery(store.appStore.tenantId()), 'fullPath', 'asc').pipe(
          debugListLoaded<DocumentModel>('DocumentStore.documents', params.currentUser)
        );
      }
    }),

    documentResource: rxResource({
      params: () => ({
        documentKey: store.documentKey(),
        currentUser: store.appStore.currentUser()
      }),
      stream: ({params}) => {
        const key = params.documentKey;
        if (!key || key.length === 0) return new Observable<DocumentModel>(() => {});
        return store.documentService.read(params.documentKey).pipe(
          debugItemLoaded('DocumentStore.document', params.currentUser)
        );
      }
    }),

    subfoldersResource: rxResource({
      params: () => ({ listId: store.listId() }),
      stream: ({ params }) => {
        const listId = params.listId;
        if (!listId.startsWith('f:')) return of<FolderModel[]>([]);
        return store.folderService.listByParent(listId.substring(2));
      }
    }),
  })),

 withComputed((state) => {
    return {
      documents: computed(() => state.documentsResource.value() ?? []),
      subFolders: computed(() => state.subfoldersResource.value() ?? []),
      isLoading: computed(() => state.documentsResource.isLoading() || state.subfoldersResource.isLoading()),
    }
  }),

  withComputed((state) => {
    return {
      // documents
      documentsCount: computed(() => state.documents()?.length ?? 0),
      folderDocumentCounts: computed(() => {
        const counts = new Map<string, number>();
        for (const doc of state.documents()) {
          for (const key of doc.folderKeys) {
            counts.set(key, (counts.get(key) ?? 0) + 1);
          }
        }
        return counts;
      }),
      filteredDocuments: computed(() => {
        const allDocs = state.documents() ;

        // apply listId filter first
        let filtered = allDocs;
        const listId = state.listId();
        
        if (listId && listId !== 'all') {
          const prefix = listId.substring(0,2);
          const value = listId.substring(2);
          
          switch (prefix) {
          case 'p:': // path
            filtered = filtered.filter(d => d.fullPath.startsWith(value)) ?? [];
            break;
          case 't:': // tag
            filtered = filtered.filter(d => d.tags.includes(value)) ?? [];
            break;
          case 'f:': // folderKey
            filtered = filtered.filter(d => d.folderKeys.includes(value)) ?? [];
            break;
          default:
            console.warn(`DocumentStore: unknown listId prefix '${prefix}' in listId '${listId}'. Supported: p:ath t:ag f:older`);
            return allDocs;
          }
        }
        
        // Apply other filters
        return filtered.filter((document: DocumentModel) => 
          nameMatches(document.index, state.searchTerm()) &&
          nameMatches(document.type, state.selectedType()) &&
          nameMatches(document.source, state.selectedSource()) &&
          chipMatches(document.tags, state.selectedTag()))
      }),

      // single document
      document: computed(() => state.documentResource.value()),

      // other
      currentUser: computed(() => state.appStore.currentUser()),
      tenantId: computed(() => state.appStore.tenantId()),
    };
  }),

  withMethods((store) => {
    return {
      reset() {
        patchState(store, initialState);
        this.reload();
      },

      reload() {
        store.documentsResource.reload();
        store.documentResource.reload();
        store.subfoldersResource.reload();
      },
 
      /******************************** setters (filter) ******************************************* */
      setDocumentKey(documentKey: string): void {
        patchState(store, { documentKey });
      },

      setListId(listId: string) {
        patchState(store, { listId });
      },

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
        return store.appStore.getTags(DocumentModelName);
      },

      getTypes(): CategoryListModel {
        return store.appStore.getCategory('document_type');
      },

      getSources(): CategoryListModel {
        return store.appStore.getCategory('document_source');
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
        const folderKey = store.listId().startsWith('f:') ? store.listId().substring(2) : undefined;
        document.folderKeys = folderKey ? [folderKey] : [];
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
        // 5) open edit modal
        const { DocumentEditModal } = await import('./document-edit.modal');
        const modal = await store.modalController.create({
          component: DocumentEditModal,
          componentProps: {
            document,
            currentUser,
            tags: store.appStore.getTags(DocumentModelName),
            types: store.appStore.getCategory('document_type'),
            sources: store.appStore.getCategory('document_source'),
            readOnly: false
          }
        });
        await modal.present();
        const { data, role } = await modal.onDidDismiss<DocumentModel>();
        if (role === 'confirm' && data) {
          await store.documentService.update(data, currentUser);
        }
        store.documentsResource.reload();
      },

      /**
       * Pick multiple files, upload each to storage and save a DocumentModel for each.
       * All created documents are automatically assigned to the current folder (if listId = f:<key>).
       * No per-file navigation — the list reloads after all uploads complete.
       */
      async addFiles(files: File[]): Promise<void> {
        if (!files.length) return;
        const currentUser = store.currentUser();
        if (!currentUser) return;
        const tenantId = store.tenantId();
        const folderKey = store.listId().startsWith('f:') ? store.listId().substring(2) : undefined;
        const basePath = `tenant/${tenantId}/${DocumentModelName}`;

        for (const file of files) {
          const fullPath = `${basePath}/${file.name}`;
          const downloadUrl = await store.uploadService.uploadFile(file, fullPath, file.name);
          if (!downloadUrl) continue;

          const doc = await store.documentService.getDocumentFromFile(file, fullPath);
          doc.folderKeys = folderKey ? [folderKey] : [];
          doc.authorKey = currentUser.personKey;
          doc.authorName = `${currentUser.firstName} ${currentUser.lastName}`;
          doc.priorVersionKey = '';
          doc.version = '1.0';
          await store.documentService.create(doc, currentUser);
        }
        store.documentsResource.reload();
      },

      /**
       * Prompt for a name, create a new FolderModel nested under the current folder,
       * and navigate into it by updating the listId.
       */
      async addFolder(): Promise<void> {
        const currentUser = store.currentUser();
        if (!currentUser) return;
        const parentFolderKey = store.listId().startsWith('f:') ? store.listId().substring(2) : '';

        const alert = await store.alertController.create({
          header: 'New Folder',
          inputs: [{ name: 'name', type: 'text', placeholder: 'Folder name' }],
          buttons: [
            { text: 'Cancel', role: 'cancel' },
            { text: 'Create', role: 'confirm' }
          ]
        });
        await alert.present();
        const { data, role } = await alert.onDidDismiss();
        if (role !== 'confirm') return;
        const name: string = data?.values?.name?.trim() ?? '';
        if (!name) return;

        const folder = newFolderModel(store.tenantId(), name, parentFolderKey ? [parentFolderKey] : []);
        const newKey = await store.folderService.create(folder, currentUser);
        if (newKey) {
          patchState(store, { listId: `f:${newKey}` });
        }
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
        console.log(`DocumentStore.export(${type}) is not yet implemented (tbd)`);
      },

      async edit(document?: DocumentModel, readOnly = true): Promise<void> {
        if (!document) return;
        const { DocumentEditModal } = await import('./document-edit.modal');
        const modal = await store.modalController.create({
          component: DocumentEditModal,
          componentProps: {
            document,
            currentUser: store.currentUser(),
            tags: store.appStore.getTags(DocumentModelName),
            types: store.appStore.getCategory('document_type'),
            sources: store.appStore.getCategory('document_source'),
            readOnly
          }
        });
        await modal.present();
        const { data, role } = await modal.onDidDismiss<DocumentModel>();
        if (role === 'confirm' && data && !readOnly) {
          await store.documentService.update(data, store.currentUser());
        }
        store.documentsResource.reload();
      },

      async delete(document?: DocumentModel, readOnly = true): Promise<void> {
        if (!document || readOnly) return;
        const result = await confirm(store.alertController, store.i18n.delete_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
        if (result === true) {
          await store.documentService.delete(document, store.currentUser());
          this.reset();
        }
      },

      async save(doc?: DocumentModel): Promise<void> {
        if (!doc) return;
        await (!doc.bkey ? 
          store.documentService.create(doc, store.currentUser()) : 
          store.documentService.update(doc, store.currentUser()));
        store.appNavigationService.back();
      },

      async preview(document?: DocumentModel, readOnly = true): Promise<void> {
        if (!document || readOnly) return;
        await Browser.open({ url: document.url, windowName: '_blank' });
      },

      async download(document?: DocumentModel, readOnly = true): Promise<void> {
        if (!document || readOnly) return;
        window.open(document.url, '_blank');
      },

      async showRevisions(document: DocumentModel): Promise<void> {
        const revisions = await this.getRevisions(document);
        const { DocumentRevisionsModal } = await import('./document-revisions.modal');
        const modal = await store.modalController.create({
          component: DocumentRevisionsModal,
          componentProps: { revisions }
        });
        await modal.present();
        await modal.onWillDismiss();
      },

      getTitleLabel(readOnly: boolean, key?: string): string {
        if (readOnly) {
          return store.i18n.as_view();
        }
        if (key && key.length > 0) {
          return store.i18n.as_edit();
        } else {
          return store.i18n.as_create();
        }
      },

      async openPriorVersion(key: string, tags:string, types: CategoryListModel, sources: CategoryListModel): Promise<void> {
        const prior = await firstValueFrom(store.documentService.read(key));
        if (!prior) return;
        const modal = await store.modalController.create({
          component: DocumentEditModal,
          componentProps: {
            document: prior,
            currentUser: store.currentUser(),
            tags,
            types,
            sources,
            readOnly: true
          }
        });
        await modal.present();
        await modal.onWillDismiss();
      }
    };
  }),
);
