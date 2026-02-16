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
import { debugListLoaded, debugMessage, findUserByPersonKey, getSystemQuery, hasRole, isPerson, warn } from '@bk2/shared-util-core';

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
      params: () => ({
        currentUser: store.appStore.currentUser()
      }),
      stream: ({params}) => {
        if (!isFirestoreInitializedCheck()) {
          debugMessage('AocRolesStore.personsResource: Firestore not initialized, returning empty stream.', params.currentUser);
          return of([]);
        }
        return store.firestoreService.searchData<PersonModel>(PersonCollection, getSystemQuery(store.appStore.env.tenantId), 'lastName', 'asc').pipe(
          debugListLoaded<PersonModel>('RolesStore.persons', params.currentUser)
        );
      },
    }),
    usersResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser()
      }),
      stream: ({params}) => {
        if (!isFirestoreInitializedCheck()) {
          debugMessage('AocRolesStore.usersResource: Firestore not initialized, returning empty stream.', params.currentUser);
          return of([]);
        }
        return store.firestoreService.searchData<UserModel>(UserCollection, getSystemQuery(store.appStore.env.tenantId), 'loginEmail', 'asc').pipe(
          debugListLoaded<UserModel>('RolesStore.users', params.currentUser)
        );
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
        const users = store.users();
        const person = params.person;
        if (!person || !users) return of(undefined);
        return of(findUserByPersonKey(users, person.bkey));
      },
    }),
  })),

  withComputed(state => {
    return {
      selectedUser: computed(() => state.userResource.value()),
      chatUser: computed(() => {
        const user = state.userResource.value();
        if (!user) return undefined;
        return {
          id: user.bkey,
          name: user.loginEmail,
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
        const selectedUser = params.selectedUser;
        if (!selectedUser) return of(undefined);
        return from(getFirebaseUser(selectedUser.bkey));
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
        const modal = await store.modalController.create({
          component: PersonSelectModalComponent,
          cssClass: 'list-modal',
          componentProps: {
            selectedTag: '',
            currentUser: store.currentUser(),
          },
        });
        modal.present();
        const { data, role } = await modal.onWillDismiss();
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
        const generatedPwd = generatePassword(password);

        const person = store.selectedPerson();
        if (!person) {
          warn('RolesStore.createAccountAndUser: please select a person first.');
          return;
        }
        try {
          patchState(store, { log: [], logTitle: `creating account for ${person.firstName} ${person.lastName}/${person.bkey}/${person.favEmail}` });
          const user = createUserFromPerson(person, store.appStore.env.tenantId);
          if (!user.loginEmail || user.loginEmail.length === 0 || !isValidEmail(user.loginEmail)) {
            console.warn('RolesStore.createAccountAndUser: loginEmail is missing or invalid - can not register this user');
            return;
          }
          let uid = await getUidByEmail(user.loginEmail);
          if (!uid) {
            uid = await createFirebaseAccount(store.toastController, user.loginEmail, generatedPwd);
            console.log(`RolesStore.createAccountAndUser: Firebase user <${uid}/${user.loginEmail}> created.`);
          } else {
            console.log(`RolesStore.createAccountAndUser: Firebase user <${uid}/${user.loginEmail}> already exists.`);
          }

          if (uid) {
            // the Firebase account exists, now create the user
            // check whether this user already exists
            const existingUser = await firstValueFrom(store.userService.read(uid));
            console.log(`RolesStore.createAccountAndUser: read user ${uid}`, existingUser);
            if (!existingUser) {
              user.bkey = uid;
              console.log('RolesStore.createAccountAndUser: creating user: ', user);
              await store.userService.create(user, store.currentUser());
              store.usersResource.reload();
              store.userResource.reload();
              console.log(`RolesStore.createAccountAndUser: user ${uid} was created.`);
            } else {
              console.log(`RolesStore.createAccountAndUser: user ${uid} already exists.`);
            }
          } else {
            console.error('RolesStore.createAccountAndUser: did not receive a valid firebase uid.');
          }
        } catch (ex) {
          error(store.toastController, 'RolesStore.createAccountAndUser -> error: ' + JSON.stringify(ex));
        }
      },

      /**
       * Reset the password for the user account. This sends a reset password email to the user, so that the email receiver can set a new password.
       * This is only possible if the user account has been created before.
       */
      async resetPassword(): Promise<void> {
        const user = store.selectedUser();
        if (!user) {
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
            const email = store.appStore.env.production ? user.loginEmail : store.appStore.currentUser()?.loginEmail;
            patchState(store, { log: [], logTitle: `sending reset password email to ${email}` });
            if (email) {
              store.authService.resetPassword(email, 'aoc/roles');
            }
          } catch (ex) {
            error(store.toastController, 'RolesStore.resetPassword -> error: ' + JSON.stringify(ex));
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
        const generatedPwd = generatePassword(password);

        const user = store.selectedUser();
        if (!user) {
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
            patchState(store, { log: [], logTitle: `setting new password for user ${user.bkey}` });
            setPassword(user.bkey, generatedPwd, store.appStore.env.useEmulators);
          } catch (ex) {
            error(store.toastController, 'RolesStore.setPassword -> error: ' + JSON.stringify(ex));
          }
        }
      },

      /**
       * Update the selected firebase user.
       */
      async updateFbuser(): Promise<void> {
        const fbuser = store.selectedFbUser();
        if (!fbuser) {
          patchState(store, { log: [], logTitle: 'firebase user is missing' });
          warn('RolesStore.updateFbuser: firebase user is missing');
        } else {
          // a firebase user is selected
          try {
            patchState(store, { log: [], logTitle: `updating firebase user ${fbuser.uid}.` });
            const modal = await store.modalController.create({
              component: FbuserEditModalComponent,
              componentProps: {
                fbuser: fbuser,
                currentUser: store.currentUser(),
              },
            });
            modal.present();
            const { data, role } = await modal.onWillDismiss();
            if (role === 'confirm') {
              await updateFirebaseUser(data as FirebaseUserModel, store.appStore.env.useEmulators);
            }
          } catch (ex) {
            error(store.toastController, 'RolesStore.updateFbuser -> error: ' + JSON.stringify(ex));
          }
        }
      },

      async checkAuthorisation(): Promise<void> {
        const log: LogInfo[] = [];
        const person = store.selectedPerson();
        if (!person) {
          patchState(store, { log: [], logTitle: 'please select a person first' });
          return;
        }
        const email = person.favEmail;
        patchState(store, { log: [], logTitle: `checking authorisation for ${person.firstName} ${person.lastName}/${person.bkey}/${email}` });
        patchState(store, { log: logMessage(log, 'person ID: ' + person.bkey) });
        patchState(store, { log: logMessage(log, 'person tenants: ' + person.tenants.join(', ')) });
        if (!email || email.length === 0) {
          patchState(store, { log: logMessage(log, 'The person does not have an email address. Therefore, an account can not be opened.') });
        } else {
          patchState(store, { log: logMessage(log, 'person email: ' + email) });

          const user = store.selectedUser();
          if (!user) {
            patchState(store, { log: logMessage(log, 'user is missing') });
          } else {
            patchState(store, { log: logMessage(log, 'user ID: ' + user.bkey) });
            patchState(store, { log: logMessage(log, 'user email: ' + user.loginEmail) });
            patchState(store, { log: logMessage(log, 'isArchived: ' + user.isArchived) });
            patchState(store, { log: logMessage(log, 'user tenants: ' + user.tenants.join(', ')) });
            patchState(store, { log: logMessage(log, 'roles: ' + Object.keys(user.roles)) });
            patchState(store, { log: logMessage(log, 'user-person link: ' + (user.personKey === person.bkey ? 'OK' : 'ERROR: ' + user.personKey + ' != ' + person.bkey)) });
          }
          const fbUser = store.selectedFbUser();
          if (!fbUser) {
            patchState(store, { log: logMessage(log, 'firebase user was not found by id (reason could be that there is no user)') });
            // tbd: try to get the user with uid = getuidByEmail(person.email) -> getFirebaseUser(uid)
          } else {
            patchState(store, { log: logMessage(log, 'firebase user ID: ' + fbUser.uid) });
            patchState(store, { log: logMessage(log, 'firebase email: ' + fbUser.email) });
            if (user) {
              patchState(store, { log: logMessage(log, 'fbUser-user link: ' + (fbUser.uid === user.bkey ? 'OK' : 'ERROR: ' + fbUser.uid + ' != ' + user.bkey)) });
            }
          }
          // tbd: check for all users that have the same email address (and different tenants)
        }
      },

      async impersonateUser(): Promise<void> {
        const log: LogInfo[] = [];
        const user = store.selectedUser();
        if (hasRole('admin', store.currentUser()) === false) {
          patchState(store, { log: logMessage(log, 'You are not allowed to impersonate users. Only admin users can do this.') });
          return;
        }
        patchState(store, { log: [], logTitle: `AocRolesStore.impersonateUser: impersonating user ${user?.loginEmail}}` });
        if (!user) {
          patchState(store, { log: logMessage(log, 'AocRolesStore.impersonateUser: no user, please select a person first') });
          return;
        } else {
          patchState(store, { log: logMessage(log, `AocRolesStore.impersonateUser: user <${user.bkey}/${user.loginEmail}> exists`) });
        }
        try {
          // Get a reference to the Firebase Functions service.
          const functions = getFunctions(getApp(), 'europe-west6'); // Use the correct region for your functions.
          if (store.appStore.env.useEmulators) {
            connectFunctionsEmulator(functions, 'localhost', 5001);
          }
          const createCustomTokenFunction = httpsCallable(functions, 'createCustomToken');
          const result = await createCustomTokenFunction({ uid: user.bkey });
          patchState(store, { log: [], logTitle: `AocRolesStore.impersonateUser: createCustomToken was successful: ${result}` });
          const token = result.data as string;
          patchState(store, { log: logMessage(log, `AocRolesStore.impersonateUser: impersonation token <${token}>`) });
          // Now we can use the impersonation token to sign in the user
          await store.authService.loginWithToken(token, 'public/welcome');
          patchState(store, { log: logMessage(log, `AocRolesStore.impersonateUser: user <${user.bkey}/${user.loginEmail}> is now impersonated`) });
        } catch (ex) {
          console.error('AocRolesStore.impersonateUser: Error calling impersonateUser function:', ex);
        }
      },

      async updateUser(newUser: UserModel): Promise<void> {
        store.userService.update(newUser, store.currentUser(), '@user.operation.update');
      },
    };
  })
);
