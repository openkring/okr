import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore, ModelSelectService } from '@bk2/shared-feature';
import { AvatarInfo, CategoryListModel, InvitationCollection, InvitationModel } from '@bk2/shared-models';
import { chipMatches, getSystemQuery, nameMatches } from '@bk2/shared-util-core';

import { InvitationService } from '@bk2/relationship-invitation-data-access';
import { isInvitation } from '@bk2/relationship-invitation-util';

import { InvitationEditModalComponent } from './invitation-edit.modal';

export type InvitationState = {
  searchTerm: string;
  selectedTag: string;
  caleventKey: string;
  inviterKey: string;
  inviteeKey: string;
  selectedState: string;
};

export const initialInvitationState: InvitationState = {
  searchTerm: '',
  selectedTag: '',
  caleventKey: '',
  inviterKey: '',
  inviteeKey: '',
  selectedState: 'all',
};

export const InvitationStore = signalStore(
  withState(initialInvitationState),
  withProps(() => ({
    invitationService: inject(InvitationService),
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    modelSelectService: inject(ModelSelectService)
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
      invitations: computed(() => state.invitationsResource.value()),
      invitationsCount: computed(() => state.invitationsResource.value()?.length ?? 0), 
      currentUser: computed(() => state.appStore.currentUser()),
      currentPerson: computed(() => state.appStore.currentPerson()),
      defaultResource : computed(() => state.appStore.defaultResource()),
      filteredInvitations: computed(() => 
        state.invitationsResource.value()?.filter((invitation: InvitationModel) => 
          nameMatches(invitation.index, state.searchTerm()) &&
          nameMatches(invitation.state, state.selectedState()) &&
          chipMatches(invitation.tags, state.selectedTag()))
      ),
      isLoading: computed(() => state.invitationsResource.isLoading()),
      tenantId: computed(() => state.appStore.tenantId()),
    };
  }),

  withMethods((store) => {
    return {

      /******************************** setters (filter) ******************************************* */
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

      getStates(): CategoryListModel {
        return store.appStore.getCategory('invitation_state');
      },

      /******************************** actions ******************************************* */

      /**
       * Show a modal to edit, view (readOnly = true) or create a invitation relationship.
       * @param invitation the invitation relationship to edit
       * @param readOnly 
       */
      async edit(invitation?: InvitationModel, readOnly = true): Promise<void> {
        if (invitation && !readOnly) {
        const modal = await store.modalController.create({
          component: InvitationEditModalComponent,
          componentProps: {
            invitation,
            currentUser: store.currentUser(),
            states: this.getStates(),
            tags: this.getTags(),
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
          store.invitationsResource.reload();
        }
      },

      async delete(invitation?: InvitationModel, readOnly = true): Promise<void> {
        if (invitation && !readOnly) {
          await store.invitationService.delete(invitation, store.currentUser());
          store.invitationsResource.reload();
        }
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
