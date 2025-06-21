import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';

import { AppNavigationService, chipMatches, getSystemQuery, nameMatches, navigateByUrl, searchData } from '@bk2/shared/util';
import { UserService } from '@bk2/user/data-access';
import { ModelType, UserCollection, UserModel } from '@bk2/shared/models';
import { Router } from '@angular/router';
import { AppStore } from '@bk2/shared/feature';

export type UserListState = {
  searchTerm: string;
  selectedTag: string;
};

export const initialState: UserListState = {
  searchTerm: '',
  selectedTag: '',
};

export const UserListStore = signalStore(
  withState(initialState),
  withProps(() => ({
    userService: inject(UserService),
    appNavigationService: inject(AppNavigationService),
    router: inject(Router),
    appStore: inject(AppStore),
  })),
  withProps((store) => ({
    userResource: rxResource({
      loader: () => {
        return searchData<UserModel>(store.appStore.firestore, UserCollection, getSystemQuery(store.appStore.tenantId()), 'loginEmail', 'asc');
      }
    })
  })),

  withComputed((state) => {
    return {
      users: computed(() => state.userResource.value()),
      usersCount: computed(() => state.userResource.value()?.length ?? 0),
      currentUser: computed(() => state.appStore.currentUser()),
      filteredUsers: computed(() => 
        state.userResource.value()?.filter((user: UserModel) => 
          nameMatches(user.index, state.searchTerm()) &&
          chipMatches(user.tags, state.selectedTag()))
      ),
      isLoading: computed(() => state.userResource.isLoading()), 
    };
  }),

  withMethods((store) => {
    return {
      reset() {
        patchState(store, initialState);
        store.userResource.reload();
      },
      
      /******************************** setters (filter) ******************************************* */
      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags(ModelType.User);
      },

      /******************************* actions *************************************** */
      async add(): Promise<void> {
        // not sure whether we should implement this
        // AOC function ? only depending on an existing person and/or firebase account ?
        console.log('UserListStore.add() is not yet implemented.');
      },

      async edit(user: UserModel): Promise<void> {
        store.appNavigationService.pushLink('/user/all' );
        await navigateByUrl(store.router, `/user/${user.bkey}`);
        store.userResource.reload();
      },

      async delete(user: UserModel): Promise<void> {
        await store.userService.delete(user);
        this.reset();
      },

      async export(type: string): Promise<void> {
        console.log(`UserListStore.export(${type}) is not yet implemented.`);
      }
    }
  }),
);
