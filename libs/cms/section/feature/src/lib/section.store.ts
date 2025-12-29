import { computed, inject, Injectable } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { CategoryItemModel, CategoryListModel, SectionModel, SectionType } from '@bk2/shared-models';
import { CardSelectModalComponent } from '@bk2/shared-ui';
import { chipMatches, debugItemLoaded, debugMessage, nameMatches } from '@bk2/shared-util-core';

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
};

export const initialState: SectionState = {
  sectionId: '',
  searchTerm: '',
  selSearchTerm: '',
  selectedTag: '',
  selectedCategory: 'all'
};

export const _SectionStore = signalStore(
  withState(initialState),
  withProps(() => ({
    sectionService: inject(SectionService),
    appStore: inject(AppStore),
    modalController: inject(ModalController),  
  })),
  withProps((store) => ({
    sectionsResource: rxResource({
      stream: () => {
        return store.sectionService.list();
      }
    }),

    sectionResource: rxResource({
      params: () => ({
        sectionId: store.sectionId()
      }),
      stream: ({ params }) => {
        if (!params.sectionId || params.sectionId.length === 0) {
          return of(undefined);
        }
        const section$ = store.sectionService.read(params.sectionId);
        debugItemLoaded<SectionModel>(`SectionStore.sectionResource`, section$, store.appStore.currentUser());
        return section$;
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
          chipMatches(section.tags, state.selectedTag())
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
        const modal = await store.modalController.create({
          component: SectionEditModalComponent,
          cssClass: 'full-modal',
          componentProps: {
            section,
            currentUser: store.currentUser(),
            tags,
            roles,
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
        await store.sectionService.delete(section, store.currentUser());
        this.reset();
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