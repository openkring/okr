import { inject, Injectable } from '@angular/core';
import { map, Observable, of, take } from 'rxjs';

import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { AddressCollection, AddressModel, PersonCollection, PersonModel, UserModel } from '@okr/shared-models';
import { getFullName, getSystemQuery, hasRole } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';

import {
  getPersonIndex,
  FindPersonDuplicatesRequest,
  FindPersonDuplicatesResponse,
  MergePersonIntoTenantRequest,
  MergePersonIntoTenantResponse,
  PersonDuplicateCandidate,
  PersonFormModel,
  ReconcilableField,
} from '@okr/subject-person-util';
import { ActivityService } from '@okr/activity-data-access';
import { getAddressIndex } from '@okr/subject-address-util';
import { PFX } from './scope';

/** The sensitive scalar address channels of a person (spec 1.19 Phase 4, D9). */
export type SensitiveChannel = 'ssn' | 'dob' | 'dod';

/** Vault-backed sensitive scalar values of a person (spec 1.19 Phase 4, D9). */
export interface SensitivePersonData {
  ssn?: string;
  dob?: string;
  dod?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PersonService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly activityService = inject(ActivityService);
  private i18nService = inject(I18nService);
  private readonly functions = getFunctions(getApp(), 'europe-west6');

  // i18n
  protected readonly i18n = this.i18nService.translateAll({
    create_conf: PFX + 'create.conf',
    create_error: PFX + 'create.error',
    update_conf: PFX + 'update.conf',
    update_error: PFX + 'update.error',
    delete_conf: PFX + 'delete.conf',
    delete_error: PFX + 'delete.error'
  });

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Creates a new person.
   * ssn/dob never land on the person document (spec 1.19 Phase 4): they are taken
   * from the `sensitive` param (or stray form-model fields), stripped from the
   * person object, and written into the addresses vault.
   * @param person the person to create
   * @param currentUser the current user
   * @param sensitive the vault-backed ssn/dob values from the edit form
   * @returns the unique key of the created person or undefined if creation failed
   */
  public async create(person: PersonModel, currentUser?: UserModel, sensitive?: SensitivePersonData): Promise<string | undefined> {
    const sens = this.takeSensitive(person, sensitive);
    person.index = getPersonIndex(person);
    const key = await this.firestoreService.createModel<PersonModel>(PersonCollection, person, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
    const payload = `${key}: ${getFullName(person.firstName, person.lastName)}`;
    void this.activityService.log('person', 'create', currentUser, payload);
    if (key) await this.syncSensitiveChannels(key, sens, currentUser);
    return key;
  }

  /**
   * Removes the form-model ssn/dob/dod fields from the person object (they must never be
   * written to the person document — spec 1.19 Phase 4 strip) and returns the
   * effective sensitive values: explicit `sensitive` param wins, stray form fields
   * are the fallback. `isDeceased` is NOT set here: onAddressChange derives it from the
   * dod vault address, so the flag has exactly one writer.
   */
  private takeSensitive(person: PersonModel, sensitive?: SensitivePersonData): SensitivePersonData {
    const form = person as PersonFormModel;
    const sens: SensitivePersonData = {
      ssn: sensitive?.ssn ?? form.ssnId,
      dob: sensitive?.dob ?? form.dateOfBirth,
      dod: sensitive?.dod ?? form.dateOfDeath,
    };
    delete form.ssnId;
    delete form.dateOfBirth;
    delete form.dateOfDeath;
    return sens;
  }

  /**
   * Writes the sensitive scalar values into the addresses vault
   * (spec 1.19): ssn → 'ssn' channel, dob → 'dob' channel, dod → 'dod' channel.
   * Empty/undefined values are no-ops — existing vault docs are never cleared here.
   * Uses FirestoreService directly (not AddressService) — cross-scope data-access
   * imports violate the Nx module boundaries; this mirrors how person.store
   * already queries the addresses collection.
   * Public: the profile store writes the person doc itself (own toast handling)
   * and calls this afterwards so the profile edit path stays vault-synced.
   */
  public async syncSensitiveChannels(key: string, sensitive: SensitivePersonData, currentUser?: UserModel): Promise<void> {
    const parentKey = `person.${key}`;
    await this.upsertScalarChannel(parentKey, 'ssn', sensitive.ssn ?? '', currentUser);
    await this.upsertScalarChannel(parentKey, 'dob', sensitive.dob ?? '', currentUser);
    await this.upsertScalarChannel(parentKey, 'dod', sensitive.dod ?? '', currentUser);
  }

  /**
   * Loads the vault-backed ssn/dob/dod values for the person edit form (spec 1.19
   * Phase 4, D9): owner and privileged read the addresses vault directly (the
   * rules allow it), memberAdmin goes through the getAddressView callable
   * (privileged tier, D-P4-1), everyone else gets empty values (the form hides
   * the fields via the privacy gates anyway).
   */
  public async loadSensitive(personKey: string, currentUser?: UserModel): Promise<SensitivePersonData> {
    if (!personKey) return {};
    const isOwner = currentUser?.personKey === personKey;
    if (isOwner || hasRole('privileged', currentUser)) {
      const [ssn, dob, dod] = await Promise.all([
        this.readScalarChannel(`person.${personKey}`, 'ssn'),
        this.readScalarChannel(`person.${personKey}`, 'dob'),
        this.readScalarChannel(`person.${personKey}`, 'dod'),
      ]);
      return { ssn, dob, dod };
    }
    if (hasRole('memberAdmin', currentUser)) {
      try {
        const fn = httpsCallable<{ parentKeys: string[] }, { views: Record<string, AddressModel[]> }>(
          this.functions, 'getAddressView');
        const result = await fn({ parentKeys: [`person.${personKey}`] });
        const addresses = result.data.views[`person.${personKey}`] ?? [];
        return {
          ssn: addresses.find((a) => a.addressChannel === 'ssn')?.ssn ?? '',
          dob: addresses.find((a) => a.addressChannel === 'dob')?.dob ?? '',
          dod: addresses.find((a) => a.addressChannel === 'dod')?.dod ?? '',
        };
      } catch (error) {
        console.error('PersonService.loadSensitive: getAddressView failed', error);
        return {};
      }
    }
    return {};
  }

  /** Reads the value of a sensitive scalar-channel address ('' if none exists). */
  private async readScalarChannel(parentKey: string, channel: SensitiveChannel): Promise<string> {
    const query = getSystemQuery(this.env.tenantId);
    query.push({ key: 'parentKey', operator: '==', value: parentKey });
    query.push({ key: 'addressChannel', operator: '==', value: channel });
    const existing = await this.firestoreService.getDataOnce<AddressModel>(AddressCollection, query, 'none');
    return existing[0]?.[channel] ?? '';
  }

  /**
   * Upsert a sensitive scalar-channel address (one doc per parent and channel,
   * no favorite/label semantics). Empty value or unchanged value → no-op (idempotent).
   */
  private async upsertScalarChannel(parentKey: string, channel: SensitiveChannel, value: string, currentUser?: UserModel): Promise<void> {
    const query = getSystemQuery(this.env.tenantId);
    query.push({ key: 'parentKey', operator: '==', value: parentKey });
    query.push({ key: 'addressChannel', operator: '==', value: channel });
    const existing = await this.firestoreService.getDataOnce<AddressModel>(AddressCollection, query, 'none');
    const current = existing[0];
    if (!current) {
      if (!value) return;                              // nothing to store
      const address = new AddressModel(this.env.tenantId);
      address.addressChannel = channel;
      address[channel] = value;
      address.parentKey = parentKey;
      address.isFavorite = false;
      address.index = getAddressIndex(address);
      await this.firestoreService.createModel<AddressModel>(AddressCollection, address, undefined, undefined, currentUser);
    } else if (value && current[channel] !== value) {
      current[channel] = value;
      current.index = getAddressIndex(current);
      await this.firestoreService.updateModel<AddressModel>(AddressCollection, current, false, undefined, undefined, currentUser);
    }
  }
  
  /**
   * Returns the person with the given unique key.
   * @param key the unique key of the person 
   * @returns an Observable of the person or undefined if not found
   */
  public read(key?: string): Observable<PersonModel | undefined> {
    if (!key || key.length === 0) return of(undefined);
    return this.firestoreService.readModel<PersonModel>(PersonCollection, key).pipe(take(1));    
  }

  /**
   * Finds the first person that matches a given bexioId.
   * To avoid caching issues, we query on the locally cached list (from list()) and do not query the server.
   * @param bexioId the id of the person within Bexio
   * @returns an Observable of the matching person or undefined
   */
  public readPersonByBexioId(bexioId: string): Observable<PersonModel | undefined> {
    if (!bexioId || bexioId.length === 0) return of(undefined);
    return this.list().pipe(
      take(1),
      map((persons: PersonModel[]) => {
        return persons.find((person: PersonModel) => person.bexioId === bexioId);
      }));
  }

  /**
   * Updates an existing person.
   * ssn/dob never land on the person document (spec 1.19 Phase 4) — see create().
   * @param person the person to update
   * @param currentUser the current user
   * @param sensitive the vault-backed ssn/dob values from the edit form
   * @returns the unique key of the updated person or undefined if update failed
   */
  public async update(person: PersonModel, currentUser?: UserModel, sensitive?: SensitivePersonData): Promise<string | undefined> {
    const sens = this.takeSensitive(person, sensitive);
    person.index = getPersonIndex(person);
    const key = await this.firestoreService.updateModel<PersonModel>(PersonCollection, person, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
    const payload = `${key}: ${getFullName(person.firstName, person.lastName)}`;
    void this.activityService.log('person', 'update', currentUser, payload);
    if (key) await this.syncSensitiveChannels(key, sens, currentUser);
    return key;
  }

  /**
   * Archives a person by setting its isArchived property to true.
   * @param person the person to archive
   * @param currentUser the current user
   * @returns a Promise that resolves when the operation is complete
   */
  public async delete(person: PersonModel, currentUser?: UserModel): Promise<void> {
    const payload = `${person.okey}: ${getFullName(person.firstName, person.lastName)}`;
    await this.firestoreService.deleteModel<PersonModel>(PersonCollection, person, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
    void this.activityService.log('person', 'delete', currentUser, payload);
  }

  /**
   * Cross-tenant duplicate search via the findPersonDuplicates callable.
   * Matches on name / dateOfBirth / favEmail / ssnId. Returns [] on any error.
   */
  public async findDuplicates(req: FindPersonDuplicatesRequest): Promise<PersonDuplicateCandidate[]> {
    try {
      const fn = httpsCallable<FindPersonDuplicatesRequest, FindPersonDuplicatesResponse>(
        this.functions, 'findPersonDuplicates');
      const result = await fn(req);
      return result.data.candidates ?? [];
    } catch (error) {
      console.error('PersonService.findDuplicates failed', error);
      return [];
    }
  }

  /**
   * Shares an existing person into the given tenant and applies the resolved scalar fields,
   * via the mergePersonIntoTenant callable. Returns the merged person key.
   */
  public async mergeIntoTenant(
    personKey: string,
    tenantId: string,
    resolvedFields: Partial<Record<ReconcilableField, string>>,
  ): Promise<string> {
    const fn = httpsCallable<MergePersonIntoTenantRequest, MergePersonIntoTenantResponse>(
      this.functions, 'mergePersonIntoTenant');
    const result = await fn({ personKey, tenantId, resolvedFields });
    return result.data.okey;
  }

  /*-------------------------- LIST / QUERY  --------------------------------*/
  /**
   * Lists all persons in the database.
   * @param orderBy the name of the field to order by
   * @param sortOrder the order direction (asc or desc)
   * @returns an Observable of the list of persons
   */
  public list(orderBy = 'lastName', sortOrder = 'asc'): Observable<PersonModel[]> {
    return this.firestoreService.searchData<PersonModel>(PersonCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
  }
}
