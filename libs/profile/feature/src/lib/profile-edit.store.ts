import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Observable, of } from 'rxjs';
import { Photo } from '@capacitor/camera';

import { AppStore } from '@bk2/shared-feature';
import { PersonCollection, PersonModel, PersonModelName, UserCollection, UserModel } from '@bk2/shared-models';
import { AppNavigationService } from '@bk2/shared-util-angular';
import { debugItemLoaded } from '@bk2/shared-util-core';
import { FirestoreService } from '@bk2/shared-data-access';

import { AvatarService } from '@bk2/avatar-data-access';

import { PersonService } from '@bk2/subject-person-data-access';

/**
 * the personEditPage is setting the personKey.
 * The store reads the corresponding person and updates the state with the person.
 * Then, the person is used to read its addresses.
 */
export type ProfileEditState = {
  personKey: string | undefined;
};

export const initialState: ProfileEditState = {
  personKey: undefined,
};

export const ProfileEditStore = signalStore(
  withState(initialState),
  withProps(() => ({
    personService: inject(PersonService),
    appNavigationService: inject(AppNavigationService),
    appStore: inject(AppStore),
    avatarService: inject(AvatarService),
    firestoreService: inject(FirestoreService),
  })),

  withProps((store) => ({
    personResource: rxResource({
      params: () => ({
        personKey: store.personKey()
      }),
      stream: ({params}) => {
        let person$: Observable<PersonModel | undefined> = of(undefined);
        if (params.personKey) {
          person$ = store.personService.read(params.personKey);
          debugItemLoaded('ProfileEditStore.person', person$, store.appStore.currentUser());
        }
        return person$;
      }
    })
  })),

  withComputed((state) => {
    return {
      person: computed(() => state.personResource.value()),
      currentUser: computed(() => state.appStore.currentUser()),
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
    /**
     * Update the current user and the corresponding person with the changed profile data.
     * The method does two updates (person and user), saves two comments, and shows one confirmation toast.
     */
      async save(person?: PersonModel, user?: UserModel): Promise<void> {
        if (person) {
          await store.firestoreService.updateModel<PersonModel>(PersonCollection, person, false, undefined, user);
        }
        if (user) {
          await store.firestoreService.updateModel<UserModel>(UserCollection, user, false, '@profile.operation.update', user);
        }
      },

      async saveAvatar(photo: Photo): Promise<void> {
        const person = store.person();
        if (!person) return;
        await store.avatarService.saveAvatarPhoto(photo, person.bkey, store.appStore.env.tenantId, PersonModelName);
      }
    }
  }),
);
