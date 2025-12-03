import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';
import { AlertController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { debugListLoaded } from '@bk2/shared-util-core';

import { CommentService } from '@bk2/comment-data-access';
import { bkPrompt } from '@bk2/shared-util-angular';

export type CommentListState = {
  parentKey: string; // modelType.key of the parent model
};

export const initialState: CommentListState = {
  parentKey: '',
};

export const CommentListStore = signalStore(
  withState(initialState),
  withProps(() => ({
    commentService : inject(CommentService),
    alertController: inject(AlertController),
    appStore: inject(AppStore),
  })),
  withProps((store) => ({
    commentsResource: rxResource({
      params: () => ({
        parentKey: store.parentKey(),
      }),  
      stream: ({params}) => {
        if (!params.parentKey || params.parentKey.length === 0) return of([]);
        const comments$ = store.commentService.list(params.parentKey);
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
      setParentKey(parentKey: string) {
        patchState(store, { parentKey });
      },

      /******************************* actions *************************************** */
      async add(comment?: string): Promise<void> {
        if (!comment || comment.length === 0) {
          comment = await bkPrompt(store.alertController, '@comment.operation.add.title', '@comment.operation.add.placeholder');
        }
        if (!comment || comment.length === 0) return;
        await store.commentService.create(store.parentKey(), comment, store.currentUser());
        store.commentsResource.reload();
      }
    };
  })
);
