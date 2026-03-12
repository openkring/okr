import { computed, inject } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom, from } from 'rxjs';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { MembershipCollection, MembershipModel, UserCollection, UserModel } from '@bk2/shared-models';
import { DateFormat, debugListLoaded, getSystemQuery, getTodayStr, isAfterDate } from '@bk2/shared-util-core';

import { authState } from 'rxfire/auth';
import { AUTH } from '@bk2/shared-config';
import { confirm, error, navigateByUrl } from '@bk2/shared-util-angular';
import { Router } from '@angular/router';
import { AuthService } from '@bk2/auth-data-access';
import { UserService } from '@bk2/user-data-access';
import { createFirebaseAccount, generatePassword, getUidByEmail, isValidEmail } from '@bk2/aoc-util';

export type FirebaseAuthUser = {
  uid: string;
  email: string | undefined;
  displayName: string | undefined;
  disabled: boolean;
  emailVerified: boolean;
  creationTime: string | undefined;
  lastSignInTime: string | undefined;
};

export type UserAccount = {
    hasFirebaseAccount: boolean,
    hasBkAccount: boolean,
    hasMembership: boolean,
    firstName: string,
    lastName: string,
    loginEmail: string,
    personKey: string,
    uid: string,
    index: string
};

export type AocUserAccountState = {
  searchTerm: string | undefined;
};

export const initialState: AocUserAccountState = {
  searchTerm: undefined,
};

export const AocUserAccountStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    router: inject(Router),
    firestoreService: inject(FirestoreService),
    fbUser: toSignal(authState(inject(AUTH))),
    modalController: inject(ModalController),
    alertController: inject(AlertController),
    toastController: inject(ToastController),
    authService: inject(AuthService),
    userService: inject(UserService),
  })),
  withProps(store => ({
    usersResource: rxResource({
      // the resource will reload whenever the fbUser changes (login/logout).
      params: () => store.fbUser(),
      stream: () => {
        // we are querying for the users of all tenants in order to be able to filter out fbUsers of other tenants later
        const query =  [{ key: 'isArchived', operator: '==', value: false }];
        return store.firestoreService.searchData<UserModel>(UserCollection, query, 'loginEmail', 'asc');
      }
    }),
    activeMembersResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser(),
        defaultOrg: store.appStore.defaultOrg()
      }),
      stream: ({params}) => {
        const orgKey = params.defaultOrg?.bkey;
        if (!orgKey) return store.firestoreService.searchData<MembershipModel>(MembershipCollection, [], 'memberName2', 'asc').pipe(
          debugListLoaded('MembershipStore.activeMembers (no org)', params.currentUser)
        );
        const query = getSystemQuery(store.appStore.tenantId());
        query.push({ key: 'orgKey', operator: '==', value: orgKey });
        query.push({ key: 'state', operator: '==', value: 'active' });
        query.push({ key: 'memberModelType', operator: '==', value: 'person' });
        query.push({ key: 'relIsLast', operator: '==', value: true });

        return store.firestoreService.searchData<MembershipModel>(MembershipCollection, query, 'memberName2', 'asc').pipe(
          debugListLoaded('MembershipStore.activeMembers', params.currentUser)
        );
      },
    }),    
    firebaseUsersResource: rxResource({
      params: () => store.fbUser(),
      stream: () => {
        const fn = httpsCallable<void, { users: FirebaseAuthUser[] }>(getFunctions(getApp(), 'europe-west6'), 'listFirebaseUsers');
        return from(fn().then(result => result.data.users));
      },
    }),
  })),

  withComputed(state => {
    return {
        activeMembers: computed(() => {
            const activeMembers = state.activeMembersResource.value() ?? [];
            return activeMembers.filter(m => isAfterDate(m.dateOfExit, getTodayStr(DateFormat.StoreDate)))
        }),
        firebaseUsers: computed(() => state.firebaseUsersResource.value() ?? []),
        allUsers: computed(() => state.usersResource.value() ?? []), // of all tenants
    };
  }),

  withComputed(state => {
    return {
      userAccounts: computed((): UserAccount[] => {
        const firebaseUsers = state.firebaseUsers();
        const allUsers      = state.allUsers();
        const activeMembers = state.activeMembers();

        // Fast lookup maps
        const userByUid      = new Map(allUsers.map(u => [u.bkey, u]));
        const memberByPerson = new Map(activeMembers.map(m => [m.memberKey, m]));

        const result: UserAccount[] = [];
        const seenUids = new Set<string>();

        // 1. Firebase Auth users (source of truth for accounts)
        for (const fbUser of firebaseUsers) {
          seenUids.add(fbUser.uid);
          const user       = userByUid.get(fbUser.uid);
          const loginEmail = user?.loginEmail ?? fbUser.email ?? '';
          if (!user) {
            result.push({
              uid:                fbUser.uid,
              loginEmail,
              firstName:          '',
              lastName:           '',
              personKey:          '',
              hasFirebaseAccount: true,
              hasBkAccount:       false,
              hasMembership:      false,
              index:              loginEmail.toLocaleLowerCase()
              });
          } else {
            // found a user -> ignore users of other tenants
            if (!user.tenants.includes(state.appStore.tenantId())) continue;
            const membership = user ? memberByPerson.get(user.personKey) : undefined;
            const firstName = user?.firstName  ?? membership?.memberName1 ?? '';
            const lastName = user?.lastName   ?? membership?.memberName2 ?? '';
            result.push({
              uid:                fbUser.uid,
              loginEmail,
              firstName,
              lastName,
              personKey:          user?.personKey  ?? '',
              hasFirebaseAccount: true,
              hasBkAccount:       !!user,
              hasMembership:      !!membership,
              index:              (loginEmail + ' ' + firstName + ' ' + lastName).toLocaleLowerCase()
            });
          }
        }

        // 2. BK users without a Firebase Auth account
        for (const user of allUsers) {
          // ignore users of other tenants
          if (!user.tenants.includes(state.appStore.tenantId())) continue;
          if (seenUids.has(user.bkey)) continue;
          seenUids.add(user.bkey);
          const membership = memberByPerson.get(user.personKey);
          result.push({
            uid:                user.bkey,
            loginEmail:         user.loginEmail,
            firstName:          user.firstName,
            lastName:           user.lastName,
            personKey:          user.personKey,
            hasFirebaseAccount: false,
            hasBkAccount:       true,
            hasMembership:      !!membership,
            index:              (user.loginEmail + ' ' + user.firstName + ' ' + user.lastName).toLocaleLowerCase()
          });
        }

        // 3. Active members without any account at all
        const accountedPersonKeys = new Set(allUsers.map(u => u.personKey).filter(Boolean));
        console.log('accountedPersonKeys: ', accountedPersonKeys);
        console.log(activeMembers.length + ' active members');
        for (const membership of activeMembers) {
          if (accountedPersonKeys.has(membership.memberKey)) continue;
          result.push({
            uid:                '',
            loginEmail:         '',
            firstName:          membership.memberName1,
            lastName:           membership.memberName2,
            personKey:          membership.memberKey,
            hasFirebaseAccount: false,
            hasBkAccount:       false,
            hasMembership:      true,
            index:              (membership.memberName1 + ' ' + membership.memberName2).toLocaleLowerCase()
          });
        }

        return result;
      }),
    };
  }),


  withComputed(state => {
    return {
      isLoading: computed(() => state.usersResource.isLoading() || state.firebaseUsersResource.isLoading()),
      defaultOrg: computed(() => state.appStore.defaultOrg()),
      currentUser: computed(() => state.appStore.currentUser()),
      filteredAccounts: computed(() => state.userAccounts().filter(a => a.index.includes(state.searchTerm() ?? '')))
    };
  }),

  withMethods(store => {
    return {
      reset() {
        patchState(store, initialState);
        this.reload();
      },

      reload() {
        store.usersResource.reload();
        store.activeMembersResource.reload();
        store.firebaseUsersResource.reload();
      },

      /******************************** setters (filter) ******************************************* */
      setSearchTerm(term: string) {
        const searchTerm = term.toLocaleLowerCase();
        patchState(store, { searchTerm });
      },

      /******************************** actions ******************************************* */
      async editPerson(account: UserAccount): Promise<void> {
        await navigateByUrl(store.router, `/person/${account.personKey}`, { readOnly: false });
      },

      async editMembership(account: UserAccount): Promise<void> {
        if (!account.personKey) return;
        // No direct membership-edit route exists; navigate to the person page where memberships are accessible.
        await navigateByUrl(store.router, `/person/${account.personKey}`, { readOnly: false });
      },

      async editUser(account: UserAccount): Promise<void> {
        if (!account.uid) return;
        await navigateByUrl(store.router, `/user/${account.uid}`, { readOnly: false });
      },

      async createAccountAndUser(account: UserAccount): Promise<void> {
        if (!account.loginEmail || !isValidEmail(account.loginEmail)) {
          // read the favorite email from person
          const person = store.appStore.getPerson(account.personKey);
          account.loginEmail = person?.favEmail ?? '';
          if (!account.loginEmail || !isValidEmail(account.loginEmail)) {
            console.warn('AocUserAccountStore.createAccountAndUser: loginEmail is missing or invalid');
            return;
          }
        }
        try {
          const generatedPwd = generatePassword();
          let uid = await getUidByEmail(account.loginEmail);
          if (!uid) {
            uid = await createFirebaseAccount(store.toastController, account.loginEmail, generatedPwd, `${account.firstName} ${account.lastName}`.trim());
          }
          if (!uid) {
            console.error('AocUserAccountStore.createAccountAndUser: did not receive a valid firebase uid.');
            return;
          }
          const existingUser = await firstValueFrom(store.userService.read(uid));
          if (!existingUser) {
            const user = new UserModel(store.appStore.tenantId());
            user.bkey = uid;
            user.loginEmail = account.loginEmail;
            user.personKey = account.personKey;
            user.firstName = account.firstName;
            user.lastName = account.lastName;
            await store.userService.create(user, store.currentUser());
            this.reload();
          } else {
            console.log(`AocUserAccountStore.createAccountAndUser: user ${uid} already exists.`);
          }
        } catch (ex) {
          error(store.toastController, 'AocUserAccountStore.createAccountAndUser -> error: ' + JSON.stringify(ex));
        }
      },

      async deleteUser(account: UserAccount): Promise<void> {
        const confirmed = await confirm(store.alertController, '@aoc.account.user.delete.confirm', true);
        if (confirmed === true) {
          const user = store.allUsers().find(u => u.bkey === account.uid);
          if (user) {
            await store.userService.delete(user, store.currentUser());
            this.reload();
          }
        }
      },

      async deleteFirebaseUser(account: UserAccount): Promise<void> {
        const confirmed = await confirm(store.alertController, '@aoc.account.fbuser.delete.confirm', true);
        if (confirmed === true) {
          try {
            const fn = httpsCallable<{ uid: string }, void>(getFunctions(getApp(), 'europe-west6'), 'deleteFirebaseAuthUser');
            await fn({ uid: account.uid });
            this.reload();
          } catch (ex) {
            error(store.toastController, 'AocUserAccountStore.deleteFirebaseUser -> error: ' + JSON.stringify(ex));
          }
        }
      },

      async resetPassword(account: UserAccount): Promise<void> {
        if (!account.loginEmail) return;
        await store.authService.resetPassword(account.loginEmail, 'aoc/accounts');
      }
    };
  })
);
