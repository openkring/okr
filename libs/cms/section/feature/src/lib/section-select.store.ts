import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';

import { ENV } from '@bk2/shared/config';
import { SectionModel } from '@bk2/shared/models';
import { nameMatches } from '@bk2/shared/util';
import { SectionService } from '@bk2/cms/section/data-access';
import { Router } from '@angular/router';

export type SectionList = {
  searchTerm: string;
};

export const initialState: SectionList = {
  searchTerm: '',
};

export const SectionSelectStore = signalStore(
  withState(initialState),
  withProps(() => ({
    sectionService: inject(SectionService),
    env: inject(ENV),
    modalController: inject(ModalController),  
    router: inject(Router),
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
      isLoading: computed(() => state.sectionsResource.isLoading()),
      filteredSections: computed(() => 
        state.sectionsResource.value()?.filter((section: SectionModel) => 
          nameMatches(section.index, state.searchTerm())
      )),
    };
  }),

  withMethods((store) => {
    return {
      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      }
    };
  }),
);

