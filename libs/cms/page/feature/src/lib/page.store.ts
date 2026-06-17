import { computed, inject, Injectable } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Router } from '@angular/router';
import { combineLatest, firstValueFrom, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { AppStore, withErrorState } from '@bk2/shared-feature';
import { AppConfig, CategoryItemModel, CategoryListModel, PageModel, SectionModel } from '@bk2/shared-models';
import { chipMatches, debugItemLoaded, debugListLoaded, debugMessage, die, nameMatches, getImgixUrlWithAutoParams, debugData, getTodayStr, DateFormat } from '@bk2/shared-util-core';
import { bkPrompt, confirm, downloadTextFile, error, exportCsv, getExportFileName, navigateByUrl } from '@bk2/shared-util-angular';
import { I18nService } from '@bk2/shared-i18n';

import { PageService } from '@bk2/cms-page-data-access';
import { SectionSelectModal } from '@bk2/cms-section-feature';
import { SectionService } from '@bk2/cms-section-data-access';
import { isPage, PAGE_I18N_KEYS } from '@bk2/cms-page-util';

import { DocGenerationService } from '@bk2/pdf-template-data-access';
import { PagePrintService } from './page-print.service';
import { PageEditModal } from './page-edit.modal';
import { PageSortModal } from './page-sort.modal';

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
  withErrorState(),
  withProps(() => ({
    appStore: inject(AppStore),
    pageService: inject(PageService),
    sectionService: inject(SectionService),
    modalController: inject(ModalController),
    alertController: inject(AlertController),
    toastController: inject(ToastController),
    docGenerationService: inject(DocGenerationService),
    pagePrintService: inject(PagePrintService),
    router: inject(Router),
    i18nService: inject(I18nService)
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
    i18n: store.i18nService.translateAll(PAGE_I18N_KEYS),
  })),
  withProps((store) => ({
    pagesResource: rxResource({
      params: () => ({
        currentUser: store.currentUser()
      }),
      stream: ({params}) => {
        return store.pageService.list().pipe(
          debugListLoaded<PageModel>('PageStore.pages', params.currentUser),
          catchError(error => {
            debugData('PageStore.pagesResource: stream error', error, params.currentUser);
            store.setError(store.i18n.error_load());
            return of([] as PageModel[]);
          })
        );
      }
    }),
    pageResource: rxResource({
      params: () => ({
        pageId: store.pageId(),
        currentUser: store.currentUser()
      }),
      stream: ({ params }) => {
        if (!params.pageId || params.pageId.length === 0) {
          return of({ page: undefined, sections: [] });
        }
        return store.pageService.read(params.pageId).pipe(
          debugItemLoaded<PageModel>(`PageStore.pageResource (page only)`, params.currentUser),
          switchMap(page => {
            if (!page || !page.sections || page.sections.length === 0) {
              debugData('PageStore.pageResource: No sections to load', { page: page?.bkey, sectionCount: page?.sections?.length }, params.currentUser);
              return of({ page, sections: [] as SectionModel[] });
            }
            debugData('PageStore.pageResource: Loading sections', { page: page.bkey, sectionIds: page.sections }, params.currentUser);
            // Load all sections for this page - use combineLatest to get live updates
            const sectionObservables = page.sections.map(sectionId => 
              store.sectionService.read(sectionId.replace('@TID@', store.tenantId()))
            );
            return combineLatest(sectionObservables).pipe(
              map(sections => {
                const filteredSections = sections.filter(s => s !== undefined) as SectionModel[];
                debugData('PageStore.pageResource: Sections loaded', { 
                  page: page.bkey, 
                  requestedCount: page.sections.length,
                  loadedCount: filteredSections.length,
                  sectionIds: filteredSections.map(s => s.bkey)
                }, params.currentUser);
                return {
                  page,
                  sections: filteredSections
                };
              })
            );
          }),
          catchError(error => {
            debugData('PageStore.pageResource: stream error', error, params.currentUser);
            store.setError(store.i18n.error_load());
            return of({ page: undefined, sections: [] as SectionModel[] });
          })
        );
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
      page: computed(() => state.pageResource.value()?.page ?? undefined),
      meta: computed(() => state.pageResource.value()?.page?.meta),
      sections: computed(() => state.pageResource.value()?.page?.sections ?? []),
      pageSections: computed(() => state.pageResource.value()?.sections ?? []),
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
      
      reloadCurrentPage() {
        // Force reload of the current page to get fresh data
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
        // No force-reload needed: pageResource uses a live Firestore stream that updates
        // automatically. Calling reload() when pageId hasn't changed would momentarily set
        // isLoading=true, show a spinner, and destroy+recreate child components like MatrixChat.
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

      getImgixUrl(url: string | undefined): string | undefined {
        if (!url) return undefined;
        const imgixBaseUrl = store.imgixBaseUrl();
        return `${imgixBaseUrl}/${getImgixUrlWithAutoParams(url)}`;
      },

      /******************************** actions ... ******************************************* */
      /******************************** ... page-related  ******************************************* */
      /**
       * Add a new page with the given name and open the edit modal for this page.
       * @param readOnly 
       * @returns 
       */
      async add(readOnly = true): Promise<void> {
        if (readOnly) return;
        const pageName = await bkPrompt(store.alertController, store.i18n.add_label(), store.i18n.add_placeholder(), store.i18n.ok(), store.i18n.cancel());
        if (pageName) {
          const page = new PageModel(store.tenantId());
          page.name = pageName;
          await this.edit(page, readOnly);
        }
      },

      /**
       * Edit a page by opening the edit modal. If the page has no key, it will be created after saving the modal. Otherwise, the existing page will be updated.
       * @param page 
       * @param readOnly 
       */
      async edit(page: PageModel, readOnly = true): Promise<void> {
        const modal = await store.modalController.create({
          component: PageEditModal,
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
            store.clearError();
            try {
              page.bkey === '' ?
                await store.pageService.create(data, store.currentUser()) :
                await store.pageService.update(data, store.currentUser());
              this.reload();
            } catch (error) {
              store.setError(store.i18n.error_save());
              throw error;
            }
          }
        }
      },

      /**
       * Deletes the given page after asking for confirmation.
       * @param page 
       * @param readOnly 
       * @returns 
       */
      async delete(page: PageModel, readOnly = true): Promise<void> {
        if (readOnly) return;
        const result = await confirm(store.alertController, store.i18n.delete_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
        if (result === true) {
          store.clearError();
          try {
            await store.pageService.delete(page, store.currentUser());
            this.reload();
          } catch (error) {
            store.setError(store.i18n.error_delete());
            throw error;
          }
        }
      },

      /******************************** ... section-related ******************************************* */
      /**
       * Deletes the section with sectionKey from the current Page.
       * @param sectionKey the id of the section to remove.
       */
      async removeSectionById(sectionKey: string): Promise<void> {
        const page = store.page() ?? die('PageStore.deleteSectionFromPage: page is mandatory.');
        page.sections.splice(page.sections.indexOf(sectionKey), 1);
        store.clearError();
        try {
          await store.pageService.update(page, store.currentUser());
          this.reloadCurrentPage();
        } catch (error) {
          store.setError(store.i18n.error_save());
          throw error;
        }
      },

     /**
       * Sort the sections of the page.
       * @returns 
       */
      async sortSections(): Promise<void> {
        if (store.sections().length === 0) {
          await confirm(store.alertController, store.i18n.sort_noSections(), store.i18n.ok(), store.i18n.cancel() );
          return;
        }
        if (store.sections().length === 1) {
          await confirm(store.alertController, store.i18n.sort_onlyOneSection(), store.i18n.ok(), store.i18n.cancel());
          return;
        }
        // convert the list of sectionKeys to a list of SectionModels
        const sections = await firstValueFrom(store.sectionService.searchByKeys(store.sections()));
        const modal = await store.modalController.create({
          component: PageSortModal,
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
          store.clearError();
          try {
            await store.pageService.update(page, store.currentUser());
            this.reloadCurrentPage();
          } catch (error) {
            store.setError(store.i18n.error_save());
            throw error;
          }
        }
      },

      /**
       * Add a new section to the page.
       */
      async addSectionById(sectionId: string): Promise<void> {
        const page = store.page();
        if (!page) return;
        page.sections.unshift(sectionId);
        store.clearError();
        try {
          await store.pageService.update(page, store.currentUser());
          this.reloadCurrentPage();
        } catch (error) {
          store.setError(store.i18n.error_save());
          throw error;
        }
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
          component: SectionSelectModal,
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
          await navigateByUrl(store.router, `/private/${page.bkey}/c-contentpage`, { readOnly });
      },

      async navigateByUrl(url: string): Promise<void> {
        await navigateByUrl(store.router, url);
      },

      /**
       * Export the currently-filtered pages. `type === 'csv'` downloads a CSV
       * (bkey, name, type, state, tags); any other value downloads pretty JSON.
       */
      async export(type: string): Promise<void> {
        const pages = store.filteredPages() ?? [];
        if (type === 'csv') {
          const rows = [
            ['bkey', 'name', 'type', 'state', 'tags'],
            ...pages.map(p => [p.bkey ?? '', p.name ?? '', p.type ?? '', p.state ?? '', p.tags ?? ''])
          ];
          await exportCsv(rows, getExportFileName('pages', 'csv'));
        } else {
          await downloadTextFile(JSON.stringify(pages, null, 2), getExportFileName('pages', 'json'));
        }
      },

      /**
       * Generate a PDF of the current page via the page-print template, using
       * client-side DOM capture of the rendered sections. `root` is the page
       * content element holding the rendered <bk-section-dispatcher> hosts;
       * `visibleSections` is exactly the list the page component rendered (already
       * filtered for accordion-nesting + state), so it lines up 1:1 with the
       * top-level hosts. On any failure, falls back to the native print dialog.
       */
      async print(root?: HTMLElement, visibleSections?: SectionModel[]): Promise<void> {
        const page = store.page() ?? die('PageStore.print: page is mandatory.');
        const sections = visibleSections ?? [];

        // Nothing printable on this page: inform the user and stop (no PDF, no
        // browser dialog). The native-print fallback is reserved for genuine
        // generation failures and the no-container case below.
        if (sections.length === 0) {
          error(store.toastController, store.i18n.print_empty());
          return;
        }
        // No rendered container handed in (should not happen in practice):
        // degrade gracefully to the browser's own print.
        if (!root) {
          console.error('PageStore.print: no renderer container available.');
          window.print();
          return;
        }

        const appConfig = store.appStore.appConfig();
        const logoUrl = `${store.appStore.services.imgixBaseUrl()}/${getImgixUrlWithAutoParams(appConfig.logoUrl)}`;
        const sourceUrl = typeof window !== 'undefined' ? window.location.href : '';

        const payload = store.pagePrintService.buildPayload(root, sections, {
          pageTitle: page.title?.length ? page.title : page.name,
          pageSubtitle: '',
          orgName: appConfig.appName,
          logoUrl,
          sourceUrl,
          printedDate: getTodayStr(DateFormat.ViewDate),
        });

        // Generation runs on a Cloud Function and takes a few seconds — show a
        // non-blocking hint so the click feels acknowledged.
        const generating = await store.toastController.create({
          message: store.i18n.print_generating(),
          duration: 4000,
          position: 'bottom',
        });
        await generating.present();

        try {
          const result = await store.docGenerationService.generate({
            templateId: 'page-print',
            payload: payload as unknown as Record<string, unknown>,
            options: {
              outputFormat: 'pdf',
              storageMode: 'ephemeral',
              filename: `${page.name || 'page'}.pdf`,
            },
          });
          await generating.dismiss();
          if (typeof window !== 'undefined') window.open(result.url, '_blank');
        } catch (e) {
          await generating.dismiss();
          debugMessage(`PageStore.print: generation failed: ${e}`, store.currentUser());
          error(store.toastController, store.i18n.print_error());
          window.print();
        }
      },

      getTitleLabel(readOnly: boolean, key?: string): string {
        if (readOnly) {
          return store.i18n.view();
        }
        if (key && key.length > 0) {
          return store.i18n.edit();
        } else {
          return store.i18n.create();
        }
      },
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