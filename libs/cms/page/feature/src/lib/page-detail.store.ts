import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom, of } from 'rxjs';

import { AppStore } from '@bk2/shared-feature';
import { PageModel, SectionModel } from '@bk2/shared-models';
import { CardSelectModalComponent } from '@bk2/shared-ui';
import { debugItemLoaded, debugMessage, die } from '@bk2/shared-util-core';

import { PageService } from '@bk2/cms-page-data-access';
import { SectionService } from '@bk2/cms-section-data-access';
import { SectionSelectModalComponent } from '@bk2/cms-section-feature';
import { createSection } from '@bk2/cms-section-util';
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
      params: () => ({
        pageId: store.pageId()
      }),
      stream: ({ params }) => {
        if (!params.pageId || params.pageId.length === 0) {
          return of(undefined);
        }
        const page$ = store.pageService.read(params.pageId);
        debugItemLoaded<PageModel>(`PageDetailStore.pageResource`, page$, store.currentUser());
        return page$;
      }
    })
  })),

  withComputed((state) => {
    return {
      page: computed(() => state.pageResource.value() ?? undefined),
      meta: computed(() => state.pageResource.value()?.meta),
      sections: computed(() => state.pageResource.value()?.sections ?? []),
      isEmptyPage: computed(() => state.pageResource.value()?.sections === undefined || state.pageResource.value()?.sections.length === 0),
      isLoading: computed(() => state.pageResource.isLoading()),
      sectionTypes: computed(() => state.appStore.getCategory('section_type')?.items ?? [])
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
        const page = store.page() ?? die('PageStore.deleteSectionFromPage: page is mandatory.');
        page.sections.splice(page.sections.indexOf(sectionKey), 1);
        store.pageService.update(page, store.currentUser());
      },
      /**
       * Sort the sections of the page.
       * @returns 
       */
      async sortSections() {
        if (store.sections().length === 0) return;
        // convert the list of sectionKeys to a list of SectionModels
        const sections = await firstValueFrom(store.sectionService.searchByKeys(store.sections()));
        const modal = await store.modalController.create({
          component: PageSortModalComponent,
          componentProps: {
            sections: sections
          }
        });
        modal.present();
        const { data, role } = await modal.onWillDismiss();
        if (role === 'confirm') {
          const sortedSections = (data as SectionModel[]).map((section: SectionModel) => section.bkey ?? die('PageDetailStore.sortSections: sectionKey is mandatory.'));
          const page = store.page() ?? die('PageDetailStore.sortSections: page is mandatory.');
          page.sections = sortedSections;
          store.pageService.update(page, store.currentUser());
          store.pageResource.reload();
        }
      },
      /**
       * Add a new section to the page.
       */
      async addSection(): Promise<void> {
        const page = structuredClone(store.page() ?? die('PageDetailStore.addSection: page is mandatory.'));
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
          const section = createSection(data, store.tenantId());
          const sectionKey = await store.sectionService.create(section);
          if (sectionKey) {
            page.sections.push(sectionKey);
            store.pageService.update(page, store.currentUser());
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
        const page = store.page() ?? die('PageDetailStore.selectSection: page is mandatory.');
        const modal = await store.modalController.create({
          component: SectionSelectModalComponent,
          cssClass: 'full-modal'
        });
        modal.present();
        const { data, role } = await modal.onWillDismiss();
        if (role === 'confirm') { // data = selected sectionKey
          page.sections.push(data);
          store.pageService.update(page, store.currentUser());
          store.pageResource.reload();
        }
      },

      async export(type: string): Promise<void> {
        console.log(`PageDetailStore.export(${type}) is not yet implemented.`);
      },

      async print(): Promise<void> {
        store.page() ?? die('PageDetailStore.print: page is mandatory.');
        window.print();
      }
    }
  }),
);
