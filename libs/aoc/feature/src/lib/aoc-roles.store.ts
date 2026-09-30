import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { from, of } from 'rxjs';

import { AUTH, isFirestoreInitializedCheck } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { AppStore, PersonSelectModal, PersonSelectResult } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { FirebaseUserModel, LogInfo, logMessage, PersonCollection, PersonModel, UserCollection, UserModel } from '@okr/shared-models';
import { error } from '@okr/shared-util-angular';
import { debugListLoaded, debugMessage, findUserByPersonKey, getSystemQuery, hasRole, isPerson, warn } from '@okr/shared-util-core';

import { generatePassword, setPassword, getFirebaseUser, updateFirebaseUser, AOC_I18N_KEYS } from '@okr/aoc-util';
import { isSyntheticLoginEmail } from '@okr/user-util';
import { AuthService } from '@okr/auth-data-access';
import { UserService } from '@okr/user-data-access';
import { FbuserEditModal } from '@okr/user-feature';

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
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(AOC_I18N_KEYS),
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
        return of(findUserByPersonKey(users, person.okey));
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
          id: user.okey,
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
        return from(getFirebaseUser(selectedUser.okey));
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
      reset() {
        patchState(store, { ...initialState });
      },

      reload() {
        store.personsResource.reload();
        store.usersResource.reload();
        store.userResource.reload();
        store.fbUserResource.reload();
      },

      async selectPerson(): Promise<void> {
        const modal = await store.modalController.create({
          component: PersonSelectModal,
          cssClass: 'list-modal',
          componentProps: {
            selectedTag: '',
            currentUser: store.currentUser(),
          },
        });
        modal.present();
        const { data, role } = await modal.onWillDismiss<PersonSelectResult>();
        if (role === 'confirm' && data?.kind === 'predefined' && isPerson(data.person, store.appStore.env.tenantId)) {
          this.setSelectedPerson(data.person);
        }
      },

      /**
       * Opens a user account for the selected person through the openAccount Cloud Function
       * (syncPersonAccount, spec 1.71 §5.3) — the one code path that knows the shared-email rule and
       * hands out a Benutzername when the favourite email already belongs to another person. The
       * former client-side path (getUidByEmail + createFirebaseAccount + userService.create) attached
       * such a person to the other person's uid.
       * @param password - optional password for the new account. openAccount sets a random one;
       *   if a password is given, it replaces that one afterwards.
       */
      async createAccountAndUser(password?: string): Promise<void> {
        const person = store.selectedPerson();
        if (!person?.okey) {
          warn('RolesStore.createAccountAndUser: please select a person first.');
          return;
        }
        try {
          patchState(store, { log: [], logTitle: `opening an account for ${person.firstName} ${person.lastName}/${person.okey}` });
          const fn = httpsCallable<{ personKey: string; tenantId: string; action: 'open' }, { ok: boolean; outcome?: string; uid?: string; loginId?: string }>(
            getFunctions(getApp(), 'europe-west6'), 'syncPersonAccount');
          const { data } = await fn({ personKey: person.okey, tenantId: store.appStore.env.tenantId, action: 'open' });
          const opened = data.outcome === 'created' || data.outcome === 'createdWithLoginId';
          if (opened && data.uid && password) {
            await setPassword(data.uid, generatePassword(password), store.appStore.env.useEmulators);
          }
          const loginIdInfo = data.outcome === 'createdWithLoginId' ? ` — Benutzername ${data.loginId}` : '';
          patchState(store, { logTitle: `account for ${person.okey}: ${data.outcome ?? 'unknown'}${loginIdInfo}` });
          store.usersResource.reload();
          store.userResource.reload();
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
            // a Benutzername account is reset by its Benutzername: the mail goes to the favourite
            // email (spec 1.71 §5.2) — the synthetic login address has no mailbox
            const target = isSyntheticLoginEmail(user.loginEmail) ? user.loginId : user.loginEmail;
            const email = store.appStore.env.production ? target : store.appStore.currentUser()?.loginEmail;
            patchState(store, { log: [], logTitle: `sending reset password email to ${email}` });
            if (email) {
              // resetPassword no longer navigates or toasts — the console reports through its
              // own log panel, which is the surface an admin is actually watching here.
              const sent = await store.authService.resetPassword(email);
              patchState(store, { logTitle: sent ? `reset password email sent to ${email}` : `sending reset password email to ${email} FAILED` });
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
            patchState(store, { log: [], logTitle: `setting new password for user ${user.okey}` });
            setPassword(user.okey, generatedPwd, store.appStore.env.useEmulators);
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
              component: FbuserEditModal,
              componentProps: {
                fbuser: fbuser,
                currentUser: store.currentUser(),
              },
            });
            modal.present();
            const { data, role } = await modal.onWillDismiss();
            if (role === 'confirm') {
              await updateFirebaseUser(data as FirebaseUserModel, store.appStore.env.useEmulators);
              this.reload();
            }
          } catch (ex) {
            error(store.toastController, 'RolesStore.updateFbuser -> error: ' + ((ex as Error).message ?? JSON.stringify(ex)));
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
        const email = store.appStore.getDirectoryEntry(`person.${person.okey}`)?.favEmail ?? '';
        patchState(store, { log: [], logTitle: `checking authorisation for ${person.firstName} ${person.lastName}/${person.okey}/${email}` });
        patchState(store, { log: logMessage(log, 'person ID: ' + person.okey) });
        patchState(store, { log: logMessage(log, 'person tenants: ' + person.tenants.join(', ')) });
        if (!email || email.length === 0) {
          patchState(store, { log: logMessage(log, 'The person does not have an email address. Therefore, an account can not be opened.') });
        } else {
          patchState(store, { log: logMessage(log, 'person email: ' + email) });

          const user = store.selectedUser();
          if (!user) {
            patchState(store, { log: logMessage(log, 'user is missing') });
          } else {
            patchState(store, { log: logMessage(log, 'user ID: ' + user.okey) });
            patchState(store, { log: logMessage(log, 'user email: ' + user.loginEmail) });
            patchState(store, { log: logMessage(log, 'isArchived: ' + user.isArchived) });
            patchState(store, { log: logMessage(log, 'user tenants: ' + user.tenants.join(', ')) });
            patchState(store, { log: logMessage(log, 'roles: ' + Object.keys(user.roles)) });
            patchState(store, { log: logMessage(log, 'user-person link: ' + (user.personKey === person.okey ? 'OK' : 'ERROR: ' + user.personKey + ' != ' + person.okey)) });
          }
          const fbUser = store.selectedFbUser();
          if (!fbUser) {
            patchState(store, { log: logMessage(log, 'firebase user was not found by id (reason could be that there is no user)') });
            // tbd: try to get the user with uid = getuidByEmail(person.email) -> getFirebaseUser(uid)
          } else {
            patchState(store, { log: logMessage(log, 'firebase user ID: ' + fbUser.uid) });
            patchState(store, { log: logMessage(log, 'firebase email: ' + fbUser.email) });
            if (user) {
              patchState(store, { log: logMessage(log, 'fbUser-user link: ' + (fbUser.uid === user.okey ? 'OK' : 'ERROR: ' + fbUser.uid + ' != ' + user.okey)) });
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
          patchState(store, { log: logMessage(log, `AocRolesStore.impersonateUser: user <${user.okey}/${user.loginEmail}> exists`) });
        }
        try {
          // Get a reference to the Firebase Functions service.
          const functions = getFunctions(getApp(), 'europe-west6'); // Use the correct region for your functions.
          if (store.appStore.env.useEmulators) {
            connectFunctionsEmulator(functions, 'localhost', 5001);
          }
          const createCustomTokenFunction = httpsCallable(functions, 'createCustomToken');
          const result = await createCustomTokenFunction({ uid: user.okey });
          patchState(store, { log: [], logTitle: `AocRolesStore.impersonateUser: createCustomToken was successful: ${result}` });
          const token = result.data as string;
          patchState(store, { log: logMessage(log, `AocRolesStore.impersonateUser: impersonation token <${token}>`) });
          // Now we can use the impersonation token to sign in the user
          await store.authService.loginWithToken(token, 'public/welcome');
          patchState(store, { log: logMessage(log, `AocRolesStore.impersonateUser: user <${user.okey}/${user.loginEmail}> is now impersonated`) });
        } catch (ex) {
          console.error('AocRolesStore.impersonateUser: Error calling impersonateUser function:', ex);
        }
      },

      async updateUser(newUser: UserModel): Promise<void> {
        store.userService.update(newUser, store.currentUser());
      },
    };
  })
);
