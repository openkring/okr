import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';

import { of } from 'rxjs';
import { AppStore } from '@bk2/shared/feature';
import { debugItemLoaded } from '@bk2/shared/util-core';
import { AppNavigationService } from '@bk2/shared/util-angular';
import { UserService } from '@bk2/user/data-access';
import { ModelType, UserModel } from '@bk2/shared/models';

export type UserEditState = {
  userKey: string | undefined;
};

export const initialState: UserEditState = {
  userKey: undefined,
};

export const UserEditStore = signalStore(
  withState(initialState),
  withProps(() => ({
    userService: inject(UserService),
    appNavigationService: inject(AppNavigationService),
    appStore: inject(AppStore),
  })),

  withProps((store) => ({
    userResource: rxResource({
      params: () => ({
        userKey: store.userKey()
      }),
      stream: ({params}) => {
        if (!params.userKey) return of(undefined);
        const _user$ = store.userService.read(params.userKey);
        debugItemLoaded('UserEditStore.user', _user$, store.appStore.currentUser());
        return _user$;
      }
    })
  })),

  withComputed((state) => {
    return {
      currentUser: computed(() => state.appStore.currentUser()),
      user: computed(() => state.userResource.value() ?? new UserModel(state.appStore.tenantId())),
      isLoading: computed(() => state.userResource.isLoading()),
    };
  }),

  withMethods((store) => {
    return {
      
      /************************************ SETTERS ************************************* */
      setUserKey(userKey: string): void {
        patchState(store, { userKey });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags(ModelType.User);
      },

      /************************************ ACTIONS ************************************* */
      async save(user: UserModel): Promise<void> {
        await (!user.bkey ? 
          store.userService.create(user, store.currentUser()) : 
          store.userService.update(user, store.currentUser()));
        store.appNavigationService.back();
      }
    }
  }),
);

