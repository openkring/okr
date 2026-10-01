import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { MembershipCollection, MembershipModel, PersonModel, UserModel } from '@okr/shared-models';
import { allTermsMatch, chipMatches, DateFormat, getSystemQuery, getTodayStr, isAfterDate } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';

import { AppStore } from './app.store';
import { SHARED_FEATURE_I18N_KEYS, SharedFeatureI18n } from './select-i18n';
import { MIN_CUSTOM_SEARCH_LENGTH, normalizeForCompare, normalizeWhitespace } from './location-select.store';


export type PersonSelectState = {
  searchTerm: string;
  currentUser: UserModel | undefined;
  selectedTag: string;
  allowCustom: boolean;
  membersFirst: boolean;
  /**
   * When set, a two-level lookup like membersFirst: persons who hold an app account IN THIS
   * TENANT first, everybody else below. The tenant id itself, not a boolean: an account belongs
   * to exactly one tenant, so "has an account" is only ever a question about one of them.
   */
  accountsFirst: string;
  /** okeys never offered — e.g. people who are already on the list the caller is filling. */
  excludeKeys: string[];
};

export const personInitialState: PersonSelectState = {
  searchTerm: '',
  currentUser: undefined,
  selectedTag: '',
  allowCustom: false,
  membersFirst: false,
  accountsFirst: '',
  excludeKeys: [],
};

export const PersonSelectStore = signalStore(
  withState(personInitialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    i18n: inject(I18nService).translateAll(SHARED_FEATURE_I18N_KEYS) as SharedFeatureI18n
  })),

  withProps((store) => ({
    // Active memberships of the default org — the "current members" the first lookup level offers.
    activeMembershipsResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser(),
        orgKey: store.appStore.defaultOrg()?.okey,
        tenantId: store.appStore.tenantId(),
      }),
      stream: ({ params }) => {
        if (!params.orgKey) return of([] as MembershipModel[]);
        const query = getSystemQuery(params.tenantId);
        query.push({ key: 'orgKey', operator: '==', value: params.orgKey });
        query.push({ key: 'state', operator: '==', value: 'active' });
        query.push({ key: 'memberModelType', operator: '==', value: 'person' });
        query.push({ key: 'relIsLast', operator: '==', value: true });
        return store.firestoreService.searchData<MembershipModel>(MembershipCollection, query, 'memberName2', 'asc');
      },
    }),
  })),

  withComputed((store) => {
    return {
      /**
       * Never offered, on either level: a deceased person, and a technical one (`isSystem`, e.g. the
       * kiosk tablet's 'Logbuch' person). `?? false` because older documents lack the field.
       */
      persons: computed(() => {
        const excluded = new Set(store.excludeKeys());
        return store.appStore.allPersons().filter((p: PersonModel) =>
          !p.isDeceased && !(p.isSystem ?? false) && !excluded.has(p.okey));
      }),
      isLoading: computed(() => store.appStore.isReferenceDataLoading()),
      // state === 'active' is not enough: scs has memberships left at 'active' with a dateOfExit
      // years in the past (e.g. exited 2016-12-31), so the exit date decides who is current.
      memberKeys: computed(() => {
        const today = getTodayStr(DateFormat.StoreDate);
        return new Set(
          (store.activeMembershipsResource.value() ?? [])
            .filter((m: MembershipModel) => isAfterDate(m.dateOfExit, today))
            .map((m: MembershipModel) => m.memberKey)
        );
      }),
    }
  }),

  withComputed((store) => ({
    /**
     * Who belongs on the first level: current members (membersFirst), or people who can log in
     * HERE (accountsFirst — an invitation email still reaches the rest, but an account holder is
     * the usual guest). `?? []` because persons written before `accountTenants` read back undefined.
     */
    firstLevelKeys: computed(() => {
      if (store.membersFirst()) return store.memberKeys();
      const tenant = store.accountsFirst();
      if (!tenant) return new Set<string>();
      return new Set(store.persons().filter(p => (p.accountTenants ?? []).includes(tenant)).map(p => p.okey));
    }),
    isTwoLevel: computed(() => store.membersFirst() || store.accountsFirst().length > 0),
  })),

  withComputed((store) => {
    const matches = (person: PersonModel) =>
      allTermsMatch(person.index, store.searchTerm()) && chipMatches(person.tags, store.selectedTag());
    return {
      personsCount: computed(() => store.persons()?.length ?? 0),
      /** Level 1: current members, or account holders (see firstLevelKeys). */
      memberMatches: computed(() => store.persons().filter(p => store.firstLevelKeys().has(p.okey) && matches(p))),
      /** Level 2: every living person, members or not. */
      personMatches: computed(() => store.persons().filter(matches)),
      customLabel: computed(() => normalizeWhitespace(store.searchTerm())),
      hasExactMatch: computed(() => {
        const q = normalizeForCompare(store.searchTerm());
        return (store.persons() ?? []).some(p => normalizeForCompare(`${p.firstName} ${p.lastName}`) === q);
      }),
    }
  }),

  withComputed((store) => ({
    showCustomEntry: computed(() =>
      store.allowCustom()
      && store.customLabel().length >= MIN_CUSTOM_SEARCH_LENGTH
      && !store.hasExactMatch()
    ),
    /**
     * Members of the default org matching the term. Empty unless membersFirst (opt-in, currently
     * the trip/logbuch lookup) — without it there is only one, undivided section.
     */
    memberSection: computed(() => store.isTwoLevel() ? store.memberMatches() : []),
    /**
     * Everyone else matching the term. With membersFirst this is the non-member remainder shown
     * BELOW the members, never instead of them: a member hit must not hide a non-member of the
     * same name (searching 'Pedersen' has to offer Jasmine next to the member Hans).
     */
    otherSection: computed(() =>
      store.isTwoLevel()
        ? store.personMatches().filter(p => !store.firstLevelKeys().has(p.okey))
        : store.personMatches()
    ),
  })),

  withComputed((store) => ({
    matchCount: computed(() => store.memberSection().length + store.otherSection().length),
    /** Label the non-member remainder, so the extra names are not read as members. */
    showOtherDivider: computed(() => store.isTwoLevel() && store.otherSection().length > 0),
  })),

  withMethods((store) => {
    return {

      setCurrentUser(currentUser: UserModel | undefined) {
        patchState(store, { currentUser });
      },

      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      setAllowCustom(allowCustom: boolean) {
        patchState(store, { allowCustom });
      },

      setMembersFirst(membersFirst: boolean) {
        patchState(store, { membersFirst });
      },

      setAccountsFirst(accountsFirst: string) {
        patchState(store, { accountsFirst });
      },

      setExcludeKeys(excludeKeys: string[]) {
        patchState(store, { excludeKeys });
      }
    }
  }),
);
