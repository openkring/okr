import { computed, inject, Injectable } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Router } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';

import { AppStore } from '@bk2/shared-feature';
import { AppConfig, CategoryItemModel, CategoryListModel, PageModel, SectionModel } from '@bk2/shared-models';
import { chipMatches, debugItemLoaded, debugListLoaded, debugMessage, die, nameMatches, getImgixUrlWithAutoParams } from '@bk2/shared-util-core';
import { bkPrompt, confirm, navigateByUrl } from '@bk2/shared-util-angular';

import { PageService } from '@bk2/cms-page-data-access';
import { SectionSelectModalComponent } from '@bk2/cms-section-feature';
import { SectionService } from '@bk2/cms-section-data-access';
import { isPage } from '@bk2/cms-page-util';

import { PageEditModalComponent } from './page-edit.modal';
import { PageSortModalComponent } from './page-sort.modal';

export type PageState = {
  pageId: string;
  sectionId: string;

  // filters
  searchTerm: string;
  selectedTag: string;
  selectedType: string;
  selectedState: string;
};

export const initialState: PageState = {
  pageId: '',
  sectionId: '',

  // filters
  searchTerm: '',
  selectedTag: '',
  selectedType: 'all',
  selectedState: 'all'
};

export const _PageStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    pageService: inject(PageService),
    sectionService: inject(SectionService),
    modalController: inject(ModalController),
    alertController: inject(AlertController),
    router: inject(Router) 
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
    pagesResource: rxResource({
      stream: () => {
        const pages$ = store.pageService.list();
        debugListLoaded<PageModel>('PageStore.pages', pages$, store.currentUser());
        return pages$;
      }
    }),
    pageResource: rxResource({
      params: () => ({
        pageId: store.pageId()
      }),
      stream: ({ params }) => {
        if (!params.pageId || params.pageId.length === 0) {
          return of(undefined);
        }
        const page$ = store.pageService.read(params.pageId);
        debugItemLoaded<PageModel>(`PageStore.pageResource`, page$, store.currentUser());
        return page$;
      }
    })
  })),

  withComputed((state) => {
    return {
      // pages
      pages: computed(() => state.pagesResource.value()),
      pagesCount: computed(() => state.pagesResource.value()?.length ?? 0), 
      filteredPages: computed(() => 
        state.pagesResource.value()?.filter((page: PageModel) => 
          nameMatches(page.index, state.searchTerm()) &&
          nameMatches(page.type, state.selectedType()) &&
          nameMatches(page.state, state.selectedState()) &&
          chipMatches(page.tags, state.selectedTag())
      )),
      // page
      page: computed(() => state.pageResource.value() ?? undefined),
      meta: computed(() => state.pageResource.value()?.meta),
      sections: computed(() => state.pageResource.value()?.sections ?? []),
      isEmptyPage: computed(() => state.pageResource.value()?.sections === undefined || state.pageResource.value()?.sections.length === 0),
      sectionTypes: computed(() => state.appStore.getCategory('section_type')),

      isLoading: computed(() => state.pagesResource.isLoading() || state.pageResource.isLoading()),
    };
  }),

  withMethods((store) => {
    return {
      reset() {
        patchState(store, { ...initialState });
      },

      reload() {
        store.pagesResource.reload();
        store.pageResource.reload();
      },
      /******************************** setters (filter) ******************************************* */
      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      setSelectedType(selectedType: string) {
        patchState(store, { selectedType });
      },

      setSelectedState(selectedState: string) {
        patchState(store, { selectedState });
      },

      /**
       * Updates the page id which triggers the loading of the page.
       * @param pageId the key of the page
       */
      setPageId(pageId: string) {
        debugMessage(`PageStore.setPageId(${pageId})`, store.currentUser());
        patchState(store, { pageId });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags('page');
      },

      getTypes(): CategoryListModel {
        return store.appStore.getCategory('page_type');
      },

      getStates(): CategoryListModel {
        return store.appStore.getCategory('content_state');
      },

      getRoles(): CategoryListModel {
        return store.appStore.getCategory('role');
      },

      getConfigAttribute(key: keyof AppConfig): string | number | boolean {
        return store.appStore.appConfig()[key];
      },

      getImgixUrl(key: keyof AppConfig): string {
        const url = store.appStore.appConfig()[key] + '';
        const imgixBaseUrl = store.imgixBaseUrl();
        return `${imgixBaseUrl}/${getImgixUrlWithAutoParams(url)}`;
      },

      /******************************** actions ... ******************************************* */
      /******************************** ... page-related  ******************************************* */
      async add(readOnly = true): Promise<void> {
        if (readOnly) return;
        const pageName = await bkPrompt(store.alertController, '@content.page.operation.add.label', '@content.page.field.name');
        if (pageName) {
          const page = new PageModel(store.tenantId());
          page.name = pageName;
          await this.edit(page, readOnly);
          this.reload();
        }
      },

      async edit(page: PageModel, readOnly = true): Promise<void> {
        const modal = await store.modalController.create({
          component: PageEditModalComponent,
          componentProps: {
            page,
            currentUser: store.currentUser(),
            tags: this.getTags(),
            roles: this.getStates(),
            types: this.getTypes(),
            states: this.getStates(),
            readOnly
          }
        });
        modal.present();
        const { data, role } = await modal.onWillDismiss();
        if (role === 'confirm' && data && !readOnly) {
          if (isPage(data, store.tenantId())) {
            page.bkey === '' ?
              await store.pageService.create(data, store.currentUser()) :
              await store.pageService.update(data, store.currentUser());
            this.reload();
          }
        }
      },

      async delete(page: PageModel, readOnly = true): Promise<void> {
        if (readOnly) return;
        await store.pageService.delete(page, store.currentUser());
        this.reload();
      },

      /******************************** ... section-related ******************************************* */
      /**
       * Deletes the section with sectionKey from the current Page.
       * @param sectionKey the id of the section to remove.
       */
      async removeSectionById(sectionKey: string): Promise<void> {
        const page = store.page() ?? die('PageStore.deleteSectionFromPage: page is mandatory.');
        page.sections.splice(page.sections.indexOf(sectionKey), 1);
        await store.pageService.update(page, store.currentUser());
        this.reload();
      },

     /**
       * Sort the sections of the page.
       * @returns 
       */
      async sortSections(): Promise<void> {
        if (store.sections().length === 0) {
          await confirm(store.alertController, '@content.page.operation.sort.noSections');
          return;
        }
        if (store.sections().length === 1) {
          await confirm(store.alertController, '@content.page.operation.sort.onlyOneSection');
          return;
        }
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
        if (role === 'confirm' && data) { // data = sorted list of SectionModels
          const sortedSections = (data as SectionModel[]).map((section: SectionModel) => section.bkey ?? die('PageStore.sortSections: sectionKey is mandatory.'));
          const page = store.page() ?? die('PageStore.sortSections: page is mandatory.');
          page.sections = sortedSections;
          await store.pageService.update(page, store.currentUser());
          this.reload();
        }
      },

      /**
       * Add a new section to the page.
       */
      async addSectionById(sectionId: string): Promise<void> {
        const page = store.page();
        if (!page) return;
        page.sections.push(sectionId);
        store.pageService.update(page, store.currentUser());
        this.reload();
      },

      /**
       * Select an existing section and add it to the page.
       * @param page the page to add the section to
       * @returns 
       */
      async selectSection(): Promise<void> {
        const page = store.page();
        if (!page) return;
        const modal = await store.modalController.create({
          component: SectionSelectModalComponent,
          cssClass: 'full-modal'
        });
        modal.present();
        const { data, role } = await modal.onWillDismiss();
        if (role === 'confirm' && data) { // data = selected sectionKey
          this.addSectionById(data as string);
        }
      },

      /******************************** external  ******************************************* */
      async show(page: PageModel, readOnly = true): Promise<void> {
        if (!page.bkey) return;
        //  store.appStore.appNavigationService.pushLink('page/all/c-' + store.tenantId() + '-pages');
          await navigateByUrl(store.router, `/private/${page.bkey}/c-${store.tenantId()}-contentpage`, { readOnly });
      },

      async navigateByUrl(url: string): Promise<void> {
        await navigateByUrl(store.router, url);
      },

      async export(type: string): Promise<void> {
        console.log(`PageStore.export(${type}) is not yet implemented.`);
      },

      async print(): Promise<void> {
        store.page() ?? die('PageStore.print: page is mandatory.');
        window.print();
      }
    }
  }),
);

@Injectable({
  providedIn: 'root'
})
export class PageStore extends _PageStore {
  constructor() {
    super();
  }
}