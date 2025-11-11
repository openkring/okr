import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';

import { AppStore } from '@bk2/shared-feature';
import { SectionModel } from '@bk2/shared-models';
import { CardSelectModalComponent } from '@bk2/shared-ui';
import { nameMatches } from '@bk2/shared-util-core';

import { SectionService } from '@bk2/cms-section-data-access';
import { createSection, isSection } from '@bk2/cms-section-util';

import { SectionEditModalComponent } from './section-edit.modal';

export type SectionListState = {
  searchTerm: string;
  selectedCategory: string;
};

export const initialState: SectionListState = {
  searchTerm: '',
  selectedCategory: 'all'
};

export const SectionListStore = signalStore(
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
    })
  })),

  withComputed((state) => {
    return {
      sections: computed(() => state.sectionsResource.value()),
      sectionsCount: computed(() => state.sectionsResource.value()?.length ?? 0),
      filteredSections: computed(() => 
        state.sectionsResource.value()?.filter((section: SectionModel) => 
          nameMatches(section.index, state.searchTerm()) && 
          nameMatches(section.type, state.selectedCategory())   
        )),
      isLoading: computed(() => state.sectionsResource.isLoading()),
      sectionTypes: computed(() => state.appStore.getCategory('section_type'))
      }
  }),

  withMethods((store) => {
    return {
      reset() {
        patchState(store, initialState);
        store.sectionsResource.reload();
      },

      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedCategory(selectedCategory: string) {
        patchState(store, { selectedCategory });
      },

      async delete(section: SectionModel): Promise<void> {
        await store.sectionService.delete(section, store.appStore.currentUser());
        this.reset();
      },

      async add() {
        const modal = await store.modalController.create({
          component: CardSelectModalComponent,
          cssClass: 'full-modal',
          componentProps: {
            categories: store.sectionTypes(),
            slug: 'section'
          }
        });
        modal.present();
        const { data, role } = await modal.onWillDismiss();
        if (role === 'confirm') { // data = selected Category
          const section = createSection(data, store.appStore.tenantId());
          this.edit(await store.sectionService.create(section));
        }
        this.reset();
      },

      async edit(sectionKey?: string): Promise<void> {
        if (sectionKey) {
          const section = await firstValueFrom(store.sectionService.read(sectionKey));
          if (section) {
            const modal = await store.modalController.create({
              component: SectionEditModalComponent,
              componentProps: {
                section: section
              }
            });
            modal.present();
            const { data, role } = await modal.onWillDismiss();
            if (role === 'confirm') {
              if (isSection(data, store.appStore.tenantId())) {
                store.sectionService.update(data, store.appStore.currentUser());
              }
            }
          }
        }
      }
    }
  }),
);

