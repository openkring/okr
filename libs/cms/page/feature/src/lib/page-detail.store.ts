import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { PageService } from '@bk2/cms/page/data-access';
import { ModalController } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';

import { debugItemLoaded, debugMessage, die } from '@bk2/shared/util';
import { PageModel, SectionModel } from '@bk2/shared/models';
import { SectionTypes } from '@bk2/shared/categories';
import { CardSelectModalComponent } from '@bk2/shared/ui';
import { AppStore } from '@bk2/shared/feature';

import { createSection } from '@bk2/cms/section/util';
import { SectionService } from '@bk2/cms/section/data-access';
import { SectionSelectModalComponent } from '@bk2/cms/section/feature';
import { PageSortModalComponent } from './page-sort.modal';

export type PageDetailState = {
  pageId: string;
};

export const initialState: PageDetailState = {
  pageId: '',
};

export const PageDetailStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    pageService: inject(PageService),
    sectionService: inject(SectionService),
    modalController: inject(ModalController),
  })),
  withComputed((state) => {
    return {
      tenantId: computed(() => state.appStore.tenantId()),
      currentUser: computed(() => state.appStore.currentUser()),
      showDebugInfo: computed(() => state.appStore.showDebugInfo()),
      imgixBaseUrl: computed(() => state.appStore.services.imgixBaseUrl()),
    };
  }),

  withProps((store) => ({
    pageResource: rxResource({
      request: () => ({
        pageId: store.pageId()
      }),
      loader: ({ request }) => {
        const _page$ = store.pageService.read(request.pageId);
        debugItemLoaded<PageModel>(`PageDetailStore.pageResource`, _page$, store.currentUser());
        return _page$;
      }
    })
  })),

  withComputed((state) => {
    return {
      page: computed(() => state.pageResource.value()),
      meta: computed(() => state.pageResource.value()?.meta),
      sections: computed(() => state.pageResource.value()?.sections ?? []),
      isEmptyPage: computed(() => state.pageResource.value()?.sections === undefined || state.pageResource.value()?.sections.length === 0),
      isLoading: computed(() => state.pageResource.isLoading())
    };
  }),

  withMethods((store) => {
    return {
      /******************************** setters (filter) ******************************************* */
      /**
       * Updates the page id which triggers the loading of the page.
       * @param id the key of the page
       */
      setPageId(pageId: string) {
        debugMessage(`PageDetailStore.setPageId(${pageId})`, store.currentUser());
        patchState(store, { pageId });
      },

      /******************************** actions ******************************************* */
      /**
       * Deletes the section with sectionKey from the current Page.
       * @param sectionKey the id of the section to remove.
       */
      deleteSectionFromPage: (sectionKey: string) => {
        const _page = store.page() ?? die('PageStore.deleteSectionFromPage: page is mandatory.');
        _page.sections.splice(_page.sections.indexOf(sectionKey), 1);
        store.pageService.update(_page);
      },
      /**
       * Sort the sections of the page.
       * @returns 
       */ 
      async sortSections() {
        if (store.sections().length === 0) return;
        // convert the list of sectionKeys to a list of SectionModels
        const _sections = await firstValueFrom(store.sectionService.searchByKeys(store.sections()));
        const _modal = await store.modalController.create({
          component: PageSortModalComponent,
          componentProps: {
            sections: _sections    
          }
        });
        _modal.present();
        const { data, role } = await _modal.onWillDismiss();
        if (role === 'confirm') {
          const _sortedSections = (data as SectionModel[]).map((_section: SectionModel) => _section.bkey ?? die('PageDetailStore.sortSections: sectionKey is mandatory.'));
          const _page = store.page() ?? die('PageDetailStore.sortSections: page is mandatory.');
          _page.sections = _sortedSections;
          store.pageService.update(_page);
          store.pageResource.reload();
        }
      },
      /**
       * Add a new section to the page.
       */
      async addSection(): Promise<void> {
        const _page = structuredClone(store.page() ?? die('PageDetailStore.addSection: page is mandatory.'));
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
          const _section = createSection(data, store.tenantId());
          const _sectionKey = await store.sectionService.create(_section);
          if (_sectionKey) {
            _page.sections.push(_sectionKey);
            store.pageService.update(_page);
            store.pageResource.reload();
          } 
        }
      },
      /**
       * Select an existing section and add it to the page.
       * @param page the page to add the section to
       * @returns 
       */
      async selectSection(): Promise<void> {
        const _page = store.page() ?? die('PageDetailStore.selectSection: page is mandatory.');
        const _modal = await store.modalController.create({
          component: SectionSelectModalComponent,
          cssClass: 'full-modal'
        });
        _modal.present();
        const { data, role } = await _modal.onWillDismiss();
        if (role === 'confirm') { // data = selected sectionKey
          _page.sections.push(data);
          store.pageService.update(_page);
          store.pageResource.reload();
        }
      },

      async export(type: string): Promise<void> {
        console.log(`PageDetailStore.export(${type}) is not yet implemented.`);
      }
    }
  }),
);
