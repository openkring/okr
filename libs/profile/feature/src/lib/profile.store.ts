import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Photo } from '@capacitor/camera';
import { from, of, take } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { PersonCollection, PersonModel, PersonModelName, UserCollection, UserModel } from '@okr/shared-models';
import { AhvFormat, AppNavigationService, formatAhv, isBlankAhv } from '@okr/shared-util-angular';
import { debugItemLoaded } from '@okr/shared-util-core';
import { FirestoreService } from '@okr/shared-data-access';

import { AvatarService } from '@okr/avatar-data-access';

import { PersonService, SensitivePersonData } from '@okr/subject-person-data-access';
import { PersonFormModel } from '@okr/subject-person-util';
import { PROFILE_I18N_KEYS, ProfileI18n } from '@okr/profile-util';

/**
 * the personEditPage is setting the personKey.
 * The store reads the corresponding person and updates the state with the person.
 * Then, the person is used to read its addresses.
 */
export type ProfileState = {
  personKey: string | undefined;
};

export const initialState: ProfileState = {
  personKey: undefined,
};

export const ProfileStore = signalStore(
  withState(initialState),
  withProps(() => ({
    personService: inject(PersonService),
    appNavigationService: inject(AppNavigationService),
    appStore: inject(AppStore),
    avatarService: inject(AvatarService),
    firestoreService: inject(FirestoreService),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(PROFILE_I18N_KEYS) as ProfileI18n,
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
    }),
    // ssn/dob live only in the addresses vault (spec 1.19 Phase 4) — the profile is
    // the owner's self-service path, so this reads the own vault docs directly.
    sensitiveResource: rxResource({
      params: () => ({
        personKey: store.personKey(),
        currentUser: store.appStore.currentUser()
      }),
      stream: ({params}) => {
        if (!params.personKey) return of(undefined);
        return from(store.personService.loadSensitive(params.personKey, params.currentUser));
      }
    })
  })),

  withComputed((state) => {
    return {
      person: computed(() => state.personResource.value()),
      // person + vault ssn/dob merged for the edit form; undefined until BOTH loaded
      // (seeding from a form model without the vault values would lose them on save).
      personForm: computed<PersonFormModel | undefined>(() => {
        const person = state.personResource.value();
        const sensitive = state.sensitiveResource.value();
        if (!person || !sensitive) return undefined;
        return { ...person, ssnId: sensitive.ssn ?? '', dateOfBirth: sensitive.dob ?? '' };
      }),
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
      async save(person?: PersonFormModel, user?: UserModel): Promise<void> {
        if (person) {
          const newPerson = structuredClone(person);
          // ssn/dob go ONLY into the addresses vault (spec 1.19 Phase 4): take them
          // off the person object before the write and sync them afterwards.
          //
          // ssn: '' when the field was cleared (which erases the vault doc) — the mask
          // scaffolding a cleared field leaves behind ('756.') is not a number and must not
          // be stored. dob is deliberately NOT sent: the profile shows it read-only, so it
          // has nothing to write, and passing the displayed value back would erase the vault
          // dob whenever loadSensitive came up empty.
          const sensitive: SensitivePersonData = {
            ssn: isBlankAhv(newPerson.ssnId) ? '' : formatAhv(newPerson.ssnId, AhvFormat.Electronic),
          };
          delete newPerson.ssnId;
          delete newPerson.dateOfBirth;
          // The privacy preferences (usage*) are edited directly on the person in the privacy
          // accordion — the person is the tenant-readable source for getPersonPrivacySettings.
          await store.firestoreService.updateModel<PersonModel>(PersonCollection, newPerson, false, undefined, undefined, user);
          await store.personService.syncSensitiveChannels(newPerson.okey, sensitive, user);
        }
        if (user) {
          await store.firestoreService.updateModel<UserModel>(UserCollection, user, false, store.i18n.update_conf(), store.i18n.update_error(), user);
        }
      },

      async saveAvatar(photo: Photo): Promise<void> {
        const person = store.person();
        if (!person) return;
        await store.avatarService.saveAvatarPhoto(photo, person.okey, store.appStore.env.tenantId, PersonModelName);
      },

      getTitleLabel(readOnly: boolean, key?: string): string {
        if (readOnly) {
          return store.i18n.view();
        }
        if (key && key.length > 0) {
          return store.i18n.edit();
        } else {
          return store.i18n.create();
        }
      }
    }
  }),
);
