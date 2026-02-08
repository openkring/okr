import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';
import { ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { SectionModel } from '@bk2/shared-models';

export type MessagesState = {
  maxItems: number | undefined; // max items to show, undefined means all
};

export const initialState: MessagesState = {
  maxItems: undefined,
};

export const MessagesStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    modalController: inject(ModalController),
  })),
  withProps((store) => ({
    messagesForCurrentUserResource: rxResource({
      params: () => ({
        personKey: store.appStore.currentUser()?.personKey,
        maxItems: store.maxItems()
      }),
      stream: ({params}) => {
        const personKey = params.personKey;
        if (!personKey) return of([] as SectionModel[]);
        return of([] as SectionModel[]); // tbd: implement message fetching logic
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
      messages: computed(() => state.messagesForCurrentUserResource.value() ?? []),
      isLoading: computed(() => state.messagesForCurrentUserResource.isLoading()),
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
        store.messagesForCurrentUserResource.reload();
      },

      edit(message: SectionModel, readOnly = true): void {
        console.log('MessagesStore: edit is not yet implemented.', message, readOnly);
      }
    }
  })
);

