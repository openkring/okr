import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore, ModelSelectService } from '@bk2/shared-feature';
import { CategoryListModel, InvitationCollection, InvitationModel } from '@bk2/shared-models';
import { chipMatches, DateFormat, getSystemQuery, getTodayStr, isAfterDate, nameMatches } from '@bk2/shared-util-core';

import { InvitationService } from '@bk2/relationship-invitation-data-access';

export type InvitationSectionState = {
  showOnlyCurrent: boolean;  // whether to show only current memberships or all memberships that ever existed
  caleventKey: string;
  inviteeKey: string;

  // config
  maxItems: number | undefined; // max items to show, undefined means all
  showPastItems: boolean; // whether to show past items
  showUpcomingItems: boolean; // whether to show upcoming items

  // filters
  searchTerm: string;
  selectedTag: string;
  selectedState: string;
};

export const initialInvitationState: InvitationSectionState = {
  showOnlyCurrent: true,
  caleventKey: '',
  inviteeKey: '',

  // config
  maxItems: undefined,
  showPastItems: false,
  showUpcomingItems: true,

  // filters
  searchTerm: '',
  selectedTag: '',
  selectedState: 'all',
};

export const InvitationSectionStore = signalStore(
  withState(initialInvitationState),
  withProps(() => ({
    invitationService: inject(InvitationService),
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    modelSelectService: inject(ModelSelectService),
    alertController: inject(AlertController),
  })),
  withProps((store) => ({
    invitationsResource: rxResource({
      stream: () => {
        return store.firestoreService.searchData<InvitationModel>(InvitationCollection, getSystemQuery(store.appStore.tenantId()), 'name', 'asc');
      }
    })
  })),

  withComputed((state) => {
    return {
      // all invitations, either only the current ones or all that ever existed (based on showOnlyCurrent)
      allInvitations: computed(() => state.showOnlyCurrent() ? 
        state.invitationsResource.value()?.filter(inv => isAfterDate(inv.date, getTodayStr(DateFormat.StoreDate))) ?? [] : 
        state.invitationsResource.value() ?? []),
      invitationsCount: computed(() => state.invitationsResource.value()?.length ?? 0), 

      // for accordion: all invitees of a calevent
      invitees: computed(() => {
        if (!state.caleventKey()) return [];
        return state.invitationsResource.value()?.filter((invitation: InvitationModel) => 
          invitation.caleventKey === state.caleventKey()) ?? [];
      }),

      currentUser: computed(() => state.appStore.currentUser()),
      currentPerson: computed(() => state.appStore.currentPerson()),
      defaultResource : computed(() => state.appStore.defaultResource()),
      isLoading: computed(() => state.invitationsResource.isLoading()),
      tenantId: computed(() => state.appStore.tenantId()),
    };
  }),

  withComputed((state) => {
    return {
      filteredInvitations: computed(() => 
        state.allInvitations()?.filter((invitation: InvitationModel) => 
          nameMatches(invitation.index, state.searchTerm()) &&
          nameMatches(invitation.state, state.selectedState()) &&
          chipMatches(invitation.tags, state.selectedTag()))
      ),
      myInvitations: computed(() => {
        if (!state.inviteeKey()) return [];
        return state.allInvitations().filter((invitation: InvitationModel) => 
          invitation.inviteeKey === state.inviteeKey()) ?? [];
      }),
    }
  }),

  withMethods((store) => {
    return {
      reload(): void {
        store.invitationsResource.reload();
      },

      /******************************** setters (filter) ******************************************* */
      setShowOnlyCurrent(showOnlyCurrent: boolean) {
        patchState(store, { showOnlyCurrent });
      },

      setConfig(maxItems: number | undefined, showPastItems: boolean, showUpcomingItems: boolean) {
        patchState(store, { maxItems, showPastItems, showUpcomingItems });
      },

      setScope(caleventKey: string, inviteeKey: string, showOnlyCurrent = true) {
        patchState(store, { caleventKey, inviteeKey, showOnlyCurrent });
      },

      // filters
      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      setSelectedState(selectedState: string) {
        patchState(store, { selectedState });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags('invitation');
      }, 

      getLocale(): string {
        return store.appStore.appConfig().locale;
      },

      /******************************** actions ******************************************* */
      async changeState(invitation: InvitationModel, newState: 'pending' | 'accepted' | 'declined' | 'maybe'): Promise<void> {
        invitation.state = newState;
        invitation.respondedAt = getTodayStr(DateFormat.StoreDate);
        await store.invitationService.update(invitation, store.currentUser());
        this.reload();
      },
    }
  })
);
