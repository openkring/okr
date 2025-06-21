import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';

import { AllCategories, SectionModel, SectionType } from '@bk2/shared/models';
import { categoryMatches, SectionTypes } from '@bk2/shared/categories';
import { nameMatches } from '@bk2/shared/util';
import { CardSelectModalComponent } from '@bk2/shared/ui';
import { AppStore } from '@bk2/shared/feature';

import { SectionService } from '@bk2/cms/section/data-access';
import { createSection, isSection } from '@bk2/cms/section/util';
import { SectionEditModalComponent } from './section-edit.modal';

export type SectionListState = {
  searchTerm: string;
  selectedCategory: SectionType | typeof AllCategories;
};

export const initialState: SectionListState = {
  searchTerm: '',
  selectedCategory: AllCategories
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
      loader: () => {
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
          nameMatches(section.index, state.searchTerm()) && categoryMatches(section.type, state.selectedCategory())   
        )),
      isLoading: computed(() => state.sectionsResource.isLoading()),
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

      setSelectedCategory(selectedCategory: SectionType | typeof AllCategories) {
        patchState(store, { selectedCategory });
      },

      async delete(section: SectionModel): Promise<void> {
        await store.sectionService.delete(section);
        this.reset();
      },

      async add() {
        const _modal = await store.modalController.create({
          component: CardSelectModalComponent,
          cssClass: 'full-modal',
          componentProps: {
            categories: SectionTypes,
            slug: 'section'
          }
        });
        _modal.present();
        const { data, role } = await _modal.onWillDismiss();
        if (role === 'confirm') { // data = selected Category
          const _section = createSection(data, store.appStore.tenantId());
          this.edit(await store.sectionService.create(_section));
        }
        this.reset();
      },

      async edit(sectionKey?: string): Promise<void> {
        if (sectionKey) {
          const _section = await firstValueFrom(store.sectionService.read(sectionKey));
          if (_section) {
            const _modal = await store.modalController.create({
              component: SectionEditModalComponent,
              componentProps: {
                section: _section
              }
            });
            _modal.present();
            const { data, role } = await _modal.onWillDismiss();
            if (role === 'confirm') {
              if (isSection(data, store.appStore.tenantId())) {
                store.sectionService.update(data);
              }
            }
          }
        }
      }
    }
  }),
);

