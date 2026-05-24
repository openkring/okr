import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Photo } from '@capacitor/camera';
import { of, take } from 'rxjs';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { PersonCollection, PersonModel, PersonModelName, UserCollection, UserModel } from '@bk2/shared-models';
import { AhvFormat, AppNavigationService, formatAhv } from '@bk2/shared-util-angular';
import { debugItemLoaded } from '@bk2/shared-util-core';
import { FirestoreService } from '@bk2/shared-data-access';

import { AvatarService } from '@bk2/avatar-data-access';

import { PersonService } from '@bk2/subject-person-data-access';
import { PFX } from './scope';

const PROFILE_I18N_KEYS = {
  profile:                         PFX + 'profile',
  intro:                           PFX + 'intro',
  personal_title:                  PFX + 'personal.title',
  personal_description:            PFX + 'personal.description',
  personal_dob_label:              PFX + 'personal.dateOfBirth.label',
  personal_dob_placeholder:        PFX + 'personal.dateOfBirth.placeholder',
  personal_dob_helper:             PFX + 'personal.dateOfBirth.helper',
  personal_ssn_label:              PFX + 'personal.ssn.label',
  personal_ssn_placeholder:        PFX + 'personal.ssn.placeholder',
  personal_ssn_helper:             PFX + 'personal.ssn.helper',
  privacy_title:                   PFX + 'privacy.title',
  privacy_description:             PFX + 'privacy.description',
  settings_title:                  PFX + 'settings.title',
  settings_description:            PFX + 'settings.description',
  addresses_description:           PFX + 'addresses.description',
  gravatar_label:                  PFX + 'gravatar.label',
  gravatar_placeholder:            PFX + 'gravatar.placeholder',
  gravatar_helper:                 PFX + 'gravatar.helper',
  usage_images:                    PFX + 'usage.images',
  usage_dob:                       PFX + 'usage.dob',
  usage_postal:                    PFX + 'usage.postal',
  usage_email:                     PFX + 'usage.email',
  usage_phone:                     PFX + 'usage.phone',
  usage_name:                      PFX + 'usage.name',
  avatar_usage:                    PFX + 'usage.avatar',
  usage_srv_info:                  PFX + 'usage.srv.info',
  usage_srv_label:                 PFX + 'usage.srv.label',
  usage_srv_helper:                PFX + 'usage.srv.helper',
  language_label:                  PFX + 'language',
  update:                          PFX + 'update.label',
  update_conf:                     PFX + 'update.conf',
  update_error:                    PFX + 'update.error',
  view:                            PFX + 'view',
  edit:                            PFX + 'edit',
  create:                          PFX + 'create',
  name_display_label:              PFX + 'display.name.label',
  name_display_helper:             PFX + 'display.name.helper',
  sort_person_label:               PFX + 'sort.person.label',
  sort_person_helper:              PFX + 'sort.person.helper',
  deliver_news_label:              PFX + 'deliver.news.label',
  deliver_news_helper:             PFX + 'deliver.news.helper',
  deliver_invoice_label:           PFX + 'deliver.invoice.label',
  deliver_invoice_helper:          PFX + 'deliver.invoice.helper',
  deliver_messages_label:          PFX + 'deliver.messages.label',
  deliver_messages_button:         PFX + 'deliver.messages.button',
  show_debug_label:                PFX + 'show.debug.label',
  show_debug_helper:               PFX + 'show.debug.helper',
  show_archived_label:             PFX + 'show.archived.label',
  show_archived_helper:            PFX + 'show.archived.helper',
  show_helpers_label:              PFX + 'show.helpers.label',
  show_helpers_helper:             PFX + 'show.helpers.helper',
  use_touchid_label:               PFX + 'use.touchid.label',
  use_touchid_helper:              PFX + 'use.touchid.helper',
  use_faceid_label:                PFX + 'use.faceid.label',
  use_faceid_helper:               PFX + 'use.faceid.helper',
  search_placeholder:              '@search.label',
  as_title:                        '@actionsheet.title',
  save:                          '@save.label',
  cancel:                          '@cancel',
  ok:                              '@ok',
} satisfies Record<string, string>;

export type ProfileI18n = { [K in keyof typeof PROFILE_I18N_KEYS]: Signal<string> };

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
          await store.firestoreService.updateModel<PersonModel>(PersonCollection, newPerson, false, undefined, undefined, user);
        }
        if (user) {
          await store.firestoreService.updateModel<UserModel>(UserCollection, user, false, store.i18n.update_conf(), store.i18n.update_error(), user);
        }
      },

      async saveAvatar(photo: Photo): Promise<void> {
        const person = store.person();
        if (!person) return;
        await store.avatarService.saveAvatarPhoto(photo, person.bkey, store.appStore.env.tenantId, PersonModelName);
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
