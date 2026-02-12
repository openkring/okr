import { computed, inject } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { authState } from 'rxfire/auth';
import { of } from 'rxjs';

import { AUTH, ENV, FIRESTORE } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { AppConfig, CategoryCollection, CategoryItemModel, CategoryListModel, GroupCollection, GroupModel, OrgCollection, OrgModel, PersonCollection, PersonModel, PrivacySettings, ResourceCollection, ResourceModel, ResourceModelName, TagCollection, TagModel, UserCollection, UserModel } from '@bk2/shared-models';
import { die, getSystemQuery } from '@bk2/shared-util-core';
import { AppNavigationService } from '@bk2/shared-util-angular';

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
    firestoreService: inject(FirestoreService),
    firestore: inject(FIRESTORE),
    auth: inject(AUTH),
    env: inject(ENV),
    fbUser: toSignal(authState(inject(AUTH))),
    appNavigationService: inject(AppNavigationService)
  })),
  
  withProps((store) => ({
/*     usersResource: rxResource({
      // the resource will reload whenever the fbUser changes (login/logout).
      params: () => store.fbUser(),
      stream: () => {
        return store.firestoreService.searchData<UserModel>(UserCollection, getSystemQuery(store.tenantId()), 'loginEmail', 'asc');
      }
    }), */
    currentUserResource: rxResource({
      // the resource will reload whenever the fbUser changes (login/logout).
      params: () => store.fbUser(),
      stream: () => {
        const query = getSystemQuery(store.tenantId());
        const loginEmail = store.fbUser()?.email;
        if (!loginEmail) return of(undefined);
        query.push({ key: 'loginEmail', operator: '==', value: loginEmail });
        return store.firestoreService.searchData<UserModel>(UserCollection, query, 'loginEmail', 'asc');
      }
    }),
    personsResource: rxResource({
      params: () => ({ 
        fbUser: store.fbUser(), 
        tenantId: store.tenantId() 
      }),
      stream: ({params}) => {
        if (!params.fbUser || !params.tenantId) return of([]);
        return store.firestoreService.searchData<PersonModel>(PersonCollection, getSystemQuery(params.tenantId), 'lastName', 'asc');
      }
    }),
    orgsResource: rxResource({
      params: () => ({ 
        fbUser: store.fbUser(), 
        tenantId: store.tenantId() 
      }),
      stream: ({params}) => {
        if (!params.fbUser || !params.tenantId) return of([]);
        return store.firestoreService.searchData<OrgModel>(OrgCollection, getSystemQuery(params.tenantId), 'name', 'asc');
      }
    }),
    groupsResource: rxResource({
      params: () => ({ 
        fbUser: store.fbUser(), 
        tenantId: store.tenantId() 
      }),
      stream: ({params}) => {
        if (!params.fbUser || !params.tenantId) return of([]);
        return store.firestoreService.searchData<GroupModel>(GroupCollection, getSystemQuery(params.tenantId), 'name', 'asc');
      }
    }),
    resourcesResource: rxResource({
      params: () => ({ 
        fbUser: store.fbUser(), 
        tenantId: store.tenantId() 
      }),
      stream: ({params}) => {
        if (!params.fbUser || !params.tenantId) return of([]);
        return store.firestoreService.searchData<ResourceModel>(ResourceCollection, getSystemQuery(params.tenantId), 'name', 'asc');
      }
    }),
    tagsResource: rxResource({
      params: () => ({ 
        fbUser: store.fbUser(), 
        tenantId: store.tenantId() 
      }),
      stream: ({params}) => {
        if (!params.fbUser || !params.tenantId) return of([]);
        return store.firestoreService.searchData<TagModel>(TagCollection, getSystemQuery(params.tenantId), 'tagModel', 'asc');
      }
    }),
    categoriesResource: rxResource({
      params: () => ({
        fbUser: store.fbUser(),
        tenantId: store.tenantId()
      }),
      stream: ({params}) => {
        if (!params.fbUser || !params.tenantId) return of([]);
        return store.firestoreService.searchData<CategoryListModel>(CategoryCollection, getSystemQuery(params.tenantId), 'name', 'asc');
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
      //allUsers : computed(() => state.usersResource.value() ?? []),
      currentUser: computed(() => {
        const users = state.currentUserResource.value();
        if (!users) {
          console.warn('AppStore.currentUser: currentUserResource has no value yet.');
          return undefined;
        }
        if (users.length === 0) {
          console.warn('AppStore.currentUser: no user found for loginEmail ', state.fbUser()?.email);
          return undefined;
        }
        if (users.length > 1) {
          console.error('AppStore.currentUser: multiple users found for loginEmail ', state.fbUser()?.email);
        }
        return users[0];
      }),
      allPersons: computed(() => state.personsResource.value() ?? []),
      allOrgs: computed(() => state.orgsResource.value() ?? []),
      allGroups: computed(() => state.groupsResource.value() ?? []),
      allResources: computed(() => state.resourcesResource.value() ?? []),
      allTags: computed(() => state.tagsResource.value() ?? []),
      allCategories: computed(() => state.categoriesResource.value() ?? []),
      appConfig: computed(() => state.appConfigResource.value() ?? new AppConfig(state.tenantId())),
    };
  }),

  withComputed((state) => ({
    //currentUser: computed(() => state.allUsers().find((user: UserModel) => user.loginEmail === state.fbUser()?.email)),
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
    isLoading: computed(() => state.currentUserResource.isLoading() || state.personsResource.isLoading() || state.orgsResource.isLoading() || 
        state.resourcesResource.isLoading() || state.tagsResource.isLoading()),
  })),

  withMethods((store) => {
    return {
/*       resetCurrentUser() {
        store.usersResource.reload();
      }, */
      /************************************ GETTERS ************************************* */
/*       getUser(key: string) {
        if (!key) return undefined;
        return store.allUsers()?.find(p => p.bkey === key);
      }, */
      getPerson(key: string) {
        if (!key) return undefined;
        return store.allPersons()?.find(p => p.bkey === key);
      },
      getOrg(key: string) {
        if (!key) return undefined;
        return store.allOrgs()?.find(p => p.bkey === key);
      },
      getGroup(key: string) {
        if (!key) return undefined;
        return store.allGroups()?.find(p => p.bkey === key);
      },
      getResource(key: string) {
        if (!key) return undefined;
        return store.allResources()?.find(p => p.bkey === key);
      },

      /**
       * Returns the configured tags for a given model type from firestore collection 'tags'.
       * The search is by attribute 'tagModel'. That means that the tags can be configured per model type and per tenant.
       * You will find a database entry 'default' to start with or extend the tenants for an existing entry with your own tenantId.
       * @param modelType 
       * @returns 
       */
      getTags(modelType: string): string {
        if (!modelType) return '';
        const tagModels = store.allTags().filter((tag: TagModel) => tag.tagModel === modelType);
        return tagModels.length === 0 ? '' : tagModels[0].tags;
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
       * This returns the name of the default icon for a given ModelType.
       * For most ModelTypes, this is the icon defined in categories model_type.
       * For most Resources, it is the icon defined in categories resource_type.
       * For rowing boats (resource_type = 'rboat'), it is the icon defined in categories rboat_type and the subType.
       * @param modelType
       * @param type
       * @param subType
       * @returns the name of the default icon (without path and without file extension)
       */
       getDefaultIcon(modelType?: string, type?: string, subType?: string): string {
        if (!modelType) return 'other';
        if (modelType === ResourceModelName && type && type.length) {
            if (type === 'rboat' && subType && subType?.length) { 
              return this.getCategoryIcon('rboat_type', subType);
            } else {
              return this.getCategoryIcon('resource_type', type);
            }
        } else {
          return this.getCategoryIcon('model_type', modelType);
        }
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
