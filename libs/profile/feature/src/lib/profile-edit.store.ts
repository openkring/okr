import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Photo } from '@capacitor/camera';
import { of, take } from 'rxjs';

import { AppStore } from '@bk2/shared-feature';
import { PersonCollection, PersonModel, PersonModelName, UserCollection, UserModel } from '@bk2/shared-models';
import { AhvFormat, AppNavigationService, formatAhv } from '@bk2/shared-util-angular';
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
        personKey: store.personKey(),
        currentUser: store.appStore.currentUser()
      }),
      stream: ({params}) => {
        if (!params.personKey) return of(undefined);
        return store.personService.read(params.personKey).pipe(
          take(1), // Complete after first emission to prevent memory leak with hot observable
          debugItemLoaded('ProfileEditStore.person', params.currentUser)
        );
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
          const newPerson = structuredClone(person);
          newPerson.ssnId = formatAhv(newPerson.ssnId ?? '', AhvFormat.Electronic);
          await store.firestoreService.updateModel<PersonModel>(PersonCollection, newPerson, false, undefined, user);
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
