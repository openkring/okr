import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { computed, inject } from '@angular/core';
import { collection, query } from 'firebase/firestore';
import { collectionData } from 'rxfire/firestore';
import { authState } from 'rxfire/auth';
import { Observable, of } from 'rxjs';

import { AUTH, ENV, FIRESTORE } from '@bk2/shared/config';
import { AddressCollection, AddressModel, AppConfig, OrgCollection, OrgModel, PersonCollection, PersonModel, PrivacySettings, ResourceCollection, ResourceModel, TagCollection, TagModel, UserCollection, UserModel } from '@bk2/shared/models';
import { getSystemQuery, searchData } from '@bk2/shared/util-core';

import { AppConfigService } from './app-config.service';

export type AppState = {
  tenantId: string;
  production: boolean;
  useEmulators: boolean;
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
    measurementId: string;
  },
  services: {
    appcheckRecaptchaEnterpriseKey: string;
    gmapKey: string;
    nxCloudAccessToken: string;
    imgixBaseUrl: string;
  };
};

const initialState: AppState = {
  tenantId: '',
  production: false,
  useEmulators: false,
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
    measurementId: ''
  },
  services: {
    appcheckRecaptchaEnterpriseKey: '',
    gmapKey: '',
    nxCloudAccessToken: '',
    imgixBaseUrl: ''
  }
};

export const AppStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withProps(() => ({
    appConfigService: inject(AppConfigService),
    firestore: inject(FIRESTORE),
    auth: inject(AUTH),
    env: inject(ENV),
    fbUser: toSignal(authState(inject(AUTH)))
  })),
  
  withProps((store) => ({
    usersResource: rxResource({
      // the resource will reload whenever the fbUser changes (login/logout).
      params: () => store.fbUser(),
      stream: () => {
        return searchData<UserModel>(store.firestore, UserCollection, getSystemQuery(store.tenantId()), 'loginEmail', 'asc');
      }
    }),
    personsResource: rxResource({
      stream: () => {
        return searchData<PersonModel>(store.firestore, PersonCollection, getSystemQuery(store.tenantId()), 'lastName', 'asc');
      }
    }),
    orgsResource: rxResource({
      stream: () => {
        return searchData<OrgModel>(store.firestore, OrgCollection, getSystemQuery(store.tenantId()), 'name', 'asc');
      }
    }),
    resourcesResource: rxResource({
      stream: () => {
        return searchData<ResourceModel>(store.firestore, ResourceCollection, getSystemQuery(store.tenantId()), 'name', 'asc');
      }
    }),
    tagsResource: rxResource({
      stream: () => {
        return searchData<TagModel>(store.firestore, TagCollection, getSystemQuery(store.tenantId()), 'tagModel', 'asc');
      }
    }),
    appConfigResource: rxResource({
      params: () => ({ 
        tenantId: store.tenantId()
      }),
      stream: ({params}) => {
        if (!params.tenantId) return of(undefined);
        return store.appConfigService.read(params.tenantId);
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
      appConfig: computed(() => state.appConfigResource.value() ?? new AppConfig(state.tenantId())),
    };
  }),

  withComputed((state) => ({
    currentUser: computed(() => state.allUsers().find((user: UserModel) => user.loginEmail === state.fbUser()?.email)),
    defaultOrg: computed(() => state.allOrgs().find((org: OrgModel) => org.bkey === state.tenantId())),
    defaultResource: computed(() => state.allResources().find((resource: ResourceModel) => resource.bkey === state.appConfig().defaultResourceId)),
    privacySettings: computed(() => {
        return {
          showName: state.appConfig().showName,
          showDateOfBirth: state.appConfig().showDateOfBirth,
          showDateOfDeath: state.appConfig().showDateOfDeath,
          showEmail: state.appConfig().showEmail,
          showPhone: state.appConfig().showPhone,
          showPostalAddress: state.appConfig().showPostalAddress,
          showIban: state.appConfig().showIban,
          showGender: state.appConfig().showGender,
          showTaxId: state.appConfig().showTaxId,
          showBexioId: state.appConfig().showBexioId,
          showTags: state.appConfig().showTags,
          showNotes: state.appConfig().showNotes,
          showMemberships: state.appConfig().showMemberships,
          showOwnerships: state.appConfig().showOwnerships,
          showComments: state.appConfig().showComments,
          showDocuments: state.appConfig().showDocuments
        } as PrivacySettings;
      }
    ),
    // environment can be called directly on appStore:
    // e.g.  appStore.firebase.apiKey()
    // e.g. appStore.tenantId()
  })),

  withComputed((state) => ({
    currentPerson: computed(() => state.allPersons().find((person: PersonModel) => person.bkey === state.currentUser()?.personKey)),

    isAuthenticated: computed(() => state.fbUser() !== null && state.fbUser() !== undefined),
    firebaseUid: computed(() => state.fbUser()?.uid ?? undefined),
    loginEmail: computed(() => state.fbUser()?.email ?? undefined),
    roles: computed(() => state.currentUser()?.roles ?? []),
    showDebugInfo: computed(() => state.currentUser()?.showDebugInfo ?? state.appConfig().showDebugInfo ?? false),
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
      },
    }
  }),

  withHooks({
    onInit(store) {
      patchState(store, { 
        tenantId: store.env.tenantId,
        production: store.env.production,
        useEmulators: store.env.useEmulators,
        firebase: store.env.firebase,
        services: store.env.services
      });
    }
  })
);
