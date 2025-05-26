import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { computed, inject } from '@angular/core';
import { collection, query } from 'firebase/firestore';
import { collectionData } from 'rxfire/firestore';
import { authState } from 'rxfire/auth';

import { AUTH, DEFAULT_TOAST_LENGTH, ENV, FIRESTORE } from '@bk2/shared/config';
import { AddressCollection, AddressModel, OrgCollection, OrgModel, PersonCollection, PersonModel, ResourceCollection, ResourceModel, TagCollection, TagModel, UserCollection, UserModel } from '@bk2/shared/models';
import { getSystemQuery, searchData } from '@bk2/shared/data-access';

import { UserService } from '@bk2/user/data-access';
import { AuthCredentials } from '@bk2/auth/model';
import { AuthService } from '@bk2/auth/data-access';
import { Observable, of } from 'rxjs';

export type AppState = {
  title: string;
  appName: string;
  version: string;
  tenantId: string;
};

const initialState: AppState = {
  title: '',
  appName: '',
  version: '',
  tenantId: '',
}

export const AppStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withProps(() => ({
    authService: inject(AuthService),
    userService: inject(UserService),
    firestore: inject(FIRESTORE),
    auth: inject(AUTH),
    env: inject(ENV),
    fbUser: toSignal(authState(inject(AUTH)))
  })),
  
  withProps((store) => ({
    usersResource: rxResource({
      loader: () => {
        return searchData<UserModel>(store.firestore, UserCollection, getSystemQuery(store.tenantId()), 'loginEmail', 'asc');
      }
    }),
    personsResource: rxResource({
      loader: () => {
        return searchData<PersonModel>(store.firestore, PersonCollection, getSystemQuery(store.tenantId()), 'lastName', 'asc');
      }
    }),
    orgsResource: rxResource({
      loader: () => {
        return searchData<OrgModel>(store.firestore, OrgCollection, getSystemQuery(store.tenantId()), 'name', 'asc');
      }
    }),
    resourcesResource: rxResource({
      loader: () => {
        return searchData<ResourceModel>(store.firestore, ResourceCollection, getSystemQuery(store.tenantId()), 'name', 'asc');
      }
    }),
    tagsResource: rxResource({
      loader: () => {
        return searchData<TagModel>(store.firestore, TagCollection, getSystemQuery(store.tenantId()), 'tagModel', 'asc');
      }
    })
  })),

  withComputed((state) => {
    return {
      allUsers : computed(() => state.usersResource.value() ?? []),
      allPersons: computed(() => state.personsResource.value() ?? []),
      allOrgs: computed(() => state.orgsResource.value() ?? []),
      allResources: computed(() => state.resourcesResource.value() ?? []),
      allTags: computed(() => state.tagsResource.value() ?? []),
    };
  }),

  withComputed((state) => ({
    currentUser: computed(() => state.allUsers().find((user: UserModel) => user.loginEmail === state.fbUser()?.email)),
    defaultOrg: computed(() => state.allOrgs().find((org: OrgModel) => org.bkey === state.env.owner.tenantId)),
    defaultResource: computed(() => state.allResources().find((resource: ResourceModel) => resource.bkey === state.env.settingsDefaults.defaultResource)),
  })),

  withComputed((state) => ({
    currentPerson: computed(() => state.allPersons().find((person: PersonModel) => person.bkey === state.currentUser()?.personKey)),

    isAuthenticated: computed(() => state.fbUser() !== null && state.fbUser() !== undefined),
    firebaseUid: computed(() => state.fbUser()?.uid ?? undefined),
    loginEmail: computed(() => state.fbUser()?.email ?? undefined),
    roles: computed(() => state.currentUser()?.roles ?? []),
    isDebug: computed(() => state.currentUser()?.showDebugInfo ?? false),
    toastLength: computed(() => state.currentUser()?.toastLength ?? DEFAULT_TOAST_LENGTH),
  })),

  withProps((store) => ({
    addressesResource: rxResource({
      request: () => ({
        person: store.currentPerson()
      }),
      loader: ({request}) => {
        if (!request.person) return of([]);
        const _ref = query(collection(store.firestore, `${PersonCollection}/${request.person.bkey}/${AddressCollection}`));
        return collectionData(_ref, { idField: 'bkey' }) as Observable<AddressModel[]>;
      }
    })
  })),

  withComputed((state) => {
    return {
      addresses: computed(() => state.addressesResource.value() ?? []),
      isLoading: computed(() => state.usersResource.isLoading() || state.personsResource.isLoading() || state.orgsResource.isLoading() || 
        state.resourcesResource.isLoading() || state.tagsResource.isLoading() || state.addressesResource.isLoading()),
    };
  }),

  withMethods((store) => {
    return {
      /************************************ AUTH ************************************* */
      login(credentials: AuthCredentials) {
        store.authService.login(credentials);
      },
      logout() {
        store.authService.logout();
      },

      /************************************ GETTERS ************************************* */
      getUser(key: string) {
        if (!key) return undefined;
        return store.allUsers()?.find(p => p.bkey === key);
      },
      getPerson(key: string) {
        if (!key) return undefined;
        return store.allPersons()?.find(p => p.bkey === key);
      },
      getOrg(key: string) {
        if (!key) return undefined;
        return store.allOrgs()?.find(p => p.bkey === key);
      },
      getResource(key: string) {
        if (!key) return undefined;
        return store.allResources()?.find(p => p.bkey === key);
      },
      getTags(tagModel: number): string {
        if (!tagModel) return '';
        return store.allTags().filter((tag: TagModel) => tag.tagModel === tagModel + '')[0].tags;
      } 
    }
  }),

  withHooks({
    onInit(store) {
      patchState(store, { 
        title: store.env.app.title,
        appName: store.env.app.name,
        version: store.env.app.version,
        tenantId: store.env.owner.tenantId 
      });
    }
  })
);
