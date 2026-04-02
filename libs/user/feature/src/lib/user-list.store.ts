import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { ModalController } from '@ionic/angular/standalone';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { ExportFormat, UserCollection, UserModel } from '@bk2/shared-models';
import { exportXlsx } from '@bk2/shared-util-angular';
import { chipMatches, generateRandomString, getDataRow, getSystemQuery, isUser, nameMatches } from '@bk2/shared-util-core';
import { ExportFormats } from '@bk2/shared-categories';

import { UserService } from '@bk2/user-data-access';
import { UserEditModal } from './user-edit.modal';

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
    modalController: inject(ModalController),
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService)
  })),
  withProps((store) => ({
    userResource: rxResource({
      stream: () => {
        return store.firestoreService.searchData<UserModel>(UserCollection, getSystemQuery(store.appStore.tenantId()), 'loginEmail', 'asc');
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
      },

      reload() {
        store.userResource.reload()
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
        return store.appStore.getTags('user');
      },

      /******************************* actions *************************************** */
      async add(): Promise<void> {
        // not sure whether we should implement this
        // AOC function ? only depending on an existing person and/or firebase account ?
        console.log('UserListStore.add() is not yet implemented.');
      },

      async edit(user: UserModel, readOnly = true): Promise<void> {
        const modal = await store.modalController.create({
          component: UserEditModal,
          componentProps: {
            user,
            readOnly
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data) {
          if (isUser(data, store.appStore.tenantId())) {
            await store.userService.update(data, store.currentUser(), '');
          }
        }
        //store.appNavigationService.pushLink('/user/all' );
        //await navigateByUrl(store.router, `/user/${user.bkey}`, { readOnly } );
        this.reload();
      },

      async delete(user: UserModel, readOnly = true): Promise<void> {
        if (readOnly) return;
        await store.userService.delete(user, store.appStore.currentUser());
        this.reset();
      },

      async export(type: string): Promise<void> {
        let keys: (keyof UserModel)[] = [];
        const table: string[][] = [];
        const fn = generateRandomString(10) + '.' + ExportFormats[ExportFormat.XLSX].abbreviation;
        let tableName = 'Users';
        switch(type) {
          case 'raw':
            keys = Object.keys(new UserModel(store.appStore.tenantId())) as (keyof UserModel)[];
            table.push(keys);
            tableName = 'Rohdaten Users';
            break;
          case 'users':
            keys = ['loginEmail', 'firstName', 'lastName', 'roles']
            break;
          default:
            console.warn(`UserListStore.export: type ${type} not supported.`);
            return;
        }
        for (const user of store.users() ?? []) {
          table.push(getDataRow<UserModel>(user, keys));
        }
        exportXlsx(table, fn, tableName);
      }
    }
  }),
);
