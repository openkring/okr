import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject, PLATFORM_ID } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { of } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { isPlatformBrowser } from '@angular/common';

import { AUTH } from '@bk2/shared/config';
import { debugListLoaded, die, findUserByPersonKey, getSystemQuery, isPerson, warn } from '@bk2/shared/util-core';
import { error } from '@bk2/shared/util-angular';
import { LogInfo, logMessage, PersonCollection, PersonModel, UserCollection, UserModel } from '@bk2/shared/models';
import { PersonSelectModalComponent, AppStore } from '@bk2/shared/feature';
import { FirestoreService } from '@bk2/shared/data-access';

import { AuthService } from '@bk2/auth/data-access';
import { createFirebaseAccount, createUserFromPerson } from '@bk2/aoc/util';
import { UserService } from '@bk2/user/data-access';
import { impersonateUser } from '../../../../../apps/functions/src/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';

export type AocRolesState = {
  calendarName: string;
  searchTerm: string;
  selectedTag: string;
  selectedPerson: PersonModel | undefined;
  log: LogInfo[];
  logTitle: string;
};

export const initialState: AocRolesState = {
  calendarName: '',
  searchTerm: '',
  selectedTag: '',
  selectedPerson: undefined,
  log: [],
  logTitle: ''
};

export const AocRolesStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    auth: inject(AUTH),
    authService: inject(AuthService),
    userService: inject(UserService),
    modalController: inject(ModalController),
    toastController: inject(ToastController),
    platformId: inject(PLATFORM_ID)
  })),
  withProps((store) => ({
    personsResource: rxResource({
      stream: () => {
        const persons$ = store.firestoreService.searchData<PersonModel>(PersonCollection, getSystemQuery(store.appStore.env.tenantId), 'lastName', 'asc');
        debugListLoaded<PersonModel>('RolesStore.persons', persons$, store.appStore.currentUser());
        return persons$;
      }
    }),
    usersResource: rxResource({
      stream: () => {
        const users$ = store.firestoreService.searchData<UserModel>(UserCollection, getSystemQuery(store.appStore.env.tenantId), 'loginEmail', 'asc');
        debugListLoaded<UserModel>('RolesStore.users', users$, store.appStore.currentUser());
        return users$;
      }
    }),
  })),

  withComputed((state) => {
    return {
      currentUser: computed(() => state.appStore.currentUser()),
      isLoading: computed(() => state.personsResource.isLoading()),
      persons: computed(() => state.personsResource.value()),
      users: computed(() => state.usersResource.value()),
    }
  }),

  withProps((store) => ({
    userResource: rxResource({
      params: () => ({
        person: store.selectedPerson()
      }),
      stream: ({ params }) => {
        const _users = store.users();
        const _person = params.person;
        if (!_person || !_users) return of(undefined);
        return of(findUserByPersonKey(_users, _person.bkey));
      }
    }),
  })),

  withComputed((state) => {
    return {
      selectedUser: computed(() => state.userResource.value()),
      chatUser: computed(() => {
        const _user = state.userResource.value();
        if (!_user) return undefined;
        return {
          id: _user.bkey,
          name: _user.loginEmail,
          imageUrl: ''
        };
      })
    }
  }),

  withMethods((store) => {
    return {

      /******************************** setters (filter) ******************************************* */
      setSelectedPerson(selectedPerson: PersonModel | undefined) {
        patchState(store, { selectedPerson, log: [], logTitle: '' });
      },

      /******************************* actions *************************************** */
      async selectPerson(): Promise<void> {
        const _modal = await store.modalController.create({
          component: PersonSelectModalComponent,
          cssClass: 'list-modal',
          componentProps: {
            selectedTag: '',
            currentUser: store.currentUser()
          }
        });
        _modal.present();
        const { data, role } = await _modal.onWillDismiss();
        if (role === 'confirm') {
          if (isPerson(data, store.appStore.env.tenantId)) {
            console.log('RolesStore: selected person: ', data);
            this.setSelectedPerson(data);
          }
        }
      },

      /**
       * Creates a new Firebase user account for the selected person if it does not yet exist.
       * Additionally, it creates a new user account for the same user to link the Firebase account with the person.
       * Check whether a Firebase account already exists for this email address. If not, create the account.
       * On successful creation of the user account, this new user is signed in. That's why we update the user to the former current user.
       * User account creation can fail if the account already exists and the password is invalid.
       * see https://stackoverflow.com/questions/37517208/firebase-kicks-out-current-user/38013551#38013551
       * for solutions to solve this admin function on the client side without being looged out. 
       * @param password - optional password for the new user account. If not given, a random password is generated.
       */
      async createAccountAndUser(password?: string): Promise<void> {
        const _person = store.selectedPerson();
        if (!_person) {
          warn('RolesStore.createAccountAndUser: please select a person first.');
        } else {
          try {
            patchState(store, { log: [], logTitle: `creating account for ${_person.firstName} ${_person.lastName}/${_person.bkey}/${_person.fav_email}` });
            const _user = createUserFromPerson(_person, store.appStore.env.tenantId);
            const _currentFbUser = store.appStore.fbUser() ?? die('RolesStore.createAccountAndUser: no current Firebase user');
            if (!_user.loginEmail || _user.loginEmail.length === 0) die('RolesStore.createAccountAndUser: loginEmail is missing - can not register this user');
            const _uid = await createFirebaseAccount(store.auth, store.toastController, _currentFbUser, _user.loginEmail, password);
            if (_uid) {      // the Firebase account exists, now create the user
              _user.bkey = _uid;
              _user.index = store.userService.getSearchIndex(_user);
              await store.userService.create(_user);
              store.usersResource.reload();
              store.userResource.reload();
            }
          }
          catch (_ex) {
            error(store.toastController, 'RolesStore.createAccountAndUser -> error: ' + JSON.stringify(_ex));
          }
        }
      },

      async resetPassword(): Promise<void> {
        const _user = store.selectedUser();
        if (!_user) {
          if (store.selectedPerson()) {
            patchState(store, { log: [], logTitle: 'user is missing; please create a user and account first for this person' });
            warn('RolesStore.resetPassword: user is missing; please create a user and account first for this person.');
          } else {
            warn('RolesStore.resetPassword: please select a person first.');
          }
        } else { // a user is selected 
          try {
            const _email = _user.loginEmail;
            console.log('RolesPageComponent.resetPassword: sending reset password email to  ' + _email);
            // tbd: ask for confirmation
            //  store.authService.resetPassword(_email);
          }
          catch (_ex) {
            console.error(_ex);
          }
        }
      },

      /**
       * Set the password for the user account to a given value.
       * This is only possible if the user account has been created before.
       * This is a sensitive operation and should be avoided (as the admin then knows the user's password).
       */
      async setPassword(): Promise<void> {
        const _user = store.selectedUser();
        if (!_user) {
          if (store.selectedPerson()) {
            patchState(store, { log: [], logTitle: 'user is missing; please create a user and account first for this person' });
            warn('RolesStore.setPassword: user is missing; please create a user and account first for this person.');
          } else {
            patchState(store, { log: [], logTitle: 'please select a person first' });
            warn('RolesStore.setPassword: please select a person first.');
          }
        } else { // a user is selected 
          patchState(store, { log: [], logTitle: 'this is not yet implemented as it needs a cloud function' });
          console.log('RolesPageComponent.setPassword: this is not yet implemented as it needs a cloud function');
          /*
              see: https://stackoverflow.com/questions/29889729/how-to-get-the-email-of-any-user-in-firebase-based-on-user-id
              1) Implement cloud functions with admin SDK:
                admin.auth().getUser(uid)
                admin.auth().getUserByEmail(email)
                admin.auth().getUserByPhoneNumber(phoneNumber) 
  
                admin.auth().getUser(data.uid)
                  .then(userRecord => resolve(userRecord.toJSON().email))
                  .catch(error => reject({status: 'error', code: 500, error}))
  
              2) Call the cloud function from the client
          */
        }
      },

      async checkAuthorisation(): Promise<void> {
        const _log: LogInfo[] = [];
        const _person = store.selectedPerson();
        if (!_person) {
          patchState(store, { log: [], logTitle: 'please select a person first' });
          return;
        }
        const _email = _person.fav_email;
        patchState(store, { log: [], logTitle: `checking authorisation for ${_person.firstName} ${_person.lastName}/${_person.bkey}/${_email}` });

        if (!_email || _email.length === 0) {
          patchState(store, { log: logMessage(_log, 'The person does not have an email address. Therefore, an account can not be opened.') });
        } else {
          patchState(store, { log: logMessage(_log, 'Email address: ' + _email) });
        }

        const _user = store.selectedUser();
        if (!_user) {
          patchState(store, { log: logMessage(_log, 'user is missing; please create a user and Firebase account for this person') });
        } else {
          patchState(store, { log: logMessage(_log, 'Corresponding user: ' + _user.bkey) });
          patchState(store, { log: logMessage(_log, 'isArchived: ' + _user.isArchived) });
          patchState(store, { log: logMessage(_log, 'user-person link: ' + (_user.personKey === _person.bkey ? 'OK' : 'ERROR: ' + _user.personKey + ' != ' + _person.bkey)) });
          patchState(store, { log: logMessage(_log, 'tenants: ' + _user.tenants.join(', ')) });
          patchState(store, { log: logMessage(_log, 'roles: ' + Object.keys(_user.roles)) });

          // tbd: check firebase auth user account -> how ? lookup by email ? 
          // tbd: check for Firebase acocunt and person not having a user
          // tbd: check for all users that have the same email address (and different tenants)
        }
      },

      impersonateUser(uid: string): void {
        const _log: LogInfo[] = [];
        const _user = store.selectedUser();
        patchState(store, { log: [], logTitle: `impersonating user ${_user?.loginEmail}}` });
        if (!_user) {
          patchState(store, { log: logMessage(_log, 'no user, please select a person first') });
          return;
        } else {
          patchState(store, { log: logMessage(_log, `user <${_user.bkey}/${_user.loginEmail}> exists`) });
        }
        try {
          // Get a reference to the Firebase Functions service.
          const functions = getFunctions(getApp(), 'europe-west6'); // Use the correct region for your functions. 
          if (store.appStore.env.useEmulators) {
            connectFunctionsEmulator(functions, 'localhost', 5001);
          }
          const impersonateUserFunction = httpsCallable(functions, 'impersonateUser');
          impersonateUserFunction({ uid: uid });
        }
        catch (_ex) {
          console.error('AocRolesStore.impersonateUser: Error calling impersonateUser function:', _ex);
        }
      },

      async checkChatUser(): Promise<void> {
        const _log: LogInfo[] = [];
        const _user = store.selectedUser();
        patchState(store, { log: [], logTitle: `checking authorisation for user ${_user?.loginEmail}}` });
        if (!_user) {
          patchState(store, { log: logMessage(_log, 'no user, please select a person first') });
          return;
        } else {
          patchState(store, { log: logMessage(_log, `user <${_user.bkey}/${_user.loginEmail}> exists`) });
        }
        if (!isPlatformBrowser(store.platformId)) {
          patchState(store, { log: logMessage(_log, `wrong platform, should be web`) });
          return;
        } else {
          const _platform = Capacitor.getPlatform();
          patchState(store, { log: logMessage(_log, `platform is <${_platform}> (should be web)`) });
        }
        if (!store.chatUser()) {
          patchState(store, { log: logMessage(_log, `user <${_user.bkey}/${_user.loginEmail}> is not yet created`) });
        } else {
          patchState(store, { log: logMessage(_log, `user <${_user.bkey}/${_user.loginEmail}> is already created`) });
        }
        try {
          // Get a reference to the Firebase Functions service.
          const functions = getFunctions(getApp(), 'europe-west6'); // Use the correct region for your functions. 
          if (store.appStore.env.useEmulators) {
            connectFunctionsEmulator(functions, 'localhost', 5001);
          }
          const getOtherStreamUserToken = httpsCallable(functions, 'getOtherStreamUserToken');
          const _result = await getOtherStreamUserToken({ uid: _user.bkey });
          const _token = _result.data as string;
          patchState(store, { log: logMessage(_log, `stream token <${_token}`) });

        }
        catch (_ex) {
          console.error('AocRolesStore.checkChatUser: Error checking chat user:', _ex);
        }
      },

      async revokeStreamUserToken(): Promise<void> {
        const _log: LogInfo[] = [];
        const _user = store.selectedUser();
        patchState(store, { log: [], logTitle: `revoking stream user token for user ${_user?.loginEmail}}` });
        if (!_user) {
          patchState(store, { log: logMessage(_log, 'no user, please select a person first') });
          return;
        } else {
          patchState(store, { log: logMessage(_log, `user <${_user.bkey}/${_user.loginEmail}> exists`) });
        }
        try {
          const functions = getFunctions(getApp(), 'europe-west6'); // Use the correct region for your functions. 
          if (store.appStore.env.useEmulators) {
            connectFunctionsEmulator(functions, 'localhost', 5001);
          }
          const revokeOtherStreamUserToken = httpsCallable(functions, 'revokeOtherStreamUserToken');
          await revokeOtherStreamUserToken({ uid: _user.bkey });
          patchState(store, { log: logMessage(_log, `stream token revoked for user <${_user.bkey}/${_user.loginEmail}>`) });
        }
        catch (_ex) {
          console.error('AocRolesStore.revokeStreamUserToken: Error revoking stream user token:', _ex);
        }
      },

      async createStreamUser(): Promise<void> {
        const _log: LogInfo[] = [];
        const _user = store.selectedUser();
        patchState(store, { log: [], logTitle: `creating stream user for user ${_user?.bkey}/${_user?.loginEmail}}` });
        if (!_user) {
          patchState(store, { log: logMessage(_log, 'no user, please select a person first') });
          return;
        } else {
          patchState(store, { log: logMessage(_log, `user <${_user.bkey}/${_user.loginEmail}> exists`) });
        }
        try {
          const functions = getFunctions(getApp(), 'europe-west6'); // Use the correct region for your functions. 
          if (store.appStore.env.useEmulators) {
            connectFunctionsEmulator(functions, 'localhost', 5001);
          }
          const createOtherStreamUser = httpsCallable(functions, 'createOtherStreamUser');
          await createOtherStreamUser({ uid: _user.bkey, name: _user.firstName + ' ' + _user.lastName, email: _user.loginEmail, image: '' });
          patchState(store, { log: logMessage(_log, `stream user created for user <${_user.bkey}/${_user.loginEmail}>`) });
        }
        catch (_ex) {
          console.error('AocRolesStore.createStreamUser: Error creating stream user:', _ex);
        }

      }
    }
  })
);
