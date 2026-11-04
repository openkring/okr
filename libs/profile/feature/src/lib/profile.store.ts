import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Photo } from '@capacitor/camera';
import { from, of, take } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { DiarySourceModel, PersonCollection, PersonModel, PersonModelName, UserCollection, UserModel, withoutDiaryConsents } from '@okr/shared-models';
import { AhvFormat, AlertService, AppNavigationService, formatAhv, isBlankAhv } from '@okr/shared-util-angular';
import { debugItemLoaded, fill } from '@okr/shared-util-core';
import { FirestoreService } from '@okr/shared-data-access';

import { AvatarService } from '@okr/avatar-data-access';

import { PersonService, SensitivePersonData } from '@okr/subject-person-data-access';
import { PersonFormModel } from '@okr/subject-person-util';
import { PROFILE_I18N_KEYS, ProfileI18n } from '@okr/profile-util';
import { DiaryLineService, DiaryPullColumn, DiaryRequest, DiarySourcesService } from '@okr/content-diary-data-access';

/**
 * the personEditPage is setting the personKey.
 * The store reads the corresponding person and updates the state with the person.
 * Then, the person is used to read its addresses.
 */
export type ProfileState = {
  personKey: string | undefined;
  /** spec 1.77 §12.4 — in a diary app: the columns of «Tagebuch-Quellen» and the owner's doc */
  diaryPullColumns: DiaryPullColumn[];
  diarySources: DiarySourceModel | undefined;
  /** spec 1.77 §12.4 — in a source app: the diaries asking, and whether an answer is under way */
  diaryRequests: DiaryRequest[];
  diaryRequestBusy: boolean;
};

export const initialState: ProfileState = {
  personKey: undefined,
  diaryPullColumns: [],
  diarySources: undefined,
  diaryRequests: [],
  diaryRequestBusy: false,
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
    diaryLineService: inject(DiaryLineService),
    diarySourcesService: inject(DiarySourcesService),
    alertService: inject(AlertService),
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
       * Spec 1.77 §12.4 — «Tagebuch-Quellen», once when the profile page opens. No columns (an app without a diary, or
       * a failed call) hides the accordion.
       */
      async loadDiarySources(): Promise<void> {
        const uid = store.appStore.fbUser()?.uid;
        if (!uid) return;
        try {
          const columns = await store.diaryLineService.listMyDiaryPullOptions();
          if (columns.length === 0) return;
          const doc = await store.diarySourcesService.read(uid);
          const tenants = [store.appStore.tenantId()];
          patchState(store, { diaryPullColumns: columns, diarySources: doc ?? { okey: uid, tenants, authorKey: uid, from: '', to: '', pulls: [] } });
        } catch (e) {
          console.warn('ProfileStore.loadDiarySources', e);
        }
      },

      /** Spec 1.77 §12.4 — the diaries asking this app, once when the profile opens. A failed call shows no list. */
      async loadDiaryRequests(): Promise<void> {
        try {
          patchState(store, { diaryRequests: await store.diaryLineService.listMyDiaryRequests() });
        } catch (e) {
          console.warn('ProfileStore.loadDiaryRequests', e);
        }
      },

      /** Answers one diary: *Erlauben* with what it asks for, *Widerrufen* with nothing (`setDiaryConsent`). */
      async answerDiaryRequest(tenantId: string, allow: boolean): Promise<void> {
        const request = store.diaryRequests().find((r) => r.tenantId === tenantId);
        if (!request) return;
        patchState(store, { diaryRequestBusy: true });
        try {
          const { sources, swept } = await store.diaryLineService.setDiaryConsent(tenantId, allow ? request.requested : []);
          patchState(store, { diaryRequests: store.diaryRequests().map((r) => r.tenantId === tenantId ? { ...r, consented: sources } : r) });
          if (swept > 0) await store.alertService.showToast(fill(store.i18n.diaryTransfer_swept(), { count: String(swept) }));
        } catch (e) {
          console.warn('ProfileStore.answerDiaryRequest', e);
          await store.alertService.showToast(store.i18n.diaryTransfer_error());
        } finally {
          patchState(store, { diaryRequestBusy: false });
        }
      },

      /** Returns false when the write failed: the service has shown the error, the edit is not saved. */
      async saveDiarySources(model: DiarySourceModel): Promise<boolean> {
        const key = await store.diarySourcesService.save(model, store.i18n.update_error());
        if (!key) return false;
        patchState(store, { diarySources: model });
        return true;
      },

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
          store.appStore.reloadPersons();
        }
        if (user) {
          await store.firestoreService.updateModel<UserModel>(UserCollection, withoutDiaryConsents(user), false, store.i18n.update_conf(), store.i18n.update_error(), user);
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
