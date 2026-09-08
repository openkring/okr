import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of, switchMap } from 'rxjs';
import { map } from 'rxjs/operators';
import { ModalController } from '@ionic/angular/standalone';

import { SectionService } from '@okr/cms-section-data-access';
import { AppStore } from '@okr/shared-feature';
import { ArticleSection, PageCollection, PageModel, SectionModel } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';
import { belongsToTenant, replaceSubstring } from '@okr/shared-util-core';
import { SECTION_I18N_KEYS } from '@okr/cms-section-util';

export type NewsState = {
  blogPageKey: string | undefined;
  maxItems: number | undefined; // max items to show, undefined means all
};

const initialNewsState: NewsState = {
  blogPageKey: undefined,
  maxItems: undefined,
};

export const NewsStore = signalStore(
  withState(initialNewsState),
  withProps(() => ({
    appStore: inject(AppStore),
    sectionService: inject(SectionService),
    modalController: inject(ModalController),
    i18n: inject(I18nService).translateAll(SECTION_I18N_KEYS)
  })),
  withProps((store) => ({
    newsResource: rxResource({
      params: () => ({
        blogPageKey: store.blogPageKey(),
        maxItems: store.maxItems(),
        tenantId: store.appStore.env.tenantId,
      }),
      stream: ({ params }) => {
        const { blogPageKey, maxItems, tenantId } = params;
        if (!blogPageKey) return of([] as ArticleSection[]);

        // 1. Load the blog page to get its ordered sections list. The key may carry the
        //    @TID@ placeholder (`news_@TID@`) — the dashboard's `d-news` section doc is
        //    SHARED across tenants, so an unresolved literal key would hand every tenant
        //    the same (foreign) blog page.
        const pageKey = replaceSubstring(blogPageKey, '@TID@', tenantId);
        return store.appStore.firestoreService.readObject<PageModel>(PageCollection, pageKey).pipe(
          switchMap(page => {
            // A read by document id bypasses the `tenants array-contains` filter, and
            // `pages` is world-readable in firestore.rules — so the tenant check has to
            // happen here or a foreign tenant's blog leaks into this app.
            if (!belongsToTenant(page, tenantId)) return of([] as (SectionModel | undefined)[]);
            if (!page?.sections?.length) return of([] as (SectionModel | undefined)[]);

            // 2. Resolve the page's sections out of the tenant-scoped collection stream instead
            //    of opening one live document subscription per section. The old code did
            //    `page.sections.map(readModel)` + combineLatest, which on scs meant 23 permanent
            //    WebChannel document streams for a teaser that shows 5 items — 23 of the
            //    dashboard's 43 subscriptions, and the bulk of its Firestore main-thread time
            //    (spec 1.53). `list()` is already open on the dashboard (the census counts 16
            //    subscribers), so reusing it costs nothing and adds no subscription.
            //
            //    It is also the SAFER read: `list()` carries `tenants array-contains-any` in the
            //    query, so a foreign tenant's section can no longer be resolved at all — where a
            //    read by document id bypassed that filter and needed the client-side check below.
            return store.sectionService.list().pipe(
              map(all => {
                const byKey = new Map(all.map(sec => [sec.okey, sec]));
                // page.sections is a CURATED, ORDERED subset — not "all articles of the tenant"
                // (scs has >40 published article sections but lists 23 here). Keep its order.
                return page.sections.map(sectionKey => byKey.get(replaceSubstring(sectionKey, '@TID@', tenantId)));
              })
            );
          }),
          map(sections => {
            // 3. Keep only this tenant's published article sections. The tenant check is now
            //    redundant (the query filters it) but stays as a belt-and-braces guard.
            const articles = sections.filter(
              (s): s is ArticleSection =>
                !!s && s.type === 'article' && !s.isArchived && s.state === 'published' && belongsToTenant(s, tenantId)
            );
            return maxItems !== undefined ? articles.slice(0, maxItems) : articles;
          })
        );
      }
    })
  })),

  withComputed((state) => ({
    news: computed(() => state.newsResource.value() ?? []),
    isLoading: computed(() => state.newsResource.isLoading()),
    currentUser: computed(() => state.appStore.currentUser()),
    tenantId: computed(() => state.appStore.env.tenantId),
  })),

  withMethods((store) => ({
    setConfig(blogPageKey?: string, maxItems?: number): void {
      patchState(store, { blogPageKey, maxItems });
    },

    reload(): void {
      store.newsResource.reload();
    },

    edit(_newsItem: SectionModel, _readOnly = true): void {
      console.log('NewsStore: edit is not yet implemented.', _newsItem, _readOnly);
    }
  }))
);
