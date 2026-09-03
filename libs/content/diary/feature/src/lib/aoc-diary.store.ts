import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom, of } from 'rxjs';

import { DiaryImportService, DiaryService, DriveAccessResult } from '@okr/content-diary-data-access';
import {
  DIARY_I18N_KEYS, DiaryReference, DiaryReferenceKind, DiaryUsage,
  collectLocationReferences, collectPersonReferences,
} from '@okr/content-diary-util';
import { LocationService } from '@okr/location-data-access';
import {
  AvatarInfo, DiaryImportModel, DiaryModel, LocationModel, OrgModel, PersonModel,
} from '@okr/shared-models';
import { AppStore, LocationSelectModal, PersonSelectModal } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AlertService } from '@okr/shared-util-angular';
import { PersonService } from '@okr/subject-person-data-access';
import { PersonNewFormModel, convertFormToNewPerson } from '@okr/subject-person-util';

import type { DiaryReferenceListResult } from './diary-reference-list.modal';
import type { DiaryUsageListResult } from './diary-usage-list.modal';

export type AocDiaryState = {
  isCheckingDrive: boolean;
  driveResult: DriveAccessResult | undefined;
  isDryRunning: boolean;
  dryRunResult: DiaryImportModel | undefined;
  dryRunError: string | undefined;
  isCommitting: boolean;
  commitResult: DiaryImportModel | undefined;
  commitError: string | undefined;
};

export const initialState: AocDiaryState = {
  isCheckingDrive: false,
  driveResult: undefined,
  isDryRunning: false,
  dryRunResult: undefined,
  dryRunError: undefined,
  isCommitting: false,
  commitResult: undefined,
  commitError: undefined,
};

/**
 * The AOC diary screen's state and every write it performs.
 *
 * The two modals it opens are deliberately dumb: they pick, this store acts, and the store
 * RE-OPENS them afterwards so the admin keeps working through the list instead of starting over
 * per fix. That is why both are pulled in with a dynamic `await import()` and never injected the
 * other way round — see the store↔modal DI contract in the `new-feature` skill.
 */
export const AocDiaryStore = signalStore(
  withProps(() => ({
    appStore: inject(AppStore),
    diaryService: inject(DiaryService),
    diaryImportService: inject(DiaryImportService),
    locationService: inject(LocationService),
    personService: inject(PersonService),
    modalController: inject(ModalController),
    alertService: inject(AlertService),
    i18nService: inject(I18nService),
  })),
  withState(initialState),
  withProps(store => ({
    i18n: store.i18nService.translateAll(DIARY_I18N_KEYS),

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
    locationReferences: computed(() => collectLocationReferences(store.diariesResource.value() ?? [])),
    personReferences: computed(() => collectPersonReferences(store.diariesResource.value() ?? [])),
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

    const locationAvatar = (location: LocationModel): AvatarInfo => ({
      key: location.okey, name1: location.name, name2: '', modelType: 'location',
      type: '', subType: '', label: location.name,
    });

    const personAvatar = (person: PersonModel): AvatarInfo => ({
      key: person.okey, name1: person.firstName, name2: person.lastName, modelType: 'person',
      type: '', subType: '', label: `${person.firstName} ${person.lastName}`.trim(),
    });

    /**
     * Attaches a location to one diary. `customLocationLabel` is cleared in the same write:
     * the two fields are the resolved and unresolved halves of ONE value, and leaving the text
     * behind would make the entry show up in both halves of the list.
     */
    const linkLocation = async (usage: DiaryUsage, location: LocationModel): Promise<boolean> => {
      const diary = diaryOf(usage);
      if (!diary) return false;
      await store.diaryService.update(
        { ...diary, location: locationAvatar(location), customLocationLabel: '' },
        store.appStore.currentUser());
      return true;
    };

    /**
     * Attaches a person to one diary, replacing whatever stood for them before: the raw slug for
     * an unresolved reference, the previously matched avatar when a wrong match is corrected.
     */
    const linkPerson = async (
      reference: DiaryReference, usage: DiaryUsage, person: PersonModel,
    ): Promise<boolean> => {
      const diary = diaryOf(usage);
      if (!diary) return false;
      const people = (diary.people ?? []).filter(p => p.key !== reference.key && p.key !== person.okey);
      const customPeopleLabels = (diary.customPeopleLabels ?? [])
        .filter(label => label.toLowerCase() !== reference.label.toLowerCase());
      await store.diaryService.update(
        { ...diary, people: [...people, personAvatar(person)], customPeopleLabels },
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
      return await linkLocation(usage, { ...saved, okey });
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
      return await linkPerson(reference, usage, { ...person, okey } as PersonModel);
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
            if (location) await linkLocation(data.usage, location);
          }
        } else if (data.action === 'add') {
          await addPerson(reference, data.usage);
        } else {
          const person = await pickPerson();
          if (person) await linkPerson(reference, data.usage, person);
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
          tags: store.appStore.getTags('person'),
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
      /** Proves the deployed function still reaches the Drive archive. Reads only. */
      async checkDrive(): Promise<void> {
        patchState(store, { isCheckingDrive: true, driveResult: undefined });
        try {
          patchState(store, { driveResult: await store.diaryImportService.checkDriveAccess() });
        } catch (error) {
          // The raw reason is kept: an expired refresh token, a missing share and a wrong folder
          // id all surface as one generic failure otherwise, and they need different fixes.
          store.alertService.error(`${store.i18n.drive_failed()} ${error}`);
        } finally {
          patchState(store, { isCheckingDrive: false });
        }
      },

      /** Full read/parse/resolve/weather pass that writes no diary — safe to repeat. */
      /**
       * Runs the import to completion, one window of 200 at a time.
       *
       * The loop lives here rather than in the callable because that is what makes a long import
       * survivable: each invocation writes its window and advances the cursor in `diaryImports`,
       * so a failure mid-run leaves a resumable run rather than a half-written archive. Progress
       * is patched after every window, so the screen shows movement over the ~40 calls a full
       * archive needs instead of one silent multi-minute wait.
       *
       * `phase` is the only termination signal — never the processed/total ratio. A file whose
       * date is missing is counted as processed but never written, so `processed === total` can
       * be reached while the function still has windows to hand out, and comparing counts would
       * stop the run early.
       */
      async commit(): Promise<void> {
        patchState(store, { isCommitting: true, commitResult: undefined, commitError: undefined });
        try {
          let run = await store.diaryImportService.commitDiaryImport(
            { tenantId: store.appStore.tenantId() });
          patchState(store, { commitResult: run });
          while (run.phase !== 'done') {
            run = await store.diaryImportService.commitDiaryImport({ runId: run.okey });
            patchState(store, { commitResult: run });
          }
        } catch (error) {
          // The run row survives in `diaryImports` with its cursor intact — pressing the button
          // again starts a NEW run, which is safe: the document ids are derived from the date, so
          // re-importing a window overwrites it with the same content rather than duplicating it.
          patchState(store, { commitError: `${error}` });
        } finally {
          patchState(store, { isCommitting: false });
        }
      },

      async dryRun(): Promise<void> {
        patchState(store, { isDryRunning: true, dryRunResult: undefined, dryRunError: undefined });
        try {
          patchState(store, { dryRunResult: await store.diaryImportService.dryRunDiaryImport(store.appStore.tenantId()) });
        } catch (error) {
          patchState(store, { dryRunError: `${error}` });
          store.alertService.error(`${store.i18n.dryrun_failed()} ${error}`);
        } finally {
          patchState(store, { isDryRunning: false });
        }
      },

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
