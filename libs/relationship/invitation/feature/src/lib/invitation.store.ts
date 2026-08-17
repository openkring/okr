import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore, ModelSelectService } from '@okr/shared-feature';
import { AvatarInfo, CalEventModel, CategoryListModel, InvitationCollection, InvitationModel } from '@okr/shared-models';
import { chipMatches, DateFormat, extractSecondPartOfOptionalTupel, getSystemQuery, getTodayStr, isAfterDate, nameMatches } from '@okr/shared-util-core';
import { confirm } from '@okr/shared-util-angular';
import { I18nService } from '@okr/shared-i18n';

import { InvitationService } from '@okr/relationship-invitation-data-access';
import { getInvitationIndex, isInvitation, INVITATION_I18N_KEYS, InvitationI18n } from '@okr/relationship-invitation-util';

export type { InvitationI18n };

export type InvitationState = {
  showOnlyCurrent: boolean;  // whether to show only current memberships or all memberships that ever existed
  caleventKey: string;
  inviteeKey: string;

  // filters
  searchTerm: string;
  selectedTag: string;
  selectedState: string;
};

export const initialInvitationState: InvitationState = {
  showOnlyCurrent: true,
  caleventKey: '',
  inviteeKey: '',

  // filters
  searchTerm: '',
  selectedTag: '',
  selectedState: 'all',
};

export const InvitationStore = signalStore(
  withState(initialInvitationState),
  withProps(() => ({
    invitationService: inject(InvitationService),
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    modelSelectService: inject(ModelSelectService),
    alertController: inject(AlertController),
    i18nService: inject(I18nService)
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(INVITATION_I18N_KEYS),

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
          // 'my' scope: only invitations addressed to me (invitee), never the ones I sent
          (!state.inviteeKey() || invitation.inviteeKey === state.inviteeKey()) &&
          nameMatches(invitation.index, state.searchTerm()) &&
          nameMatches(invitation.state, state.selectedState()) &&
          chipMatches(invitation.tags, state.selectedTag()))
      ),
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
      // add an invitation of a person to a calevent
      async invitePerson(calevent: CalEventModel, readOnly = false): Promise<string | undefined> {
        const avatar = await store.modelSelectService.selectPersonAvatar('', '');
        if (avatar && !readOnly) {
          const inv = new InvitationModel(store.tenantId());
          inv.inviteeKey = extractSecondPartOfOptionalTupel(avatar.key);
          inv.inviteeFirstName = avatar.name1;
          inv.inviteeLastName = avatar.name2;
          inv.inviterKey = store.currentUser()?.personKey || '';
          inv.inviterFirstName = store.currentUser()?.firstName || '';
          inv.inviterLastName = store.currentUser()?.lastName || '';
          inv.caleventKey = calevent.okey;
          inv.name = calevent.name;
          inv.date = calevent.startDate;
          inv.sentAt = getTodayStr(DateFormat.StoreDate);
          inv.index = getInvitationIndex(inv);
          return await store.firestoreService.createModel<InvitationModel>(InvitationCollection, inv, store.i18n.invite_conf(), store.i18n.invite_error(), store.currentUser());
        }

      },
      /**
       * Show a modal to edit, view (readOnly = true) or create a invitation relationship.
       * @param invitation the invitation relationship to edit
       * @param readOnly 
       */
      async edit(invitation?: InvitationModel, readOnly = true): Promise<void> {
        const { InvitationEditModal } = await import('./invitation-edit.modal');
        const modal = await store.modalController.create({
          component: InvitationEditModal,
          componentProps: {
            invitation,
            currentUser: store.currentUser(),
            tags: this.getTags(),
            locale: this.getLocale(),
            readOnly
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data && !readOnly) {
          if (isInvitation(data, store.tenantId())) {
            await (!data.okey ? 
              store.invitationService.create(data, store.currentUser()) : 
              store.invitationService.update(data, store.currentUser()));
          }
        }
        this.reload();
      },

      async delete(invitation: InvitationModel, readOnly = true): Promise<void> {
        if (readOnly) return;
        const result = await confirm(store.alertController, store.i18n.delete_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
        if (result === true) {
          await store.invitationService.delete(invitation);
          this.reload();
        }
      },

      async changeState(invitation: InvitationModel, newState: 'pending' | 'accepted' | 'declined' | 'maybe'): Promise<void> {
        invitation.state = newState;
        invitation.respondedAt = getTodayStr(DateFormat.StoreDate);
        await store.invitationService.update(invitation, store.currentUser());
        this.reload();
      },

      async export(type: string): Promise<void> {
        console.log(`InvitationStore.export(${type}) is not yet implemented.`);
      },

      async selectPerson(): Promise<AvatarInfo | undefined> {
        return await store.modelSelectService.selectPersonAvatar('','');
      },

     getTitleLabel(readOnly: boolean, key?: string): string {
        if (readOnly) {
          return store.i18n.view();
        }
        if (key && key.length > 0) {
          return store.i18n.update();
        } else {
          return store.i18n.invite();
        }
      }
    }
  })
);
