import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Router } from '@angular/router';
import { ModalController } from '@ionic/angular/standalone';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { rxResource } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';

import { isFirestoreInitializedCheck } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { AddressCollection, AddressModel, MembershipCollection, MembershipModel, OrgModel, OwnershipModel, PersonModel, SrvContact, SrvIndex, SrvMemberLicenseDetail, SrvMismatch } from '@bk2/shared-models';
import { debugListLoaded, getFullName, getMismatches, getSystemQuery, getTodayStr, getYear, isAfterOrEqualDate, isMembership, isPerson } from '@bk2/shared-util-core';

import { OwnershipService } from '@bk2/relationship-ownership-data-access';
import { MembershipEditModal } from '@bk2/relationship-membership-feature';
import { MembershipService } from '@bk2/relationship-membership-data-access';
import { PersonService } from '@bk2/subject-person-data-access';
import { PersonEditModal } from '@bk2/subject-person-feature';
import { newMembershipForPerson } from '@bk2/relationship-membership-util';
import { AOC_I18N_KEYS } from '@bk2/aoc-util';

import { AocSrvMismatchModal } from './aoc-srv-mismatch.modal';

export { getMismatches };

const PARENT_ORG = 'srv';

// ─── Store state ──────────────────────────────────────────────────────────────

export type AocSrvState = {
  index: SrvIndex[];
  searchTerm: string;
  selectedFilter: string;
  regasoftItems: number;
};

const initialState: AocSrvState = {
  index: [],
  searchTerm: '',
  selectedFilter: 'all',
  regasoftItems: 0
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function memberCatAbbr(category: string): string {
  const map: Record<string, string> = {
    active: 'A', active2: 'A', active3: 'A', honorary: 'A', free: 'A', passive: 'P', junior: 'J', double: 'D', candidate: 'K',
  };
  return map[category] ?? '';
}

function buildIndexEntry(
  m: MembershipModel | undefined,
  p: MembershipModel | undefined,
  r: SrvContact | undefined,
  person: PersonModel | undefined,
  isProdEnv: boolean,
  postal?: AddressModel
): SrvIndex {
  const firstName = m?.memberName1 ?? r?.firstName ?? p?.memberName1 ?? '';
  const lastName  = m?.memberName2 ?? r?.lastName  ?? p?.memberName2 ?? '';
  const serviceIdPart = (r?.serviceId != null ? String(r.serviceId) : '') || (p?.memberId ?? '');
  const ridPart       = r ? String(r.srvId) : '';
  return {
    key:        getFullName(firstName, lastName).trim().toLowerCase(),
    indexField: `f:${firstName} l:${lastName} s:${serviceIdPart} r:${ridPart}`.toLowerCase(),
    firstName,
    lastName,

    mKey:        m?.bkey ?? '',
    personKey:   m?.memberKey ?? '',
    mDateOfExit: m?.dateOfExit ?? '',
    dateOfBirth: m?.memberDateOfBirth ?? '',
    gender:      m?.memberType ?? '',
    state:       m?.state ?? '',
    mCategory:   memberCatAbbr(m?.category ?? ''),
    mEmail:      person?.favEmail ?? '',
    mPhone:      person?.favPhone ?? '',
    mStreet:     postal ? `${postal.streetName} ${postal.streetNumber}`.trim() : '',
    mZipCode:    postal?.zipCode ?? person?.favZipCode ?? '',
    mCity:       postal?.city ?? '',

    pKey:        p?.bkey ?? '',
    memberId:    p?.memberId ?? '',
    pDateOfExit: p?.dateOfExit ?? '',
    pState:      p?.state ?? '',
    pCategory:   memberCatAbbr(p?.category ?? ''),

    rid:              r ? String(r.srvId) : '',
    rServiceId:       r?.serviceId != null ? String(r.serviceId) : '',
    rFirstName:       r?.firstName ?? '',
    rLastName:        r?.lastName ?? '',
    rEmail:           getEmail(r, isProdEnv),
    rPhone:           r?.mobile || r?.telefon || '',
    rStreet:          r?.street ?? '',
    rZipCode:         r?.postcode ?? '',
    rCity:            r?.city ?? '',
    rDateOfBirth:     r?.dateOfBirth ?? '',
    rCategory:        r?.membershipType ? r.membershipType.charAt(0).toUpperCase() : '',
    rDateOfExit:      r?.leavingDate || r?.dateOfDeath || '',
    nationIOC:        r?.nationIOC ?? '',
    hasNewsletter:    r?.hasNewsletter ?? false,
    mainClub:         r?.mainClub ?? false,
    clubs:            r?.clubs?.map(c => c.clubName) ?? [],
    licenseId:            r?.licenseId != null ? String(r.licenseId) : '',
    licenseDate:          r?.licenseDate ?? '',
    licenseValidUntil:    r?.licenseValidUntil ?? '',
    licenseImage:         null,
    licenseImageName:     null,
    licenseImageMimeType: null,
  };
}

function storageKey(tenantId: string): string {
  return `bk2-aoc-srv-index-${tenantId}`;
}

// in the test system, Regasoft adds a 'x' after the email address, we need to remove this to make it comparable
function getEmail(r?: SrvContact, isProdEnv = true): string {
  const email = r?.email;
  if (!email ) return '';
  if (!isProdEnv && r.email?.endsWith('x'))  return email.substring(0, email.length-1);
  return email;
}

function stripForStorage(entry: SrvIndex): Omit<SrvIndex, 'licenseImage' | 'licenseImageName' | 'licenseImageMimeType'> & { licenseImage: null; licenseImageName: null; licenseImageMimeType: null } {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { licenseImage, licenseImageName, licenseImageMimeType, ...rest } = entry;
  return { ...rest, licenseImage: null, licenseImageName: null, licenseImageMimeType: null };
}

function saveIndex(tenantId: string, index: SrvIndex[]): void {
  try {
    localStorage.setItem(storageKey(tenantId), JSON.stringify(index.map(stripForStorage)));
  } catch { /* SSR/quota */ }
}

function loadIndex(tenantId: string): SrvIndex[] {
  try {
    const raw = localStorage.getItem(storageKey(tenantId));
    return raw ? (JSON.parse(raw) as SrvIndex[]) : [];
  } catch { return []; }
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const AocSrvStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    personService: inject(PersonService),
    membershipService: inject(MembershipService),
    modalController: inject(ModalController),
    router: inject(Router),
    ownershipService: inject(OwnershipService),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(AOC_I18N_KEYS),
  })),

  withComputed(state => ({
    currentUser: computed(() => state.appStore.currentUser()),
    tenantId:    computed(() => state.appStore.tenantId()),
  })),

  // Main memberships: orgKey = tenantId (SCS members)
  withProps((store) => ({
    mainMembershipsResource: rxResource({
      params: () => ({ currentUser: store.currentUser(), tenantId: store.tenantId() }),
      stream: ({ params }) => {
        const query = getSystemQuery(params.tenantId);
        query.push({ key: 'orgKey',          operator: '==', value: params.tenantId });
        query.push({ key: 'memberModelType', operator: '==', value: 'person' });
        query.push({ key: 'orgModelType',    operator: '==', value: 'org' });
        return store.firestoreService
          .searchData<MembershipModel>(MembershipCollection, query, 'memberName2', 'asc')
          .pipe(debugListLoaded<MembershipModel>('AocSrvStore.mainMemberships', params.currentUser));
      },
    }),
  })),

  // Parent memberships: orgKey = PARENT_ORG 
  withProps((store) => ({
    parentMembershipsResource: rxResource({
      params: () => ({ currentUser: store.currentUser() }),
      stream: ({ params }) => {
        const query = getSystemQuery(store.tenantId());
        query.push({ key: 'orgKey',          operator: '==', value: PARENT_ORG });
        query.push({ key: 'memberModelType', operator: '==', value: 'person' });
        query.push({ key: 'orgModelType',    operator: '==', value: 'org' });
        return store.firestoreService
          .searchData<MembershipModel>(MembershipCollection, query, 'memberName2', 'asc')
          .pipe(debugListLoaded<MembershipModel>('AocSrvStore.parentMemberships', params.currentUser));
      },
    }),
  })),


  withComputed(state => ({
    // Filter Firestore streams to currently active members
    mainMemberships: computed(() =>
      (state.mainMembershipsResource.value() ?? [])
        .filter((m: MembershipModel) => isAfterOrEqualDate(m.dateOfExit, getTodayStr()))
    ),
    parentMemberships: computed(() =>
      (state.parentMembershipsResource.value() ?? [])
        .filter((m: MembershipModel) => isAfterOrEqualDate(m.dateOfExit, getTodayStr()))
    ),
    isLoading: computed(() =>
      state.mainMembershipsResource.isLoading() || state.parentMembershipsResource.isLoading()
    ),
    foreignNationMembers: computed(() =>
      state.index().filter(i => !!i.nationIOC && i.nationIOC !== 'SUI')
    ),
    doubleMembers: computed(() =>
      state.index().filter(i => (i && i.clubs.length > 1))
    ),
    mcat:    computed(() => state.appStore.allCategories()?.find(c => c.name === 'mcat_scs')),
    genders: computed(() => state.appStore.getCategory('gender')),
  })),

  withMethods(store => ({

    setSearchTerm(searchTerm: string) { patchState(store, { searchTerm }); },
    setFilter(selectedFilter: string) { patchState(store, { selectedFilter }); },
    resetIndex() {
      patchState(store, { index: [] });
      try { localStorage.removeItem(storageKey(store.tenantId())); } catch { /* SSR */ }
    },
    loadIndexFromStorage() {
      const index = loadIndex(store.tenantId());
      if (index.length > 0) {
        const regasoftItems = index.filter(i => !!i.rid).length;
        patchState(store, { index, regasoftItems });
      }
    },

    async buildIndex(): Promise<void> {
      if (!isFirestoreInitializedCheck()) return;

      const mainMemberships   = store.mainMemberships();
      const parentMemberships = store.parentMemberships();

      // ── Lookup maps ──────────────────────────────────────────────────────
      const parentByMemberKey = new Map<string, MembershipModel>();
      for (const p of parentMemberships) parentByMemberKey.set(p.memberKey, p);

      // ── Fetch Regasoft contacts ──────────────────────────────────────────
      const functions = getFunctions(getApp(), 'europe-west6');
      if (store.appStore.env.useEmulators) {
        connectFunctionsEmulator(functions, 'localhost', 5001);
      }
      let regasoftContacts: SrvContact[] = [];
      try {
        const fn = httpsCallable<void, SrvContact[]>(functions, 'getSrvContacts');
        const result = await fn();
        regasoftContacts = result.data;
        patchState(store, { regasoftItems: regasoftContacts.length });
        console.log(`AocSrvStore.buildIndex: ${regasoftContacts.length} Regasoft contacts loaded`);
      } catch (e) {
        console.error('AocSrvStore.buildIndex: getSrvContacts failed', e);
      }

      const regasoftByServiceId = new Map<string, SrvContact>();
      const regasoftByName      = new Map<string, SrvContact>();
      for (const r of regasoftContacts) {
        if (r.serviceId != null) regasoftByServiceId.set(String(r.serviceId), r);
        const nameKey = getFullName(r.firstName, r.lastName).trim().toLowerCase();
        if (!regasoftByName.has(nameKey)) regasoftByName.set(nameKey, r);
      }

      const processedParentKeys    = new Set<string>();
      const processedRegasoftIds   = new Set<number>();
      const index: SrvIndex[] = [];
      const isProdEnv = store.appStore.env.production;

      // Batch-load all favorite postal addresses once for the whole index build
      const postalQuery = getSystemQuery(store.tenantId());
      postalQuery.push({ key: 'addressChannel', operator: '==', value: 'postal' });
      postalQuery.push({ key: 'isFavorite', operator: '==', value: true });
      const allPostalAddresses = await firstValueFrom(
        store.firestoreService.searchData<AddressModel>(AddressCollection, postalQuery)
      );
      const postalByPersonKey = new Map<string, AddressModel>();
      for (const a of allPostalAddresses) {
        if (a.parentKey?.startsWith('person.')) {
          postalByPersonKey.set(a.parentKey.substring('person.'.length), a);
        }
      }

      // ── Process main memberships ─────────────────────────────────────────
      for (const m of mainMemberships) {
        const p = parentByMemberKey.get(m.memberKey);
        if (p?.bkey) processedParentKeys.add(p.bkey);

        let r: SrvContact | undefined;
        if (p?.memberId) r = regasoftByServiceId.get(p.memberId);
        if (!r) {
          const nameKey = getFullName(m.memberName1, m.memberName2).trim().toLowerCase();
          r = regasoftByName.get(nameKey);
        }
        if (r) processedRegasoftIds.add(r.srvId);

        const person = store.appStore.getPerson(m.memberKey);
        const postal = postalByPersonKey.get(m.memberKey);
        index.push(buildIndexEntry(m, p, r, person, isProdEnv, postal));
      }

      // ── Orphan parent memberships (no matching main) ─────────────────────
      for (const p of parentMemberships) {
        if (p.bkey && processedParentKeys.has(p.bkey)) continue;

        let r: SrvContact | undefined;
        if (p.memberId) r = regasoftByServiceId.get(p.memberId);
        if (!r) {
          const nameKey = getFullName(p.memberName1, p.memberName2).trim().toLowerCase();
          r = regasoftByName.get(nameKey);
        }
        if (r) processedRegasoftIds.add(r.srvId);

        index.push(buildIndexEntry(undefined, p, r, undefined, isProdEnv));
      }

      // ── Orphan Regasoft contacts (no matching main or parent) ────────────
      for (const r of regasoftContacts) {
        if (processedRegasoftIds.has(r.srvId)) continue;
        index.push(buildIndexEntry(undefined, undefined, r, undefined, isProdEnv));
      }

      index.sort((a, b) => {
        const nameA = a.lastName || a.rLastName;
        const nameB = b.lastName || b.rLastName;
        return nameA.localeCompare(nameB);
      });

      // ── Enrich all Regasoft members from detail endpoint ─────────────────
      const allRids = index.map(i => Number(i.rid)).filter(n => n > 0);
      if (allRids.length > 0) {
        try {
          const detailFn = httpsCallable<{ rids: number[] }, SrvMemberLicenseDetail[]>(functions, 'getSrvMemberDetail');
          const detailResult = await detailFn({ rids: allRids });
          const detailMap = new Map(detailResult.data.map(d => [d.rid, d]));
          for (const entry of index) {
            const detail = detailMap.get(Number(entry.rid));
            if (detail) {
              entry.hasNewsletter      = detail.hasNewsletter;
              entry.rStreet            = detail.street;
              entry.rZipCode           = detail.postcode;
              entry.rCity              = detail.city;
              entry.licenseId          = detail.licenseId;
              entry.licenseDate        = detail.licenseDate;
              entry.licenseValidUntil  = detail.licenseValidUntil;
              entry.licenseImage       = detail.licenseImage;
              entry.licenseImageName   = detail.licenseImageName;
              entry.licenseImageMimeType = detail.licenseImageMimeType;
              entry.rDateOfExit        = detail.inactiveDate || detail.leavingDate || detail.dateOfDeath;
              entry.clubs              = detail.clubs.map(c => c.mainClub ? '!' + c.clubName : c.clubName);
            }
          }
          const withClubs = index.filter(i => i.clubs.length > 0).length;
          const multiClubs = index.filter(i => i.clubs.length > 1).length;
          console.log(`AocSrvStore.buildIndex: enriched ${detailResult.data.length} member details, ${withClubs} with clubs, ${multiClubs} with >1 club`);
        } catch (e) {
          console.error('AocSrvStore.buildIndex: getSrvMemberDetail failed', e);
        }
      }

      console.log(`AocSrvStore.buildIndex: index built with ${index.length} entries`);
      patchState(store, { index });
      saveIndex(store.tenantId(), index);
    },

    async showRegasoftDetail(item: SrvIndex): Promise<void> {
      const modal = await store.modalController.create({
        component: AocSrvMismatchModal,
        cssClass: 'wide-modal',
        componentProps: { item },
      });
      await modal.present();
    },

    async createLicense(item: SrvIndex): Promise<void> {
      const ownership = new OwnershipModel(store.tenantId());
      ownership.ownerKey       = item.personKey;
      ownership.ownerModelType = 'person';
      ownership.ownerName1     = item.firstName;
      ownership.ownerName2     = item.lastName;
      ownership.ownerType      = item.gender;
      ownership.resourceKey    = item.licenseId;
      ownership.resourceName   = `SRV Lizenz ${item.licenseId}`;
      ownership.resourceModelType = 'resource';
      ownership.resourceType   = 'legaldoc';
      ownership.resourceSubType = 'license';
      ownership.validFrom      = item.licenseDate;
      ownership.validTo        = item.licenseValidUntil;
      await store.ownershipService.create(ownership, store.appStore.currentUser() ?? undefined);
    },

    downloadLicense(item: SrvIndex): void {
      if (!item.licenseImage) return;
      const mimeType = item.licenseImageMimeType ?? 'application/octet-stream';
      const name     = item.licenseImageName     ?? `license_${item.rid}`;
      const binary   = atob(item.licenseImage);
      const bytes    = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: mimeType });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    },

    async editPerson(item: SrvIndex): Promise<void> {
      const person = store.appStore.getPerson(item.personKey);
      if (person) {
        const modal = await store.modalController.create({
          component: PersonEditModal,
          componentProps: {
              person,
              currentUser: store.currentUser(),
              tags: store.appStore.getTags('person'),
              tenantId: store.tenantId(),
              genders: store.appStore.getCategory('gender'),
              readOnly: false
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data) {
          if (isPerson(data, store.tenantId()))
            await store.personService.update(data, store.currentUser());
        }
      }
    },

    async editMember(mKey: string): Promise<void> {
      const membership = store.mainMemberships().find(m => m.bkey === mKey);
      const mcat = store.mcat();
      if (!membership || !mcat) return;
      const modal = await store.modalController.create({
        component: MembershipEditModal,
        componentProps: {
          membership: { ...membership },
          currentUser: store.appStore.currentUser(),
          tags: store.appStore.getTags('membership'),
          priv: store.appStore.privacySettings(),
          mcat,
          isNew: false,
          readOnly: false,
        },
      });
      await modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data) {
        if (isMembership(data, store.tenantId())) {
          store.membershipService.update(data, store.currentUser());
        }
      }
    },

    async editParentMember(pKey: string): Promise<void> {
      const membership = store.parentMemberships().find(m => m.bkey === pKey);
      const mcat = store.mcat();
      if (!membership || !mcat) return;
      const modal = await store.modalController.create({
        component: MembershipEditModal,
        componentProps: {
          membership: { ...membership },
          currentUser: store.appStore.currentUser(),
          tags: store.appStore.getTags('membership'),
          priv: store.appStore.privacySettings(),
          mcat,
          isNew: false,
          readOnly: false,
        },
      });
      await modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data) {
        if (isMembership(data, store.tenantId())) {
          store.membershipService.update(data, store.currentUser());
        }
      }
    },

    async createParentMember(item: SrvIndex): Promise<void> {
      const person = store.appStore.getPerson(item.personKey);
      const org = store.appStore.getOrg(PARENT_ORG);
      if (person && org) {
        const cat = store.appStore.getCategoryItemByAbbreviation('mcat_' + org.bkey, item.rCategory);
        if (cat) {
          const defaultDateOfEntry = getYear() + '0101'; // first day of the current year
          const membership = newMembershipForPerson(person, org.bkey, org.name, cat, defaultDateOfEntry);
          membership.memberId = item.rServiceId;
          store.membershipService.create(membership, store.currentUser());
        }
        store.parentMembershipsResource.reload();
      }
    },

    async addToRegasoft(item: SrvIndex): Promise<void> {
      const functions = getFunctions(getApp(), 'europe-west6');
      if (store.appStore.env.useEmulators) {
        connectFunctionsEmulator(functions, 'localhost', 5001);
      }
      const fn = httpsCallable<object, { id: string }>(functions, 'createSrvContact');
      const p = store.appStore.getPerson(item.personKey);
      const srvPostalAddresses = await firstValueFrom(store.firestoreService.searchData<AddressModel>(AddressCollection, [
        { key: 'parentKey', operator: '==', value: 'person.' + item.personKey },
        { key: 'addressChannel', operator: '==', value: 'postal' },
        { key: 'isFavorite', operator: '==', value: true }
      ]));
      const srvPostal = srvPostalAddresses[0];
      let srvId: string;
      try {
        const result = await fn({
          firstName:      item.firstName,
          lastName:       item.lastName,
          fullname:       `${item.lastName} ${item.firstName}`.trim(),
          dateOfBirth:    item.dateOfBirth,
          gender:         item.gender === 'female' ? 2 : 1,
          email:          p?.favEmail || null,
          mobile:         p?.favPhone || null,
          membershipType: item.state === 'passive' ? 'Passive' : 'Active',
          nationIOC:      'SUI',
          language:       0,
          hasNewsletter:  true,
          hasLicense:     false,
          street:         srvPostal ? `${srvPostal.streetName} ${srvPostal.streetNumber}`.trim() || null : null,
          streetAdditional: null,
          postcode:       srvPostal?.zipCode || null,
          city:           srvPostal?.city || null,
          countryName:    srvPostal?.countryCode ? 'Schweiz' : null,
          countryId:      srvPostal?.countryCode || null,
          telefon:        null,
        });
        srvId = String(result.data.id);
      } catch (e) {
        console.error('AocSrvStore.addToRegasoft: createSrvContact failed', e);
        throw e;
      }

      patchState(store, {
        index: store.index().map(i => i.key === item.key
          ? { ...i, memberId: srvId, rid: srvId, rServiceId: srvId, rFirstName: item.firstName, rLastName: item.lastName }
          : i
        ),
      });
    },

    async updateRegasoft(item: SrvIndex): Promise<void> {
      if (!item.rid) return;
      const functions = getFunctions(getApp(), 'europe-west6');
      if (store.appStore.env.useEmulators) {
        connectFunctionsEmulator(functions, 'localhost', 5001);
      }
      const fn = httpsCallable<object, { id: string }>(functions, 'updateSrvContact');
      const changed = new Set(getMismatches(item).map(m => m.field));
      const person  = store.appStore.getPerson(item.personKey);
      const catToMembershipType: Record<string, string> = { A: 'Active', P: 'Passive', J: 'Junior', D: 'Double', C: 'Candidate' };

      try {
        await fn({
          srvId:          Number(item.rid),
          firstName:      changed.has('firstName')   ? item.firstName         : item.rFirstName,
          lastName:       changed.has('lastName')    ? item.lastName          : item.rLastName,
          email:          changed.has('email')       ? item.mEmail  || null   : item.rEmail  || null,
          mobile:         changed.has('phone')       ? item.mPhone  || null   : item.rPhone  || null,
          dateOfBirth:    changed.has('dateOfBirth') ? item.dateOfBirth       : item.rDateOfBirth,
          gender:         item.gender === 'female' ? 2 : 1,
          membershipType: catToMembershipType[item.mCategory] ?? undefined,
          street:         changed.has('street')      ? item.mStreet || null   : item.rStreet || null,
          postcode:       changed.has('zipCode')     ? item.mZipCode || null  : item.rZipCode || null,
          city:           changed.has('city')        ? item.mCity   || null   : item.rCity   || null,
          leavingDate:    item.mDateOfExit || null,
          dateOfDeath:    person?.dateOfDeath || null,
        });
      } catch (e) {
        console.error('AocSrvStore.updateRegasoft: updateSrvContact failed', e);
        throw e;
      }

      patchState(store, {
        index: store.index().map(i => {
          if (i.key !== item.key) return i;
          return {
            ...i,
            rFirstName:   changed.has('firstName')   ? item.firstName    : i.rFirstName,
            rLastName:    changed.has('lastName')    ? item.lastName     : i.rLastName,
            rEmail:       changed.has('email')       ? item.mEmail       : i.rEmail,
            rPhone:       changed.has('phone')       ? item.mPhone       : i.rPhone,
            rDateOfBirth: changed.has('dateOfBirth') ? item.dateOfBirth  : i.rDateOfBirth,
            rStreet:      changed.has('street')      ? item.mStreet      : i.rStreet,
            rZipCode:     changed.has('zipCode')     ? item.mZipCode     : i.rZipCode,
            rCity:        changed.has('city')        ? item.mCity        : i.rCity,
            rCategory:    catToMembershipType[item.mCategory] ? item.mCategory : i.rCategory,
            rDateOfExit:  item.mDateOfExit || i.rDateOfExit,
          };
        }),
      });
    }
  }))
);
