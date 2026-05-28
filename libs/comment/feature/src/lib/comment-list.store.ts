import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { debugListLoaded } from '@bk2/shared-util-core';

import { CommentService } from '@bk2/comment-data-access';
import { AlertService } from '@bk2/shared-util-angular';
import { PFX } from './scope';

const COMMENT_LIST_I18N_KEYS = {
  comments:             PFX + 'comments',
  empty:                PFX + 'empty',
  add_title:            PFX + 'add.title',
  add_placeholder:      PFX + 'add.placeholder',
} satisfies Record<string, string>;

export type CommentListI18n = { [K in keyof typeof COMMENT_LIST_I18N_KEYS]: Signal<string> };

export type CommentListState = {
  parentKey: string; // modelType.key of the parent model
};

export const initialState: CommentListState = {
  parentKey: '',
};

export const CommentListStore = signalStore(
  withState(initialState),
  withProps(() => {
    const i18nService = inject(I18nService);
    return {
      commentService: inject(CommentService),
      alertService: inject(AlertService),
      appStore: inject(AppStore),
      i18n: i18nService.translateAll(COMMENT_LIST_I18N_KEYS),
    };
  }),
  withProps((store) => ({
    commentsResource: rxResource({
      params: () => ({
        parentKey: store.parentKey(),
        currentUser: store.appStore.currentUser()
      }),  
      stream: ({params}) => {
        return store.commentService.list(params.parentKey).pipe(
          debugListLoaded('CommentListStore.comment$', params.currentUser)
        );
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
          comment = await store.alertService.bkPrompt(store.i18n.add_title(), store.i18n.add_placeholder());
        }
        if (!comment || comment.length === 0) return;
        await store.commentService.create(store.parentKey(), comment, store.currentUser());
        store.commentsResource.reload();
      }
    };
  })
);
