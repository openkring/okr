import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular';
import { signalStore, withComputed, withMethods, withProps } from '@ngrx/signals';
import { firstValueFrom, of } from 'rxjs';

import { DiaryService } from '@okr/content-diary-data-access';
import {
  DIARY_I18N_KEYS, DiaryReference, DiaryReferenceKind, DiaryUsage,
  collectLocationReferences, collectPersonReferences, locationAvatar, replaceDiaryAvatar, withDiaryLocations,
} from '@okr/content-diary-util';
import { LocationService } from '@okr/location-data-access';
import {
  AvatarInfo, DiaryModel, LocationModel, OrgModel, PersonModel,
} from '@okr/shared-models';
import { AppStore, LocationSelectModal, PersonSelectModal } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AlertService } from '@okr/shared-util-angular';
import { PersonService } from '@okr/subject-person-data-access';
import { PersonNewFormModel, convertFormToNewPerson } from '@okr/subject-person-util';

import type { DiaryReferenceListResult } from './diary-reference-list.modal';
import type { DiaryUsageListResult } from './diary-usage-list.modal';

/**
 * The diary repair page's state (`/diary/import`) and every write it performs.
 *
 * The two modals it opens are deliberately dumb: they pick, this store acts, and the store
 * RE-OPENS them afterwards so the admin keeps working through the list instead of starting over
 * per fix. That is why both are pulled in with a dynamic `await import()` and never injected the
 * other way round — see the store↔modal DI contract in the `new-feature` skill.
 */
export const DiaryImportStore = signalStore(
  withProps(() => ({
    appStore: inject(AppStore),
    diaryService: inject(DiaryService),
    locationService: inject(LocationService),
    personService: inject(PersonService),
    modalController: inject(ModalController),
    alertService: inject(AlertService),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(DIARY_I18N_KEYS),

    /** read once per import page open; feeds the current names of linked locations */
    locationsResource: rxResource({
      stream: () => store.locationService.list(),
    }),

    diariesResource: rxResource({
      params: () => ({
        authorKey: store.appStore.fbUser()?.uid ?? '',
        tenantId: store.appStore.tenantId(),
      }),
      stream: ({ params }) => {
        if (!params.authorKey || !params.tenantId) return of([] as DiaryModel[]);
        return store.diaryService.list(params.authorKey, params.tenantId);
      },
    }),
  })),
  withComputed(store => ({
    isLoading: computed(() => store.diariesResource.isLoading()),
    diaries: computed((): DiaryModel[] => store.diariesResource.value() ?? []),
    // keyed rows show the record's CURRENT name, not the name stamped into the diary avatar
    locationReferences: computed(() => {
      const names = new Map((store.locationsResource.value() ?? []).map(l => [l.okey, l.name] as const));
      return collectLocationReferences(store.diariesResource.value() ?? [])
        .map(r => (r.key && names.get(r.key) ? { ...r, label: names.get(r.key) as string } : r));
    }),
    personReferences: computed(() => {
      const names = new Map((store.appStore.allPersons() ?? []).map(p => [p.okey, `${p.firstName} ${p.lastName}`.trim()] as const));
      return collectPersonReferences(store.diariesResource.value() ?? [])
        .map(r => (r.key && names.get(r.key) ? { ...r, label: names.get(r.key) as string } : r));
    }),
  })),
  withComputed(store => ({
    unresolvedLocationCount: computed(() => store.locationReferences().filter(r => !r.resolved).length),
    unresolvedPersonCount: computed(() => store.personReferences().filter(r => !r.resolved).length),
  })),
  withMethods(store => {
    const iconBaseUrl = (): string => store.appStore.env.services.imgixBaseUrl;

    const referencesOf = (kind: DiaryReferenceKind): DiaryReference[] =>
      kind === 'location' ? store.locationReferences() : store.personReferences();

    const diaryOf = (usage: DiaryUsage): DiaryModel | undefined =>
      store.diaries().find(diary => diary.okey === usage.okey);


    const personAvatar = (person: PersonModel): AvatarInfo => ({
      key: person.okey, name1: person.firstName, name2: person.lastName, modelType: 'person',
      type: '', subType: '', label: `${person.firstName} ${person.lastName}`.trim(),
    });

    /**
     * Attaches a location to one diary, replacing the entry the reference stood for (free text
     * or a previously matched record) in place, so its position in the sortable list is kept.
     */
    const linkLocation = async (usage: DiaryUsage, location: LocationModel, referenceId: string): Promise<boolean> => {
      const diary = diaryOf(usage);
      if (!diary) return false;
      const normalised = withDiaryLocations(diary);
      await store.diaryService.update(
        { ...normalised, locations: replaceDiaryAvatar(normalised.locations ?? [], referenceId, locationAvatar(location)) },
        store.appStore.currentUser());
      return true;
    };

    /**
     * Attaches a person to one diary, replacing whatever stood for them before: the free text
     * for an unresolved reference, the previously matched avatar when a wrong match is corrected.
     */
    const linkPerson = async (usage: DiaryUsage, person: PersonModel, referenceId: string): Promise<boolean> => {
      const diary = diaryOf(usage);
      if (!diary) return false;
      const normalised = withDiaryLocations(diary);
      await store.diaryService.update(
        { ...normalised, people: replaceDiaryAvatar(normalised.people ?? [], referenceId, personAvatar(person)) },
        store.appStore.currentUser());
      return true;
    };

    /** Opens the location editor on a new or existing record; returns what was saved. */
    const openLocationEditor = async (location: LocationModel): Promise<LocationModel | undefined> => {
      const { LocationEditModal } = await import('@okr/location-feature');
      const modal = await store.modalController.create({
        component: LocationEditModal,
        componentProps: { location, currentUser: store.appStore.currentUser(), readOnly: false },
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<LocationModel>();
      return role === 'confirm' && data ? data : undefined;
    };

    /** The shared location picker, unfiltered by type — a diary place can be any of them. */
    const pickLocation = async (): Promise<LocationModel | undefined> => {
      const currentUser = store.appStore.currentUser();
      if (!currentUser) return undefined;
      const modal = await store.modalController.create({
        component: LocationSelectModal,
        cssClass: 'list-modal',
        componentProps: { type: '', currentUser, allowCustom: false, showMap: false },
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss();
      return role === 'confirm' && data?.kind === 'predefined' ? (data.location as LocationModel) : undefined;
    };

    const pickPerson = async (): Promise<PersonModel | undefined> => {
      const currentUser = store.appStore.currentUser();
      if (!currentUser) return undefined;
      const modal = await store.modalController.create({
        component: PersonSelectModal,
        cssClass: 'list-modal',
        componentProps: { selectedTag: '', currentUser, allowCustom: false, membersFirst: false },
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss();
      return role === 'confirm' && data?.kind === 'predefined' ? (data.person as PersonModel) : undefined;
    };

    /**
     * Creates the location the diary names and attaches it in one step.
     * The editor opens pre-filled with the diary's own text, so the admin only has to confirm
     * (or correct the spelling and add coordinates) rather than retype the name.
     */
    const addLocation = async (reference: DiaryReference, usage: DiaryUsage): Promise<boolean> => {
      const seed = new LocationModel(store.appStore.tenantId());
      seed.name = reference.label;
      const saved = await openLocationEditor(seed);
      if (!saved) return false;
      const okey = await store.locationService.create(saved, store.appStore.currentUser());
      if (!okey) return false;
      return await linkLocation(usage, { ...saved, okey }, reference.id);
    };

    /**
     * Creates the person the diary names and attaches them.
     *
     * The person screen's full intake — contact channels, membership, reconciling a near-match —
     * deliberately does NOT run here: a name in a private diary is not a member record. What DOES
     * run is the duplicate lookup, because minting a second row for someone the tenant already
     * knows is the one mistake this shortcut could cause. On a hit the creation is refused and
     * the admin is pointed at "map to person", which is the correct repair.
     */
    const addPerson = async (reference: DiaryReference, usage: DiaryUsage): Promise<boolean> => {
      const org = store.appStore.defaultOrg() ?? new OrgModel(store.appStore.tenantId());
      const { PersonNewModal } = await import('@okr/subject-person-feature');
      const modal = await store.modalController.create({ component: PersonNewModal, componentProps: { org } });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<PersonNewFormModel>();
      if (role !== 'confirm' || !data) return false;

      const candidates = await store.personService.findDuplicates({
        firstName: data.firstName, lastName: data.lastName, dateOfBirth: data.dateOfBirth,
        favEmail: data.email, ssnId: data.ssnId,
      });
      if (candidates.length > 0) {
        store.alertService.error(store.i18n.person_duplicate_hint());
        return false;
      }

      const person = convertFormToNewPerson(data, store.appStore.tenantId());
      const okey = await store.personService.create(person, store.appStore.currentUser());
      if (!okey) return false;
      store.appStore.reloadPersons();
      return await linkPerson(usage, { ...person, okey } as PersonModel, reference.id);
    };

    /**
     * The diaries one reference appears in, with its two repairs. Loops so several entries can
     * be fixed in a row; it re-reads the reference from the freshly recomputed list after every
     * write, and ends by itself once the last entry has been repaired and the row is gone.
     */
    const showUsages = async (kind: DiaryReferenceKind, start: DiaryReference): Promise<void> => {
      const { DiaryUsageListModal } = await import('./diary-usage-list.modal');
      let reference: DiaryReference | undefined = start;
      while (reference) {
        const modal = await store.modalController.create({
          component: DiaryUsageListModal,
          cssClass: 'list-modal',
          componentProps: { reference, iconBaseUrl: iconBaseUrl() },
        });
        await modal.present();
        const { data, role } = await modal.onWillDismiss<DiaryUsageListResult>();
        if (role !== 'confirm' || !data) return;

        // Every path below reports its own outcome: FirestoreService.updateModel raises the
        // confirmation (or the error) toast for the write itself.
        if (kind === 'location') {
          if (data.action === 'add') {
            await addLocation(reference, data.usage);
          } else {
            const location = await pickLocation();
            if (location) await linkLocation(data.usage, location, reference.id);
          }
        } else if (data.action === 'add') {
          await addPerson(reference, data.usage);
        } else {
          const person = await pickPerson();
          if (person) await linkPerson(data.usage, person, reference.id);
        }
        reference = referencesOf(kind).find(candidate => candidate.id === reference?.id);
      }
    };

    /** Opens the record behind a resolved reference in its own editor. */
    const editReference = async (reference: DiaryReference): Promise<void> => {
      if (!reference.resolved) return;
      if (reference.kind === 'location') {
        const location = await firstValueFrom(store.locationService.read(reference.key));
        if (location) await openLocationEditor(location);
        return;
      }
      const person = await firstValueFrom(store.personService.read(reference.key));
      if (!person) return;
      const { PersonEditModal } = await import('@okr/subject-person-feature');
      const modal = await store.modalController.create({
        component: PersonEditModal,
        componentProps: {
          person,
          currentUser: store.appStore.currentUser(),
          tagModel: 'person',
          tenantId: store.appStore.tenantId(),
          genders: store.appStore.getCategory('gender'),
          readOnly: false,
        },
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<PersonModel>();
      if (role === 'confirm' && data) await store.personService.update(data, store.appStore.currentUser());
    };

    return {
      /**
       * The places (or people) list. Loops for the same reason `showUsages` does: an admin
       * working through unresolved rows should land back on the list after each one.
       */
      async showReferences(kind: DiaryReferenceKind): Promise<void> {
        const { DiaryReferenceListModal } = await import('./diary-reference-list.modal');
        for (;;) {
          const modal = await store.modalController.create({
            component: DiaryReferenceListModal,
            cssClass: 'list-modal',
            componentProps: { kind, references: referencesOf(kind), iconBaseUrl: iconBaseUrl() },
          });
          await modal.present();
          const { data, role } = await modal.onWillDismiss<DiaryReferenceListResult>();
          if (role !== 'confirm' || !data) return;

          if (data.action === 'edit') {
            await editReference(data.reference);
          } else {
            await showUsages(kind, data.reference);
          }
        }
      },
    };
  })
);
