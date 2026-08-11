import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { MembershipCollection, MembershipModel, PersonModel, UserModel } from '@okr/shared-models';
import { chipMatches, DateFormat, getSystemQuery, getTodayStr, isAfterDate, nameMatches } from '@okr/shared-util-core';
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
};

export const personInitialState: PersonSelectState = {
  searchTerm: '',
  currentUser: undefined,
  selectedTag: '',
  allowCustom: false,
  membersFirst: false,
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
      // A deceased person is never offered, on either level.
      persons: computed(() => store.appStore.allPersons().filter((p: PersonModel) => !p.isDeceased)),
      isLoading: computed(() => store.appStore.isLoading()),
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

  withComputed((store) => {
    const matches = (person: PersonModel) =>
      nameMatches(person.index, store.searchTerm()) && chipMatches(person.tags, store.selectedTag());
    return {
      personsCount: computed(() => store.persons()?.length ?? 0),
      /** Level 1: current members only. */
      memberMatches: computed(() => store.persons().filter(p => store.memberKeys().has(p.okey) && matches(p))),
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
     * Default: every living person. Only with membersFirst (opt-in, currently the trip/logbuch
     * lookup) does the two-level mode apply — members first, widening to everyone only when the
     * term finds no member. Picking a guest or a former member then takes one extra keystroke.
     */
    filteredPersons: computed(() =>
      store.membersFirst() && store.memberMatches().length > 0
        ? store.memberMatches()
        : store.personMatches()
    ),
    /** True while the widened level is on display, so the list can say so. */
    isBeyondMembers: computed(() =>
      store.membersFirst() && store.memberMatches().length === 0 && store.personMatches().length > 0
    ),
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
      }
    }
  }),
);
