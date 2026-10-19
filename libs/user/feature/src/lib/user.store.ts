import { computed, inject } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { ModalController, ToastController } from '@ionic/angular';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { authState } from 'rxfire/auth';
import { catchError, from, of } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { ExportFormat, MembershipCollection, MembershipModel, PersonCollection, PersonModel, RoleName, UserModel } from '@okr/shared-models';
import { AUTH } from '@okr/shared-config';
import { AppNavigationService, exportCsv, showToast } from '@okr/shared-util-angular';
import { chipMatches, DateFormat, debugItemLoaded, debugListLoaded, generateRandomString, getDataRow, getFullName, getSystemQuery, getTodayStr, isAfterDate, isUser, nameMatches, OPERATOR_TENANT_ID } from '@okr/shared-util-core';
import { ExportFormats } from '@okr/shared-categories';

import { UserService } from '@okr/user-data-access';
import { buildUserAccountRows, filterUserAccountRows, USER_I18N_KEYS, UserAccountRow, UserI18n } from '@okr/user-util';

export type { UserI18n };

/** What listFirebaseUsers returns per login (the server scopes it to the caller's tenant, bka sees all). */
type FirebaseLogin = { uid: string; email: string | undefined };

/** The roles the «Erweiterte Rollen» select offers: every role that grants more than plain membership. */
export const EXTENDED_ROLE_OPTIONS: RoleName[] = [
  'privileged', 'contentAdmin', 'resourceAdmin', 'memberAdmin', 'eventAdmin', 'treasurer', 'admin',
  'groupAdmin', 'kiosk', 'tripAdmin', 'auditor', 'tester',
];

export type UserState = {
  searchTerm: string;
  selectedTag: string;
  userKey: string | undefined;
  problems: boolean;               // «Probleme» chip
  extendedRolesOn: boolean;        // «Erweiterte Rollen» chip
  extendedRole: RoleName | 'any';  // its role select; 'any' = «alle»
};

export const initialState: UserState = {
  searchTerm: '',
  selectedTag: '',
  userKey: undefined,
  problems: false,
  extendedRolesOn: false,
  extendedRole: 'any',
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
    toastController: inject(ToastController),
    fbUser: toSignal(authState(inject(AUTH))),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(USER_I18N_KEYS),
  })),
  withProps((store) => ({
    // a failed read must never look like «nobody»: say so, keep the list empty (phase 2/3 pattern)
    loadFailed: (what: string, ex: unknown): void => {
      console.error(`UserStore: reading ${what} failed`, ex);
      void showToast(store.toastController, store.i18n.read_error());
    },
  })),
  withProps((store) => ({
    usersResource: rxResource({
      params: () => store.fbUser(),   // reload on login/logout
      stream: () => {
        const fn = httpsCallable<void, { users: UserModel[] }>(getFunctions(getApp(), 'europe-west6'), 'listBkUsers');
        return from(fn().then(result => result.data.users).catch((ex: unknown) => { store.loadFailed('users', ex); return [] as UserModel[]; }));
      }
    }),

    // the Firebase logins; scoped server-side, so outside bka no login without a user can appear
    firebaseUsersResource: rxResource({
      params: () => store.fbUser(),
      stream: () => {
        const fn = httpsCallable<void, { users: FirebaseLogin[] }>(getFunctions(getApp(), 'europe-west6'), 'listFirebaseUsers');
        return from(fn().then(result => result.data.users).catch((ex: unknown) => { store.loadFailed('logins', ex); return [] as FirebaseLogin[]; }));
      }
    }),

    // the active members of the tenant's default org (same query as the former AOC account page)
    activeMembersResource: rxResource({
      params: () => ({ currentUser: store.appStore.currentUser(), defaultOrg: store.appStore.defaultOrg() }),
      stream: ({ params }) => {
        const orgKey = params.defaultOrg?.okey;
        if (!orgKey) return store.firestoreService.searchData<MembershipModel>(MembershipCollection, [], 'memberName2', 'asc').pipe(
          debugListLoaded('UserStore.activeMembers (no org)', params.currentUser),
          catchError((ex: unknown) => { store.loadFailed('members', ex); return of([] as MembershipModel[]); })
        );
        const query = getSystemQuery(store.appStore.tenantId());
        query.push({ key: 'orgKey', operator: '==', value: orgKey });
        query.push({ key: 'state', operator: '==', value: 'active' });
        query.push({ key: 'memberModelType', operator: '==', value: 'person' });
        query.push({ key: 'relIsLast', operator: '==', value: true });
        return store.firestoreService.searchData<MembershipModel>(MembershipCollection, query, 'memberName2', 'asc').pipe(
          debugListLoaded('UserStore.activeMembers', params.currentUser),
          catchError((ex: unknown) => { store.loadFailed('members', ex); return of([] as MembershipModel[]); })
        );
      },
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
      isOperator: computed(() => store.appStore.tenantId() === OPERATOR_TENANT_ID),
      extendedRoleOptions: computed(() => EXTENDED_ROLE_OPTIONS),
      activeMembers: computed(() => {
        const today = getTodayStr(DateFormat.StoreDate);
        return (store.activeMembersResource.value() ?? []).filter(m => isAfterDate(m.dateOfExit, today));
      }),
      isLoading: computed(() => store.usersResource.isLoading() || store.firebaseUsersResource.isLoading() || store.activeMembersResource.isLoading()),
    };
  }),

  withComputed((store) => {
    return {
      /** logins + users + active members merged into rows (all kinds, unfiltered) */
      accountRows: computed((): UserAccountRow[] => buildUserAccountRows(
        store.usersResource.value() ?? [],
        (store.firebaseUsersResource.value() ?? []).map(f => ({ uid: f.uid, email: f.email })),
        store.activeMembers().map(m => ({ personKey: m.memberKey, name: getFullName(m.memberName1, m.memberName2) })),
        store.appStore.tenantId(),
        store.isOperator(),
      )),
    };
  }),

  withComputed((store) => {
    return {
      /** the rows after the chips, the search term and the tag */
      filteredRows: computed((): UserAccountRow[] => {
        const term = store.searchTerm();
        const tag = store.selectedTag();
        return filterUserAccountRows(store.accountRows(), {
          problems: store.problems(),
          extendedRole: store.extendedRolesOn() ? store.extendedRole() : undefined,
        }).filter(r =>
          nameMatches((r.user?.index ?? '') + ' ' + r.name + ' ' + (r.loginEmail ?? '') + ' ' + (r.loginId ?? ''), term) &&
          chipMatches(r.user?.tags ?? '', tag));
      }),
      problemCount: computed(() => filterUserAccountRows(store.accountRows(), { problems: true }).length),
    };
  }),

  withMethods((store) => {
    return {
      reset() {
        patchState(store, initialState);
      },

      reload() {
        store.usersResource.reload();
        store.firebaseUsersResource.reload();
        store.activeMembersResource.reload();
      },

      /******************************** setters (filter) ******************************************* */
      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      setProblems(problems: boolean) {
        patchState(store, { problems });
      },

      setExtendedRolesOn(extendedRolesOn: boolean) {
        patchState(store, { extendedRolesOn, extendedRole: 'any' });
      },

      setExtendedRole(extendedRole: RoleName | 'any') {
        patchState(store, { extendedRole });
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
              store.appStore.reloadPersons();
            }
          }
        }
        this.reload();
      },

      async delete(user: UserModel, readOnly = true): Promise<void> {
        if (readOnly) return;
        await store.userService.delete(user, store.appStore.currentUser());
        this.reset();
        this.reload();
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
        await (!user.okey ?
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
