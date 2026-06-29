import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { ModalController } from '@ionic/angular/standalone';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { ExportFormat, PersonCollection, PersonModel, UserCollection, UserModel } from '@bk2/shared-models';
import { AppNavigationService, exportCsv } from '@bk2/shared-util-angular';
import { chipMatches, debugItemLoaded, generateRandomString, getDataRow, getSystemQuery, isUser, nameMatches } from '@bk2/shared-util-core';
import { ExportFormats } from '@bk2/shared-categories';

import { UserService } from '@bk2/user-data-access';
import { USER_I18N_KEYS, UserI18n } from '@bk2/user-util';

export type { UserI18n };

export type UserState = {
  searchTerm: string;
  selectedTag: string;
  userKey: string | undefined;
};

export const initialState: UserState = {
  searchTerm: '',
  selectedTag: '',
  userKey: undefined
};

export const UserStore = signalStore(
  withState(initialState),
  withProps(() => ({
    userService: inject(UserService),
    modalController: inject(ModalController),
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    appNavigationService: inject(AppNavigationService),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(USER_I18N_KEYS),
    usersResource: rxResource({
      stream: () => {
        return store.firestoreService.searchData<UserModel>(UserCollection, getSystemQuery(store.appStore.tenantId()), 'loginEmail', 'asc');
      }
    }),

    userResource: rxResource({
      params: () => ({
        userKey: store.userKey(),
        currentUser: store.appStore.currentUser()
      }),
      stream: ({params}) => {
        return store.userService.read(params.userKey).pipe(
          debugItemLoaded('UserStore.user', params.currentUser)
        );
      }
    })
  })),

  withComputed((store) => {
    return {
      users: computed(() => store.usersResource.value()),
      usersCount: computed(() => store.usersResource.value()?.length ?? 0),
      user: computed(() => store.userResource.value() ?? new UserModel(store.appStore.tenantId())),
      currentUser: computed(() => store.appStore.currentUser()),
      tenantId: computed(() => store.appStore.tenantId()),
      filteredUsers: computed(() => 
        store.usersResource.value()?.filter((user: UserModel) => 
          nameMatches(user.index, store.searchTerm()) &&
          chipMatches(user.tags, store.selectedTag()))
      ),
      isLoading: computed(() => store.usersResource.isLoading() && store.userResource.isLoading()), 
    };
  }),

  withMethods((store) => {
    return {
      reset() {
        patchState(store, initialState);
      },

      reload() {
        store.usersResource.reload()
      },
      
      /******************************** setters (filter) ******************************************* */
      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      setUserKey(userKey: string): void {
        patchState(store, { userKey });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags('user');
      },

      /******************************* actions *************************************** */
      async add(): Promise<void> {
        // not sure whether we should implement this
        // AOC function ? only depending on an existing person and/or firebase account ?
        console.log('UserStore.add() is not yet implemented.');
      },

      async edit(user: UserModel, readOnly = true): Promise<void> {
        const { UserEditModal } = await import('./user-edit.modal');
        const modal = await store.modalController.create({
          component: UserEditModal,
          componentProps: {
            user,
            person: store.appStore.getPerson(user.personKey),
            readOnly
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data) {
          const { user: editedUser, person } = data as { user: UserModel; person?: PersonModel };
          if (isUser(editedUser, store.appStore.tenantId())) {
            await store.userService.update(editedUser, store.currentUser());
            // Persist the usage* privacy preferences directly onto the linked person.
            if (person) {
              await store.firestoreService.updateModel<PersonModel>(PersonCollection, person, false, undefined, undefined, store.currentUser());
            }
          }
        }
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
            console.warn(`UserStore.export: type ${type} not supported.`);
            return;
        }
        for (const user of store.users() ?? []) {
          table.push(getDataRow<UserModel>(user, keys));
        }
        exportCsv(table, fn, tableName);
      },

      async save(user: UserModel): Promise<void> {
        await (!user.bkey ?
          store.userService.create(user, store.currentUser()) :
          store.userService.update(user, store.currentUser()));
        store.appNavigationService.back();
      },

      getTitleLabel(readOnly: boolean, key?: string): string {
        if (readOnly) {
          return store.i18n.view();
        }
        if (key && key.length > 0) {
          return store.i18n.update();
        } else {
          return store.i18n.create();
        }
      }
    }
  }),
);
