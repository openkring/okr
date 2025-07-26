import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';

import { AvatarInfo, ModelType } from '@bk2/shared/models';
import { createFullName, debugItemLoaded } from '@bk2/shared/util-core';
import { AppStore } from '@bk2/shared/feature';
import { AvatarService } from '@bk2/avatar/data-access';

export type TaskEditState = {
  author: AvatarInfo | undefined;
  assignee: AvatarInfo | undefined;
  scope: AvatarInfo | undefined;
};

export const initialState: TaskEditState = {
  author: undefined,
  assignee: undefined,
  scope: undefined,
};

export const TaskEditStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    avatarService: inject(AvatarService)
  })),
  withProps((store) => ({
    authorResource: rxResource({
      params: () => ({
        author: store.author(),
        currentUser: store.appStore.currentUser()
      }),  
      stream: ({params}) => {
        const _key = params.author?.key + '.' + params.author?.modelType;
        const author$ = store.avatarService.getAvatarImgixUrl(_key);
        debugItemLoaded<string>(`authorUrl `, author$, params.currentUser);
        return author$;
      }
    }),

    assigneeResource: rxResource({
      params: () => ({
        assignee: store.assignee(),
        currentUser: store.appStore.currentUser()
      }),  
      stream: ({params}) => {
        const _key = params.assignee?.key + '.' + params.assignee?.modelType;
        const assignee$ = store.avatarService.getAvatarImgixUrl(_key);
        debugItemLoaded<string>(`assigneeUrl `, assignee$, params.currentUser);
        return assignee$;
      }
    }),

    scopeResource: rxResource({
      params: () => ({
        scope: store.scope(),
        currentUser: store.appStore.currentUser()
      }),  
      stream: ({params}) => {
        const _key = params.scope?.key + '.' + params.scope?.modelType;
        const scope$ = store.avatarService.getAvatarImgixUrl(_key);
        debugItemLoaded<string>(`scopeUrl `, scope$, params.currentUser);
        return scope$;
      }
    })
  })),

  withComputed((state) => {
    return {
      authorUrl: computed(() => state.authorResource.value() ?? ''),
      authorName: computed(() => createFullName(state.author()?.name1 ?? '', state.author()?.name2 ?? '')),
      assigneeUrl: computed(() => state.assigneeResource.value() ?? ''),
      assigneeName: computed(() => createFullName(state.assignee()?.name1 ?? '', state.assignee()?.name2 ?? '')),
      scopeUrl: computed(() => state.scopeResource.value() ?? ''),
      scopeName: computed(() => createFullName(state.scope()?.name1 ?? '', state.scope()?.name2 ?? '')),
      isLoading: computed(() => state.authorResource.isLoading() || state.assigneeResource.isLoading() || state.scopeResource.isLoading()),

      tags: computed(() => state.appStore.getTags(ModelType.Task)),
      tenantId: computed(() => state.appStore.tenantId()),
      currentUser: computed(() => state.appStore.currentUser()),
    };
  }),

  withMethods((store) => {
    return {
      /******************************** setters ******************************************* */
      setAuthor(author: AvatarInfo | undefined): void {
        patchState(store, { author });
      },
      setAssignee(assignee: AvatarInfo | undefined): void {
        patchState(store, { assignee });
      },
      setScope(scope: AvatarInfo | undefined): void {
        patchState(store, { scope });
      },
      /******************************** getters ******************************************* */

    };
  }),
);

