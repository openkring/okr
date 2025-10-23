import { isPlatformBrowser } from '@angular/common';
import { computed, inject, PLATFORM_ID } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Capacitor } from '@capacitor/core';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { firstValueFrom, from, of } from 'rxjs';

import { AUTH, isFirestoreInitializedCheck } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore, PersonSelectModalComponent } from '@bk2/shared-feature';
import { FirebaseUserModel, LogInfo, logMessage, PersonCollection, PersonModel, UserCollection, UserModel } from '@bk2/shared-models';
import { error } from '@bk2/shared-util-angular';
import { debugListLoaded, findUserByPersonKey, getSystemQuery, hasRole, isPerson, warn } from '@bk2/shared-util-core';

import { createFirebaseAccount, createUserFromPerson, getUidByEmail, generatePassword, isValidEmail, setPassword, getFirebaseUser, updateFirebaseUser } from '@bk2/aoc-util';
import { AuthService } from '@bk2/auth-data-access';
import { UserService } from '@bk2/user-data-access';
import { FbuserEditModalComponent } from '@bk2/user-feature';

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
  logTitle: '',
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
    platformId: inject(PLATFORM_ID),
  })),
  withProps(store => ({
    personsResource: rxResource({
      stream: () => {
        if (!isFirestoreInitializedCheck()) {
          console.warn('AocRolesStore.personsResource: Firestore not initialized, returning empty stream.');
          return of([]);
        }
        const persons$ = store.firestoreService.searchData<PersonModel>(PersonCollection, getSystemQuery(store.appStore.env.tenantId), 'lastName', 'asc');
        debugListLoaded<PersonModel>('RolesStore.persons', persons$, store.appStore.currentUser());
        return persons$;
      },
    }),
    usersResource: rxResource({
      stream: () => {
        if (!isFirestoreInitializedCheck()) {
          console.warn('AocRolesStore.usersResource: Firestore not initialized, returning empty stream.');
          return of([]);
        }
        const users$ = store.firestoreService.searchData<UserModel>(UserCollection, getSystemQuery(store.appStore.env.tenantId), 'loginEmail', 'asc');
        debugListLoaded<UserModel>('RolesStore.users', users$, store.appStore.currentUser());
        return users$;
      },
    }),
  })),

  withComputed(state => {
    return {
      currentUser: computed(() => state.appStore.currentUser()),
      isLoading: computed(() => state.personsResource.isLoading()),
      persons: computed(() => state.personsResource.value()),
      users: computed(() => state.usersResource.value()),
    };
  }),

  withProps(store => ({
    userResource: rxResource({
      params: () => ({
        person: store.selectedPerson(),
      }),
      stream: ({ params }) => {
        const _users = store.users();
        const _person = params.person;
        if (!_person || !_users) return of(undefined);
        return of(findUserByPersonKey(_users, _person.bkey));
      },
    }),
  })),

  withComputed(state => {
    return {
      selectedUser: computed(() => state.userResource.value()),
      chatUser: computed(() => {
        const _user = state.userResource.value();
        if (!_user) return undefined;
        return {
          id: _user.bkey,
          name: _user.loginEmail,
          imageUrl: '',
        };
      }),
    };
  }),

  withProps(store => ({
    fbUserResource: rxResource({
      params: () => ({
        selectedUser: store.selectedUser(),
      }),
      stream: ({ params }) => {
        const _selectedUser = params.selectedUser;
        if (!_selectedUser) return of(undefined);
        return from(getFirebaseUser(_selectedUser.bkey));
      },
    }),
  })),

  withComputed(state => {
    return {
      selectedFbUser: computed(() => state.fbUserResource.value()),
    };
  }),

  withMethods(store => {
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
            currentUser: store.currentUser(),
          },
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
       * On successful creation of the firebase user account, this new user is signed in. That's why we update the user to the former current user.
       * User account creation can fail if the account already exists or the password is invalid.
       * see https://stackoverflow.com/questions/37517208/firebase-kicks-out-current-user/38013551#38013551
       * for solutions to solve this admin function on the client side without being looged out.
       * @param password - optional password for the new user account. If not given, a random password is generated.
       */
      async createAccountAndUser(password?: string): Promise<void> {
        const _password = generatePassword(password);

        const _person = store.selectedPerson();
        if (!_person) {
          warn('RolesStore.createAccountAndUser: please select a person first.');
          return;
        }
        try {
          patchState(store, { log: [], logTitle: `creating account for ${_person.firstName} ${_person.lastName}/${_person.bkey}/${_person.fav_email}` });
          const _user = createUserFromPerson(_person, store.appStore.env.tenantId);
          if (!_user.loginEmail || _user.loginEmail.length === 0 || !isValidEmail(_user.loginEmail)) {
            console.warn('RolesStore.createAccountAndUser: loginEmail is missing or invalid - can not register this user');
            return;
          }
          let _uid = await getUidByEmail(_user.loginEmail);
          if (!_uid) {
            _uid = await createFirebaseAccount(store.toastController, _user.loginEmail, _password);
            console.log(`RolesStore.createAccountAndUser: Firebase user <${_uid}/${_user.loginEmail}> created.`);
          } else {
            console.log(`RolesStore.createAccountAndUser: Firebase user <${_uid}/${_user.loginEmail}> already exists.`);
          }

          if (_uid) {
            // the Firebase account exists, now create the user
            // check whether this user already exists
            const _existingUser = await firstValueFrom(store.userService.read(_uid));
            console.log(`RolesStore.createAccountAndUser: read user ${_uid}`, _existingUser);
            if (!_existingUser) {
              _user.bkey = _uid;
              console.log('RolesStore.createAccountAndUser: creating user: ', _user);
              await store.userService.create(_user, store.currentUser());
              store.usersResource.reload();
              store.userResource.reload();
              console.log(`RolesStore.createAccountAndUser: user ${_uid} was created.`);
            } else {
              console.log(`RolesStore.createAccountAndUser: user ${_uid} already exists.`);
            }
          } else {
            console.error('RolesStore.createAccountAndUser: did not receive a valid firebase uid.');
          }
        } catch (_ex) {
          error(store.toastController, 'RolesStore.createAccountAndUser -> error: ' + JSON.stringify(_ex));
        }
      },

      /**
       * Reset the password for the user account. This sends a reset password email to the user, so that the email receiver can set a new password.
       * This is only possible if the user account has been created before.
       */
      async resetPassword(): Promise<void> {
        const _user = store.selectedUser();
        if (!_user) {
          if (store.selectedPerson()) {
            patchState(store, { log: [], logTitle: 'user is missing.' });
            warn('RolesStore.resetPassword: user is missing.');
          } else {
            warn('RolesStore.resetPassword: please select a person first.');
          }
        } else {
          // a user is selected
          try {
            // we send the password reset email to the selected user (in prod) or to the current user (in dev)
            const _email = store.appStore.env.production ? _user.loginEmail : store.appStore.currentUser()?.loginEmail;
            patchState(store, { log: [], logTitle: `sending reset password email to ${_email}` });
            if (_email) {
              store.authService.resetPassword(_email, 'aoc/roles');
            }
          } catch (_ex) {
            error(store.toastController, 'RolesStore.resetPassword -> error: ' + JSON.stringify(_ex));
          }
        }
      },

      /**
       * Set the password for the user account to a given value.
       * This is only possible if the user account has been created before.
       * This is a sensitive operation and should be avoided (as the admin then knows the user's password).
       * @param password - optional password. If not given, a random password is generated.
       */
      async setPassword(password?: string): Promise<void> {
        const _password = generatePassword(password);

        const _user = store.selectedUser();
        if (!_user) {
          if (store.selectedPerson()) {
            patchState(store, { log: [], logTitle: 'user is missing' });
            warn('RolesStore.setPassword: user is missing');
          } else {
            patchState(store, { log: [], logTitle: 'please select a person first' });
            warn('RolesStore.setPassword: please select a person first.');
          }
        } else {
          // a user is selected
          try {
            patchState(store, { log: [], logTitle: `setting new password for user ${_user.bkey}` });
            setPassword(_user.bkey, _password, store.appStore.env.useEmulators);
          } catch (_ex) {
            error(store.toastController, 'RolesStore.setPassword -> error: ' + JSON.stringify(_ex));
          }
        }
      },

      /**
       * Update the selected firebase user.
       */
      async updateFbuser(): Promise<void> {
        const _fbuser = store.selectedFbUser();
        if (!_fbuser) {
          patchState(store, { log: [], logTitle: 'firebase user is missing' });
          warn('RolesStore.updateFbuser: firebase user is missing');
        } else {
          // a firebase user is selected
          try {
            patchState(store, { log: [], logTitle: `updating firebase user ${_fbuser.uid}.` });
            const _modal = await store.modalController.create({
              component: FbuserEditModalComponent,
              componentProps: {
                fbuser: _fbuser,
                currentUser: store.currentUser(),
              },
            });
            _modal.present();
            const { data, role } = await _modal.onWillDismiss();
            if (role === 'confirm') {
              await updateFirebaseUser(data as FirebaseUserModel, store.appStore.env.useEmulators);
            }
          } catch (_ex) {
            error(store.toastController, 'RolesStore.updateFbuser -> error: ' + JSON.stringify(_ex));
          }
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
        patchState(store, { log: logMessage(_log, 'person ID: ' + _person.bkey) });
        patchState(store, { log: logMessage(_log, 'person tenants: ' + _person.tenants.join(', ')) });
        if (!_email || _email.length === 0) {
          patchState(store, { log: logMessage(_log, 'The person does not have an email address. Therefore, an account can not be opened.') });
        } else {
          patchState(store, { log: logMessage(_log, 'person email: ' + _email) });

          const _user = store.selectedUser();
          if (!_user) {
            patchState(store, { log: logMessage(_log, 'user is missing') });
          } else {
            patchState(store, { log: logMessage(_log, 'user ID: ' + _user.bkey) });
            patchState(store, { log: logMessage(_log, 'user email: ' + _user.loginEmail) });
            patchState(store, { log: logMessage(_log, 'isArchived: ' + _user.isArchived) });
            patchState(store, { log: logMessage(_log, 'user tenants: ' + _user.tenants.join(', ')) });
            patchState(store, { log: logMessage(_log, 'roles: ' + Object.keys(_user.roles)) });
            patchState(store, { log: logMessage(_log, 'user-person link: ' + (_user.personKey === _person.bkey ? 'OK' : 'ERROR: ' + _user.personKey + ' != ' + _person.bkey)) });
          }
          const _fbUser = store.selectedFbUser();
          if (!_fbUser) {
            patchState(store, { log: logMessage(_log, 'firebase user was not found by id (reason could be that there is no user)') });
            // tbd: try to get the user with uid = getuidByEmail(person.email) -> getFirebaseUser(uid)
          } else {
            patchState(store, { log: logMessage(_log, 'firebase user ID: ' + _fbUser.uid) });
            patchState(store, { log: logMessage(_log, 'firebase email: ' + _fbUser.email) });
            if (_user) {
              patchState(store, { log: logMessage(_log, 'fbUser-user link: ' + (_fbUser.uid === _user.bkey ? 'OK' : 'ERROR: ' + _fbUser.uid + ' != ' + _user.bkey)) });
            }
          }
          // tbd: check for all users that have the same email address (and different tenants)
        }
      },

      async impersonateUser(): Promise<void> {
        const _log: LogInfo[] = [];
        const _user = store.selectedUser();
        if (hasRole('admin', store.currentUser()) === false) {
          patchState(store, { log: logMessage(_log, 'You are not allowed to impersonate users. Only admin users can do this.') });
          return;
        }
        patchState(store, { log: [], logTitle: `AocRolesStore.impersonateUser: impersonating user ${_user?.loginEmail}}` });
        if (!_user) {
          patchState(store, { log: logMessage(_log, 'AocRolesStore.impersonateUser: no user, please select a person first') });
          return;
        } else {
          patchState(store, { log: logMessage(_log, `AocRolesStore.impersonateUser: user <${_user.bkey}/${_user.loginEmail}> exists`) });
        }
        try {
          // Get a reference to the Firebase Functions service.
          const functions = getFunctions(getApp(), 'europe-west6'); // Use the correct region for your functions.
          if (store.appStore.env.useEmulators) {
            connectFunctionsEmulator(functions, 'localhost', 5001);
          }
          const _createCustomTokenFunction = httpsCallable(functions, 'createCustomToken');
          const _result = await _createCustomTokenFunction({ uid: _user.bkey });
          patchState(store, { log: [], logTitle: `AocRolesStore.impersonateUser: createCustomToken was successful: ${_result}` });
          const _token = _result.data as string;
          patchState(store, { log: logMessage(_log, `AocRolesStore.impersonateUser: impersonation token <${_token}>`) });
          // Now we can use the impersonation token to sign in the user
          await store.authService.loginWithToken(_token, 'public/welcome');
          patchState(store, { log: logMessage(_log, `AocRolesStore.impersonateUser: user <${_user.bkey}/${_user.loginEmail}> is now impersonated`) });
        } catch (_ex) {
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
        } catch (_ex) {
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
        } catch (_ex) {
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
        } catch (_ex) {
          console.error('AocRolesStore.createStreamUser: Error creating stream user:', _ex);
        }
      },

      async updateUser(newUser: UserModel): Promise<void> {
        store.userService.update(newUser, store.currentUser(), '@user.operation.update');
      },
    };
  })
);
