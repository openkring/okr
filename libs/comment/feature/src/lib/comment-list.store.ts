import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { AppStore } from '@bk2/shared-feature';
import { debugListLoaded } from '@bk2/shared-util-core';

import { CommentService } from '@bk2/comment-data-access';

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
      params: () => ({
        collectionName: store.collectionName(),
        parentKey: store.parentKey(),
      }),  
      stream: ({params}) => {
        if (!params.collectionName || params.collectionName.length === 0 || !params.parentKey || params.parentKey.length === 0) return of([]);
        const comments$ = store.commentService.list(params.collectionName, params.parentKey);
        debugListLoaded('CommentListStore.comment$', comments$, store.appStore.currentUser());   
        return comments$;
      }
    }),
  })),

  withComputed((state) => {
    return {
      comments: computed(() => state.commentsResource.value()),
      currentUser: computed(() => state.appStore.currentUser()),
      tenantId: computed(() => state.appStore.env.tenantId),
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
