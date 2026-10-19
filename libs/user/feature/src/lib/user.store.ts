import { computed, inject, signal } from '@angular/core';
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
import { exportCsv, showToast } from '@okr/shared-util-angular';
import { DateFormat, debugListLoaded, generateRandomString, getDataRow, getFullName, getSystemQuery, getTodayStr, isAfterDate, isUser, OPERATOR_TENANT_ID } from '@okr/shared-util-core';
import { ExportFormats } from '@okr/shared-categories';

import { UserService } from '@okr/user-data-access';
import { buildUserAccountRows, EXTENDED_ROLE_OPTIONS, filterUserAccountRows, searchUserAccountRows, USER_I18N_KEYS, UserAccountRow, UserI18n } from '@okr/user-util';

export type { UserI18n };

/** What listFirebaseUsers returns per login (the server scopes it to the caller's tenant, bka sees all). */
type FirebaseLogin = { uid: string; email: string | undefined };

export type UserState = {
  searchTerm: string;
  selectedTag: string;
  problems: boolean;               // «Probleme» chip
  extendedRolesOn: boolean;        // «Erweiterte Rollen» chip
  extendedRole: RoleName | 'any';  // its role select; 'any' = «alle»
};

export const initialState: UserState = {
  searchTerm: '',
  selectedTag: '',
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
    i18nService: inject(I18nService),
    toastController: inject(ToastController),
    fbUser: toSignal(authState(inject(AUTH))),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(USER_I18N_KEYS),
  })),
  withProps(() => ({
    /** which sources failed to load; a failed source must never fake «nobody» or fake problems */
    failed: signal<{ users: boolean; logins: boolean; members: boolean }>({ users: false, logins: false, members: false }),
  })),
  withProps((store) => ({
    // say it once (one toast for all failing sources), keep the list empty (phase 2/3 pattern)
    loadFailed: (what: 'users' | 'logins' | 'members', ex: unknown): void => {
      console.error(`UserStore: reading ${what} failed`, ex);
      const first = !Object.values(store.failed()).some(Boolean);
      store.failed.update(f => ({ ...f, [what]: true }));
      if (first) void showToast(store.toastController, store.i18n.read_error());
    },
    loadStarted: (what: 'users' | 'logins' | 'members'): void => {
      store.failed.update(f => ({ ...f, [what]: false }));
    },
  })),
  withProps((store) => ({
    usersResource: rxResource({
      params: () => store.fbUser(),   // reload on login/logout
      stream: () => {
        store.loadStarted('users');
        const fn = httpsCallable<void, { users: UserModel[] }>(getFunctions(getApp(), 'europe-west6'), 'listBkUsers');
        return from(fn().then(result => result.data.users).catch((ex: unknown) => { store.loadFailed('users', ex); return [] as UserModel[]; }));
      }
    }),

    // the Firebase logins; scoped server-side, so outside bka no login without a user can appear
    firebaseUsersResource: rxResource({
      params: () => store.fbUser(),
      stream: () => {
        store.loadStarted('logins');
        const fn = httpsCallable<void, { users: FirebaseLogin[] }>(getFunctions(getApp(), 'europe-west6'), 'listFirebaseUsers');
        return from(fn().then(result => result.data.users).catch((ex: unknown) => { store.loadFailed('logins', ex); return [] as FirebaseLogin[]; }));
      }
    }),

    // the active members of the tenant's default org (same query as the former AOC account page)
    activeMembersResource: rxResource({
      params: () => ({ orgKey: store.appStore.defaultOrg()?.okey, uid: store.appStore.currentUser()?.okey }),
      stream: ({ params }) => {
        store.loadStarted('members');
        const orgKey = params.orgKey;
        const currentUser = store.appStore.currentUser();
        if (!orgKey) return store.firestoreService.searchData<MembershipModel>(MembershipCollection, [], 'memberName2', 'asc').pipe(
          debugListLoaded('UserStore.activeMembers (no org)', currentUser),
          catchError((ex: unknown) => { store.loadFailed('members', ex); return of([] as MembershipModel[]); })
        );
        const query = getSystemQuery(store.appStore.tenantId());
        query.push({ key: 'orgKey', operator: '==', value: orgKey });
        query.push({ key: 'state', operator: '==', value: 'active' });
        query.push({ key: 'memberModelType', operator: '==', value: 'person' });
        query.push({ key: 'relIsLast', operator: '==', value: true });
        return store.firestoreService.searchData<MembershipModel>(MembershipCollection, query, 'memberName2', 'asc').pipe(
          debugListLoaded('UserStore.activeMembers', currentUser),
          catchError((ex: unknown) => { store.loadFailed('members', ex); return of([] as MembershipModel[]); })
        );
      },
    }),
  })),

  withComputed((store) => {
    return {
      // listBkUsers hands the operator every tenant's users: the list, the count and the export stay on the own tenant
      users: computed(() => (store.usersResource.value() ?? []).filter(u => u.tenants?.includes(store.appStore.tenantId()))),
      usersCount: computed(() => (store.usersResource.value() ?? []).filter(u => u.tenants?.includes(store.appStore.tenantId())).length),
      currentUser: computed(() => store.appStore.currentUser()),
      tenantId: computed(() => store.appStore.tenantId()),
      isOperator: computed(() => store.appStore.tenantId() === OPERATOR_TENANT_ID),
      /** the user docs are there (loaded, not reloading); `?edit=` waits for this */
      usersLoaded: computed(() => store.usersResource.hasValue() && !store.usersResource.isLoading()),
      extendedRoleOptions: computed(() => EXTENDED_ROLE_OPTIONS),
      activeMembers: computed(() => {
        const today = getTodayStr(DateFormat.StoreDate);
        return (store.activeMembersResource.value() ?? []).filter(m => isAfterDate(m.dateOfExit, today));
      }),
      isLoading: computed(() => store.fbUser() === undefined || store.usersResource.isLoading() || store.firebaseUsersResource.isLoading() || store.activeMembersResource.isLoading()),
    };
  }),

  withComputed((store) => {
    return {
      /** all three sources have loaded (value present, not loading) and none failed; only then may a missing counterpart count as a problem */
      sourcesComplete: computed(() =>
        store.usersResource.hasValue() && !store.usersResource.isLoading() &&
        store.firebaseUsersResource.hasValue() && !store.firebaseUsersResource.isLoading() &&
        store.activeMembersResource.hasValue() && !store.activeMembersResource.isLoading() &&
        !Object.values(store.failed()).some(Boolean)),
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
        store.sourcesComplete(),
      )),
    };
  }),

  withComputed((store) => {
    return {
      /** the rows after the chips, the search term and the tag */
      filteredRows: computed((): UserAccountRow[] => {
        const term = store.searchTerm();
        const tag = store.selectedTag();
        return searchUserAccountRows(filterUserAccountRows(store.accountRows(), {
          problems: store.problems(),
          extendedRole: store.extendedRolesOn() ? store.extendedRole() : undefined,
        }), term, tag);
      }),
      problemCount: computed(() => store.sourcesComplete() ? filterUserAccountRows(store.accountRows(), { problems: true }).length : 0),
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
    }
  }),
);
