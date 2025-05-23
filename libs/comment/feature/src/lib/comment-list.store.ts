import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';

import { debugListLoaded } from '@bk2/shared/util';
import { AppStore } from '@bk2/auth/feature';
import { of } from 'rxjs';
import { CommentService } from '@bk2/comment/data';

export type CommentListState = {
  collectionName: string;
  parentKey: string;
};

export const initialState: CommentListState = {
  collectionName: '',
  parentKey: '',
};

export const CommentListStore = signalStore(
  withState(initialState),
  withProps(() => ({
    commentService : inject(CommentService),
    appStore: inject(AppStore),
  })),
  withProps((store) => ({
    commentsResource: rxResource({
      request: () => ({
        collectionName: store.collectionName(),
        parentKey: store.parentKey(),
      }),  
      loader: ({request}) => {
        if (!request.collectionName || request.collectionName.length === 0 || !request.parentKey || request.parentKey.length === 0) return of([]);
        const _comments$ = store.commentService.list(request.collectionName, request.parentKey);
        debugListLoaded('CommentListStore.comment$', _comments$, store.appStore.currentUser());   
        return _comments$;
      }
    }),
  })),

  withComputed((state) => {
    return {
      comments: computed(() => state.commentsResource.value()),
      currentUser: computed(() => state.appStore.currentUser()),
      toastLength: computed(() => state.appStore.toastLength()),
      tenantId: computed(() => state.appStore.env.owner.tenantId),
      isLoading: computed(() => state.commentsResource.isLoading()),
    };
  }),

  withMethods((store) => {
    return {

      /******************************** setters (filter) ******************************************* */
      setCollection(collectionName: string, parentKey: string) {
        patchState(store, { collectionName, parentKey });
      },

      /******************************* actions *************************************** */
      async add(comment: string): Promise<void> {
        await store.commentService.create(store.collectionName(), store.parentKey(), comment);
        store.commentsResource.reload();
      }
    };
  })
);
