import { computed, effect, inject, PLATFORM_ID } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { captureMessage } from '@sentry/angular';
import { authState } from 'rxfire/auth';
import { of } from 'rxjs';
import { App } from '@capacitor/app';

import { AUTH, ENV, FIRESTORE } from '@okr/shared-config';
import { AppConfigService, FirestoreService } from '@okr/shared-data-access';
import { AddressDirectoryCollection, AddressDirectoryModel, AppConfig, AvailableLanguages, CategoryCollection, CategoryItemModel, CategoryListModel, DefaultLanguage, DefaultLanguageCode, GroupCollection, GroupModel, OrgCollection, OrgModel, PersonCollection, PersonModel, PrivacySettings, privacyUsageToAccessor, ResourceCollection, ResourceModel, ResourceModelName, stricterAccessor, TagCollection, TagModel, UserCollection, UserModel } from '@okr/shared-models';
import { die, getSystemQuery, replacePlaceholders } from '@okr/shared-util-core';
import { AppNavigationService, isBrowser, markStartup, reportStartupTiming, VersionCheckService } from '@okr/shared-util-angular';
import { I18nService } from '@okr/shared-i18n';

import { SessionService} from '@okr/session-data-access';

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
  // Watchdog flag: set true when an authenticated user's UserModel hasn't loaded within
  // READINESS_TIMEOUT_MS, so navigation is unblocked instead of hanging on the spinner.
  readinessTimedOut: boolean;
};

/** Grace period for an authenticated user's UserModel to load before we stop blocking. */
const READINESS_TIMEOUT_MS = 10_000;

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
  },
  readinessTimedOut: false
};

export const AppStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withProps(() => ({
    appConfigService: inject(AppConfigService),
    firestoreService: inject(FirestoreService),
    firestore: inject(FIRESTORE),
    appVersionService: inject(VersionCheckService),
    auth: inject(AUTH),
    env: inject(ENV),
    fbUser: toSignal(authState(inject(AUTH))),
    appNavigationService: inject(AppNavigationService),
    platformId: inject(PLATFORM_ID),
    sessionService: inject(SessionService),
    i18nService: inject(I18nService)
  })),
  
  withProps((store) => ({
    currentUserResource: rxResource({
      // the resource will reload whenever the fbUser changes (login/logout).
      params: () => store.fbUser(),
      stream: () => {
        // Read the user's own doc BY DOCUMENT ID (== auth uid). The users security
        // rule grants self-read via `request.auth.uid == userId` (a get), but NOT via
        // a loginEmail list query: Firestore validates queries against their potential
        // result set, and a loginEmail filter doesn't constrain the document id, so the
        // self-read branch can never validate the list — only privileged users would
        // pass (via the isPrivileged() branch). Reading by uid works for every signed-in
        // user, including the 'registered' role.
        const uid = store.fbUser()?.uid;
        if (!uid) return of(undefined);
        return store.firestoreService.readModel<UserModel>(UserCollection, uid);
      }
    }),
  })),

  withProps((store) => ({
    // These collections are tenantRead-protected (rule: userExists() && belongsToTenant).
    // Gate them on the LOADED UserModel (currentUserResource), not merely on fbUser:
    // fbUser turns truthy the instant Firebase auth resolves, but the users/{uid} doc the
    // rule reads server-side may not have resolved yet. Firing the query in that window
    // (e.g. the auth-restore window on the public /welcome landing) is denied with
    // "Missing or insufficient permissions". currentUser being set proves users/{uid}
    // exists and resolved, so the rule's userExists()/belongsToTenant can pass.
    personsResource: rxResource({
      params: () => ({
        currentUser: store.currentUserResource.value(),
        tenantId: store.tenantId()
      }),
      stream: ({params}) => {
        if (!params.currentUser || !params.tenantId) return of([]);
        return store.firestoreService.searchData<PersonModel>(PersonCollection, getSystemQuery(params.tenantId), 'lastName', 'asc');
      }
    }),
    orgsResource: rxResource({
      params: () => ({
        currentUser: store.currentUserResource.value(),
        tenantId: store.tenantId()
      }),
      stream: ({params}) => {
        if (!params.currentUser || !params.tenantId) return of([]);
        return store.firestoreService.searchData<OrgModel>(OrgCollection, getSystemQuery(params.tenantId), 'name', 'asc');
      }
    }),
    // The address-directory projection (spec 1.19 Phase 4): the CF-materialized,
    // registered-visible contact data per parentKey. This stream replaces the
    // stripped favEmail/favPhone person/org fields for lists and detail views.
    // orderBy 'none': lookups go through the directoryMap, and skipping the
    // orderBy avoids a composite index on this collection.
    addressDirectoryResource: rxResource({
      params: () => ({
        currentUser: store.currentUserResource.value(),
        tenantId: store.tenantId()
      }),
      stream: ({params}) => {
        if (!params.currentUser || !params.tenantId) return of([]);
        return store.firestoreService.searchData<AddressDirectoryModel>(AddressDirectoryCollection, getSystemQuery(params.tenantId), 'none');
      }
    }),
    groupsResource: rxResource({
      params: () => ({
        currentUser: store.currentUserResource.value(),
        tenantId: store.tenantId()
      }),
      stream: ({params}) => {
        if (!params.currentUser || !params.tenantId) return of([]);
        return store.firestoreService.searchData<GroupModel>(GroupCollection, getSystemQuery(params.tenantId), 'name', 'asc');
      }
    }),
    resourcesResource: rxResource({
      params: () => ({
        currentUser: store.currentUserResource.value(),
        tenantId: store.tenantId()
      }),
      stream: ({params}) => {
        if (!params.currentUser || !params.tenantId) return of([]);
        return store.firestoreService.searchData<ResourceModel>(ResourceCollection, getSystemQuery(params.tenantId), 'name', 'asc');
      }
    }),
    tagsResource: rxResource({
      params: () => ({
        currentUser: store.currentUserResource.value(),
        tenantId: store.tenantId()
      }),
      stream: ({params}) => {
        if (!params.currentUser || !params.tenantId) return of([]);
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
        fbUser: store.fbUser(),
        tenantId: store.tenantId()
      }),
      stream: ({params}) => {
        if (!params.fbUser || !params.tenantId) return of(undefined);
        return store.appConfigService.read(params.tenantId);
      }
    })
  })),

  withComputed((state) => {
    return {
      currentUser: computed(() => state.currentUserResource.value()),
      allPersons: computed(() => state.personsResource.value() ?? []),
      allOrgs: computed(() => state.orgsResource.value() ?? []),
      allAddressDirectories: computed(() => state.addressDirectoryResource.value() ?? []),
      // parentKey ('person.<okey>' | 'org.<okey>') -> its directory projection doc
      addressDirectoryMap: computed(() => new Map(
        (state.addressDirectoryResource.value() ?? []).map((d: AddressDirectoryModel) => [d.parentKey, d]))),
      allGroups: computed(() => state.groupsResource.value() ?? []),
      allResources: computed(() => state.resourcesResource.value() ?? []),
      allTags: computed(() => state.tagsResource.value() ?? []),
      allCategories: computed(() => state.categoriesResource.value() ?? []),
      appConfig: computed(() => {
        const loaded = state.appConfigResource.value();
        return Object.assign(new AppConfig(state.tenantId()), loaded ?? {});
      }),
    };
  }),

  withComputed((state) => ({
    defaultOrg: computed(() => state.allOrgs().find((org: OrgModel) => org.okey === state.tenantId())),
    defaultResource: computed(() => state.allResources().find((resource: ResourceModel) => resource.okey === state.appConfig().defaultResourceId)),
    // Codes this tenant exposes in the language switcher. appConfig() re-applies the class
    // default, so this is normally populated; coalesce empty → all for safety.
    enabledLanguageCodes: computed(() => {
      const configured = state.appConfig().enabledLanguages;
      return configured && configured.length > 0 ? configured : AvailableLanguages;
    }),
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
    currentPerson: computed(() => state.allPersons().find((person: PersonModel) => person.okey === state.currentUser()?.personKey)),

    isAuthenticated: computed(() => state.fbUser() !== null && state.fbUser() !== undefined),
    firebaseUid: computed(() => state.fbUser()?.uid ?? undefined),
    loginEmail: computed(() => state.fbUser()?.email ?? undefined),
    roles: computed(() => state.currentUser()?.roles ?? []),
    // System reference data (categories) is read synchronously via getCategory(). True once
    // the resource has settled (loaded or errored), so the app never hangs on a failed load.
    // Note: rendering before readiness is tolerated — getCategory degrades to an empty
    // category until the stream emits (the watchdog can open navigation without data).
    areCategoriesReady: computed(() => !state.categoriesResource.isLoading()),
    // True once the auth state is settled: either logged out (fbUser === null) or
    // logged in with the UserModel loaded. Undefined fbUser (auth still restoring) or
    // a set fbUser without currentUser yet (post-login load window) → not ready.
    isUserSessionReady: computed(() => {
      const fbUser = state.fbUser();
      if (fbUser === null) return true;
      return !!fbUser && !!state.currentUser();
    }),
    // The data-driven readiness (excludes the timeout fallback so the watchdog can depend
    // on it without a feedback loop). Logged-out users are ready immediately. For an
    // authenticated user it is ready when the UserModel AND categories have loaded, OR
    // when the user-doc read has settled WITHOUT yielding a model (doc missing / read
    // denied) — in that broken-session case we stop blocking rather than hang forever.
    isDataReady: computed(() => {
      const fbUser = state.fbUser();
      if (fbUser === null) return true;
      if (!fbUser) return false; // auth still restoring
      if (state.currentUser()) return !state.categoriesResource.isLoading();
      // authenticated but no UserModel: ready only once the read has definitively settled
      return !state.currentUserResource.isLoading();
    }),
    showDebugInfo: computed(() => state.currentUser()?.showDebugInfo ?? state.appConfig().showDebugInfo ?? false),
    isLoading: computed(() => state.currentUserResource.isLoading() || state.personsResource.isLoading() || state.orgsResource.isLoading() ||
        state.resourcesResource.isLoading() || state.tagsResource.isLoading()),
  })),

  withComputed((store) => ({
    // The single source of truth for "may feature routes activate". Used both by the
    // app-ready route guard and by the root spinner overlay. Ready when the data is
    // ready, or when the readiness watchdog has timed out (so a perpetually-loading
    // users/{uid} read never strands the user on the spinner). NOTE: this is intentionally
    // a gate on NAVIGATION (via the guard), never on the presence of <ion-router-outlet>
    // in the DOM — destroying the outlet mid-transition crashes Ionic's StackController
    // ("can't access property 'commit'").
    isAppReady: computed(() => store.isDataReady() || store.readinessTimedOut()),
    // Authenticated, but the UserModel never loaded and the readiness watchdog has since
    // fired — i.e. the users/{uid} read stalled rather than returning. In practice this is a
    // slow/blocked network (e.g. Firefox under strict tracking protection forcing long-polling).
    // Surface a "slow network, please retry" state instead of silently dropping the user into a
    // role-less, data-less shell that looks like an app bug. Scoped to the timeout path only: a
    // fast missing-doc / permission-denied read settles isDataReady WITHOUT firing the watchdog,
    // so that genuinely-broken-account case never shows the (misleading) slow-network message.
    // Self-healing: if the read finally resolves, currentUser is set and this flips back to false.
    isDegradedSession: computed(() => store.readinessTimedOut() && !!store.fbUser() && !store.currentUser()),
  })),

  withMethods((store) => {
    return {
      getPerson(key: string): PersonModel | undefined {
        if (!key) return undefined;
        return store.allPersons()?.find(p => p.okey === key);
      },

      /**
       * The address-directory projection doc of a parent (spec 1.19 Phase 4) —
       * the registered-visible contact data (favEmail/favPhone/entries) that
       * replaces the stripped person/org fav* fields.
       * @param parentKey 'person.<okey>' or 'org.<okey>'
       */
      getDirectoryEntry(parentKey: string): AddressDirectoryModel | undefined {
        if (!parentKey) return undefined;
        return store.addressDirectoryMap().get(parentKey);
      },

      getPersonByAttribute(attributeName: string, attributeValue: string): PersonModel | undefined {
        if (!attributeName || !attributeValue) return undefined;
        return store.allPersons()?.find(p => p[attributeName as keyof PersonModel] === attributeValue);
      },

      /**
       * Return effective PrivacySettings for a specific person, combining the app-level defaults
       * with the person's own UserModel privacy preferences (if available).
       * For each overridable field the stricter of the two accessors wins — the person's data is
       * shown only if both the tenant policy AND the person's own wish allow it.
       * Fields that the user cannot override (showGender, showTaxId, etc.) always use the app default.
       * @param person the PersonModel of the person being viewed (not the current user). The
       *   usage* privacy preferences live on the person (tenant-readable), so this works for
       *   all viewers, not just privileged ones who can read the users collection.
       */
      getPersonPrivacySettings(person?: PersonModel): PrivacySettings {
        const defaults = store.privacySettings();
        if (!person) return defaults;
        return {
          ...defaults,
          showName:          stricterAccessor(defaults.showName,          privacyUsageToAccessor(person.usageName)),
          showDateOfBirth:   stricterAccessor(defaults.showDateOfBirth,   privacyUsageToAccessor(person.usageDateOfBirth)),
          showEmail:         stricterAccessor(defaults.showEmail,         privacyUsageToAccessor(person.usageEmail)),
          showPhone:         stricterAccessor(defaults.showPhone,         privacyUsageToAccessor(person.usagePhone)),
          showPostalAddress: stricterAccessor(defaults.showPostalAddress, privacyUsageToAccessor(person.usagePostalAddress)),
        };
      },
      getOrg(key: string) {
        if (!key) return undefined;
        return store.allOrgs()?.find(p => p.okey === key);
      },

      getOrgByAttribute(attributeName: string, attributeValue: string): OrgModel | undefined {
        if (!attributeName || !attributeValue) return undefined;
        return store.allOrgs()?.find(p => p[attributeName as keyof OrgModel] === attributeValue);
      },

      getGroup(key: string) {
        if (!key) return undefined;
        return store.allGroups()?.find(p => p.okey === key);
      },
      getResource(key: string) {
        if (!key) return undefined;
        return store.allResources()?.find(p => p.okey === key);
      },

      replacePlaceholders(text: string): string {
        const context = {
          tenantId: store.tenantId(),
          appDomain: store.appConfig().appDomain,
          appVersion: store.appVersionService.getCurrentVersion(),
          appName: store.appConfig().appName
        }
        return replacePlaceholders(text, context);
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

      getCategory(categoryName?: string): CategoryListModel {
        if (!categoryName) { die('AppStore.getCategory: categoryName is mandatory.'); }
        const cat = store.allCategories().find(c => c.name === categoryName);
        if (cat) return cat;
        // The app-ready watchdog opens navigation after READINESS_TIMEOUT_MS even when the
        // categories resource never loaded (hung/failed Firestore read), so render-path callers
        // can reach this with an empty allCategories(). Degrade to an empty category instead of
        // crashing the page — computeds re-evaluate once the stream emits. A name missing from
        // LOADED categories is real misconfiguration: report it, but still keep the page alive.
        if (store.allCategories().length > 0) {
          captureMessage(`AppStore.getCategory: category ${categoryName} not found.`, { level: 'warning' });
        }
        return new CategoryListModel(store.tenantId());
      },

      tryGetCategory(categoryName?: string): CategoryListModel | undefined {
        if (!categoryName) return undefined;
        return store.allCategories()?.find(cat => cat.name === categoryName);
      },

      getCategoryItem(categoryName?: string, itemName?: string): CategoryItemModel | undefined {
        if (!categoryName || !itemName) return undefined;
        const cat = this.getCategory(categoryName);
        return cat ? cat.items.find(i => i.name === itemName) : undefined;
      },

      getCategoryItemByAbbreviation(categoryName?: string, abbreviation?: string): CategoryItemModel | undefined {
        if (!categoryName || !abbreviation) return undefined;
        const cat = this.getCategory(categoryName);
        return cat ? cat.items.find(i => i.abbreviation === abbreviation) : undefined;
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

      if (!isBrowser(store.platformId)) return;

      // TEMPORARY startup instrumentation (remove after slow-startup investigation).
      // Marks the auth/data boundaries; reportStartupTiming ships the gaps to Sentry.
      effect(() => { if (store.fbUser()) markStartup('fbUser'); });
      effect(() => { if (store.currentUser()) markStartup('user:loaded'); });
      effect(() => { if (store.isDataReady()) markStartup('data-ready'); });
      effect(() => {
        if (store.isAppReady()) {
          markStartup('app-ready');
          reportStartupTiming(store.isDataReady() ? 'data-ready' : 'watchdog');
        }
      });

      // Active UI language. Applies the signed-in user's saved preference (userLanguage),
      // and seeds from the browser language before login / for users without a saved pref.
      // currentUser is a LIVE Firestore stream, so this effect also handles apply-on-save:
      // saving a new language in the profile re-emits the user doc here and switches the UI
      // immediately (Transloco reRenderOnLangChange). AvailableLanguages is index-aligned with
      // the Language enum (GE=0 → 'de', …); undefined language (browser seed) falls back to 'de'.
      effect(() => {
        const user = store.currentUser();
        const code = user ? AvailableLanguages[user.userLanguage ?? DefaultLanguage] : undefined;
        store.i18nService.setActiveLang(code, DefaultLanguageCode, store.enabledLanguageCodes());
      });

      // Start anonymous session immediately on bootstrap
      store.sessionService.startSession();

      // Upgrade session when user becomes authenticated
      effect(() => {
        const user = store.currentUser();
        if (user) {
          store.sessionService.upgradeSession(user);
        }
      });

      // End session on logout
      effect(() => {
        const fbUser = store.fbUser();
        if (fbUser === null) {
          store.sessionService.endSession();
        }
      });

      // Readiness watchdog: if an authenticated user's UserModel hasn't loaded within
      // READINESS_TIMEOUT_MS (e.g. a hung users/{uid} read), stop blocking navigation so
      // they don't sit on the spinner forever. Fast missing-doc / permission-denied cases
      // are already handled synchronously by isDataReady. The effect intentionally does
      // NOT read readinessTimedOut, so setting it does not re-trigger this effect.
      effect((onCleanup) => {
        const authed = !!store.fbUser();
        const dataReady = store.isDataReady();
        if (!authed || dataReady) {
          patchState(store, { readinessTimedOut: false });
          return;
        }
        const handle = setTimeout(() => { markStartup('watchdog:fired'); patchState(store, { readinessTimedOut: true }); }, READINESS_TIMEOUT_MS);
        onCleanup(() => clearTimeout(handle));
      });

      // End session when tab is hidden; restart when visible again
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          store.sessionService.endSession();
        } else if (document.visibilityState === 'visible' && !store.sessionService.hasActiveSession) {
          store.sessionService.startSession().then(() => {
            const user = store.currentUser();
            if (user) store.sessionService.upgradeSession(user);
          });
        }
      });

      // Capacitor: supplement visibilitychange on native iOS/Android
      App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          store.sessionService.endSession();
        } else if (isActive && !store.sessionService.hasActiveSession) {
          store.sessionService.startSession().then(() => {
            const user = store.currentUser();
            if (user) store.sessionService.upgradeSession(user);
          });
        }
      });
    }
  })
);
