import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore, ModelSelectService } from '@bk2/shared-feature';
import { AvatarInfo, CalEventModel, CategoryListModel, InvitationCollection, InvitationModel } from '@bk2/shared-models';
import { chipMatches, DateFormat, extractSecondPartOfOptionalTupel, getSystemQuery, getTodayStr, isAfterDate, nameMatches } from '@bk2/shared-util-core';
import { confirm } from '@bk2/shared-util-angular';
import { I18nService } from '@bk2/shared-i18n';

import { InvitationService } from '@bk2/relationship-invitation-data-access';
import { isInvitation } from '@bk2/relationship-invitation-util';

import { InvitationEditModal } from './invitation-edit.modal';
import { PFX } from './scope';

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
    i18n: store.i18nService.translateAll({
      delete_confirm: PFX + 'delete.confirm',
      invite_conf: PFX + 'invite.conf',
      invite_error: PFX + 'invite.error',
      ok: '@ok',
      cancel: '@cancel'
    }),

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
          inv.caleventKey = calevent.bkey;
          inv.name = calevent.name;
          inv.date = calevent.startDate;
          inv.index = `ik:${inv.inviteeKey}, ck:${inv.caleventKey}, n:${inv.inviteeLastName}, d:${inv.date}`;
          return await store.firestoreService.createModel<InvitationModel>(InvitationCollection, inv, store.i18n.invite_conf(), store.i18n.invite_error(), store.currentUser());
        }

      },
      /**
       * Show a modal to edit, view (readOnly = true) or create a invitation relationship.
       * @param invitation the invitation relationship to edit
       * @param readOnly 
       */
      async edit(invitation?: InvitationModel, readOnly = true): Promise<void> {
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
            await (!data.bkey ? 
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
          await store.invitationService.delete(invitation, store.currentUser());
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

      async selectPersonAvatar(): Promise<AvatarInfo | undefined> {
        return await store.modelSelectService.selectPersonAvatar('','');
      },
    }
  })
);
