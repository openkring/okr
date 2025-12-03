import { computed, inject } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { collection, query } from 'firebase/firestore';
import { authState } from 'rxfire/auth';
import { collectionData } from 'rxfire/firestore';
import { Observable, of } from 'rxjs';

import { AUTH, ENV, FIRESTORE } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { AddressCollection, AddressModel, AppConfig, CategoryCollection, CategoryItemModel, CategoryListModel, OrgCollection, OrgModel, PersonCollection, PersonModel, PrivacySettings, ResourceCollection, ResourceModel, TagCollection, TagModel, UserCollection, UserModel } from '@bk2/shared-models';
import { die, getSystemQuery } from '@bk2/shared-util-core';

import { AppConfigService } from './app-config.service';
import { AppNavigationService } from '@bk2/shared-util-angular';

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
    firestoreService: inject(FirestoreService),
    firestore: inject(FIRESTORE),
    auth: inject(AUTH),
    env: inject(ENV),
    fbUser: toSignal(authState(inject(AUTH))),
    appNavigationService: inject(AppNavigationService)
  })),
  
  withProps((store) => ({
    usersResource: rxResource({
      // the resource will reload whenever the fbUser changes (login/logout).
      params: () => store.fbUser(),
      stream: () => {
        return store.firestoreService.searchData<UserModel>(UserCollection, getSystemQuery(store.tenantId()), 'loginEmail', 'asc');
      }
    }),
    personsResource: rxResource({
      stream: () => {
        return store.firestoreService.searchData<PersonModel>(PersonCollection, getSystemQuery(store.tenantId()), 'lastName', 'asc');
      }
    }),
    orgsResource: rxResource({
      stream: () => {
        return store.firestoreService.searchData<OrgModel>(OrgCollection, getSystemQuery(store.tenantId()), 'name', 'asc');
      }
    }),
    resourcesResource: rxResource({
      stream: () => {
        return store.firestoreService.searchData<ResourceModel>(ResourceCollection, getSystemQuery(store.tenantId()), 'name', 'asc');
      }
    }),
    tagsResource: rxResource({
      stream: () => {
        return store.firestoreService.searchData<TagModel>(TagCollection, getSystemQuery(store.tenantId()), 'tagModel', 'asc');
      }
    }),
    categoriesResource: rxResource({
      stream: () => {
        return store.firestoreService.searchData<CategoryListModel>(CategoryCollection, getSystemQuery(store.tenantId()), 'name', 'asc');
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
      allCategories: computed(() => state.categoriesResource.value() ?? []),
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
    isLoading: computed(() => state.usersResource.isLoading() || state.personsResource.isLoading() || state.orgsResource.isLoading() || 
        state.resourcesResource.isLoading() || state.tagsResource.isLoading()),
  })),

  withMethods((store) => {
    return {
      resetCurrentUser() {
        store.usersResource.reload();
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
      getTags(modelType: string): string {
        if (!modelType) return '';
        return store.allTags().filter((tag: TagModel) => tag.tagModel === modelType)[0].tags;
      },
      getCategory(name?: string): CategoryListModel {
        // enforce that this function always returns the category (or it ends with an internal error)
        if (!name) { die('AppStore.getCategory: category is mandatory.');
        } else {
          return store.allCategories()?.find(p => p.bkey === name) ?? die(`AppStore.getCategory: category ${name} not found.`);
        }
      },
      getCategoryItem(categoryName?: string, itemName?: string): CategoryItemModel | undefined {
        if (!categoryName || !itemName) return undefined;
        const cat = this.getCategory(categoryName);
        return cat ? cat.items.find(i => i.name === itemName) : undefined;
      },
      getCategoryIcon(categoryName?: string, itemName?: string): string {
        return this.getCategoryItem(categoryName, itemName)?.icon ?? '';
      },
      /**
       * This returns the name of the default icon for a given modelType.
       * For most modelTypes, this is the icon of the category of the modelType.
       * ModelType[.ResourceType[_SubType]]:key
       * For Resources, the given key consists of resourceType:key and the icon is derived from the resourceType, e.g. 20.0:key.
       * @param modelType
       * @param key
       * @returns
       */
       getDefaultIcon(modelType?: string, key?: string): string {
        if (!modelType || !key) return 'other';
        if (modelType === 'resource') {
          const resourceTypePart = key.split(':')[0];
          if (resourceTypePart.includes('_')) {
            const [resourceType, subType] = resourceTypePart.split('_');
            if (resourceType === 'rboat') {
              return this.getCategoryIcon('rboat_type', subType);
            } else {
              return this.getCategoryIcon('resource_type', resourceType);
            }
          }
          return this.getCategoryIcon('resource_type', resourceTypePart);
        } else {
          return this.getCategoryIcon('model_type', modelType);
        }
      }
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
