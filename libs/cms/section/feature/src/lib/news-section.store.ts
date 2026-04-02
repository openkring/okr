import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { combineLatest, of, switchMap } from 'rxjs';
import { map } from 'rxjs/operators';
import { ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { ArticleSection, PageCollection, PageModel, SectionCollection, SectionModel } from '@bk2/shared-models';

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
    modalController: inject(ModalController),
  })),
  withProps((store) => ({
    newsResource: rxResource({
      params: () => ({
        blogPageKey: store.blogPageKey(),
        maxItems: store.maxItems(),
        tenantId: store.appStore.env.tenantId,
      }),
      stream: ({ params }) => {
        const { blogPageKey, maxItems } = params;
        if (!blogPageKey) return of([] as ArticleSection[]);

        // 1. Load the blog page to get its ordered sections list
        return store.appStore.firestoreService.readObject<PageModel>(PageCollection, blogPageKey).pipe(
          switchMap(page => {
            if (!page?.sections?.length) return of([] as ArticleSection[]);

            // 2. Load each section document in parallel
            const { tenantId } = params;
            const sectionObs = page.sections.map(sectionKey =>
              store.appStore.firestoreService.readModel<SectionModel>(SectionCollection, sectionKey.replace('@TID@', tenantId))
            );
            return combineLatest(sectionObs);
          }),
          map(sections => {
            // 3. Keep only published article sections
            const articles = sections.filter(
              (s): s is ArticleSection => !!s && s.type === 'article' && !s.isArchived && s.state === 'published'
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
