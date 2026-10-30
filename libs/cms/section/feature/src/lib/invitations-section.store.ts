import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { combineLatest, firstValueFrom, map, of } from 'rxjs';
import { AlertController, ModalController } from '@ionic/angular';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore, ModelSelectService } from '@okr/shared-feature';
import { CalEventModel, CategoryListModel, InvitationCollection, InvitationModel } from '@okr/shared-models';
import { chipMatches, countableInvitationsOf, DateFormat, getSystemQuery, getTodayStr, isAfterDate, nameMatches, openInvitationsOf } from '@okr/shared-util-core';
import { notify, resourceParams } from '@okr/shared-util-angular';
import { I18nService } from '@okr/shared-i18n';

import { CalEventService } from '@okr/calevent-data-access';
import { CalEventViewModal } from '@okr/calevent-feature';
import { isAttendanceClosed } from '@okr/calevent-util';
import { SECTION_I18N_KEYS } from '@okr/cms-section-util';
import { InvitationService } from '@okr/relationship-invitation-data-access';


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
    calEventService: inject(CalEventService),
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    modelSelectService: inject(ModelSelectService),
    alertController: inject(AlertController),
    i18n: inject(I18nService).translateAll(SECTION_I18N_KEYS)
  })),
  withProps((store) => ({
    invitationsResource: rxResource({
      // gate on currentUser: the invitations collection requires an authenticated tenant user (tenantRead).
      // Firing before auth is restored (notably mobile Safari) yields "Missing or insufficient permissions".
      params: resourceParams(() => ({ currentUser: store.appStore.currentUser() })),
      stream: ({ params }) => {
        if (!params.currentUser) return of([] as InvitationModel[]);
        return store.firestoreService.searchData<InvitationModel>(InvitationCollection, getSystemQuery(store.appStore.tenantId()), 'name', 'asc');
      }
    })
  })),
  withProps((store) => ({
    // The events behind the open invitations of `inviteeKey`, for countableInvitationsOf (scope
    // 'open'). Same reads as AppStore.openInvitationEventsResource (the doc listeners are shared by
    // FirestoreService), so card and badge see the same events. Missing/archived event -> null.
    openInvitationEventsResource: rxResource({
      params: resourceParams(() => {
        const keys = openInvitationsOf(store.invitationsResource.value() ?? [], store.inviteeKey())
          .map(inv => inv.caleventKey)
          .filter((key): key is string => !!key);
        return { keys: [...new Set(keys)].sort() };
      }),
      stream: ({ params }) => {
        if (params.keys.length === 0) return of(new Map<string, CalEventModel | null>());
        return combineLatest(params.keys.map(key =>
          store.calEventService.read(key).pipe(map(event => [key, event ?? null] as const)))
        ).pipe(map(entries => new Map<string, CalEventModel | null>(entries)));
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
      // Scope 'open': the invitations the user can still answer. Derived from the raw resource
      // rather than allInvitations() on purpose — isOpenInvitation carries its own (inclusive of
      // today) date cut-off — and filtered with countableInvitationsOf, the same rule the
      // notification badge counts with and the push gate mirrors, so card, badge and push cannot
      // drift apart. While the events load, invitations with a caleventKey are left out.
      openInvitations: computed(() =>
        countableInvitationsOf(
          state.invitationsResource.value() ?? [],
          state.inviteeKey(),
          state.openInvitationEventsResource.value() ?? new Map<string, CalEventModel | null>())),
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
      /**
       * Whether the invitation can still be answered: not locked, and its event exists and is
       * neither archived, past, locked nor cancelled — the event half of `isCountableInvitation`
       * (badge, card and push gate share it), so an invitation the card leaves out cannot be
       * answered either. A deleted event blocks the answer (spec 1.127 2.4); an invitation without
       * caleventKey is answerable. Unlike `isCountableInvitation` it does not require `pending`:
       * an answer may be changed (accepted -> declined) while the event is still open.
       * calEventService.read is tenant-scoped and reads an archived event as undefined.
       */
      async isAnswerable(invitation: InvitationModel): Promise<boolean> {
        if (invitation.isLocked) return false;
        if (!invitation.caleventKey) return true;
        const calevent = await firstValueFrom(store.calEventService.read(invitation.caleventKey));
        return !!calevent && !calevent.isArchived && !isAttendanceClosed(calevent);
      },

      /** Opens the read-only view of the calevent the invitation belongs to. */
      async openCalevent(invitation: InvitationModel): Promise<void> {
        const calevent = await firstValueFrom(store.calEventService.read(invitation.caleventKey));
        if (!calevent) return;
        const modal = await store.modalController.create({
          component: CalEventViewModal,
          componentProps: {
            calevent,
            periodicities: store.appStore.getCategory('periodicity'),
            locale: store.appStore.appConfig().locale
          }
        });
        await modal.present();
        await modal.onDidDismiss();
        this.reload();   // the user may have answered the invitation inside the calevent view
      },

      /**
       * Answer an invitation from the invitations widget. `respond` stamps respondedAt and writes
       * the answer comment; a locked invitation is refused and the user is told why.
       */
      async changeState(invitation: InvitationModel, newState: 'pending' | 'accepted' | 'declined'): Promise<void> {
        if (invitation.isLocked) {
          await notify(store.alertController, store.i18n.invitation_locked_title(), store.i18n.invitation_locked_hint(), store.i18n.ok());
          return;
        }
        if (!await this.isAnswerable(invitation)) return;   // the event was cancelled, locked or is over
        await store.invitationService.respond(invitation, newState, store.currentUser());
        this.reload();
      },
    }
  })
);
