import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { of } from 'rxjs';

import { ENV } from '@bk2/shared/config';
import { ModelType } from '@bk2/shared/models';
import { AppNavigationService, debugItemLoaded } from '@bk2/shared/util';

import { AppStore } from '@bk2/auth/feature';
import { convertFormToGroup, GroupFormModel } from '@bk2/group/util';
import { GroupService } from '@bk2/group/data';

export type GroupEditState = {
  groupKey: string | undefined;
  selectedSegment: string | undefined;
};

export const initialState: GroupEditState = {
  groupKey: undefined,
  selectedSegment: 'content'
};

export const GroupEditStore = signalStore(
  withState(initialState),
  withProps(() => ({
    groupService: inject(GroupService),
    appNavigationService: inject(AppNavigationService),
    appStore: inject(AppStore),
    env: inject(ENV),
    modalController: inject(ModalController),    
  })),

  withProps((store) => ({
    groupResource: rxResource({
      request: () => ({
        groupKey: store.groupKey()
      }),
      loader: ({request}) => {
        if (!request.groupKey) return of(undefined);
        const group$ = store.groupService.read(request.groupKey);
        debugItemLoaded('GroupEditStore.group', group$, store.appStore.currentUser());
        return group$;
      }
    }),
  })),
  withComputed((state) => {
    return {
      group: computed(() => state.groupResource.value()),
      currentUser: computed(() => state.appStore.currentUser()),
      defaultResource : computed(() => state.appStore.defaultResource()),
      tenantId: computed(() => state.env.owner.tenantId),
      isLoading: computed(() => state.groupResource.isLoading()),
      segment: computed(() => state.selectedSegment()),
    };
  }),

  withMethods((store) => {
    return {
      /************************************ SETTERS ************************************* */      
      setGroupKey(groupKey: string): void {
        patchState(store, { groupKey });
      },

      setSelectedSegment(selectedSegment: string): void {
        patchState(store, { selectedSegment });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags(ModelType.Group);
      },
      
      /************************************ ACTIONS ************************************* */

      async save(vm: GroupFormModel): Promise<void> {
        const _group = convertFormToGroup(store.group(), vm, store.env.owner.tenantId);
        await (!_group.bkey ? store.groupService.create(_group, store.currentUser()) : store.groupService.update(_group));
        store.appNavigationService.logLinkHistory();
        store.appNavigationService.back();
      }
    }
  }),
);
