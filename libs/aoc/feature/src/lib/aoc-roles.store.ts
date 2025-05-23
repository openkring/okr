import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { of } from 'rxjs';

import { FIRESTORE } from '@bk2/shared/config';
import { debugListLoaded, isPerson, warn } from '@bk2/shared/util';
import { findUserByPersonKey, getSystemQuery, searchData } from '@bk2/shared/data';
import { LogInfo, logMessage, PersonCollection, PersonModel, UserCollection, UserModel } from '@bk2/shared/models';
import { PersonSelectModalComponent } from '@bk2/shared/feature';

import { AppStore } from '@bk2/auth/feature';
import { AuthService } from '@bk2/auth/data';

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
    firestore: inject(FIRESTORE),
    authService: inject(AuthService),
    modalController: inject(ModalController),    
  })),
  withProps((store) => ({
    personsResource: rxResource({
      loader: () => {
        const persons$ = searchData<PersonModel>(store.firestore, PersonCollection, getSystemQuery(store.appStore.env.owner.tenantId), 'lastName', 'asc');
        debugListLoaded<PersonModel>('RolesStore.persons', persons$, store.appStore.currentUser());
        return persons$;
      }
    }),
    usersResource: rxResource({
      loader: () => {
        const users$ = searchData<UserModel>(store.firestore, UserCollection, getSystemQuery(store.appStore.env.owner.tenantId), 'loginEmail', 'asc');
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
      request: () => ({
        person: store.selectedPerson()
      }),
      loader: ({request}) => {
        const _users = store.users();
        const _person = request.person;
        if (!_person || !_users) return of(undefined);
        return of(findUserByPersonKey(_users, _person.bkey));
      }
    }),
  })),

  withComputed((state) => {
    return {
      selectedUser: computed(() => state.userResource.value()),
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
          if (isPerson(data, store.appStore.env.owner.tenantId)) {
            console.log('RolesStore: selected person: ', data);
            this.setSelectedPerson(data);
          } 
        }
      },

      /**
       * Create a new Firebase user account for the selected person if it does not yet exist.
       * Create a new user account for the same user to link the Firebase account with the subject.
       */
      async createAccountAndUser(): Promise<void> {
        const _person = store.selectedPerson();
        if (!_person) { 
          warn('RolesStore.createAccountAndUser: please select a person first.');
        } else {
          try {
            patchState(store, { log: [], logTitle: `creating account for ${_person.firstName} ${_person.lastName}/${_person.bkey}/${_person.fav_email}` });
            console.log(`RoleStore.createAccountAndUser: found ${_person.firstName} ${_person.lastName}/${_person.bkey}/${_person.fav_email}`);
            //const _user = createUserFromSubject(_person);
            //await this.userService.createUserAndAccount(_user);
          }
          catch(_ex) {
              console.error(_ex);
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
          catch(_ex) {
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
      } 
    }
  })
);
