import { computed, inject, Injectable } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { ArticleSection, ButtonAction, ButtonSection, CategoryItemModel, CategoryListModel, SectionModel, SectionType } from '@bk2/shared-models';
import { CardSelectModalComponent } from '@bk2/shared-ui';
import { chipMatches, debugItemLoaded, debugMessage, nameMatches } from '@bk2/shared-util-core';
import { DEFAULT_MIMETYPES, IMAGE_MIMETYPES } from '@bk2/shared-constants';
import { confirm } from '@bk2/shared-util-angular';

import { UploadService } from '@bk2/avatar-data-access';

import { SectionService } from '@bk2/cms-section-data-access';
import { createSection, narrowSection } from '@bk2/cms-section-util';

import { SectionEditModalComponent } from './section-edit.modal';

export type SectionState = {
  sectionId: string;

  // filters
  searchTerm: string;
  selSearchTerm: string;    // for the section select modal
  selectedTag: string;
  selectedCategory: string;
  selectedState: string;
};

export const initialState: SectionState = {
  sectionId: '',
  searchTerm: '',
  selSearchTerm: '',
  selectedTag: '',
  selectedCategory: 'all',
  selectedState: 'all',
};

export const _SectionStore = signalStore(
  withState(initialState),
  withProps(() => ({
    sectionService: inject(SectionService),
    uploadService: inject(UploadService),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    alertController: inject(AlertController),
  })),
  withProps((store) => ({
    sectionsResource: rxResource({
      stream: () => {
        return store.sectionService.list();
      }
    }),

    sectionResource: rxResource({
      params: () => ({
        sectionId: store.sectionId(),
        currentUser: store.appStore.currentUser()
      }),
      stream: ({ params }) => {
        return store.sectionService.read(params.sectionId).pipe(
          debugItemLoaded<SectionModel>(`SectionStore.sectionResource`, params.currentUser)
        );
      }
    })
  })),

  withComputed((state) => {
    return {
      // sections
      sections: computed(() => state.sectionsResource.value()),
      sectionsCount: computed(() => state.sectionsResource.value()?.length ?? 0),
      filteredSections: computed(() => 
        state.sectionsResource.value()?.filter((section: SectionModel) => 
          nameMatches(section.index, state.searchTerm()) && 
          nameMatches(section.type, state.selectedCategory()) &&
          chipMatches(section.tags, state.selectedTag()) &&
          nameMatches(section.state, state.selectedState())
        )),

      selFilteredSections: computed(() => 
        state.sectionsResource.value()?.filter((section: SectionModel) => 
          nameMatches(section.index, state.selSearchTerm())
        )),

      // section
      section: computed(() => state.sectionResource.value() ?? undefined),

      // others
      isLoading: computed(() => state.sectionsResource.isLoading() || state.sectionResource.isLoading()),
      sectionTypes: computed(() => state.appStore.getCategory('section_type')),
      currentUser: computed(() => state.appStore.currentUser()),
      tenantId: computed(() => state.appStore.tenantId()),
      showDebugInfo: computed(() => state.appStore.showDebugInfo()),
      imgixBaseUrl: computed(() => state.appStore.env.services.imgixBaseUrl),
      }
  }),

  withMethods((store) => {
    return {
      reset() {
        patchState(store, initialState);
        this.reload();
      },

      reload() {
        store.sectionsResource.reload();
        store.sectionResource.reload();
      },

      /******************************** setters (filter) ******************************************* */
      /**
       * Updates the page id which triggers the loading of the page.
       * @param id the key of the page
       */
      setSectionId(sectionId: string) {
        debugMessage(`SectionStore.setSectionId(${sectionId})`, store.currentUser());
        patchState(store, { sectionId });
      },

      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelSearchTerm(selSearchTerm: string) {   // for section select modal
        patchState(store, { selSearchTerm });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      setSelectedCategory(selectedCategory: string) {
        patchState(store, { selectedCategory });
      },

      setSelectedState(selectedState: string) {
        patchState(store, { selectedState });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags('section');
      },

      getTypes(): CategoryListModel {
        return store.appStore.getCategory('section_type');
      },

      getRoles(): CategoryListModel {
        return store.appStore.getCategory('roles');
      },

      /******************************** actions ******************************************* */
      async add(readOnly = true): Promise<string | undefined> {
        if (readOnly) return;
        const modal = await store.modalController.create({
          component: CardSelectModalComponent,
          cssClass: 'full-modal',
          componentProps: { 
            category: store.sectionTypes(),
            slug: 'section',
          }
        });
        modal.present();
        const { data, role } = await modal.onWillDismiss();
        if (role === 'confirm' && data) { // data = selected CategoryItemModel
          const item = data as CategoryItemModel;
          const section = createSection(item.name as SectionType, store.tenantId(), item.name);
          const sectionId = await this.edit(section, readOnly);
          this.reload();
          return sectionId;
        }
      },

      async edit(section?: SectionModel, readOnly = true): Promise<string | undefined> {
        if (!section) return;
        const tags = this.getTags();
        const roles = this.getRoles();
        const states = store.appStore.getCategory('content_state');
        const modal = await store.modalController.create({
          component: SectionEditModalComponent,
          cssClass: 'full-modal',
          componentProps: {
            section,
            currentUser: store.currentUser(),
            tags,
            roles,
            states,
            readOnly
          }
        });
        modal.present();
        const { data, role } = await modal.onWillDismiss();
        if (role === 'confirm' && data && !readOnly) {
          const section = narrowSection(data);
          if (section) {
            const sectionId = section.bkey?.length === 0 ?
              await store.sectionService.create(section, store.currentUser()) :
              await store.sectionService.update(data, store.currentUser());
            this.reload();
            return sectionId;
          }
        }
      },

      async delete(section?: SectionModel, readOnly = true): Promise<void> {
        if (readOnly || !section) return;
        const result = await confirm(store.alertController, '@content.section.operation.delete.confirm', true);
        if (result === true) {
          await store.sectionService.delete(section, store.currentUser());
          this.reset();
        }
      },

      async uploadImage(section?: ArticleSection): Promise<void> {
        if (!section) return;
        // 1) pick an image file
        const file = await store.uploadService.pickFile(IMAGE_MIMETYPES);
        if (!file) return;

        // 2) upload the image file into Firestorage
        const fullPath = `tenant/${store.tenantId()}/section/${section.bkey}/image/${file.name}`;
        const downloadUrl = await store.uploadService.uploadFile(file, fullPath, 'Upload Section Image');
        if (!downloadUrl) return;

        // 3) update the section with the new image URL
        section.properties.image.url = downloadUrl;
        await store.sectionService.update(section, store.currentUser());
        this.reload();
      },

      async uploadFile(section?: ButtonSection): Promise<void> {
        if (!section) return;
        // 1) pick a file
        const file = await store.uploadService.pickFile(DEFAULT_MIMETYPES);
        if (!file) return;

        // 2) upload the file into Firestorage
        const fullPath = `tenant/${store.tenantId()}/section/${section.bkey}/file/${file.name}`;
        const downloadUrl = await store.uploadService.uploadFile(file, fullPath, 'Upload Section File');
        if (!downloadUrl) return;

        // 3) update the section with the new file URL
        section.properties.action.url = downloadUrl;
        section.properties.action.altText = file.name;
        section.properties.action.type = ButtonAction.Download;
        await store.sectionService.update(section, store.currentUser());
        this.reload();
      },

      async export(type: string): Promise<void> {
        console.log(`SectionStore.export(${type}) is not yet implemented.`);
      },
    }
  }),
);


@Injectable({
  providedIn: 'root'
})
export class SectionStore extends _SectionStore {
  constructor() {
    super();
  }
}