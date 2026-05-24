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
  save:                            '@save.label',

  fbuser_auth_title:                PFX + 'fbuser.auth.title',
  fbuser_auth_description:          PFX + 'fbuser.auth.description',
  uid_label:                        PFX + 'uid.label',
  uid_placeholder:                  PFX + 'uid.placeholder',
  uid_helper:                       PFX + 'uid.helper',
  displayName_label:                PFX + 'displayName.label',
  displayName_placeholder:          PFX + 'displayName.placeholder',
  displayName_helper:               PFX + 'displayName.helper',
  photoUrl_label:                   PFX + 'photoUrl.label',
  photoUrl_placeholder:             PFX + 'photoUrl.placeholder',
  photoUrl_helper:                  PFX + 'photoUrl.helper',
  email_label:                      PFX + 'email.label',
  email_placeholder:                PFX + 'email.placeholder',
  phone_label:                      PFX + 'phone.label',
  phone_placeholder:                PFX + 'phone.placeholder',
  emailVerified_label:              PFX + 'emailVerified.label',
  emailVerified_helper:             PFX + 'emailVerified.helper',
  disabled_label:                   PFX + 'disabled.label',
  disabled_helper:                  PFX + 'disabled.helper',
  auth_title:                       PFX + 'auth.title',
  auth_description:                 PFX + 'auth.description',
  useTouchId_label:                 PFX + 'useTouchId.label',
  useTouchId_helper:                PFX + 'useTouchId.helper',
  useFaceId_label:                  PFX + 'useFaceId.label',
  useFaceId_helper:                 PFX + 'useFaceId.helper',
  display_title:                    PFX + 'display.title',
  display_description:              PFX + 'display.description',
  avatarUsage_label:                PFX + 'avatarUsage.label',
  personSortCriteria_label:         PFX + 'personSortCriteria.label',
  userLanguage_label:               PFX + 'userLanguage.label',
  nameDisplay_label:                PFX + 'nameDisplay.label',
  showArchivedData_label:           PFX + 'showArchivedData.label',
  showArchivedData_helper:          PFX + 'showArchivedData.helper',
  showDebugInfo_label:              PFX + 'showDebugInfo.label',
  showDebugInfo_helper:             PFX + 'showDebugInfo.helper',
  showHelpers_label:                PFX + 'showHelpers.label',
  showHelpers_helper:               PFX + 'showHelpers.helper',
  model_title:                      PFX + 'model.title',
  model_description:                PFX + 'model.description',
  bkey_label:                       PFX + 'bkey.label',
  bkey_placeholder:                 PFX + 'bkey.placeholder',
  bkey_helper:                      PFX + 'bkey.helper',
  personKey_label:                  PFX + 'personKey.label',
  personKey_placeholder:            PFX + 'personKey.placeholder',
  personKey_helper:                 PFX + 'personKey.helper',
  firstName_label:                  PFX + 'firstName.label',
  firstName_placeholder:            PFX + 'firstName.placeholder',
  firstName_helper:                 PFX + 'firstName.helper',
  lastName_label:                   PFX + 'lastName.label',
  lastName_placeholder:             PFX + 'lastName.placeholder',
  lastName_helper:                  PFX + 'lastName.helper',
  tenants_label:                    PFX + 'tenants.label',
  tenants_placeholder:              PFX + 'tenants.placeholder',
  tenants_helper:                   PFX + 'tenants.helper',
  notes_label:                      PFX + 'notes.label',
  notes_placeholder:                PFX + 'notes.placeholder',
  loginEmail_label:                 PFX + 'loginEmail.label',
  loginEmail_placeholder:           PFX + 'loginEmail.placeholder',
  gravatarEmail_label:              PFX + 'gravatarEmail.label',
  gravatarEmail_placeholder:        PFX + 'gravatarEmail.placeholder',
  notification_title:               PFX + 'notification.title',
  notification_description:         PFX + 'notification.description',
  newsDelivery_label:               PFX + 'newsDelivery.label',
  invoiceDelivery_label:            PFX + 'invoiceDelivery.label',
  privacy_title:                    PFX + 'privacy.title',
  privacy_description:              PFX + 'privacy.description',
  srv_description:                  PFX + 'srv.description',
  usageImages_label:                PFX + 'usageImages.label',
  usageDateOfBirth_label:           PFX + 'usageDateOfBirth.label',
  usagePostalAddress_label:         PFX + 'usagePostalAddress.label',
  usageEmail_label:                 PFX + 'usageEmail.label',
  usagePhone_label:                 PFX + 'usagePhone.label',
  usageName_label:                  PFX + 'usageName.label',
  srvEmail_label:                   PFX + 'srvEmail.label',
  srvEmail_helper:                  PFX + 'srvEmail.helper',
} satisfies Record<string, string>;

export type UserI18n = { [K in keyof typeof USER_I18N_KEYS]: Signal<string> };

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
