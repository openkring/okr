import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { ModalController } from '@ionic/angular/standalone';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { ExportFormat, UserCollection, UserModel } from '@bk2/shared-models';
import { AppNavigationService, exportXlsx } from '@bk2/shared-util-angular';
import { chipMatches, debugItemLoaded, generateRandomString, getDataRow, getSystemQuery, isUser, nameMatches } from '@bk2/shared-util-core';
import { ExportFormats } from '@bk2/shared-categories';

import { UserService } from '@bk2/user-data-access';
import { UserEditModal } from './user-edit.modal';
import { PFX } from './scope';

const USER_I18N_KEYS = {
  // store keys
  users:                           PFX + 'users',
  empty:                           PFX + 'empty',
  login_email:                     PFX + 'loginEmail',
  fbuser_edit_title:               PFX + 'fbuser.edit.title',
  avatar_upload:                   PFX + 'document.upload.avatar.title',
  changeConfirmation_ok:           PFX + 'changeConfirmation.ok',
  changeConfirmation_cancel:       PFX + 'changeConfirmation.cancel',
  changeConfirmation_confirmation: PFX + 'changeConfirmation.confirmation',
  name:                            '@name',
  as_title:                        PFX + 'actionsheet.title',
  as_view:                         PFX + 'actionsheet.view',
  as_create:                       PFX + 'actionsheet.create',
  as_edit:                         PFX + 'actionsheet.edit',
  as_delete:                       PFX + 'actionsheet.delete',
  cancel:                          '@cancel',
  ok:                              '@ok',
  // fbuser.form.ts keys (@user/ui scope)
  fbuser_auth_title:       '@user/ui.fbuser.auth.title',
  fbuser_auth_description: '@user/ui.fbuser.auth.description',
  uid_label:               '@user/ui.uid.label',
  uid_placeholder:         '@user/ui.uid.placeholder',
  uid_helper:              '@user/ui.uid.helper',
  displayName_label:       '@user/ui.displayName.label',
  displayName_placeholder: '@user/ui.displayName.placeholder',
  displayName_helper:      '@user/ui.displayName.helper',
  photoUrl_label:          '@user/ui.photoUrl.label',
  photoUrl_placeholder:    '@user/ui.photoUrl.placeholder',
  photoUrl_helper:         '@user/ui.photoUrl.helper',
  email_label:             '@user/ui.email.label',
  email_placeholder:       '@user/ui.email.placeholder',
  phone_label:             '@user/ui.phone.label',
  phone_placeholder:       '@user/ui.phone.placeholder',
  emailVerified_label:     '@user/ui.emailVerified.label',
  emailVerified_helper:    '@user/ui.emailVerified.helper',
  disabled_label:          '@user/ui.disabled.label',
  disabled_helper:         '@user/ui.disabled.helper',
  // user-auth.form.ts keys
  auth_title:              '@user/ui.auth.title',
  auth_description:        '@user/ui.auth.description',
  useTouchId_label:        '@user/ui.useTouchId.label',
  useTouchId_helper:       '@user/ui.useTouchId.helper',
  useFaceId_label:         '@user/ui.useFaceId.label',
  useFaceId_helper:        '@user/ui.useFaceId.helper',
  // user-display.form.ts keys
  display_title:             '@user/ui.display.title',
  display_description:       '@user/ui.display.description',
  avatarUsage_label:         '@user/ui.avatarUsage.label',
  personSortCriteria_label:  '@user/ui.personSortCriteria.label',
  userLanguage_label:        '@user/ui.userLanguage.label',
  nameDisplay_label:         '@user/ui.nameDisplay.label',
  showArchivedData_label:    '@user/ui.showArchivedData.label',
  showArchivedData_helper:   '@user/ui.showArchivedData.helper',
  showDebugInfo_label:       '@user/ui.showDebugInfo.label',
  showDebugInfo_helper:      '@user/ui.showDebugInfo.helper',
  showHelpers_label:         '@user/ui.showHelpers.label',
  showHelpers_helper:        '@user/ui.showHelpers.helper',
  // user-model.form.ts keys
  model_title:              '@user/ui.model.title',
  model_description:        '@user/ui.model.description',
  bkey_label:               '@user/ui.bkey.label',
  bkey_placeholder:         '@user/ui.bkey.placeholder',
  bkey_helper:              '@user/ui.bkey.helper',
  personKey_label:          '@user/ui.personKey.label',
  personKey_placeholder:    '@user/ui.personKey.placeholder',
  personKey_helper:         '@user/ui.personKey.helper',
  firstName_label:          '@user/ui.firstName.label',
  firstName_placeholder:    '@user/ui.firstName.placeholder',
  firstName_helper:         '@user/ui.firstName.helper',
  lastName_label:           '@user/ui.lastName.label',
  lastName_placeholder:     '@user/ui.lastName.placeholder',
  lastName_helper:          '@user/ui.lastName.helper',
  tenants_label:            '@user/ui.tenants.label',
  tenants_placeholder:      '@user/ui.tenants.placeholder',
  tenants_helper:           '@user/ui.tenants.helper',
  notes_label:              '@user/ui.notes.label',
  notes_placeholder:        '@user/ui.notes.placeholder',
  loginEmail_label:         '@user/ui.loginEmail.label',
  loginEmail_placeholder:   '@user/ui.loginEmail.placeholder',
  gravatarEmail_label:      '@user/ui.gravatarEmail.label',
  gravatarEmail_placeholder:'@user/ui.gravatarEmail.placeholder',
  // user-notification.form.ts keys
  notification_title:       '@user/ui.notification.title',
  notification_description: '@user/ui.notification.description',
  newsDelivery_label:       '@user/ui.newsDelivery.label',
  invoiceDelivery_label:    '@user/ui.invoiceDelivery.label',
} satisfies Record<string, string>;

export type UserI18n = { [K in keyof typeof USER_I18N_KEYS]: Signal<string> };

export type UserListState = {
  searchTerm: string;
  selectedTag: string;
  userKey: string | undefined;
};

export const initialState: UserListState = {
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
            await store.userService.update(data, store.currentUser());
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
        exportXlsx(table, fn, tableName);
      },

      async save(user: UserModel): Promise<void> {
        await (!user.bkey ? 
          store.userService.create(user, store.currentUser()) : 
          store.userService.update(user, store.currentUser()));
        store.appNavigationService.back();
      },

      getTitleLabel(readOnly: boolean, key?: string): string {
        if (readOnly) {
          return store.i18n.as_view();
        }
        if (key && key.length > 0) {
          return store.i18n.as_edit();
        } else {
          return store.i18n.as_create();
        }
      }
    }
  }),
);
