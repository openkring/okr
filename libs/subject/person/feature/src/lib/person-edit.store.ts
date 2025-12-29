import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';
import { Photo } from '@capacitor/camera';

import { AppStore } from '@bk2/shared-feature';
import { PersonModel, PersonModelName, ResourceModel } from '@bk2/shared-models';
import { debugItemLoaded } from '@bk2/shared-util-core';

import { PersonService } from '@bk2/subject-person-data-access';
import { AvatarService } from '@bk2/avatar-data-access';

/**
 * the personEditPage is setting the personKey.
 * The store reads the corresponding person and updates the state with the person.
 * Then, the person is used to read its addresses.
 */
export type PersonEditState = {
  personKey: string | undefined;
};

export const initialState: PersonEditState = {
  personKey: undefined,
};

export const PersonEditStore = signalStore(
  withState(initialState),
  withProps(() => ({
    personService: inject(PersonService),
    appStore: inject(AppStore),
    avatarService: inject(AvatarService),
  })),

  withProps((store) => ({
    personResource: rxResource({
      params: () => ({
        personKey: store.personKey()
      }),
      stream: ({params}) => {
        if (!params.personKey) return of(undefined);
        const person$ = store.personService.read(params.personKey);
        debugItemLoaded('PersonEditStore.person', person$, store.appStore.currentUser());
        return person$;
      }
    })
  })),

  withComputed((state) => {
    return {
      person: computed(() => state.personResource.value()),
      currentUser: computed(() => state.appStore.currentUser()),
      defaultResource : computed(() => state.appStore.defaultResource() ?? new ResourceModel(state.appStore.env.tenantId)),
      tenantId: computed(() => state.appStore.env.tenantId),
      privacySettings: computed(() => state.appStore.privacySettings()),
      isLoading: computed(() => state.personResource.isLoading()),
    };
  }),

  withMethods((store) => {
    return {
      reset() {
        patchState(store, initialState);
      },
      
      /************************************ SETTERS ************************************* */
      setPersonKey(personKey: string): void {
        patchState(store, { personKey });
      },

      /******************************** GETTERS ******************************************* */
      getTags(): string {
        return store.appStore.getTags(PersonModelName);
      },

      /************************************ ACTIONS ************************************* */
      async save(person: PersonModel): Promise<void> {
        await (!person.bkey ? 
          store.personService.create(person, store.currentUser()) : 
          store.personService.update(person, store.currentUser()));
      },

      async saveAvatar(photo: Photo): Promise<void> {
        const person = store.person();
        if (!person) return;
        await store.avatarService.saveAvatarPhoto(photo, person.bkey, store.appStore.env.tenantId, PersonModelName);
      }
    }
  }),
);
