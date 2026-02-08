import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';
import { ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { SectionModel } from 'libs/shared/models/src/lib/section.model';

export type NewsState = {
  maxItems: number | undefined; // max items to show, undefined means all
};

export const initialState: NewsState = {
  maxItems: undefined,
};

export const NewsStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    modalController: inject(ModalController),
  })),
  withProps((store) => ({
    newsResource: rxResource({
      params: () => ({
        personKey: store.appStore.currentUser()?.personKey,
        maxItems: store.maxItems()
      }),
      stream: ({params}) => {
        const personKey = params.personKey;
        if (!personKey) return of([] as SectionModel[]);
        return of([] as SectionModel[]); // tbd: implement news fetching logic
 /*        const query = getSystemQuery(store.appStore.env.tenantId);
        query.push({ key: 'completionDate', operator: '==', value: '' }); // only get tasks that are not completed (completionDate is empty)  
        return store.appStore.firestoreService.searchData<TaskModel>(TaskCollection, query, 'dueDate', 'asc').pipe(
          map(tasks => {
            const filteredTasks = tasks.filter(task => task.assignee?.key === personKey || task.author?.key === personKey);
            // Limit results if maxItems is defined
            return params.maxItems !== undefined ? filteredTasks.slice(0, params.maxItems) : filteredTasks;
          })
        ); */
      }
    })
  })),

  withComputed((state) => {
    return {
      news: computed(() => state.newsResource.value() ?? []),
      isLoading: computed(() => state.newsResource.isLoading()),
      currentUser: computed(() => state.appStore.currentUser()),
      tenantId: computed(() => state.appStore.env.tenantId),
    }
  }),

  withMethods((store) => {
    return {

      setConfig(maxItems?: number): void {
        patchState(store, { maxItems });
      },

      reload(): void {
        store.newsResource.reload();
      },

      edit(newsItem: SectionModel, readOnly = true): void {
        console.log('NewsStore: edit is not yet implemented.', newsItem, readOnly);
      }
    }
  })
);

